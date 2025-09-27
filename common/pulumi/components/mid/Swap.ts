import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

export interface SwapProps {
  connection?: mid.types.input.ConnectionArgs;
  triggers?: mid.types.input.TriggersInputArgs;
  path?: pulumi.Input<string>;
  swapSize?: pulumi.Input<string>;
  swappiness?: pulumi.Input<number>;
}

export class Swap extends pulumi.ComponentResource {
  constructor(name: string, props: SwapProps = {}, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:mid:Swap", name, {}, opts);

    const path = props.path ?? "/swap";
    const swapSize = props.swapSize ?? "1G";

    const swapfileCreate = new mid.resource.Exec(`${name}-swapfile-create`, {
      connection: props.connection,
      triggers: props.triggers,
      create: {
        command: pulumi.all({ path, swapSize }).apply(({ path, swapSize }) => {
          return [
            "/bin/sh",
            "-c",
            `
              fallocate -l '${swapSize}' '${path}'
              dd if=/dev/zero 'of=${path}' bs=1M count=1024
              chmod 600 '${path}'
              mkswap '${path}'
            `,
          ];
        }),
      },
      delete: {
        command: ["rm", "-f", path],
      },
    }, {
      parent: this,
    });

    const fstab = new mid.resource.FileLine(`${name}-swap-fstab`, {
      connection: props.connection,
      triggers: props.triggers,
      path: "/etc/fstab",
      line: pulumi.interpolate`${path} none swap sw 0 0`,
      regexp: pulumi.interpolate`${path} `,
    }, {
      parent: this,
      dependsOn: [
        swapfileCreate,
      ],
    });

    new mid.resource.Exec(`${name}-swapon`, {
      connection: props.connection,
      triggers: props.triggers,
      create: {
        command: ["swapon", path],
      },
      delete: {
        command: ["swapoff", path],
      },
    }, {
      parent: this,
      dependsOn: [
        fstab,
      ],
    });

    if (props.swappiness !== undefined) {
      new mid.resource.AnsibleTaskList(`${name}-swapiness`, {
        connection: props.connection,
        triggers: props.triggers,
        tasks: {
          create: [
            {
              module: "sysctl",
              args: {
                name: "vm.swappiness",
                value: pulumi.interpolate`${props.swappiness}`,
                state: "present",
                sysctl_file: "/etc/sysctl.d/swap.conf",
                sysctl_set: true,
              },
            },
          ],
          delete: [
            {
              module: "sysctl",
              args: {
                name: "vm.swappiness",
                value: pulumi.interpolate`${props.swappiness}`,
                state: "absent",
                sysctl_file: "/etc/sysctl.d/swap.conf",
                sysctl_set: true,
              },
            },
            {
              module: "file",
              args: {
                path: "/etc/sysctl.d/swap.conf",
                state: "absent",
              },
            },
          ],
        },
      }, {
        parent: this,
      });
    }
  }
}
