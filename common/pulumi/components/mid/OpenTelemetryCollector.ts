import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";
import * as YAML from "yaml";

import { mergeTriggers } from "../mid-utils";

export interface OpenTelemetryCollectorProps {
  connection?: mid.types.input.ConnectionArgs;
  triggers?: mid.types.input.TriggersInputArgs;
  arch?: pulumi.Input<string>;
  version?: pulumi.Input<string>;
  listenHost?: pulumi.Input<string>;
}

export class OpenTelemetryCollector extends pulumi.ComponentResource {
  package: mid.resource.Apt;
  service: mid.resource.SystemdService;

  constructor(name: string, props: OpenTelemetryCollectorProps = {}, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:mid:OpenTelemetryCollector", name, {}, opts);

    const listenHost = props.listenHost ?? "127.0.0.1";

    const version: pulumi.Input<string> = pulumi.unsecret(
      pulumi.output(
        props.version
          ?? fetch("https://api.github.com/repos/open-telemetry/opentelemetry-collector-releases/releases/latest")
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
      return `https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${version}/otelcol_${version}_linux_${targetArch}.deb`;
    });

    this.package = new mid.resource.Apt(`${name}-otelcol`, {
      connection: props.connection,
      triggers: props.triggers,
      deb: downloadURL,
      config: {
        check: false,
      },
    }, {
      parent: this,
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
          path: "/etc/otelcol/otelcol.conf",
          line: pulumi.concat(key, "='", value, "'"),
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

    const configFile = new mid.resource.File(`${name}-/etc/otelcol/config.yaml`, {
      connection: props.connection,
      triggers: props.triggers,
      path: "/etc/otelcol/config.yaml",
      backup: true,
      content: pulumi.all({ listenHost, remoteWriteAuthorizationHeader }).apply(
        ({ listenHost, remoteWriteAuthorizationHeader }) => {
          return YAML.stringify({
            receivers: {
              otlp: {
                protocols: {
                  grpc: {
                    endpoint: `${listenHost}:4317`,
                  },
                  http: {
                    endpoint: `${listenHost}:4318`,
                  },
                },
              },
            },
            processors: {
              batch: null,
            },
            exporters: {
              otlphttp: {
                endpoint: "https://jaeger-collector-otlp-http.sapslaj.xyz",
                headers: {
                  Authorization: remoteWriteAuthorizationHeader,
                },
              },
            },
            service: {
              pipelines: {
                traces: {
                  receivers: [
                    "otlp",
                  ],
                  processors: [
                    "batch",
                  ],
                  exporters: [
                    "otlphttp",
                  ],
                },
              },
            },
          });
        },
      ),
    }, {
      parent: this,
      dependsOn: [
        this.package,
      ],
    });

    this.service = new mid.resource.SystemdService(`${name}-otelcol.service`, {
      connection: props.connection,
      triggers: mergeTriggers(props.triggers, {
        refresh: [
          configFile.triggers.lastChanged,
        ],
      }),
      name: "otelcol.service",
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
