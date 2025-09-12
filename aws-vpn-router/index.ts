import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { EC2Instance } from "@sapslaj/pulumi-aws-ec2-instance";
import * as mid from "@sapslaj/pulumi-mid";

import { getSecretValueOutput } from "../common/pulumi/components/infisical";
import { Autoupdate } from "../common/pulumi/components/mid/Autoupdate";
import { BaselineUsers } from "../common/pulumi/components/mid/BaselineUsers";
import { MidTarget } from "../common/pulumi/components/mid/MidTarget";
import { PrometheusNodeExporter } from "../common/pulumi/components/mid/PrometheusNodeExporter";
import { Vector } from "../common/pulumi/components/mid/Vector";

const production = pulumi.getStack() === "prod";

const name = production ? "aws-vpn-router" : `aws-vpn-router-${pulumi.getStack()}`;

const instance = new EC2Instance("aws-vpn-router", {
  name,
  ami: {
    family: "ubuntu",
    version: "noble-24.04",
  },
  connectionArgs: {
    hostFrom: "PublicIPv4",
  },
  eip: {
    create: production,
  },
  iam: {
    attachDefaultPolicies: true,
  },
  instance: {
    instanceType: "t4g.nano",
    vpcSecurityGroupIds: [
      "sg-0e3ce83256d914c98", // CI
      "sg-0f21c10c93a07ea5c", // ServerAdmin
    ],
    rootBlockDevice: {
      volumeType: "gp3",
      volumeSize: 10,
    },
    ignoreChanges: ["ami"],
    sourceDestCheck: false,
  },
  tags: {
    Name: name,
  },
}, {
  transforms: [
    (args) => {
      if (args.type === "aws:ec2/eip:Eip") {
        return {
          props: args.props,
          opts: pulumi.mergeOptions(args.opts, {
            protect: true,
            aliases: [
              "urn:pulumi:prod::homelab-pets-aws-vpn-router::aws:ec2/eip:Eip::aws-vpn-router",
            ],
          }),
        };
      }
      return args;
    },
  ],
});

if (production) {
  new aws.ec2.Route("aws-vpn-router", {
    routeTableId: "rtb-94a4def1",
    destinationCidrBlock: "172.24.0.0/16",
    networkInterfaceId: instance.instance.primaryNetworkInterfaceId,
  });
}

export const connection = {
  host: instance.connection.host,
};

const provider = new mid.Provider("aws-vpn-router", {
  connection: instance.connection,
  deleteUnreachable: true,
  check: false,
});

const midTarget = new MidTarget("aws-vpn-router", {
  hostname: instance.name.apply((name) => `${name}.direct.sapslaj.cloud`),
  unfuckUbuntu: {
    allowSnap: true,
    allowLxd: true,
  },
}, {
  deletedWith: instance.instance,
  providers: {
    mid: provider,
  },
});

new BaselineUsers("baseline-users", {
  useBash: true,
}, {
  deletedWith: instance.instance,
  providers: {
    mid: provider,
  },
});

new PrometheusNodeExporter("node-exporter", {}, {
  deletedWith: instance.instance,
  providers: {
    mid: provider,
  },
  dependsOn: [
    midTarget,
  ],
});

new Vector("vector", {}, {
  deletedWith: instance.instance,
  providers: {
    mid: provider,
  },
  dependsOn: [
    midTarget,
  ],
});

new Autoupdate("autoupdate", {}, {
  deletedWith: instance.instance,
  providers: {
    mid: provider,
  },
});

const wireguard = new mid.resource.Apt("wireguard", {
  name: "wireguard",
}, {
  deletedWith: instance.instance,
  provider,
  dependsOn: [
    midTarget,
  ],
});

const sysctlConf = new mid.resource.File("/etc/sysctl.d/99-wireguard.conf", {
  path: "/etc/sysctl.d/99-wireguard.conf",
  content: `
net.ipv4.ip_forward = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv6.conf.all.forwarding = 1
`,
}, {
  provider,
  deletedWith: instance,
});

const sysctl = new mid.resource.Exec("sysctl", {
  create: {
    command: ["sysctl", "--system"],
  },
  update: {
    command: ["sysctl", "--system"],
  },
  delete: {
    command: ["sysctl", "--system"],
  },
}, {
  provider,
  deletedWith: instance,
  dependsOn: [
    sysctlConf,
  ],
});

const etcWireguard = new mid.resource.File("/etc/wireguard", {
  path: "/etc/wireguard",
  ensure: "directory",
}, {
  provider,
  deletedWith: instance,
  dependsOn: [
    wireguard,
  ],
});

const wg0config = new mid.resource.File("/etc/wireguard/wg0.conf", {
  path: "/etc/wireguard/wg0.conf",
  content: pulumi.interpolate`
[Interface]
PrivateKey = ${getSecretValueOutput({ folder: "/wireguard/aws-site-to-site", key: "private-key" })}
Address = 172.24.0.2/32
ListenPort = 51820

[Peer]
PublicKey = dTlak2Va5VlEQH2T60r1bQNKlH4LA+YrQFWJq2WxNjs=
AllowedIPs = 172.24.0.0/16
Endpoint = homelab.sapslaj.com:58120
`,
}, {
  provider,
  deletedWith: instance,
  dependsOn: [
    etcWireguard,
    wireguard,
  ],
});

new mid.resource.SystemdService("wg-quick@wg0.service", {
  triggers: {
    refresh: [
      wg0config.triggers.lastChanged,
    ],
  },
  name: "wg-quick@wg0.service",
  enabled: true,
  ensure: "started",
}, {
  provider,
  deletedWith: instance,
  dependsOn: [
    sysctl,
    wireguard,
    wg0config,
  ],
});
