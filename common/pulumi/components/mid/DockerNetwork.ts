import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

export interface DockerNetworkProps {
  connection?: mid.types.input.ConnectionArgs;
  config?: mid.types.input.ResourceConfigArgs;
  triggers?: mid.types.input.TriggersInputArgs;
  name: pulumi.Input<string>;
}

export class DockerNetwork extends pulumi.ComponentResource {
  constructor(name: string, props: DockerNetworkProps, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:mid:DockerNetwork", name, {}, opts);

    new mid.resource.AnsibleTaskList(name, {
      connection: props.connection,
      config: props.config,
      triggers: props.triggers,
      tasks: {
        create: [
          {
            module: "docker_network",
            args: {
              name: props.name,
              state: "present",
            },
          },
        ],
        delete: [
          {
            module: "docker_network",
            args: {
              name: props.name,
              state: "absent",
            },
          },
        ],
      },
    });
  }
}
