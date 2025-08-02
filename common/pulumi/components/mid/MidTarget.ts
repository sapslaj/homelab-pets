import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

export interface MidTargetProps {
  connection?: mid.types.input.ConnectionArgs;
  triggers?: mid.types.input.TriggersInputArgs;
  hostname?: string;
  unfuckUbuntu?: {
    allowInstallRecommends?: boolean;
    allowSnap?: boolean;
    enableMotdNews?: boolean;
    removeEsm?: boolean;
    removeLxd?: boolean;
  };
}

export class MidTarget extends pulumi.ComponentResource {
  constructor(name: string, props: MidTargetProps = {}, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:mid:MidTarget", name, {}, opts);

    const aptPrereqs = new mid.resource.Apt(`${name}-apt-prereqs`, {
      connection: props.connection,
      triggers: props.triggers,
      forceAptGet: true,
      updateCache: true,
      names: [
        "python3-apt",
      ],
    }, {
      parent: this,
      retainOnDelete: true,
    });

    if (props.hostname !== undefined) {
      new mid.resource.Exec("hostname", {
        connection: props.connection,
        triggers: props.triggers,
        create: {
          command: [
            "hostnamectl",
            "set-hostname",
            props.hostname,
          ],
        },
      }, {
        parent: this,
        retainOnDelete: true,
      });
    }

    if (props.unfuckUbuntu?.allowInstallRecommends !== false) {
      new mid.resource.File(`${name}-no-install-recommends`, {
        connection: props.connection,
        triggers: props.triggers,
        path: "/etc/apt/apt.conf.d/999norecommend",
        content: [
          `APT::Install-Recommends "0";\n`,
          `APT::Install-Suggests "0";\n`,
        ].join(""),
      }, {
        parent: this,
      });
    }

    if (props.unfuckUbuntu?.allowSnap !== false) {
      new mid.resource.File(`${name}-no-snap`, {
        connection: props.connection,
        triggers: props.triggers,
        path: "/etc/apt/preferences.d/nosnap.pref",
        content: [
          `Package: snapd\n`,
          `Pin: release a=*\n`,
          `Pin-Priority: -10\n`,
        ].join(""),
      }, {
        parent: this,
      });

      new mid.resource.Apt(`${name}-no-snap`, {
        connection: props.connection,
        triggers: props.triggers,
        name: "snapd",
        ensure: "absent",
        autoremove: true,
        autoclean: true,
        clean: true,
        purge: true,
      }, {
        parent: this,
        dependsOn: [
          aptPrereqs,
        ],
      });
    }

    if (props.unfuckUbuntu?.enableMotdNews !== false) {
      new mid.resource.Apt(`${name}-uninstall-motd-news-config`, {
        connection: props.connection,
        triggers: props.triggers,
        names: [
          "motd-news-config",
        ],
        ensure: "absent",
        autoremove: true,
        autoclean: true,
        purge: true,
      }, {
        parent: this,
        dependsOn: [
          aptPrereqs,
        ],
      });

      new mid.resource.File(`${name}-remove-motd-help-text`, {
        connection: props.connection,
        triggers: props.triggers,
        path: "/etc/update-motd.d/10-help-text",
        ensure: "absent",
      }, {
        parent: this,
      });
    }

    if (props.unfuckUbuntu?.removeEsm !== false) {
      new mid.resource.Apt(`${name}-remove-esm`, {
        connection: props.connection,
        triggers: props.triggers,
        names: [
          "ubuntu-pro-client",
          "ubuntu-release-upgrader-core",
          "update-notifier-common",
          "unattended-upgrades",
        ],
        ensure: "absent",
        autoremove: true,
        autoclean: true,
        purge: true,
      }, {
        parent: this,
        dependsOn: [
          aptPrereqs,
        ],
      });
    }

    if (props.unfuckUbuntu?.removeLxd !== false) {
      new mid.resource.Apt(`${name}-remove-lxd`, {
        connection: props.connection,
        triggers: props.triggers,
        names: [
          "lxc",
          "lxd",
          "lxd-agent-loader",
          "lxd-installer",
        ],
        ensure: "absent",
        autoremove: true,
        autoclean: true,
        purge: true,
      }, {
        parent: this,
        dependsOn: [
          aptPrereqs,
        ],
      });
    }
  }
}
