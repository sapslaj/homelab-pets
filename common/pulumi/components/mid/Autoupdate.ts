import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

import { SystemdUnit } from "./SystemdUnit";

export interface AutoupdateProps {
  connection?: mid.types.input.ConnectionArgs;
  triggers?: mid.types.input.TriggersInputArgs;
  autoreboot?: boolean;
  onCalendar?: string;
  randomizedDelaySec?: number;
  fixedRandomDelay?: boolean;
}

export class Autoupdate extends pulumi.ComponentResource {
  service: SystemdUnit;
  timer: SystemdUnit;

  constructor(name: string, props: AutoupdateProps = {}, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:mid:Autoupdate", name, {}, opts);

    const autoreboot = props.autoreboot ?? true;
    const onCalendar = props.onCalendar ?? "Tue *-*-* 10:00:00 UTC";
    const randomizedDelaySec = props.randomizedDelaySec ?? 3600;

    const execStart: string[] = [
      "/usr/bin/apt-get update",
      "/usr/bin/apt-get full-upgrade -q -y --autoremove",
    ];

    if (autoreboot) {
      execStart.push(
        "/usr/bin/sh -xc '[ -f /var/run/reboot-required ] && /usr/bin/systemctl reboot || echo No Reboot Required'",
      );
    }

    this.service = new SystemdUnit(`${name}-service`, {
      connection: props.connection,
      triggers: props.triggers,
      name: "autoupdate.service",
      unit: {
        "Description": "Autoupdate",
      },
      service: {
        "Type": "oneshot",
        "Environment": [
          "DEBIAN_FRONTEND=noninteractive",
        ],
        "ExecStart": execStart,
      },
      install: {
        "WantedBy": "multi-user.target",
      },
    }, {
      parent: this,
    });

    const timerConfig: Record<string, pulumi.Input<string>> = {
      "OnCalendar": onCalendar,
    };
    if (randomizedDelaySec) {
      timerConfig["RandomizedDelaySec"] = `${randomizedDelaySec}`;
    }
    if (props.fixedRandomDelay !== undefined) {
      timerConfig["FixedRandomDelay"] = pulumi.output(props.fixedRandomDelay).apply((v) => `${v}`);
    }

    this.timer = new SystemdUnit(`${name}-timer`, {
      connection: props.connection,
      triggers: props.triggers,
      name: "autoupdate.timer",
      enabled: true,
      ensure: "started",
      unit: {
        "Description": "Autoupdate",
        "Wants": "network-online.target",
      },
      timer: timerConfig,
      install: {
        "WantedBy": "timers.target",
      },
    }, {
      parent: this,
      dependsOn: [
        this.service,
      ],
    });
  }
}
