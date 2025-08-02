import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

export interface PrometheusNodeExporterProps {
  connection?: mid.types.input.ConnectionArgs;
  triggers?: mid.types.input.TriggersInputArgs;
  arch?: string;
  version?: string;
}

export class PrometheusNodeExporter extends pulumi.ComponentResource {
  constructor(name: string, props: PrometheusNodeExporterProps = {}, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:mid:PrometheusNodeExporter", name, {}, opts);

    const arch = props.arch ?? "amd64"; // TODO: support autodiscovery via `uname -m` or something
    const version = props.version ?? "1.9.1"; // TODO: support "latest"

    // TODO: mid: unarchive resource
    const install = new mid.resource.Exec(`${name}-install`, {
      connection: props.connection,
      triggers: props.triggers,
      create: {
        command: [
          "/bin/bash",
          "-c",
          pulumi.interpolate`set -euxo pipefail
wget -O ./prometheus-node-exporter.tar.gz https://github.com/prometheus/node_exporter/releases/download/v${version}/node_exporter-${version}.linux-${arch}.tar.gz
tar xzvf ./prometheus-node-exporter.tar.gz
cp ./node_exporter-${version}.linux-${arch}/node_exporter /usr/local/bin/node_exporter
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

    const systemdUnit = new mid.resource.File(`${name}-systemd-unit`, {
      connection: props.connection,
      triggers: props.triggers,
      path: "/etc/systemd/system/node_exporter.service",
      content: `[Unit]
Description=Prometheus Node Exporter
After=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/node_exporter '--collector.systemd'

SyslogIdentifier=node_exporter
Restart=always
RestartSec=1
StartLimitInterval=0
NoNewPrivileges=yes

ProtectSystem=strict
ProtectControlGroups=true
ProtectKernelModules=true
ProtectKernelTunables=yes

[Install]
WantedBy=multi-user.target
`,
    }, {
      parent: this,
    });

    const systemdService = new mid.resource.SystemdService(`${name}-node_exporter`, {
      connection: props.connection,
      name: "node_exporter.service",
      ensure: "started",
      enabled: true,
      daemonReload: true,
      triggers: {
        refresh: [
          systemdUnit.triggers.lastChanged,
          install.triggers.lastChanged,
          ...(props.triggers?.refresh ?? []) as any,
        ],
        ...props.triggers,
      },
    }, {
      parent: this,
    });
  }
}
