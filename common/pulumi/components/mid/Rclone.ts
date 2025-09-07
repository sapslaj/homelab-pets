import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

export interface RcloneProps {
  connection?: mid.types.input.ConnectionArgs;
  triggers?: mid.types.input.TriggersInputArgs;
  arch?: pulumi.Input<string>;
  version?: pulumi.Input<string>;
  configs?: {
    name: pulumi.Input<string>;
    properties: pulumi.Input<Record<string, pulumi.Input<string>>>;
  }[];
  jobs?: Record<string, {
    src: pulumi.Input<string>;
    dest: pulumi.Input<string>;
    ensure?: pulumi.Input<string>;
    enabled?: pulumi.Input<boolean>;
  }>;
}

export class Rclone extends pulumi.ComponentResource {
  package: mid.resource.Apt;
  configDir?: mid.resource.File;
  configFile?: mid.resource.File;
  jobsDir?: mid.resource.File;
  jobs?: Record<string, mid.resource.SystemdService>;

  constructor(name: string, props: RcloneProps, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:mid:Rclone", name, {}, opts);

    const version: pulumi.Input<string> = pulumi.unsecret(
      pulumi.output(
        props.version
          ?? fetch("https://api.github.com/repos/rclone/rclone/releases/latest")
            .then((res) => res.json())
            .then((res) => res["tag_name"]),
      ).apply((v) => {
        if (v.startsWith("v")) {
          return v.replace(/^v/, "");
        }
        return v;
      }),
    );

    const targetArch = props.arch ?? pulumi.unsecret(
      mid.agent.execOutput({
        connection: props.connection,
        command: ["uname", "-m"],
      }, {
        parent: this,
      }).apply((arch) => {
        switch (arch.stdout.trim()) {
          case "arm":
            return "armv7";
          case "aarch64":
            return "arm64";
          case "i386":
          case "i686":
            return "386";
          case "x86_64":
            return "amd64";
        }
        throw new Error(`unsupported architecture: ${arch.stdout.trim()}`);
      }),
    );

    const downloadURL = pulumi.all({ version, targetArch }).apply(({ version, targetArch }) => {
      // https://github.com/rclone/rclone/releases/download/v1.71.0/rclone-v1.71.0-linux-arm64.deb
      return `https://github.com/rclone/rclone/releases/download/v${version}/rclone-v${version}-linux-${targetArch}.deb`;
    });

    this.package = new mid.resource.Apt(`${name}-rclone`, {
      connection: props.connection,
      triggers: props.triggers,
      config: {
        check: false,
      },
      deb: downloadURL,
    }, {
      parent: this,
    });

    if (props.configs) {
      this.configDir = new mid.resource.File(`${name}-rclone-config-dir`, {
        connection: props.connection,
        triggers: props.triggers,
        path: "/root/.config/rclone/",
        ensure: "directory",
        recurse: true,
      }, {
        parent: this,
      });

      this.configFile = new mid.resource.File(`${name}-rclone-config-file`, {
        connection: props.connection,
        triggers: props.triggers,
        path: "/root/.config/rclone/rclone.conf",
        content: pulumi.output(props.configs).apply((configs) => {
          return configs.map((config) => {
            let section = `[${config.name}]\n`;
            for (const [key, value] of Object.entries(config.properties)) {
              section += `${key} = ${value}\n`;
            }
            return section;
          }).join("\n\n");
        }),
      }, {
        parent: this,
        dependsOn: [
          this.configDir,
        ],
      });
    }

    if (props.jobs) {
      this.jobsDir = new mid.resource.File(`${name}-rclone-jobs-dir`, {
        connection: props.connection,
        triggers: props.triggers,
        path: "/usr/local/libexec/rclone/",
        ensure: "directory",
        recurse: true,
      }, {
        parent: this,
      });

      const systemdService = new mid.resource.File(`${name}-rclone-systemd-service`, {
        connection: props.connection,
        triggers: props.triggers,
        path: "/etc/systemd/system/rclone-sync@.service",
        content: [
          "[Unit]",
          "Description=rclone sync %i",
          "",
          "[Service]",
          "Type=simple",
          "ExecStart=/usr/local/libexec/rclone/rclone-sync-%i.sh",
          "",
        ].join("\n"),
      }, {
        parent: this,
      });

      const systemdTimer = new mid.resource.File(`${name}-rclone-systemd-timer`, {
        connection: props.connection,
        triggers: props.triggers,
        path: "/etc/systemd/system/rclone-sync@.timer",
        content: [
          "[Unit]",
          "Description=rclone sync %i",
          "Wants=network-online.target",
          "",
          "[Timer]",
          "OnCalendar=weekly",
          "",
          "[Install]",
          "WantedBy=timers.target",
          "",
        ].join("\n"),
      }, {
        parent: this,
      });

      this.jobs = {};
      for (const [key, config] of Object.entries(props.jobs)) {
        const script = new mid.resource.File(`${name}-rclone-job-${key}-script`, {
          connection: props.connection,
          triggers: props.triggers,
          path: `/usr/local/libexec/rclone/rclone-sync-${key}.sh`,
          content: pulumi.concat(
            "#!/bin/bash\n",
            "set -euxo pipefail\n",
            pulumi.interpolate`rclone sync -v -P "${config.src}" "${config.dest}"\n`,
          ),
          mode: "a+x",
        }, {
          parent: this,
          dependsOn: [
            this.jobsDir,
          ],
        });

        this.jobs[key] = new mid.resource.SystemdService(`${name}-rclone-job-${key}-timer`, {
          connection: props.connection,
          triggers: props.triggers,
          name: pulumi.interpolate`rclone-sync@${key}.timer`,
          ensure: config.ensure,
          enabled: config.enabled,
          daemonReload: true,
        }, {
          parent: this,
          dependsOn: [
            script,
            systemdTimer,
            systemdService,
            ...(this.configFile ? [this.configFile] : []),
          ],
        });
      }
    }
  }
}
