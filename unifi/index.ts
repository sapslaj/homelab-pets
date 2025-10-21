import * as fs from "fs";

import * as cloudflare from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";
import { EC2Instance } from "@sapslaj/pulumi-aws-ec2-instance";
import * as mid from "@sapslaj/pulumi-mid";
import * as nunjucks from "nunjucks";

import { Autoupdate } from "../common/pulumi/components/mid/Autoupdate";
import { BaselineUsers } from "../common/pulumi/components/mid/BaselineUsers";
import { MidTarget } from "../common/pulumi/components/mid/MidTarget";
import { PrometheusNodeExporter } from "../common/pulumi/components/mid/PrometheusNodeExporter";
import { Vector } from "../common/pulumi/components/mid/Vector";

nunjucks.configure({
  autoescape: false,
});

const production = pulumi.getStack() === "prod";

const name = production ? "unifi" : `unifi-${pulumi.getStack()}`;

const ports = {
  80: {
    port: 80,
    protocol: "tcp",
    description: "LE challenge HTTP",
  },
  443: {
    port: 443,
    protocol: "tcp",
    description: "LE challenge HTTPS",
  },
  3478: {
    port: 3478,
    protocol: "udp",
    description: "STUN",
  },
  8080: {
    port: 8080,
    protocol: "tcp",
    description: "Device-Controller communication",
  },
  8443: {
    port: 8443,
    protocol: "tcp",
    description: "Web UI",
  },
  8843: {
    port: 8843,
    protocol: "tcp",
    description: "HTTPS portal redirection",
  },
  8880: {
    port: 8880,
    protocol: "tcp",
    description: "HTTP portal redirection",
  },
};

const instance = new EC2Instance("unifi", {
  name,
  ami: {
    family: "ubuntu",
    version: "noble-24.04",
  },
  connectionArgs: {
    hostFrom: "PublicIPv4",
  },
  dns: {
    create: true,
    target: "public",
    types: [
      "A",
      "AAAA",
    ],
    route53: {
      name,
      hostedZoneName: "sapslaj.cloud",
    },
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
    ingresses: Object.entries(ports).reduce((ingresses, port) => {
      const [key, config] = port;
      return {
        ...ingresses,
        [`${key}-ipv4`]: {
          description: config.description,
          ipProtocol: config.protocol,
          fromPort: config.port,
          toPort: config.port,
          cidrIpv4: "0.0.0.0/0",
        },
        [`${key}-ipv6`]: {
          description: config.description,
          ipProtocol: config.protocol,
          fromPort: config.port,
          toPort: config.port,
          cidrIpv6: "::/0",
        },
      };
    }, {}),
  },
  tags: {
    Name: name,
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
            aliases: [
              "urn:pulumi:prod::homelab-pets-unifi::aws:ec2/eip:Eip::unifi",
            ],
          }),
        };
      }
      return args;
    },
  ],
});

new cloudflare.DnsRecord("unifi-A", {
  zoneId: "90a03ba7d7132bbcaebcc81a29b1ac49",
  name,
  content: instance.instance.publicIp,
  type: "A",
  ttl: 1,
  proxied: false,
});

new cloudflare.DnsRecord("unifi-AAAA", {
  zoneId: "90a03ba7d7132bbcaebcc81a29b1ac49",
  name,
  content: instance.instance.ipv6Addresses.apply((ip6) => ip6[0]),
  type: "AAAA",
  ttl: 1,
  proxied: false,
});

export const connection = {
  host: instance.connection.host,
};

const provider = new mid.Provider("unifi", {
  connection: instance.connection,
  deleteUnreachable: true,
  check: false,
});

