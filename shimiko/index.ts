import * as fs from "fs/promises";
import * as path from "path";

import * as aws from "@pulumi/aws";
import { local } from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import * as time from "@pulumiverse/time";
import * as mid from "@sapslaj/pulumi-mid";

import { directoryHash } from "../common/pulumi/components/asset-utils";
import { getSecretValue, getSecretValueOutput } from "../common/pulumi/components/infisical";
import { RsyncBackup } from "../common/pulumi/components/mid/RsyncBackup";
import { SystemdUnit } from "../common/pulumi/components/mid/SystemdUnit";
import { BaseConfigTrait } from "../common/pulumi/components/proxmox-vm/BaseConfigTrait";
import { DNSRecordTrait } from "../common/pulumi/components/proxmox-vm/DNSRecordTrait";
import { ProxmoxVM } from "../common/pulumi/components/proxmox-vm/ProxmoxVM";

const config = new pulumi.Config();

const production = config.getBoolean("production");

const vm = new ProxmoxVM("shimiko", {
  name: production ? "shimiko" : undefined,
  memory: {
    dedicated: 1024,
  },
  ignoreChanges: production
    ? [
      "initialization",
    ]
    : [],
  traits: [
    new BaseConfigTrait("base", {
      mid: {
        autoupdate: {
          enabled: true,
        },
        baselineUsers: {
          enabled: true,
        },
        midTarget: {
          enabled: true,
        },
        nasClient: {
          enabled: production,
        },
        openTelemetryCollector: {
          enabled: true,
        },
        prometheusNodeExporter: {
          enabled: true,
        },
        selfheal: {
          enabled: false,
        },
        vector: {
          enabled: true,
          sources: {
            metrics_shimiko: {
              type: "prometheus_scrape",
              endpoints: ["http://localhost:9245/metrics"],
              scrape_interval_secs: 60,
              scrape_timeout_secs: 45,
            },
            metrics_zonepop: {
              type: "prometheus_scrape",
              endpoints: ["http://localhost:9412/metrics"],
              scrape_interval_secs: 60,
              scrape_timeout_secs: 45,
            },
          },
        },
      },
      dnsRecord: !production,
      cloudImage: {
        diskConfig: {
          size: 32,
        },
      },
    }),
  ],
});

const dnsRecord = DNSRecordTrait.dnsRecordFor(vm);

export const ipv4 = vm.ipv4;

const shimikoBinaryBuild = new local.Command("shimiko-binary-build", {
  create: `go build -o '${__dirname}/shimiko' '${__dirname}/cmd'`,
  triggers: [
    directoryHash(__dirname),
  ],
  assetPaths: [
    "shimiko",
  ],
});

const iamKeyRotation = new time.Rotating("traefik-iam-key", {
  rotationDays: 30,
});

const iamUserShimiko = new aws.iam.User("shimiko", {
  name: production ? "shimiko" : undefined,
});
const iamKeyShimiko = new aws.iam.AccessKey("shimiko", {
  user: iamUserShimiko.name,
}, {
  deleteBeforeReplace: false,
  dependsOn: [iamKeyRotation],
});
new aws.iam.UserPolicyAttachment("shimiko-route53", {
  user: iamUserShimiko.name,
  policyArn: "arn:aws:iam::aws:policy/AmazonRoute53FullAccess",
});

const iamUserZonepop = new aws.iam.User("shimiko-zonepop", {
  name: production ? "shimiko-zonepop" : undefined,
});
const iamKeyZonepop = new aws.iam.AccessKey("shimiko-zonepop", {
  user: iamUserShimiko.name,
}, {
  deleteBeforeReplace: false,
  dependsOn: [iamKeyRotation],
});
new aws.iam.UserPolicyAttachment("shimiko-zonepop-route53", {
  user: iamUserZonepop.name,
  policyArn: "arn:aws:iam::aws:policy/AmazonRoute53FullAccess",
});

let acmeURL = "https://acme-staging-v02.api.letsencrypt.org/directory";
if (production) {
  acmeURL = "https://acme-v02.api.letsencrypt.org/directory";
}

const etcSysconfig = new mid.resource.File("/etc/sysconfig", {
  connection: vm.connection,
  path: "/etc/sysconfig",
  ensure: "directory",
}, {
  deletedWith: vm,
  retainOnDelete: true,
});

let preTasks: pulumi.Resource[] = [];

if (production) {
  preTasks.push(
    new mid.resource.Exec("shimiko-restore-backup", {
      connection: vm.connection,
      create: {
        command: [
          "/bin/sh",
          "-c",
          `if [ ! -d /var/shimiko ]; then cp -rv /mnt/exos/volumes/shimiko/shimiko-data/shimiko /var/ ; fi`,
        ],
      },
    }),
  );
}

const varShimiko = new mid.resource.File("/var/shimiko", {
  connection: vm.connection,
  path: "/var/shimiko",
  ensure: "directory",
}, {
  dependsOn: [
    ...preTasks,
  ],
  deletedWith: vm,
});

if (production) {
  new RsyncBackup("rsync-backup", {
    connection: vm.connection,
    backupJobs: [
      {
        src: "/var/shimiko",
        dest: "/mnt/exos/volumes/shimiko/shimiko-data/",
      },
    ],
  }, {
    deletedWith: vm,
    dependsOn: [
      varShimiko,
    ],
  });
}

const shimikoBinary = new mid.resource.File("/usr/local/bin/shimiko", {
  connection: vm.connection,
  path: "/usr/local/bin/shimiko",
  source: shimikoBinaryBuild.assets?.apply((assets) => assets?.shimiko),
  mode: "a+x",
}, {
  deletedWith: vm,
});

