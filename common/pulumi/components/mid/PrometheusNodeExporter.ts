import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

import { SystemdUnit } from "./SystemdUnit";

export interface PrometheusNodeExporterProps {
  connection?: mid.types.input.ConnectionArgs;
  triggers?: mid.types.input.TriggersInputArgs;
  arch?: string;
  version?: string;
}

export class PrometheusNodeExporter extends pulumi.ComponentResource {
  constructor(name: string, props: PrometheusNodeExporterProps = {}, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:mid:PrometheusNodeExporter", name, {}, opts);

    const version: pulumi.Input<string> = pulumi.unsecret(
      pulumi.output(
        props.version
          ?? fetch("https://api.github.com/repos/prometheus/node_exporter/releases/latest")
            .then((res) => res.json())
            .then((res) => res["tag_name"]),
      ).apply((v) => {
        if (v.startsWith("v")) {
          return v.replace(/^v/, "");
        }
        return v;
      }),
    );

    const targetArch = pulumi.unsecret(
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
      return `https://github.com/prometheus/node_exporter/releases/download/v${version}/node_exporter-${version}.linux-${targetArch}.tar.gz`;
    });

    // TODO: mid: unarchive resource
    const install = new mid.resource.Exec(`${name}-install`, {
      connection: props.connection,
      triggers: props.triggers,
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
