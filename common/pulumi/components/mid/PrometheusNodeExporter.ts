import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

import { getGoarchOutput, latestGithubRelease } from "../mid-utils";
import { SystemdUnit } from "./SystemdUnit";

export interface PrometheusNodeExporterProps {
  connection?: mid.types.input.ConnectionArgs;
  triggers?: mid.types.input.TriggersInputArgs;
  arch?: pulumi.Input<string>;
  version?: pulumi.Input<string>;
}

export class PrometheusNodeExporter extends pulumi.ComponentResource {
  constructor(name: string, props: PrometheusNodeExporterProps = {}, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:mid:PrometheusNodeExporter", name, {}, opts);

    const version: pulumi.Input<string> = pulumi.unsecret(
      pulumi.output(
        props.version ?? latestGithubRelease("prometheus/node_exporter"),
      ).apply((v) => {
        if (v.startsWith("v")) {
          return v.replace(/^v/, "");
        }
        return v;
      }),
    );

    const targetArch = props.arch ?? getGoarchOutput({
      connection: props.connection,
    }, {
      parent: this,
    });

    const downloadURL = pulumi.all({ version, targetArch }).apply(({ version, targetArch }) => {
      return `https://github.com/prometheus/node_exporter/releases/download/v${version}/node_exporter-${version}.linux-${targetArch}.tar.gz`;
    });

    // TODO: mid: unarchive resource
    const install = new mid.resource.Exec(`${name}-install`, {
      connection: props.connection,
      triggers: props.triggers,
      config: {
        check: false,
      },
      create: {
        command: [
          "/bin/bash",
          "-c",
          pulumi.interpolate`set -euxo pipefail
            if curl -h 2 &>/dev/null; then
              nettool="curl"
            elif wget -h 2 &>/dev/null; then
              nettool="wget"
            else
              echo "ERROR: wget or curl not installed and required"
              exit 1
            fi
            systemctl stop node_exporter.service || true
            killall node_exporter || true
            case "$nettool" in
            wget*)
              wget -O ./prometheus-node-exporter.tar.gz '${downloadURL}'
              ;;
            curl*)
              curl -sL -o ./prometheus-node-exporter.tar.gz '${downloadURL}'
              ;;
            esac
            tar xzvf ./prometheus-node-exporter.tar.gz
            cp ./node_exporter-${version}.linux-${targetArch}/node_exporter /usr/local/bin/node_exporter
            chmod +x /usr/local/bin/node_exporter
          `,
        ],
        dir: "/tmp",
      },
      delete: {
        command: [
          "rm",
          "-f",
          "/usr/local/bin/node_exporter",
        ],
      },
    }, {
      parent: this,
    });

    new SystemdUnit(`${name}-node_exporter.service`, {
      connection: props.connection,
      triggers: props.triggers,
      name: "node_exporter.service",
      ensure: "started",
      enabled: true,
      unit: {
        Description: "Prometheus Node Exporter",
        After: "network-online.target",
      },
      service: {
        Type: "simple",
        ExecStart: "/usr/local/bin/node_exporter '--collector.systemd'",
        SyslogIdentifier: "node_exporter",
        Restart: "always",
        RestartSec: "1",
        StartLimitInterval: "0",
        NoNewPrivileges: "yes",
        ProtectSystem: "strict",
        ProtectControlGroups: "true",
        ProtectKernelModules: "true",
        ProtectKernelTunables: "yes",
      },
      install: {
        WantedBy: "multi-user.target",
      },
    }, {
      parent: this,
      dependsOn: [
        install,
      ],
    });
  }
}