const midTarget = new MidTarget("unifi", {
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

new BaselineUsers("unifi-baseline-users", {
  useBash: true,
}, {
  deletedWith: instance.instance,
  providers: {
    mid: provider,
  },
  dependsOn: [
    midTarget,
  ],
});

new PrometheusNodeExporter("unifi-node-exporter", {}, {
  deletedWith: instance.instance,
  providers: {
    mid: provider,
  },
  dependsOn: [
    midTarget,
  ],
});

new Vector("unifi-vector", {}, {
  deletedWith: instance.instance,
  providers: {
    mid: provider,
  },
  dependsOn: [
    midTarget,
  ],
});

new Autoupdate("unifi-autoupdate", {
  allowReleaseinfoChange: true,
}, {
  deletedWith: instance.instance,
  providers: {
    mid: provider,
  },
  dependsOn: [
    midTarget,
  ],
});

const mongodbSourceList = new mid.resource.File("/etc/apt/sources.list.d/mongodb-org-8.0.list", {
  path: "/etc/apt/sources.list.d/mongodb-org-8.0.list",
  content: "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse",
}, {
  provider,
  deletedWith: instance.instance,
});

const mongodbGpgKey = new mid.resource.Exec("/etc/apt/trusted.gpg.d/mongodb-repo.gpg", {
  create: {
    command: [
      "sh",
      "-c",
      "curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | sudo gpg -o /etc/apt/trusted.gpg.d/mongodb-repo.gpg --dearmor",
    ],
  },
  delete: {
    command: [
      "rm",
      "-f",
      "/etc/apt/trusted.gpg.d/mongodb-repo.gpg",
    ],
  },
}, {
  provider,
  deletedWith: instance.instance,
});

const mongodb = new mid.resource.Apt("mongodb-org", {
  name: "mongodb-org",
  updateCache: true,
}, {
  provider,
  deletedWith: instance.instance,
  dependsOn: [
    midTarget,
    mongodbSourceList,
    mongodbGpgKey,
  ],
});

const ubntSourceList = new mid.resource.File("/etc/apt/sources.list.d/100-ubnt-unifi.list", {
  path: "/etc/apt/sources.list.d/100-ubnt-unifi.list",
  content: "deb [ arch=amd64,arm64 ] https://www.ui.com/downloads/unifi/debian stable ubiquiti",
}, {
  provider,
  deletedWith: instance.instance,
});

const ubntGpgKey = new mid.resource.File("/etc/apt/trusted.gpg.d/unifi-repo.gpg", {
  path: "/etc/apt/trusted.gpg.d/unifi-repo.gpg",
  remoteSource: "https://dl.ui.com/unifi/unifi-repo.gpg",
}, {
  provider,
  deletedWith: instance.instance,
});

const unifi = new mid.resource.Apt("unifi", {
  name: "unifi",
  updateCache: true,
}, {
  provider,
  deletedWith: instance.instance,
  dependsOn: [
    midTarget,
    mongodb,
    ubntSourceList,
    ubntGpgKey,
  ],
});

const certbot = new mid.resource.Apt("certbot", {
  name: "certbot",
}, {
  provider,
  deletedWith: instance.instance,
  dependsOn: [
    midTarget,
  ],
});

const renewalHook = new mid.resource.File("/etc/letsencrypt/renewal-hooks/deploy/unifi_ssl_import.sh", {
  path: "/etc/letsencrypt/renewal-hooks/deploy/unifi_ssl_import.sh",
  mode: "a+rx",
  content: nunjucks.renderString(
    fs.readFileSync("./unifi_ssl_import.sh.njk", { encoding: "utf8" }),
    {
      hostname: `${name}.sapslaj.com`,
    },
  ),
}, {
  provider,
  deletedWith: instance.instance,
  dependsOn: [
    certbot,
  ],
});

const certbotSetup = new mid.resource.Exec("certbot-setup", {
  create: {
    command: [
      "certbot",
      "certonly",
      "--standalone",
      "--noninteractive",
      "--agree-tos",
      "--email",
      "alerts@sapslaj.com",
      "-d",
      `${name}.sapslaj.com,${name}.sapslaj.cloud`,
    ],
  },
}, {
  provider,
  deletedWith: instance.instance,
  dependsOn: [
    certbot,
    renewalHook,
  ],
});
