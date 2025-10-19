import * as pulumi from "@pulumi/pulumi";
import * as tailscale from "@pulumi/tailscale";
import * as mid from "@sapslaj/pulumi-mid";

export interface TailscaleProps {
  connection?: mid.types.input.ConnectionArgs;
  triggers?: mid.types.input.TriggersInputArgs;
  tailnetKeyName?: pulumi.Input<string>;
  up?: pulumi.Input<pulumi.Input<string>[]>;
}

export class Tailscale extends pulumi.ComponentResource {
  tailnetKey: tailscale.TailnetKey;
  packages: mid.resource.Apt;
  service: mid.resource.SystemdService;
  up: mid.resource.Exec;

  constructor(name: string, props: TailscaleProps = {}, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:mid:Tailscale", name, {}, opts);

    this.tailnetKey = new tailscale.TailnetKey(name, {
      reusable: false,
      ephemeral: false,
      preauthorized: true,
      description: props.tailnetKeyName ?? name,
    }, {
      parent: this,
    });

    const sysctl = new mid.resource.AnsibleTaskList(`${name}-sysctl`, {
      connection: props.connection,
      triggers: props.triggers,
      tasks: {
        create: [
          {
            module: "sysctl",
            args: {
              name: "net.ipv4.ip_forward",
              value: "1",
              state: "present",
              sysctl_file: "/etc/sysctl.d/99-tailscale.conf",
              sysctl_set: true,
            },
          },
          {
            module: "sysctl",
            args: {
              name: "net.ipv6.conf.all.forwarding",
              value: "1",
              state: "present",
              sysctl_file: "/etc/sysctl.d/99-tailscale.conf",
              sysctl_set: true,
            },
          },
        ],
        delete: [
          {
            module: "sysctl",
            args: {
              name: "net.ipv4.ip_forward",
              value: "1",
              state: "absent",
              sysctl_file: "/etc/sysctl.d/99-tailscale.conf",
              sysctl_set: true,
            },
          },
          {
            module: "sysctl",
            args: {
              name: "net.ipv6.conf.all.forwarding",
              value: "1",
              state: "absent",
              sysctl_file: "/etc/sysctl.d/99-tailscale.conf",
              sysctl_set: true,
            },
          },
          {
            module: "file",
            args: {
              path: "/etc/sysctl.d/99-tailscale.conf",
              state: "absent",
            },
          },
        ],
      },
    }, {
      parent: this,
    });

    const tailscaleRepos = new mid.resource.Exec(`${name}-tailscale-repos`, {
      connection: props.connection,
      triggers: props.triggers,
      create: {
        command: [
          "/bin/sh",
          "-c",
          `
            set -eu
            . /etc/os-release
            curl "https://pkgs.tailscale.com/stable/ubuntu/$UBUNTU_CODENAME.noarmor.gpg" > /usr/share/keyrings/tailscale-archive-keyring.gpg
            chmod 0644 /usr/share/keyrings/tailscale-archive-keyring.gpg
            curl "https://pkgs.tailscale.com/stable/ubuntu/$UBUNTU_CODENAME.tailscale-keyring.list" > /etc/apt/sources.list.d/tailscale.list
            chmod 0644 /etc/apt/sources.list.d/tailscale.list
          `,
        ],
      },
      delete: {
        command: [
          "rm",
          "-rf",
          "/usr/share/keyrings/tailscale-archive-keyring.gpg",
          "/etc/apt/sources.list.d/tailscale.list",
        ],
      },
    }, {
      parent: this,
    });

    this.packages = new mid.resource.Apt(`${name}-tailscale`, {
      connection: props.connection,
      triggers: props.triggers,
      config: {
        check: false,
      },
      names: [
        "tailscale",
        "tailscale-archive-keyring",
      ],
      updateCache: true,
    }, {
      parent: this,
      dependsOn: [
        sysctl,
        tailscaleRepos,
      ],
    });

    this.service = new mid.resource.SystemdService(`${name}-tailscaled.service`, {
      connection: props.connection,
      triggers: props.triggers,
      config: {
        check: false,
      },
      name: "tailscaled.service",
      enabled: true,
      ensure: "started",
    }, {
      parent: this,
      dependsOn: [
        this.packages,
      ],
    });

    this.up = new mid.resource.Exec(`${name}-tailscale-up`, {
      connection: props.connection,
      triggers: props.triggers,
      create: {
        command: pulumi.all({ authKey: this.tailnetKey.key, up: props.up }).apply(({ authKey, up }) => {
          return [
            "tailscale",
            "up",
            `--auth-key=${authKey}`,
            ...(up ?? []),
          ];
        }),
      },
      update: {
        command: pulumi.all({ up: props.up }).apply(({ up }) => {
          return [
            "tailscale",
            "up",
            ...(up ?? []),
          ];
        }),
      },
    }, {
      parent: this,
      dependsOn: [
        this.service,
      ],
    });
  }
}
