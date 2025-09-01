import * as vultr from "@ediri/vultr";
import * as aws from "@pulumi/aws";
import * as cloudflare from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";
import * as tailscale from "@pulumi/tailscale";
import * as tls from "@pulumi/tls";
import * as mid from "@sapslaj/pulumi-mid";

import { Autoupdate } from "../common/pulumi/components/mid/Autoupdate";
import { BaselineUsers } from "../common/pulumi/components/mid/BaselineUsers";
import { DockerContainer } from "../common/pulumi/components/mid/DockerContainer";
import { DockerHost } from "../common/pulumi/components/mid/DockerHost";
import { MidTarget } from "../common/pulumi/components/mid/MidTarget";
import { PrometheusNodeExporter } from "../common/pulumi/components/mid/PrometheusNodeExporter";
import { Vector } from "../common/pulumi/components/mid/Vector";
import { DNSRecord } from "../common/pulumi/components/shimiko";

const sshPrivateKey = new tls.PrivateKey("uptime-kuma", {
  algorithm: "ED25519",
  ecdsaCurve: "P256",
});

const sshKey = new vultr.SSHKey("uptime-kuma", {
  sshKey: sshPrivateKey.publicKeyOpenssh.apply((s) => s.trim()),
});

const firewallGroup = new vultr.FirewallGroup("uptime-kuma", {
  description: "uptime-kuma",
});

new vultr.FirewallRule("ssh", {
  firewallGroupId: firewallGroup.id,
  protocol: "tcp",
  port: "1:65535",
  subnet: "107.128.243.98",
  subnetSize: 32,
  ipType: "v4",
});

const instance = new vultr.Instance("uptime-kuma", {
  label: "uptime-kuma",
  plan: "vc2-1c-1gb",
  region: "atl",
  osId: vultr.getOsOutput({
    filters: [
      {
        name: "name",
        values: ["Ubuntu 24.04 LTS x64"],
      },
    ],
  }).id.apply((id) => parseInt(id)),
  disablePublicIpv4: false,
  enableIpv6: false,
  hostname: "uptime-kuma.sapslaj.xyz",
  sshKeyIds: [
    sshKey.id,
  ],
  firewallGroupId: firewallGroup.id,
});

new DNSRecord("a", {
  name: "uptime-kuma",
  records: [
    instance.mainIp,
  ],
  type: "A",
});

// new DNSRecord("aaaa", {
//   name: "uptime-kuma",
//   records: [
//     instance.v6MainIp,
//   ],
//   type: "AAAA",
// });

const connection: mid.types.input.ConnectionArgs = {
  host: instance.mainIp,
  privateKey: sshPrivateKey.privateKeyOpenssh,
  user: "root",
};

const midTarget = new MidTarget("uptime-kuma", {
  connection,
  hostname: "uptime-kuma",
}, {
  deletedWith: instance,
});

new Autoupdate("uptime-kuma", {
  connection,
}, {
  deletedWith: instance,
  dependsOn: [
    midTarget,
  ],
});

new BaselineUsers("uptime-kuma", {
  connection,
}, {
  deletedWith: instance,
  dependsOn: [
    midTarget,
  ],
});

new PrometheusNodeExporter("uptime-kuma", {
  connection,
}, {
  deletedWith: instance,
  dependsOn: [
    midTarget,
  ],
});

new Vector("uptime-kuma", {
  connection,
}, {
  deletedWith: instance,
  dependsOn: [
    midTarget,
  ],
});

const dockerHost = new DockerHost("uptime-kuma", {
  connection,
  watchtowerImage: "containrrr/watchtower",
}, {
  deletedWith: instance,
  dependsOn: [
    midTarget,
  ],
});

const cloudflareAccountId = "102270c8d4f73fb6ff33125ef1a72646";

const tunnel = new cloudflare.ZeroTrustTunnelCloudflared("uptime-kuma", {
  name: "uptime-kuma",
  accountId: cloudflareAccountId,
  configSrc: "cloudflare",
}, {
  deleteBeforeReplace: true,
});

const tunnelToken = cloudflare.getZeroTrustTunnelCloudflaredTokenOutput({
  accountId: cloudflareAccountId,
  tunnelId: tunnel.id,
});

new cloudflare.ZeroTrustTunnelCloudflaredConfig("uptime-kuma", {
  accountId: cloudflareAccountId,
  tunnelId: tunnel.id,
  config: {
    ingresses: [
      {
        hostname: "status.sapslaj.com",
        service: "http://localhost:3001",
      },
      {
        service: "http_status:404",
      },
    ],
  },
});

new cloudflare.DnsRecord("status.sapslaj.com", {
  zoneId: "90a03ba7d7132bbcaebcc81a29b1ac49",
  name: "status",
  content: pulumi.concat(tunnel.id, ".cfargotunnel.com"),
  type: "CNAME",
  ttl: 1,
  proxied: true,
});

const cloudflared = new DockerContainer("cloudflared", {
  connection,
  name: "cloudflared",
  image: "cloudflare/cloudflared:latest",
  restartPolicy: "unless-stopped",
  networkMode: "host",
  command: [
    "tunnel",
    "run",
    "--token",
    tunnelToken.token,
  ],
}, {
  deletedWith: instance,
  dependsOn: [
    dockerHost,
  ],
});

const tailnetKey = new tailscale.TailnetKey("uptime-kuma", {
  reusable: false,
  ephemeral: false,
  preauthorized: true,
  description: "uptime-kuma",
});

const sysctl = new mid.resource.AnsibleTaskList("tailscale", {
  connection,
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
  deletedWith: instance,
});

const tailscaleRepos = new mid.resource.Exec("tailscale-repos", {
  connection,
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
  deletedWith: instance,
});

const tailscalePackages = new mid.resource.Apt("tailscale", {
  connection,
  names: [
    "tailscale",
    "tailscale-archive-keyring",
  ],
  updateCache: true,
  config: {
    check: false,
  },
}, {
  deletedWith: instance,
  dependsOn: [
    midTarget,
    sysctl,
    tailscaleRepos,
  ],
});

new mid.resource.SystemdService("tailscaled.service", {
  connection,
  name: "tailscaled.service",
  enabled: true,
  ensure: "started",
}, {
  deletedWith: instance,
  dependsOn: [
    tailscalePackages,
  ],
});

new mid.resource.Exec("tailscale-up", {
  connection,
  create: {
    command: [
      "tailscale",
      "up",
      pulumi.concat("--auth-key=", tailnetKey.key),
      "--accept-routes",
    ],
  },
}, {
  deletedWith: instance,
  dependsOn: [
    tailscalePackages,
  ],
});

const container = new DockerContainer("uptime-kuma", {
  connection,
  name: "uptime-kuma",
  image: "louislam/uptime-kuma:1",
  restartPolicy: "unless-stopped",
  networkMode: "host",
  volumes: [
    "/var/docker/volumes/uptime-kuma-data:/app/data",
  ],
}, {
  deletedWith: instance,
  dependsOn: [
    dockerHost,
  ],
});
