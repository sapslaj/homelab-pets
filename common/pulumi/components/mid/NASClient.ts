import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

export interface NASClientProps {
  connection?: mid.types.input.ConnectionArgs;
  config?: mid.types.input.ResourceConfigArgs;
  triggers?: mid.types.input.TriggersInputArgs;
}

export class NASClient extends pulumi.ComponentResource {
  constructor(name: string, props: NASClientProps, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:mid:NASClient", name, {}, opts);

    const packages = new mid.resource.Apt(name, {
      connection: props.connection,
      config: props.config,
      triggers: props.triggers,
      names: [
        "nfs-common",
      ],
    }, {
      parent: this,
    });

    new mid.resource.AnsibleTaskList(name, {
      connection: props.connection,
      config: props.config,
      triggers: props.triggers,
      tasks: {
        create: [
          {
            module: "mount",
            args: {
              src: "172.24.4.10:/mnt/exos",
              path: "/mnt/exos",
              fstype: "nfs4",
              state: "mounted",
            },
          },
        ],
        delete: [
          {
            module: "mount",
            args: {
              path: "/mnt/exos",
              state: "unmounted",
            },
          },
        ],
      },
    }, {
      parent: this,
      dependsOn: [
        packages,
      ],
    });
  }
}
