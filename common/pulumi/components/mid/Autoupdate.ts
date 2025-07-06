import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

export interface AutoupdateProps {
  autoreboot?: boolean;
  onCalendar?: string;
  randomizedDelaySec?: number;
  fixedRandomDelay?: boolean;
}

export class Autoupdate extends pulumi.ComponentResource {
  timer: mid.resource.SystemdService;

  constructor(name: string, props: AutoupdateProps = {}, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:mid:Autoupdate", name, {}, opts);

    const autoreboot = props.autoreboot ?? true;
    const onCalendar = props.onCalendar ?? "Tue *-*-* 10:00:00 UTC";
    const randomizedDelaySec = props.randomizedDelaySec ?? 3600;

    const serviceConfig: string[] = [
      "[Unit]",
      "Description=Autoupdate",
      "",
      "[Service]",
      "Type=oneshot",
      "Environment=DEBIAN_FRONTEND=noninteractive",
      "ExecStart=/usr/bin/apt-get update",
      "ExecStart=/usr/bin/apt-get full-upgrade -q -y --autoremove",
    ];

    if (autoreboot) {
      serviceConfig.push(
        "ExecStart=/usr/bin/sh -xc '[ -f /var/run/reboot-required ] && /usr/bin/systemctl reboot || echo No Reboot Required'",
      );
    }

    serviceConfig.push(
      "",
      "[Install]",
      "WantedBy=multi-user.target",
      "",
    );

    const timerConfig: string[] = [
      "[Unit]",
      "Description=Autoupdate",
      "Wants=network-online.target",
      "",
      "[Timer]",
      `OnCalendar=${onCalendar}`,
    ];

    if (randomizedDelaySec) {
      timerConfig.push(`RandomizedDelaySec=${randomizedDelaySec}`);
    }

    if (props.fixedRandomDelay !== undefined) {
      timerConfig.push(`FixedRandomDelay=${props.fixedRandomDelay}`);
    }

    timerConfig.push(
      "",
      "[Install]",
      "WantedBy=timers.target",
      "",
    );

    const serviceFile = new mid.resource.File(`${name}-autoupdate-service`, {
      path: "/etc/systemd/system/autoupdate.service",
      content: serviceConfig.join("\n"),
    }, {
      parent: this,
    });

    const timerFile = new mid.resource.File(`${name}-autoupdate-timer`, {
      path: "/etc/systemd/system/autoupdate.timer",
      content: timerConfig.join("\n"),
    }, {
      parent: this,
    });

    this.timer = new mid.resource.SystemdService(`${name}-autoupdate`, {
      name: "autoupdate.timer",
      ensure: "started",
      daemonReload: true,
      triggers: {
        refresh: [
          serviceFile.triggers.lastChanged,
          timerFile.triggers.lastChanged,
        ],
      },
    }, {
      parent: this,
      dependsOn: [
        serviceFile,
        timerFile,
      ],
    });
  }
}
