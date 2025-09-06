import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

import { mergeTriggers } from "../mid-utils";
import { DockerContainer } from "./DockerContainer";
import { SystemdUnit } from "./SystemdUnit";

export interface DockerHostProps {
  connection?: mid.types.input.ConnectionArgs;
  config?: mid.types.input.ResourceConfigArgs;
  triggers?: mid.types.input.TriggersInputArgs;
  enableDockerHousekeeper?: boolean;
  enableCadvisor?: boolean;
  enableWatchtower?: boolean;
  cadvisorImage?: pulumi.Input<string>;
  watchtowerImage?: pulumi.Input<string>;
  watchtowerHTTPAPIToken?: pulumi.Input<string>;
  watchtowerPort?: pulumi.Input<number>;
}

export class DockerHost extends pulumi.ComponentResource {
  service: mid.resource.SystemdService;

  constructor(name: string, props: DockerHostProps, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:mid:DockerHost", name, {}, opts);

    const repoSetup = new mid.resource.Exec(`${name}-repo-setup`, {
      connection: props.connection,
      config: props.config,
      triggers: props.triggers,
      create: {
        command: [
          "/bin/bash",
          "-c",
          `
            set -euxo pipefail
            curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
            chmod a+r /etc/apt/keyrings/docker.asc
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu  $(. /etc/os-release && echo "\${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" |  sudo tee /etc/apt/sources.list.d/docker.list
          `,
        ],
      },
      delete: {
        command: [
          "/bin/bash",
          "-c",
          "rm -rf /etc/apt/keyrings/docker.asc /etc/apt/sources.list.d/docker.list",
        ],
      },
    }, {
      parent: this,
    });

    const dockerPackages = new mid.resource.Apt(`${name}-docker-packages`, {
      connection: props.connection,
      names: [
        "docker-ce",
        "docker-ce-cli",
        "containerd.io",
        "docker-buildx-plugin",
        "docker-compose-plugin",
      ],
      updateCache: true,
      ensure: "present",
      config: {
        ...props.config,
        check: false,
      },
      triggers: mergeTriggers(props.triggers, {
        refresh: [
          repoSetup.triggers.lastChanged,
        ],
      }),
    }, {
      parent: this,
    });

    const dockerConfig = new mid.resource.File(`${name}-docker-config`, {
      connection: props.connection,
      config: props.config,
      path: "/etc/docker/daemon.json",
      content: JSON.stringify({
        "log-driver": "journald",
        "metrics-addr": "0.0.0.0:9323",
        "experimental": true,
      }),
    }, {
      parent: this,
      dependsOn: [
        dockerPackages,
      ],
    });

    const dockerGroup = new mid.resource.Group(`${name}-docker`, {
      connection: props.connection,
      config: props.config,
      name: "docker",
    }, {
      parent: this,
    });

    if (props.connection) {
      new mid.resource.User(`${name}-docker-group-addition`, {
        connection: props.connection,
        config: {
          ...props.config,
          check: false,
        },
        name: props.connection!.user!,
        groupsExclusive: false,
        groups: [dockerGroup.name],
      }, {
        retainOnDelete: true,
        parent: this,
      });
    }

    this.service = new mid.resource.SystemdService(`${name}-docker`, {
      connection: props.connection,
      config: props.config,
      name: "docker.service",
      enabled: true,
      ensure: "started",
      triggers: {
        refresh: [
          dockerConfig.triggers.lastChanged,
          dockerGroup.triggers.lastChanged,
        ],
      },
    }, {
      parent: this,
      dependsOn: [
        dockerGroup,
        dockerPackages,
        dockerConfig,
      ],
    });

    if (props.enableDockerHousekeeper !== false) {
      const service = new SystemdUnit(`${name}-docker-housekeeper-service`, {
        connection: props.connection,
        config: props.config,
        name: "docker-housekeeper.service",
        daemonReload: true,
        unit: {
          "Description": "Cleanup Docker artifacts to preserve disk space",
        },
        service: {
          "Type": "oneshot",
          "ExecStart": [
            "/usr/bin/docker image prune -a -f",
            "/usr/bin/docker volume prune -f",
          ],
          "WorkingDirectory": "/tmp",
        },
        install: {
          "WantedBy": "multi-user.target",
        },
      }, {
        parent: this,
        dependsOn: [
          this.service,
        ],
      });

      new SystemdUnit(`${name}-docker-housekeeper-timer`, {
        connection: props.connection,
        config: props.config,
        name: "docker-housekeeper.timer",
        daemonReload: true,
        unit: {
          "Description": "Cleanup Docker artifacts to preserve disk space (daily)",
        },
        timer: {
          "OnCalendar": "daily",
          "Persistent": "true",
        },
        install: {
          "WantedBy": "timers.target",
        },
      }, {
        parent: this,
        dependsOn: [
          service,
        ],
      });
    }

    if (props.enableWatchtower !== false) {
      const watchtowerPort = props.watchtowerPort ?? 9420;
      new DockerContainer(`${name}-watchtower`, {
        connection: props.connection,
        config: props.config,
        triggers: props.triggers,
        name: "watchtower",
        image: props.watchtowerImage ?? "proxy.oci.sapslaj.xyz/docker-hub/containrrr/watchtower",
        restartPolicy: "unless-stopped",
        env: {
          WATCHTOWER_POLL_INTERVAL: "86400", // One day
          WATCHTOWER_HTTP_API_METRICS: "true",
          WATCHTOWER_HTTP_API_TOKEN: props.watchtowerHTTPAPIToken ?? "adminadmin",
        },
        volumes: [
          "/var/run/docker.sock:/var/run/docker.sock",
        ],
        publishedPorts: [
          pulumi.interpolate`0.0.0.0:${watchtowerPort}:8080`,
          pulumi.interpolate`[::]:${watchtowerPort}:8080`,
        ],
      }, {
        parent: this,
        dependsOn: [
          this.service,
        ],
      });
    }

    if (props.enableCadvisor !== false) {
      new DockerContainer(`${name}-cadvisor`, {
        connection: props.connection,
        config: props.config,
        triggers: props.triggers,
        name: "cadvisor",
        image: props.cadvisorImage ?? "gcr.io/cadvisor/cadvisor:v0.47.0", // latest is not actually latest :(
        restartPolicy: "unless-stopped",
        privileged: true,
        networkMode: "host",
        pidMode: "host",
        volumes: [
          "/:/rootfs:ro",
          "/var/run:/var/run:rw",
          "/sys:/sys:ro",
          "/var/lib/docker/:/var/lib/docker:ro",
          "/dev/disk/:/dev/disk:ro",
        ],
        devices: [
          "/dev/kmsg",
        ],
        command: [
          "--port=9338",
          "--docker_only=true",
          "--enable_load_reader=true",
        ],
        healthcheck: {
          test: [
            "NONE",
          ],
        },
      }, {
        parent: this,
        dependsOn: [
          this.service,
        ],
      });
    }
  }
}
