import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

export interface DockerContainerProps {
  connection?: mid.types.input.ConnectionArgs;
  config?: mid.types.input.ResourceConfigArgs;
  triggers?: mid.types.input.TriggersInputArgs;
  capabilities?: pulumi.Input<pulumi.Input<string>[]>;
  command?: pulumi.Input<string | pulumi.Input<string>[]>;
  devices?: pulumi.Input<pulumi.Input<string>[]>;
  entrypoint?: pulumi.Input<pulumi.Input<string>[]>;
  env?: pulumi.Input<Record<string, pulumi.Input<string>>>;
  healthcheck?: {
    interval?: pulumi.Input<string>;
    retries?: pulumi.Input<number>;
    startInterval?: pulumi.Input<string>;
    startPeriod?: pulumi.Input<string>;
    test?: pulumi.Input<string | pulumi.Input<string>[]>;
    testCliCompatible?: pulumi.Input<boolean>;
    timeout?: pulumi.Input<string>;
  };
  image?: pulumi.Input<string>;
  labels?: pulumi.Input<Record<string, pulumi.Input<string>>>;
  links?: pulumi.Input<pulumi.Input<string>[]>;
  memory?: pulumi.Input<string>;
  name?: pulumi.Input<string>;
  networkMode?: pulumi.Input<string>;
  pidMode?: pulumi.Input<string>;
  privileged?: pulumi.Input<boolean>;
  publishedPorts?: pulumi.Input<pulumi.Input<string>[]>;
  restartPolicy?: pulumi.Input<"no" | "on-failure" | "always" | "unless-stopped">;
  volumes?: pulumi.Input<pulumi.Input<string>[]>;
}

export class DockerContainer extends pulumi.ComponentResource {
  constructor(name: string, props: DockerContainerProps, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:mid:DockerContainer", name, {}, opts);

    new mid.resource.AnsibleTaskList(name, {
      connection: props.connection,
      config: props.config,
      triggers: props.triggers,
      tasks: {
        create: [
          {
            module: "docker_container",
            args: {
              comparisons: {
                "*": "strict",
              },
              capabilities: props.capabilities,
              command: props.command,
              devices: props.devices,
              entrypoint: props.entrypoint,
              env: props.env,
              healthcheck: props.healthcheck === undefined ? undefined : {
                interval: props.healthcheck.interval,
                retries: props.healthcheck.retries,
                start_interval: props.healthcheck.startInterval,
                start_period: props.healthcheck.startPeriod,
                test: props.healthcheck.test,
                test_cli_compatible: props.healthcheck.testCliCompatible,
                timeout: props.healthcheck.timeout,
              },
              image: props.image,
              labels: props.labels,
              links: props.links,
              memory: props.memory,
              name: props.name ?? name,
              network_mode: props.networkMode,
              pid_mode: props.pidMode,
              privileged: props.privileged,
              published_ports: props.publishedPorts,
              restart_policy: props.restartPolicy,
              volumes: props.volumes,
            },
          },
        ],
        update: [
          {
            module: "docker_container",
            args: {
              restart: true,
              comparisons: {
                "*": "strict",
              },
              capabilities: props.capabilities,
              command: props.command,
              devices: props.devices,
              entrypoint: props.entrypoint,
              env: props.env,
              healthcheck: props.healthcheck === undefined ? undefined : {
                interval: props.healthcheck.interval,
                retries: props.healthcheck.retries,
                start_interval: props.healthcheck.startInterval,
                start_period: props.healthcheck.startPeriod,
                test: props.healthcheck.test,
                test_cli_compatible: props.healthcheck.testCliCompatible,
                timeout: props.healthcheck.timeout,
              },
              image: props.image,
              labels: props.labels,
              links: props.links,
              memory: props.memory,
              name: props.name ?? name,
              network_mode: props.networkMode,
              pid_mode: props.pidMode,
              privileged: props.privileged,
              published_ports: props.publishedPorts,
              restart_policy: props.restartPolicy,
              volumes: props.volumes,
            },
          },
        ],
        delete: [
          {
            module: "docker_container",
            args: {
              name: props.name ?? name,
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
