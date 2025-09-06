import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

export interface MidTargetProps {
  connection?: mid.types.input.ConnectionArgs;
  triggers?: mid.types.input.TriggersInputArgs;
  hostname?: pulumi.Input<string>;
  installSudo?: boolean;
  unfuckUbuntu?: {
    allowInstallRecommends?: boolean;
    allowSnap?: boolean;
    enableMotdNews?: boolean;
    allowEsm?: boolean;
    allowLxd?: boolean;
  };
  sysctlTweaks?: {
    enableMaxUserInstances?: boolean;
    enableMaxUserWatches?: boolean;
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
      config: {
        check: false,
      },
    }, {
      parent: this,
      retainOnDelete: true,
    });

    let addPackages: string[] = [];
    let removePackages: string[] = [];

    if (props.installSudo !== false) {
      addPackages.push("sudo");
    }

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

    if (props.unfuckUbuntu?.allowInstallRecommends !== true) {
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

    if (props.unfuckUbuntu?.allowSnap !== true) {
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

      removePackages.push(
        "snapd",
      );
    }

    if (props.unfuckUbuntu?.enableMotdNews !== true) {
      new mid.resource.File(`${name}-remove-motd-help-text`, {
        connection: props.connection,
        triggers: props.triggers,
        path: "/etc/update-motd.d/10-help-text",
        ensure: "absent",
      }, {
        parent: this,
      });

      removePackages.push(
        "motd-news-config",
      );
    }

    if (props.unfuckUbuntu?.allowEsm !== true) {
      removePackages.push(
        "ubuntu-pro-client",
        "ubuntu-release-upgrader-core",
        "update-notifier-common",
        "unattended-upgrades",
      );
    }

    if (props.unfuckUbuntu?.allowLxd !== true) {
      removePackages.push(
        "lxc",
        "lxd",
        "lxd-agent-loader",
        "lxd-installer",
      );
    }

    if (addPackages.length > 0) {
      new mid.resource.Apt(`${name}-add-packages`, {
        connection: props.connection,
        triggers: props.triggers,
        names: addPackages,
        ensure: "present",
        config: {
          check: false,
        },
      }, {
        parent: this,
        retainOnDelete: true,
        dependsOn: [
          aptPrereqs,
        ],
      });
    }

    if (removePackages.length > 0) {
      new mid.resource.Apt(`${name}-remove-packages`, {
        connection: props.connection,
        triggers: props.triggers,
        names: removePackages,
        ensure: "absent",
        autoremove: true,
        autoclean: true,
        clean: true,
        purge: true,
        config: {
          check: false,
        },
      }, {
        parent: this,
        retainOnDelete: true,
        dependsOn: [
          aptPrereqs,
        ],
      });
    }

    const sysctlTweakTasks: mid.types.input.resource.AnsibleTaskListArgsTaskArgs[] = [];

    if (props.sysctlTweaks?.enableMaxUserInstances !== false) {
      sysctlTweakTasks.push({
        module: "sysctl",
        args: {
          name: "fs.inotify.max_user_instances",
          value: "8192",
          state: "present",
          sysctl_set: true,
        },
      });
    }

    if (props.sysctlTweaks?.enableMaxUserWatches !== false) {
      sysctlTweakTasks.push({
        module: "sysctl",
        args: {
          name: "fs.inotify.max_user_watches",
          value: "524288",
          state: "present",
          sysctl_set: true,
        },
      });
    }

    if (sysctlTweakTasks.length > 0) {
      new mid.resource.AnsibleTaskList(`${name}-sysctl-tweaks`, {
        connection: props.connection,
        triggers: props.triggers,
        tasks: {
          create: sysctlTweakTasks,
        },
      }, {
        parent: this,
        retainOnDelete: true,
      });
    }
  }
}
