import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

import { Autoupdate } from "../common/pulumi/components/mid/Autoupdate";
import { BaselineUsers } from "../common/pulumi/components/mid/BaselineUsers";
import { MidTarget } from "../common/pulumi/components/mid/MidTarget";
import { PrometheusNodeExporter } from "../common/pulumi/components/mid/PrometheusNodeExporter";
import { BaseConfigTrait } from "../common/pulumi/components/proxmox-vm/BaseConfigTrait";
import { ProxmoxVM } from "../common/pulumi/components/proxmox-vm/ProxmoxVM";

const vm = new ProxmoxVM("clickhouse", {
  traits: [
    new BaseConfigTrait("base", {
      ansible: false,
      cloudImage: {
        diskConfig: {
          size: 64,
        },
      },
    }),
  ],
});

const provider = new mid.Provider("clickhouse", {
  connection: vm.connection,
  deleteUnreachable: true,
});

const midTarget = new MidTarget("clickhouse", {
  unfuckUbuntu: {
    allowSnap: true,
  },
}, {
  deletedWith: vm.machine,
  providers: {
    mid: provider,
  },
});

new BaselineUsers("baseline-users", {
  useBash: true,
}, {
  dependsOn: [
    midTarget,
  ],
  deletedWith: vm.machine,
  providers: {
    mid: provider,
  },
});

new PrometheusNodeExporter("node-exporter", {
  arch: "amd64",
  version: "1.9.1",
}, {
  dependsOn: [
    midTarget,
  ],
  deletedWith: vm.machine,
  providers: {
    mid: provider,
  },
});

new Autoupdate("autoupdate", {}, {
  dependsOn: [
    midTarget,
  ],
  deletedWith: vm.machine,
  providers: {
    mid: provider,
  },
});

const prereqs = new mid.resource.Apt("prereqs", {
  names: [
    "apt-transport-https",
    "ca-certificates",
    "curl",
    "gnupg",
  ],
}, {
  provider,
  deletedWith: vm.machine,
  dependsOn: [
    midTarget,
  ],
});

const repoSetup = new mid.resource.Exec("repo-setup", {
  create: {
    command: [
      "/bin/bash",
      "-c",
      [
        "curl -fsSL 'https://packages.clickhouse.com/rpm/lts/repodata/repomd.xml.key' | sudo gpg --dearmor -o /usr/share/keyrings/clickhouse-keyring.gpg",
        "ARCH=$(dpkg --print-architecture)",
        "echo \"deb [signed-by=/usr/share/keyrings/clickhouse-keyring.gpg arch=${ARCH}] https://packages.clickhouse.com/deb stable main\" | sudo tee /etc/apt/sources.list.d/clickhouse.list",
      ].join("\n"),
    ],
  },
  delete: {
    command: [
      "rm",
      "-rf",
      "/etc/apt/sources.list.d/clickhouse.list",
      "/usr/share/keyrings/clickhouse-keyring.gpg",
    ],
  },
}, {
  provider,
  deletedWith: vm.machine,
  dependsOn: [
    prereqs,
  ],
});

const clickhousePackages = new mid.resource.Apt("clickhouse-packages", {
  updateCache: true,
  names: [
    "clickhouse-server",
    "clickhouse-client",
  ],
}, {
  provider,
  deletedWith: vm.machine,
  dependsOn: [
    repoSetup,
  ],
});

const config = new mid.resource.File("/etc/clickhouse-server/config.xml", {
  path: "/etc/clickhouse-server/config.xml",
  source: new pulumi.asset.FileAsset(__dirname + "/config/config.xml"),
  mode: "0644",
}, {
  provider,
  deletedWith: vm.machine,
  retainOnDelete: true,
  dependsOn: [
    clickhousePackages,
  ],
});

const users = new mid.resource.File("/etc/clickhouse-server/users.xml", {
  path: "/etc/clickhouse-server/users.xml",
  source: new pulumi.asset.FileAsset(__dirname + "/config/users.xml"),
  mode: "0644",
}, {
  provider,
  deletedWith: vm.machine,
  retainOnDelete: true,
  dependsOn: [
    clickhousePackages,
  ],
});

const clickhouseServerService = new mid.resource.SystemdService("clickhouse-server.service", {
  name: "clickhouse-server.service",
  ensure: "started",
  enabled: true,
  triggers: {
    refresh: [
      config.triggers.lastChanged,
      users.triggers.lastChanged,
    ],
  },
}, {
  provider,
  deletedWith: vm.machine,
  dependsOn: [
    clickhousePackages,
  ],
});
