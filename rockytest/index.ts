import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

import { BaselineUsers } from "../common/pulumi/components/mid/BaselineUsers";
import { PrometheusNodeExporter } from "../common/pulumi/components/mid/PrometheusNodeExporter";
import { BaseConfigTrait } from "../common/pulumi/components/proxmox-vm/BaseConfigTrait";
import { CloudImageTrait } from "../common/pulumi/components/proxmox-vm/CloudImageTrait";
import { DNSRecordTrait } from "../common/pulumi/components/proxmox-vm/DNSRecordTrait";
import { PrivateKeyTrait } from "../common/pulumi/components/proxmox-vm/PrivateKeyTrait";
import { ProxmoxVM, ProxmoxVMCPUType } from "../common/pulumi/components/proxmox-vm/ProxmoxVM";
import { Distro } from "../common/pulumi/homelab-config";

const distro = Distro.ROCKY_LINUX_10;

const vm = new ProxmoxVM("rockytest", {
  cpu: {
    type: ProxmoxVMCPUType.HOST,
    cores: 4,
  },
  memory: {
    dedicated: 2048,
  },
  connectionArgs: {
    user: distro.username,
  },
  traits: [
    new CloudImageTrait("cloud-image", {
      downloadFileConfig: {
        url: distro.url,
      },
      diskConfig: {
        size: 32,
      },
    }),
    new PrivateKeyTrait("private-key", {
      addPrivateKeyToUserdata: true,
    }),
    new DNSRecordTrait("dns-record"),
  ],
});

new BaselineUsers("baseline-users", {
  connection: vm.connection,
});

new PrometheusNodeExporter("node-exporter", {
  connection: vm.connection,
});

new mid.resource.Package("epel-release", {
  connection: vm.connection,
  name: "epel-release",
  ensure: "present",
});

new mid.resource.Package("htop", {
  connection: vm.connection,
  name: "htop",
  ensure: "present",
});
