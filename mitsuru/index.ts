import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

import { getSecretValue } from "../common/pulumi/components/infisical";
import { Autoupdate } from "../common/pulumi/components/mid/Autoupdate";
import { BaselineUsers } from "../common/pulumi/components/mid/BaselineUsers";
import { MidTarget } from "../common/pulumi/components/mid/MidTarget";
import { PrometheusNodeExporter } from "../common/pulumi/components/mid/PrometheusNodeExporter";
import { Rclone } from "../common/pulumi/components/mid/Rclone";
import { SystemdUnit } from "../common/pulumi/components/mid/SystemdUnit";
import { Vector } from "../common/pulumi/components/mid/Vector";

const connection: mid.types.input.ConnectionArgs = {
  host: "mitsuru.sapslaj.xyz",
  port: 22,
  user: os.userInfo().username,
  // TODO: fix SSH agent in CI
  privateKey: fs.readFileSync(path.join(os.userInfo().homedir, ".ssh", "id_rsa"), { encoding: "utf8" }),
};

const midTarget = new MidTarget("mitsuru", {
  connection,
});

new BaselineUsers("mitsuru", {
  connection,
}, {
  dependsOn: [
    midTarget,
  ],
});

new PrometheusNodeExporter("mitsuru", {
  connection,
}, {
  dependsOn: [
    midTarget,
  ],
});

new Vector("mitsuru", {
  connection,
}, {
  dependsOn: [
    midTarget,
  ],
});

new Autoupdate("mitsuru", {
  connection,
  autoreboot: false,
}, {
  dependsOn: [
    midTarget,
  ],
});

const shortrackBinary = new mid.resource.File("/usr/local/bin/shortrack", {
  connection,
  path: "/usr/local/bin/shortrack",
  remoteSource: "https://misc.sapslaj.xyz/shortrack-binaries/shortrack",
  mode: "a+x",
});

new SystemdUnit("shortrack.service", {
  connection,
  name: "shortrack.service",
  ensure: "started",
  enabled: true,
  unit: {
    Description: "Like Longhorn, but shit",
    Requires: "sys-kernel-config.mount modprobe@configfs.service modprobe@target_core_mod.service",
    After: "sys-kernel-config.mount network.target local-fs.target",
  },
  service: {
    Type: "simple",
    ExecStart: "/usr/local/bin/shortrack sigma --volume-dir /red/shortrack",
    Restart: "on-failure",
    RestartSec: "1",
  },
  install: {
    WantedBy: "multi-user.target",
  },
}, {
  dependsOn: [
    shortrackBinary,
  ],
});

const nfsPackages = new mid.resource.Apt("nfs", {
  connection,
  names: [
    "nfs-kernel-server",
  ],
}, {
  dependsOn: [
    midTarget,
  ],
});

const nfsExports = new mid.resource.File("/etc/exports", {
  connection,
  path: "/etc/exports",
  content: `/red 172.24.4.0/24(rw,sync,no_root_squash,no_subtree_check)\n`,
}, {
  retainOnDelete: true,
  dependsOn: [
    nfsPackages,
  ],
});

new mid.resource.SystemdService("nfs-kernel-server.service", {
  connection,
  name: "nfs-kernel-server.service",
  enabled: true,
  ensure: "started",
  triggers: {
    refresh: [
      nfsExports.triggers.lastChanged,
    ],
  },
}, {
  retainOnDelete: true,
  dependsOn: [
    nfsPackages,
    nfsExports,
  ],
});

new Rclone("ganyu", {
  connection,
  configs: [
    {
      name: "wasabi-use1",
      properties: {
        type: "s3",
        endpoint: "s3.wasabisys.com",
        region: "us-east-1",
        access_key_id: getSecretValue({
          folder: "/wasabi/rclone-mitsuru",
          key: "AWS_ACCESS_KEY_ID",
        }),
        secret_access_key: getSecretValue({
          folder: "/wasabi/rclone-mitsuru",
          key: "AWS_SECRET_ACCESS_KEY",
        }),
      },
    },
    {
      name: "red-nfs",
      properties: {
        type: "crypt",
        remote: "wasabi-use1:sapslaj-homelab-backups/red-nfs",
        password: getSecretValue({
          folder: "/rclone",
          key: "password",
        }),
        password2: getSecretValue({
          folder: "/rclone",
          key: "password2",
        }),
      },
    },
    {
      name: "red-shortrack",
      properties: {
        type: "crypt",
        remote: "wasabi-use1:sapslaj-homelab-backups/red-shortrack",
        password: getSecretValue({
          folder: "/rclone",
          key: "password",
        }),
        password2: getSecretValue({
          folder: "/rclone",
          key: "password2",
        }),
      },
    },
  ],
  jobs: {
    "red-nfs": {
      src: "/red/nfs",
      dest: "red-nfs:",
      enabled: true,
      ensure: "started",
    },
    "red-shortrack": {
      src: "/red/shortrack",
      dest: "red-shortrack:",
      enabled: true,
      ensure: "started",
    },
  },
}, {
  dependsOn: [
    midTarget,
  ],
});
