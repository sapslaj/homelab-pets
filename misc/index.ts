import * as path from "path";

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { AnsibleProvisioner } from "@sapslaj/pulumi-ansible-provisioner";

import { BaseConfigTrait } from "../common/pulumi/components/proxmox-vm/BaseConfigTrait";
import { DNSRecordTrait } from "../common/pulumi/components/proxmox-vm/DNSRecordTrait";
import { ProxmoxVM } from "../common/pulumi/components/proxmox-vm/ProxmoxVM";

const config = new pulumi.Config();

const production = config.getBoolean("production");

const iamUser = new aws.iam.User("misc", {
  name: production ? "misc" : undefined,
});
const iamKey = new aws.iam.AccessKey("misc", {
  user: iamUser.name,
});
new aws.iam.UserPolicyAttachment("misc-route53", {
  user: iamUser.name,
  policyArn: "arn:aws:iam::aws:policy/AmazonRoute53FullAccess",
});

const vm = new ProxmoxVM("misc", {
  name: production ? "misc" : `misc-${pulumi.getStack()}`,
  traits: [
    new BaseConfigTrait("base", {
      ansible: {
        clean: false,
        base: {
          nasClient: true,
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

new AnsibleProvisioner("misc-setup", {
  connection: vm.connection,
  rolePaths: [
    path.join(__dirname, "./ansible/roles"),
  ],
  clean: false,
  roles: [
    {
      role: "sapslaj.caddy",
      vars: {
        caddy_hostname: DNSRecordTrait.dnsRecordFor(vm).fullname,
        caddy_version: "v2.9.1",
        caddy_xcaddy_build_args: [
          "--with github.com/caddy-dns/route53@v1.5.0",
        ].join(" "),
        caddy_env: {
          AWS_REGION: "us-east-1",
          AWS_ACCESS_KEY_ID: iamKey.id,
          AWS_SECRET_ACCESS_KEY: iamKey.secret,
        },
      },
    },
  ],
});
