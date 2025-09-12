import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { EC2Instance } from "@sapslaj/pulumi-aws-ec2-instance";
import * as mid from "@sapslaj/pulumi-mid";

import { Autoupdate } from "../common/pulumi/components/mid/Autoupdate";
import { BaselineUsers } from "../common/pulumi/components/mid/BaselineUsers";
import { MidTarget } from "../common/pulumi/components/mid/MidTarget";
import { PrometheusNodeExporter } from "../common/pulumi/components/mid/PrometheusNodeExporter";
import { Vector } from "../common/pulumi/components/mid/Vector";

const production = pulumi.getStack() === "prod";

const name = production ? "omada" : `omada-${pulumi.getStack()}`;

const instance = new EC2Instance("omada", {
  name,
  ami: {
    family: "ubuntu",
    version: "jammy-22.04",
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
    instanceType: "t3a.small",
    vpcSecurityGroupIds: [
      "sg-0e3ce83256d914c98", // CI
      "sg-0f21c10c93a07ea5c", // ServerAdmin
    ],
    rootBlockDevice: {
      volumeType: "gp3",
      volumeSize: 20,
    },
    ignoreChanges: ["ami"],
  },
  securityGroup: {
    create: true,
    createDefaultEgressRule: true,
    ingresses: {
      "uptime-kuma-ipv4": {
        ipProtocol: "tcp",
        fromPort: 8043,
        toPort: 8043,
        cidrIpv4: "155.138.194.189/32",
      },
      "uptime-kuma-ipv6": {
        ipProtocol: "tcp",
        fromPort: 8043,
        toPort: 8043,
        cidrIpv6: "2001:19f0:5401:7:5400:5ff:fe9b:cb9d/128",
      },
    },
  },
  tags: {
    Name: name,
    ConfigGroup: "omada",
    ...(production
      ? {
        BackupPlan: "Default",
      }
      : {}),
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

export const connection = {
  host: instance.connection.host,
};

const provider = new mid.Provider("omada", {
  connection: instance.connection,
  deleteUnreachable: true,
  check: false,
});

const midTarget = new MidTarget("omada", {
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
});

new Vector("omada-vector", {}, {
  deletedWith: instance.instance,
  providers: {
    mid: provider,
  },
});

new Autoupdate("autoupdate", {}, {
  deletedWith: instance.instance,
  providers: {
    mid: provider,
  },
});

const jre17 = new mid.resource.Apt("jre17", {
  name: "openjdk-17-jre-headless",
  ensure: "present",
}, {
  provider,
  deletedWith: instance.instance,
  dependsOn: [
    midTarget,
  ],
});

const jsvc = new mid.resource.Apt("jsvc", {
  name: "jsvc",
  ensure: "present",
}, {
  provider,
  deletedWith: instance.instance,
  dependsOn: [
    jre17,
  ],
});

// TODO: mid: gpg key resource
const mongo7RepoSetup = new mid.resource.Exec("mongo7-repo-setup", {
  create: {
    command: [
      "/bin/bash",
      "-c",
      [
        `curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor`,
        `echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list`,
      ].join("\n"),
    ],
  },
  delete: {
    command: [
      "rm",
      "-f",
      "/etc/apt/sources.list.d/mongodb-org-7.0.list",
      "/usr/share/keyrings/mongodb-server-7.0.gpg",
    ],
  },
}, {
  provider,
  deletedWith: instance.instance,
});

const mongo7Install = new mid.resource.Apt("mongo7-install", {
  names: [
    "mongodb-org",
    "mongodb-org-database",
    "mongodb-org-server",
    // "mongodb-mongosh",
    "mongodb-org-mongos",
    "mongodb-org-tools",
  ],
  updateCache: true,
  ensure: "present",
}, {
  provider,
  deletedWith: instance.instance,
  dependsOn: [
    mongo7RepoSetup,
    midTarget,
  ],
});

new mid.resource.Apt("omada", {
  deb: "https://static.tp-link.com/upload/software/2025/202503/20250331/Omada_SDN_Controller_v5.15.20.18_linux_x64.deb",
  ensure: "present",
}, {
  provider,
  deletedWith: instance.instance,
  dependsOn: [
    jre17,
    jsvc,
    mongo7Install,
  ],
});
