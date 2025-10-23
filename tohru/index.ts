import * as fs from "fs";

import * as aws from "@pulumi/aws";
import * as kubernetes from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as mid from "@sapslaj/pulumi-mid";
import * as YAML from "yaml";

import { getSecretValue, getSecretValueOutput } from "../common/pulumi/components/infisical";
import { getKubeconfig, newK3sProvider } from "../common/pulumi/components/k3s-shared";
import { IngressDNS } from "../common/pulumi/components/k8s/IngressDNS";
import { mergeTriggers } from "../common/pulumi/components/mid-utils";
import { DockerContainer } from "../common/pulumi/components/mid/DockerContainer";
import { DockerHost } from "../common/pulumi/components/mid/DockerHost";
import { NASClient } from "../common/pulumi/components/mid/NASClient";
import { SystemdSection, SystemdUnit } from "../common/pulumi/components/mid/SystemdUnit";
import { BaseConfigTrait } from "../common/pulumi/components/proxmox-vm/BaseConfigTrait";
import { ProxmoxVM, ProxmoxVMCPUType } from "../common/pulumi/components/proxmox-vm/ProxmoxVM";

const vm = new ProxmoxVM("tohru", {
  name: pulumi.getStack() === "prod" ? "tohru" : `tohru-${pulumi.getStack()}`,
  traits: [
    new BaseConfigTrait("base", {
      cloudImage: {
        diskConfig: {
          size: 32,
        },
      },
    }),
  ],
  memory: {
    dedicated: 4 * 1024,
  },
});

new mid.resource.File("/etc/motd", {
  connection: vm.connection,
  path: "/etc/motd",
  content: fs.readFileSync("./motd", { encoding: "utf8" }),
}, {
  deletedWith: vm,
  dependsOn: [
    vm,
  ],
});

const ciSSHKey = new mid.resource.File("/home/ci/.ssh/id_rsa", {
  connection: vm.connection,
  config: {
    check: false,
  },
  path: "/home/ci/.ssh/id_rsa",
  mode: "600",
  owner: "ci",
  group: "ci",
  content: getSecretValueOutput({
    folder: "/ci",
    key: "SSH_PRIVATE_KEY",
  }),
}, {
  deletedWith: vm,
  dependsOn: [
    vm,
  ],
});

const uv = new mid.resource.Exec("uv-install", {
  connection: vm.connection,
  environment: {
    XDG_BIN_HOME: "/usr/local/bin",
  },
  create: {
    command: [
      "/bin/sh",
      "-c",
      "curl -LsSf https://astral.sh/uv/install.sh | sh",
    ],
  },
  delete: {
    command: [
      "rm",
      "-f",
      "/usr/local/bin/uv",
      "/usr/local/bin/uvx",
    ],
  },
}, {
  deletedWith: vm,
  dependsOn: [
    vm,
  ],
});

const nas = new NASClient("nas-client", {
  connection: vm.connection,
}, {
  deletedWith: vm,
  dependsOn: [
    vm,
  ],
});

interface JobProps {
  connection?: mid.types.input.ConnectionArgs;
  triggers?: mid.types.input.TriggersInputArgs;
  service: SystemdSection;
  timer: SystemdSection;
}

class Job extends pulumi.ComponentResource {
  service: SystemdUnit;
  timer: SystemdUnit;

  constructor(name: string, props: JobProps, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:tohru:Job", name, {}, opts);

    this.service = new SystemdUnit(`${name}.service`, {
      connection: props.connection,
      triggers: props.triggers,
      name: `${name}.service`,
      daemonReload: true,
      enabled: true,
      ensure: "started",
      noBlock: true,
      unit: {
        Description: name,
        After: "network.target",
      },
      service: {
        Type: "oneshot",
        User: "ci",
        Group: "ci",
        ...props.service,
      },
      install: {
        WantedBy: "multi-user.target",
      },
    }, {
      parent: this,
    });

    this.timer = new SystemdUnit(`${name}.timer`, {
      connection: props.connection,
      triggers: props.triggers,
      name: `${name}.timer`,
      daemonReload: true,
      enabled: true,
      ensure: "started",
      noBlock: true,
      unit: {
        Description: name,
      },
      timer: props.timer,
      install: {
        WantedBy: "timers.target",
      },
    }, {
      parent: this,
      dependsOn: [
        this.service,
      ],
    });
  }
}

new Job("photography-rebuild", {
  connection: vm.connection,
  service: {
    ExecStart:
      "/usr/bin/curl -X POST https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/131990c7-b5fc-4fcc-a486-ee5017ebb3c4",
    Restart: "on-failure",
    RestartSec: "5min",
    WatchdogSec: "30",
  },
  timer: {
    OnCalendar: "daily",
    RandomizedDelaySec: "1800",
    FixedRandomDelay: "true",
  },
}, {
  deletedWith: vm,
  dependsOn: [
    vm,
  ],
});

new Job("playboy-backup", {
  connection: vm.connection,
  service: {
    ExecStart: "/usr/local/sbin/playboy-backup.sh",
    Restart: "on-failure",
    RestartSec: "5min",
    WatchdogSec: "30",
  },
  timer: {
    OnCalendar: "daily",
    RandomizedDelaySec: "1800",
    FixedRandomDelay: "true",
  },
}, {
  deletedWith: vm,
  dependsOn: [
    vm,
    new mid.resource.File("/usr/local/sbin/playboy-backup.sh", {
      connection: vm.connection,
      path: "/usr/local/sbin/playboy-backup.sh",
      content: fs.readFileSync("./sbin/playboy-backup.sh", { encoding: "utf8" }),
      mode: "a+rx",
    }, {
      deletedWith: vm,
      dependsOn: [
        ciSSHKey,
        nas,
        vm,
      ],
    }),
  ],
});

new Job("uptime-kuma-backup", {
  connection: vm.connection,
  service: {
    ExecStart: "/usr/local/sbin/uptime-kuma-backup.sh",
    Restart: "on-failure",
    RestartSec: "5min",
    WatchdogSec: "30",
  },
  timer: {
    OnCalendar: "daily",
    RandomizedDelaySec: "1800",
    FixedRandomDelay: "true",
  },
}, {
  deletedWith: vm,
  dependsOn: [
    vm,
    new mid.resource.File("/usr/sbin/uptime-kuma-backup.sh", {
      connection: vm.connection,
      path: "/usr/local/sbin/uptime-kuma-backup.sh",
      content: fs.readFileSync("./sbin/uptime-kuma-backup.sh", { encoding: "utf8" }),
      mode: "a+rx",
    }, {
      deletedWith: vm,
      dependsOn: [
        ciSSHKey,
        nas,
        vm,
      ],
    }),
  ],
});