const shimikoEnv = new mid.resource.File("/etc/sysconfig/shimiko.env", {
  connection: vm.connection,
  path: "/etc/sysconfig/shimiko.env",
  content: pulumi.concat(
    ...Object.entries({
      AWS_ACCESS_KEY_ID: iamKeyShimiko.id,
      AWS_REGION: "us-east-1",
      AWS_SECRET_ACCESS_KEY: iamKeyShimiko.secret,
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4317/v1/traces",
      SHIMIKO_ACME_EMAIL: "alerts@sapslaj.com",
      SHIMIKO_ACME_URL: acmeURL,
      SHIMIKO_CERT_DOMAINS: production ? "shimiko.sapslaj.xyz" : dnsRecord.fullname,
      SHIMIKO_FAILOVER_IPS: "98.87.108.43", // FIXME: should this be hardcoded?
      SHIMIKO_HTTPS_PORT: "443",
      SHIMIKO_HTTP_PORT: "80",
      SHIMIKO_RECONCILE_INTERVAL: production ? "1h" : "0s",
      VYOS_API_TOKEN: getSecretValueOutput({
        key: "vyos-api-token",
      }),
      VYOS_PASSWORD: getSecretValueOutput({
        key: "VYOS_PASSWORD",
        folder: "/ci",
      }),
      VYOS_USERNAME: getSecretValueOutput({
        key: "VYOS_USERNAME",
        folder: "/ci",
      }),
    }).map(([key, value]) => {
      return pulumi.concat(key, "='", value, "'\n");
    }),
  ),
}, {
  deletedWith: vm,
  dependsOn: [
    etcSysconfig,
  ],
});

const shimikoService = new SystemdUnit("shimiko-server.service", {
  connection: vm.connection,
  name: "shimiko-server.service",
  daemonReload: true,
  enabled: true,
  ensure: "started",
  unit: {
    "Description": "Shimiko server",
    "After": "network-online.target",
  },
  service: {
    "Type": "simple",
    "EnvironmentFile": shimikoEnv.path,
    "WorkingDirectory": varShimiko.path,
    "ExecStart": pulumi.interpolate`${shimikoBinary.path} server`,
    "Restart": "always",
    "RestartSec": "60",
  },
  install: {
    "WantedBy": "multi-user.target",
  },
  triggers: {
    refresh: [
      varShimiko.triggers.lastChanged,
      shimikoBinary.triggers.lastChanged,
      shimikoEnv.triggers.lastChanged,
    ],
  },
  config: {
    check: false,
  },
}, {
  deletedWith: vm,
  dependsOn: [
    varShimiko,
    shimikoBinary,
    shimikoEnv,
  ],
});

const etcZonepop = new mid.resource.File("/etc/zonepop", {
  connection: vm.connection,
  path: "/etc/zonepop",
  ensure: "directory",
}, {
  deletedWith: vm,
});

const zonepopConfig = new mid.resource.File("/etc/zonepop/config.lua", {
  connection: vm.connection,
  path: "/etc/zonepop/config.lua",
  content: fs.readFile(path.join(__dirname, "zonepop-config.lua"), {
    encoding: "utf8",
  }),
}, {
  deletedWith: vm,
  dependsOn: [
    etcZonepop,
  ],
});

const zonepopBinary = new mid.resource.File("/usr/local/bin/zonepop", {
  connection: vm.connection,
  path: "/usr/local/bin/zonepop",
  remoteSource: "https://misc.sapslaj.xyz/zonepop",
  mode: "a+x",
}, {
  deletedWith: vm,
});

const zonepopEnv = new mid.resource.File("/etc/sysconfig/zonepop.env", {
  connection: vm.connection,
  path: "/etc/sysconfig/zonepop.env",
  content: pulumi.concat(
    ...Object.entries({
      AWS_REGION: "us-east-1",
      AWS_ACCESS_KEY_ID: iamKeyZonepop.id,
      AWS_SECRET_ACCESS_KEY: iamKeyZonepop.secret,
      VYOS_HOST: "yor.sapslaj.xyz",
      VYOS_PASSWORD: getSecretValueOutput({
        key: "VYOS_PASSWORD",
        folder: "/ci",
      }),
      VYOS_USERNAME: getSecretValueOutput({
        key: "VYOS_USERNAME",
        folder: "/ci",
      }),
    }).map(([key, value]) => {
      return pulumi.concat(key, "='", value, "'\n");
    }),
  ),
}, {
  deletedWith: vm,
  dependsOn: [
    etcSysconfig,
  ],
});

const zonepopService = new SystemdUnit("zonepop.service", {
  connection: vm.connection,
  name: "zonepop.service",
  daemonReload: true,
  enabled: true,
  ensure: "started",
  unit: {
    "Description": "Zonepop",
    "After": "network-online.target",
  },
  service: {
    "Type": "simple",
    "EnvironmentFile": zonepopEnv.path,
    "ExecStart": pulumi.interpolate`${zonepopBinary.path} -config-file ${zonepopConfig.path}`,
    "Restart": "always",
    "RestartSec": "1",
  },
  install: {
    "WantedBy": "multi-user.target",
  },
  triggers: {
    refresh: [
      zonepopConfig.triggers.lastChanged,
      zonepopBinary.triggers.lastChanged,
      zonepopEnv.triggers.lastChanged,
    ],
  },
}, {
  deletedWith: vm,
  dependsOn: [
    zonepopConfig,
    zonepopBinary,
    zonepopEnv,
  ],
});
