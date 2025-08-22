import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";
import * as YAML from "yaml";

import { mergeTriggers } from "../../mid-utils";

export interface VectorProps {
  connection?: mid.types.input.ConnectionArgs;
  triggers?: mid.types.input.TriggersInputArgs;
  sources?: Record<string, Record<string, any>>;
  transforms?: Record<string, Record<string, any>>;
  sinks?: Record<string, Record<string, any>>;
  config?: any;
}

export class Vector extends pulumi.ComponentResource {
  package: mid.resource.Apt;
  service: mid.resource.SystemdService;

  constructor(name: string, props: VectorProps = {}, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:mid:Vector", name, {}, opts);

    const curl = new mid.resource.Apt(`${name}-curl`, {
      connection: props.connection,
      triggers: props.triggers,
      name: "curl",
      config: {
        check: false,
      },
    }, {
      parent: this,
      retainOnDelete: true,
    });

    const repoSetup = new mid.resource.Exec(`${name}-vector-repo-setup`, {
      connection: props.connection,
      triggers: props.triggers,
      create: {
        command: [
          "/bin/bash",
          "-c",
          "eval \"$(curl -L https://setup.vector.dev)\"",
        ],
      },
      delete: {
        command: [
          "rm",
          "-rf",
          "/etc/apt/sources.list.d/timber-vector.list",
          "/etc/apt/trusted.gpg.d/datadog-archive-keyring.gpg",
          "/usr/share/keyrings/datadog-archive-keyring.gpg",
        ],
      },
    }, {
      parent: this,
      dependsOn: [
        curl,
      ],
    });

    this.package = new mid.resource.Apt(`${name}-vector`, {
      connection: props.connection,
      triggers: props.triggers,
      name: "vector",
      updateCache: true,
      config: {
        check: false,
      },
    }, {
      parent: this,
      dependsOn: [
        repoSetup,
      ],
    });

    const remoteWriteUsername = "remotewrite";

    const remoteWritePassword = aws.ssm.getParameterOutput({
      name: `/nekopara/victoria-metrics/ingress-user/${remoteWriteUsername}/password`,
    }).value;

    const remoteWriteAuthorizationHeader = remoteWritePassword.apply((password) => {
      return "Basic " + btoa(`${remoteWriteUsername}:${password}`);
    });

    const envvars = {
      REMOTE_WRITE_USERNAME: remoteWriteUsername,
      REMOTE_WRITE_PASSWORD: remoteWritePassword,
      REMOTE_WRITE_AUTHORIZATION_HEADER: remoteWriteAuthorizationHeader,
    };

    const envVarLines: mid.resource.FileLine[] = [];
    Object.entries(envvars).map(([key, value]) => {
      envVarLines.push(
        new mid.resource.FileLine(`${name}-${key}`, {
          connection: props.connection,
          triggers: props.triggers,
          path: "/etc/default/vector",
          line: pulumi.concat(key, "=", value),
          regexp: `^${key}=`,
        }, {
          parent: this,
          dependsOn: [
            this.package,
            ...envVarLines,
          ],
        }),
      );
    });

    const defaultSources: Record<string, Record<string, any>> = {
      logs_journald: {
        type: "journald",
      },
      metrics_internal: {
        type: "internal_metrics",
      },
      metrics_host: {
        type: "host_metrics",
        scrape_interval_secs: 60,
      },
      metrics_node_exporter: {
        type: "prometheus_scrape",
        endpoints: ["http://localhost:9100/metrics"],
        scrape_interval_secs: 60,
        scrape_timeout_secs: 45,
      },
    };

    const defaultSinks: Record<string, Record<string, any>> = {
      victorialogs: {
        type: "elasticsearch",
        api_version: "v8",
        compression: "gzip",
        endpoints: [
          "https://victoriametrics-vlinsert.sapslaj.xyz/insert/elasticsearch",
        ],
        healthcheck: {
          enabled: false,
        },
        inputs: ["logs_*"],
        mode: "bulk",
        request: {
          headers: {
            Authorization: "${REMOTE_WRITE_AUTHORIZATION_HEADER?}",
            AccountID: "0",
            ProjectID: "0",
            "VL-Msg-Field": "message,msg,_msg,log.msg,log.message,log",
            "VL-Stream-Fields": "stream,hostname",
            "VL-Time-Field": "timestamp",
          },
        },
      },
      victoriametrics: {
        type: "prometheus_remote_write",
        inputs: ["metrics_*"],
        endpoint: "https://victoriametrics-vminsert.sapslaj.xyz/insert/0/prometheus/api/v1/write",
        compression: "zstd",
        auth: {
          strategy: "basic",
          user: "${REMOTE_WRITE_USERNAME?}",
          password: "${REMOTE_WRITE_PASSWORD?}",
        },
        healthcheck: {
          enabled: false,
        },
      },
      internal_metrics_prometheus_exporter: {
        type: "prometheus_exporter",
        inputs: ["metrics_internal"],
        address: "0.0.0.0:9598",
      },
    };

    let config: {
      sources: Record<string, Record<string, any>>;
      transforms: Record<string, Record<string, any>>;
      sinks: Record<string, Record<string, any>>;
      [key: string]: any;
    } = {
      data_dir: "/var/lib/vector",
      api: {
        enabled: true,
      },
      sources: props.sources ?? {},
      transforms: props.transforms ?? {},
      sinks: props.sinks ?? {},
    };

    for (const [key, value] of Object.entries(defaultSources)) {
      const providedConfig = (props.sources ?? {})[key] ?? {};
      if (providedConfig.enabled !== false) {
        config.sources[key] = {
          ...value,
          ...providedConfig,
          enabled: undefined,
        };
      } else {
        delete config.sources[key];
      }
    }

    for (const [key, value] of Object.entries(config.sources)) {
      if (key.startsWith("logs_")) {
        config.transforms[`${key}_default_labels`] = {
          type: "remap",
          inputs: [key],
          source: `
.job = "host_vector/${key}"
.hostname = get_hostname!()
`,
        };
      } else if (key.startsWith("metrics_")) {
        config.transforms[`${key}_default_labels`] = {
          type: "remap",
          inputs: [key],
          source: `
.tags.job = "host_vector/${key}"
.tags.hostname = get_hostname!()
if .tags.instance == null {
  .tags.instance = .tags.hostname
}
`,
        };
      }
    }

    for (const [key, value] of Object.entries(defaultSinks)) {
      const providedConfig = (props.sinks ?? {})[key] ?? {};
      let datatype = "";
      if (key === "victorialogs") {
        datatype = "logs";
      } else if (key === "victoriametrics") {
        datatype = "metrics";
      }
      if (providedConfig.enabled !== false) {
        config.sinks[key] = {
          ...value,
        };

        if (datatype !== "") {
          config.sinks[key] = {
            ...config.sinks[key],
            inputs: Object.keys(config.transforms).filter((k) => k.startsWith(datatype + "_")),
          };
        }

        config.sinks[key] = {
          ...config.sinks[key],
          ...providedConfig,
          enabled: undefined,
        };
      } else {
        delete config.sinks[key];
      }
    }

    if (props.config) {
      config = {
        ...config,
        ...props.config,
      };
    }

    const configFile = new mid.resource.File(`${name}-/etc/vector/vector.yaml`, {
      connection: props.connection,
      triggers: props.triggers,
      path: "/etc/vector/vector.yaml",
      backup: true,
      content: YAML.stringify(config),
    }, {
      parent: this,
      dependsOn: [
        this.package,
        ...envVarLines,
      ],
    });

    this.service = new mid.resource.SystemdService(`${name}-vector.service`, {
      connection: props.connection,
      triggers: mergeTriggers(props.triggers, {
        refresh: [
          configFile.triggers.lastChanged,
        ],
      }),
      name: "vector.service",
      ensure: "started",
      enabled: true,
    }, {
      parent: this,
      dependsOn: [
        this.package,
      ],
    });
  }
}
