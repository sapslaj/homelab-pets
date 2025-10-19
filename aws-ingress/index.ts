import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { EC2Instance } from "@sapslaj/pulumi-aws-ec2-instance";
import * as mid from "@sapslaj/pulumi-mid";

import { getSecretValueOutput } from "../common/pulumi/components/infisical";
import { Autoupdate } from "../common/pulumi/components/mid/Autoupdate";
import { BaselineUsers } from "../common/pulumi/components/mid/BaselineUsers";
import { MidTarget } from "../common/pulumi/components/mid/MidTarget";
import { PrometheusNodeExporter } from "../common/pulumi/components/mid/PrometheusNodeExporter";
import { Swap } from "../common/pulumi/components/mid/Swap";
import { SystemdUnit } from "../common/pulumi/components/mid/SystemdUnit";
import { Tailscale } from "../common/pulumi/components/mid/Tailscale";
import { Vector } from "../common/pulumi/components/mid/Vector";

const production = pulumi.getStack() === "prod";

const name = production ? "aws-ingress" : `aws-ingress-${pulumi.getStack()}`;

const instance = new EC2Instance("aws-ingress", {
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
  securityGroup: {
    create: true,
    createDefaultEgressRule: true,
    ingresses: {
      icmpv4: {
        fromPort: -1,
        toPort: -1,
        ipProtocol: "icmp",
        cidrIpv4: "0.0.0.0/0",
      },
      icmpv6: {
        fromPort: -1,
        toPort: -1,
        ipProtocol: "icmpv6",
        cidrIpv6: "::/0",
      },
      httpv4: {
        fromPort: 80,
        toPort: 80,
        ipProtocol: "tcp",
        cidrIpv4: "0.0.0.0/0",
      },
      httpv6: {
        fromPort: 80,
        toPort: 80,
        ipProtocol: "tcp",
        cidrIpv6: "::/0",
      },
      httpsv4: {
        fromPort: 443,
        toPort: 443,
        ipProtocol: "tcp",
        cidrIpv4: "0.0.0.0/0",
      },
      httpsv6: {
        fromPort: 443,
        toPort: 443,
        ipProtocol: "tcp",
        cidrIpv6: "::/0",
      },
    },
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
          }),
        };
      }
      return args;
    },
  ],
});

const provider = new mid.Provider("aws-ingress", {
  connection: instance.connection,
  deleteUnreachable: true,
  check: false,
});

const midTarget = new MidTarget("aws-ingress", {
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

new Swap("swap", {
  swappiness: 10,
}, {
  deletedWith: instance.instance,
  providers: {
    mid: provider,
  },
});

new Tailscale("tailscale", {
  tailnetKeyName: name,
  up: [
    "--accept-routes",
  ],
}, {
  deletedWith: instance.instance,
  providers: {
    mid: provider,
  },
});

const ports: Record<string, number> = {
  http: 80,
  https: 443,
};

const etcBell = new mid.resource.File("/etc/bell", {
  path: "/etc/bell",
  ensure: "directory",
}, {
  provider,
  deletedWith: instance.instance,
  dependsOn: [
    midTarget,
  ],
});

const bellBinary = new mid.resource.File("/usr/local/bin/bell", {
  path: "/usr/local/bin/bell",
  remoteSource: "https://git.sapslaj.cloud/sapslaj/bell/releases/download/v1.0.0/bell_Linux_arm64",
  mode: "a+x",
}, {
  provider,
  deletedWith: instance.instance,
  dependsOn: [
    midTarget,
  ],
});

for (const [portName, port] of Object.entries(ports)) {
  const portConfig = new mid.resource.File(`/etc/bell/${portName}.cfg`, {
    config: {
      check: false,
    },
    path: `/etc/bell/${portName}.cfg`,
    ensure: "file",
    owner: "ci",
    group: "ci",
  }, {
    provider,
    deletedWith: instance.instance,
    dependsOn: [
      etcBell,
    ],
  });

  new SystemdUnit(`bell-${portName}.service`, {
    triggers: {
      refresh: [
        portConfig.triggers.lastChanged,
        bellBinary.triggers.lastChanged,
      ],
    },
    name: `bell-${portName}.service`,
    ensure: "started",
    enabled: true,
    unit: {
      Description: "bell",
      After: "network-online.target",
    },
    service: {
      Type: "simple",
      Environment: pulumi.interpolate`NET_HOST=:${port}`,
      ExecStart: `/usr/local/bin/bell /etc/bell/${portName}.cfg`,
      Restart: "always",
      RestartSec: "1",
    },
    install: {
      WantedBy: "multi-user.target",
    },
  }, {
    provider,
    deletedWith: instance.instance,
    dependsOn: [
      portConfig,
      bellBinary,
    ],
  });
}
