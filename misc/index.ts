import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

import { SystemdUnit } from "../common/pulumi/components/mid/SystemdUnit";
import { BaseConfigTrait } from "../common/pulumi/components/proxmox-vm/BaseConfigTrait";
import { DNSRecordTrait } from "../common/pulumi/components/proxmox-vm/DNSRecordTrait";
import { ProxmoxVM } from "../common/pulumi/components/proxmox-vm/ProxmoxVM";

const config = new pulumi.Config();

const production = config.getBoolean("production");

const vm = new ProxmoxVM("misc", {
  name: production ? "misc" : `misc-${pulumi.getStack()}`,
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
          enabled: true,
        },
        openTelemetryCollector: {
          enabled: false,
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
            metrics_caddy: {
              type: "prometheus_scrape",
              endpoints: ["http://localhost:2019/metrics"],
              scrape_interval_secs: 60,
              scrape_timeout_secs: 45,
            },
          },
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

const golangPPA = new mid.resource.Exec("golang-ppa", {
  connection: vm.connection,
  create: {
    command: [
      "add-apt-repository",
      "ppa:longsleep/golang-backports",
    ],
  },
  delete: {
    command: [
      "add-apt-repository",
      "--remove",
      "ppa:longsleep/golang-backports",
    ],
  },
});

const xcaddyDeps = new mid.resource.Apt("xcaddy-deps", {
  connection: vm.connection,
  updateCache: true,
  names: [
    "apt-transport-https",
    "curl",
    "debian-archive-keyring",
    "debian-keyring",
    "golang-go",
  ],
  config: {
    check: false,
  },
}, {
  deletedWith: vm,
  retainOnDelete: true,
  dependsOn: [
    vm,
    golangPPA,
  ],
});

const cloudsmithGPGKey = new mid.resource.Exec("cloudsmith-gpg-key", {
  connection: vm.connection,
  create: {
    command: [
      "/bin/bash",
      "-c",
      "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/xcaddy/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-xcaddy-archive-keyring.gpg",
    ],
  },
  delete: {
    command: [
      "rm",
      "-f",
      "/usr/share/keyrings/caddy-xcaddy-archive-keyring.gpg",
    ],
  },
}, {
  deletedWith: vm,
  dependsOn: [
    xcaddyDeps,
  ],
});

const cloudsmithAptRepo = new mid.resource.Exec("cloudsmith-apt-repo", {
  connection: vm.connection,
  create: {
    command: [
      "/bin/bash",
      "-c",
      "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/xcaddy/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-xcaddy.list",
    ],
  },
  delete: {
    command: [
      "rm",
      "-f",
      "/etc/apt/sources.list.d/caddy-xcaddy.list",
    ],
  },
}, {
  deletedWith: vm,
  dependsOn: [
    xcaddyDeps,
  ],
});

const xcaddyPackage = new mid.resource.Apt("xcaddy", {
  connection: vm.connection,
  config: {
    check: false,
  },
  updateCache: true,
  name: "xcaddy",
}, {
  deletedWith: vm,
  dependsOn: [
    cloudsmithGPGKey,
    cloudsmithAptRepo,
  ],
});

const etcSysconfig = new mid.resource.File("/etc/sysconfig", {
  connection: vm.connection,
  path: "/etc/sysconfig",
  ensure: "directory",
}, {
  deletedWith: vm,
  retainOnDelete: true,
});

const caddyEnv = new mid.resource.File("/etc/sysconfig/caddy.env", {
  connection: vm.connection,
  path: "/etc/sysconfig/caddy.env",
  content: pulumi.concat(
    ...Object.entries({
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

const etcCaddy = new mid.resource.File("/etc/caddy", {
  connection: vm.connection,
  path: "/etc/caddy",
  ensure: "directory",
}, {
  deletedWith: vm,
});

const caddyfile = new mid.resource.File("/etc/caddy/Caddyfile", {
  connection: vm.connection,
  path: "/etc/caddy/Caddyfile",
  content: pulumi.interpolate`
{
  email alerts@sapslaj.com
  metrics
  admin
}

${DNSRecordTrait.dnsRecordFor(vm).fullname} {
  root * /mnt/exos/volumes/misc/
  file_server browse
  tls {
    dns acmedns {
      username misc
      password misc
      subdomain ${DNSRecordTrait.dnsRecordFor(vm).fullname}
      server_url https://shimiko.sapslaj.xyz/acme-dns
    }
  }
}
`,
}, {
  deletedWith: vm,
  dependsOn: [
    etcCaddy,
  ],
});

const caddyVersion = "v2.10.2";

const buildArgs = [
  "--with github.com/caddy-dns/acmedns@v0.6.0",
].join(" ");

const caddyEntrypoint = new mid.resource.File("/usr/local/sbin/caddy.sh", {
  connection: vm.connection,
  path: "/usr/local/sbin/caddy.sh",
  mode: "a+x",
  content: `#!/usr/bin/env bash
set -euxo pipefail
: "\${HOME:=/root}"
export HOME
xcaddy build ${caddyVersion} --output /usr/local/bin/caddy ${buildArgs}
/usr/local/bin/caddy run --config /etc/caddy/Caddyfile
`,
}, {
  deletedWith: vm,
  dependsOn: [
    etcCaddy,
  ],
});

new SystemdUnit("caddy.service", {
  connection: vm.connection,
  name: "caddy.service",
  ensure: "started",
  enabled: true,
  unit: {
    "Description": "Caddy",
  },
  service: {
    "Type": "simple",
    "EnvironmentFile": caddyEnv.path,
    "WorkingDirectory": etcCaddy.path,
    "ExecStart": caddyEntrypoint.path,
    "Restart": "always",
    "RestartSec": "1",
  },
  install: {
    "WantedBy": "multi-user.target",
  },
}, {
  deletedWith: vm,
  dependsOn: [
    xcaddyPackage,
    caddyEnv,
    caddyfile,
    caddyEntrypoint,
  ],
});
