import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as tailscale from "@pulumi/tailscale";
import * as mid from "@sapslaj/pulumi-mid";

import { BaseConfigTrait } from "../common/pulumi/components/proxmox-vm/BaseConfigTrait";
import { ProxmoxVM, ProxmoxVMCPUType } from "../common/pulumi/components/proxmox-vm/ProxmoxVM";
import { VLAN } from "../common/pulumi/homelab-config";

const config = new pulumi.Config();

const ipv4 = config.require("ipv4");
const ipv6 = config.require("ipv6");

const vm = new ProxmoxVM("miyabi", {
  name: pulumi.getStack() === "prod" ? "miyabi" : `miyabi-${pulumi.getStack()}`,
  hostLookup: {
    resolveIpv4: () => ipv4,
  },
  traits: [
    new BaseConfigTrait("base", {
      vlanId: VLAN.SERVERS,
    }),
  ],
  cpu: {
    type: ProxmoxVMCPUType.HOST,
    cores: 2,
  },
  connectionArgs: {
    host: ipv4,
  },
  initialization: {
    ipConfigs: [
      {
        ipv4: {
          address: `${ipv4}/24`,
          gateway: "172.24.4.1",
        },
        ipv6: {
          address: `${ipv6}/64`,
          gateway: "2001:470:e022:4::1",
        },
      },
    ],
  },
});

const tailnetKey = new tailscale.TailnetKey("miyabi", {
  reusable: false,
  ephemeral: false,
  preauthorized: true,
  description: vm.name,
});

const sysctl = new mid.resource.AnsibleTaskList("sysctl", {
  connection: vm.connection,
  tasks: {
    create: [
      {
        module: "sysctl",
        args: {
          name: "net.ipv4.ip_forward",
          value: "1",
          state: "present",
          sysctl_file: "/etc/sysctl.d/99-tailscale.conf",
          sysctl_set: true,
        },
      },
      {
        module: "sysctl",
        args: {
          name: "net.ipv6.conf.all.forwarding",
          value: "1",
          state: "present",
          sysctl_file: "/etc/sysctl.d/99-tailscale.conf",
          sysctl_set: true,
        },
      },
    ],
    delete: [
      {
        module: "sysctl",
        args: {
          name: "net.ipv4.ip_forward",
          value: "1",
          state: "absent",
          sysctl_file: "/etc/sysctl.d/99-tailscale.conf",
          sysctl_set: true,
        },
      },
      {
        module: "sysctl",
        args: {
          name: "net.ipv6.conf.all.forwarding",
          value: "1",
          state: "absent",
          sysctl_file: "/etc/sysctl.d/99-tailscale.conf",
          sysctl_set: true,
        },
      },
      {
        module: "file",
        args: {
          path: "/etc/sysctl.d/99-tailscale.conf",
          state: "absent",
        },
      },
    ],
  },
}, {
  deletedWith: vm,
  dependsOn: [
    vm,
  ],
});

const tailscaleRepos = new mid.resource.Exec("tailscale-repos", {
  connection: vm.connection,
  create: {
    command: [
      "/bin/sh",
      "-c",
      `
        set -eu
        . /etc/os-release
        curl "https://pkgs.tailscale.com/stable/ubuntu/$UBUNTU_CODENAME.noarmor.gpg" > /usr/share/keyrings/tailscale-archive-keyring.gpg
        chmod 0644 /usr/share/keyrings/tailscale-archive-keyring.gpg
        curl "https://pkgs.tailscale.com/stable/ubuntu/$UBUNTU_CODENAME.tailscale-keyring.list" > /etc/apt/sources.list.d/tailscale.list
        chmod 0644 /etc/apt/sources.list.d/tailscale.list
      `,
    ],
  },
  delete: {
    command: [
      "rm",
      "-rf",
      "/usr/share/keyrings/tailscale-archive-keyring.gpg",
      "/etc/apt/sources.list.d/tailscale.list",
    ],
  },
}, {
  deletedWith: vm,
  dependsOn: [
    vm,
  ],
});

const tailscalePackages = new mid.resource.Apt("tailscale", {
  connection: vm.connection,
  names: [
    "tailscale",
    "tailscale-archive-keyring",
  ],
  updateCache: true,
  config: {
    check: false,
  },
}, {
  deletedWith: vm,
  dependsOn: [
    sysctl,
    tailscaleRepos,
  ],
});

new mid.resource.SystemdService("tailscaled.service", {
  connection: vm.connection,
  name: "tailscaled.service",
  enabled: true,
  ensure: "started",
}, {
  deletedWith: vm,
  dependsOn: [
    tailscalePackages,
  ],
});

new mid.resource.Exec("tailscale-up", {
  connection: vm.connection,
  create: {
    command: [
      "tailscale",
      "up",
      pulumi.concat("--auth-key=", tailnetKey.key),
      pulumi.concat(
        "--advertise-routes=",
        [
          "172.24.0.0/16",
        ].join(","),
      ),
      "--advertise-exit-node",
      "--snat-subnet-routes=false",
    ],
  },
}, {
  deletedWith: vm,
  dependsOn: [
    tailscalePackages,
  ],
});
