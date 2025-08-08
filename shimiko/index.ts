import * as path from "path";

import * as aws from "@pulumi/aws";
import { local } from "@pulumi/command";
import { remote as remote_inputs } from "@pulumi/command/types/input";
import * as pulumi from "@pulumi/pulumi";
import { AnsibleProvisioner } from "@sapslaj/pulumi-ansible-provisioner";

import { directoryHash } from "../common/pulumi/asset-utils";
import { BaseConfigTrait } from "../common/pulumi/components/proxmox-vm/BaseConfigTrait";
import { DNSRecordTrait } from "../common/pulumi/components/proxmox-vm/DNSRecordTrait";
import { ProxmoxVM } from "../common/pulumi/components/proxmox-vm/ProxmoxVM";

const config = new pulumi.Config();

const production = config.getBoolean("production");

const vm = new ProxmoxVM("shimiko", {
  name: production ? "shimiko" : undefined,
  memory: {
    dedicated: 4096,
  },
  traits: [
    new BaseConfigTrait("base", {
      mid: {
        midTarget: {
          enabled: true
        },
        baselineUsers: {
          // TODO: migrate from Ansible
          enabled: false,
        },
        prometheusNodeExporter: {
          // TODO: migrate from Ansible
          enabled: false,
        },
        autoupdate: {
          enabled: true,
        },
        selfheal: {
          enabled: false,
        },
        vector: {
          enabled: true,
          sources: {
            metrics_zonepop: {
              type: "prometheus_scrape",
              endpoints: ["http://localhost:9412/metrics"],
              scrape_interval_secs: 60,
              scrape_timeout_secs: 45,
            }
          }
        },
      },
      dnsRecord: !production,
      ansible: {
        clean: false,
        base: {
          nasClient: production,
          rsyncBackup: production,
          rsyncBackupConfig: production
            ? {
              jobs: [
                {
                  src: "/var/shimiko",
                  dest: "/mnt/exos/volumes/shimiko/shimiko-data/",
                },
              ],
            }
            : undefined,
        },
      },
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
  create: `go build -o '${__dirname}/ansible/roles/shimiko/files/shimiko' '${__dirname}/cmd'`,
  triggers: [
    directoryHash(__dirname),
  ],
});

const iamUser = new aws.iam.User("shimiko", {
  name: production ? "shimiko" : undefined,
});
const iamKey = new aws.iam.AccessKey("shimiko", {
  user: iamUser.name,
});
new aws.iam.UserPolicyAttachment("shimiko-route53", {
  user: iamUser.name,
  policyArn: "arn:aws:iam::aws:policy/AmazonRoute53FullAccess",
});

let acmeURL = "https://acme-staging-v02.api.letsencrypt.org/directory";
if (production) {
  acmeURL = "https://acme-v02.api.letsencrypt.org/directory";
}

new AnsibleProvisioner("shimiko-setup", {
  connection: vm.connection as remote_inputs.ConnectionArgs,
  clean: false,
  rolePaths: [
    path.join(__dirname, "ansible/roles"),
  ],
  preTasks: production
    ? [
      {
        shell: {
          cmd: `if [ ! -d /var/shimiko ]; then cp -rv /mnt/exos/volumes/shimiko/shimiko-data/shimiko /var/ ; fi`,
        },
      },
    ]
    : [],
  roles: [
    {
      role: "shimiko",
      vars: {
        shimiko_env: {
          AWS_REGION: "us-east-1",
          AWS_ACCESS_KEY_ID: iamKey.id,
          AWS_SECRET_ACCESS_KEY: iamKey.secret,
          VYOS_USERNAME: process.env.VYOS_USERNAME, // FIXME: don't do this.
          VYOS_PASSWORD: process.env.VYOS_PASSWORD, // FIXME: don't do this.
          SHIMIKO_ACME_EMAIL: "alerts@sapslaj.com",
          SHIMIKO_ACME_URL: acmeURL,
          SHIMIKO_CERT_DOMAINS: production ? "shimiko.sapslaj.xyz" : dnsRecord.fullname,
          SHIMIKO_RECONCILE_INTERVAL: production ? "1h" : "0s",
        },
      },
    },
    {
      role: "zonepop",
      vars: {
        zonepop_env: {
          AWS_REGION: "us-east-1",
          AWS_ACCESS_KEY_ID: iamKey.id,
          AWS_SECRET_ACCESS_KEY: iamKey.secret,
          VYOS_HOST: "yor.sapslaj.xyz",
          VYOS_USERNAME: process.env.VYOS_USERNAME, // FIXME: don't do this.
          VYOS_PASSWORD: process.env.VYOS_PASSWORD, // FIXME: don't do this.
        },
      },
    },
  ],
  triggers: [
    shimikoBinaryBuild.id,
  ],
}, {
  dependsOn: [
    shimikoBinaryBuild,
    vm,
  ],
});
