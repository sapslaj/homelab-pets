import * as proxmoxve from "@muhlba91/pulumi-proxmoxve";
import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

import { Autoupdate, AutoupdateProps } from "../common/pulumi/components/mid/Autoupdate";
import { BaselineUsers, BaselineUsersProps } from "../common/pulumi/components/mid/BaselineUsers";
import { MidTarget, MidTargetProps } from "../common/pulumi/components/mid/MidTarget";
import {
  PrometheusNodeExporter,
  PrometheusNodeExporterProps,
} from "../common/pulumi/components/mid/PrometheusNodeExporter";
import { SystemdUnit } from "../common/pulumi/components/mid/SystemdUnit";
import { BaseConfigTrait } from "../common/pulumi/components/proxmox-vm/BaseConfigTrait";
import { PrivateKeyTrait, PrivateKeyTraitConfig } from "../common/pulumi/components/proxmox-vm/PrivateKeyTrait";
import { ProxmoxVM, ProxmoxVMProps } from "../common/pulumi/components/proxmox-vm/ProxmoxVM";
import { ProxmoxVMTrait } from "../common/pulumi/components/proxmox-vm/ProxmoxVMTrait";

const iscsiServer = new ProxmoxVM("iscsi-server", {
  traits: [
    new BaseConfigTrait("base", {
      ansible: false,
      mid: true,
      cloudImage: {
        diskConfig: {
          size: 64,
        },
      },
    }),
  ],
});

// new mid.resource.Apt("targetcli-fb", {
//   connection: iscsiServer.connection,
//   name: "targetcli-fb",
// });

const shortrackBinary = new mid.resource.File("/usr/local/bin/shortrack", {
  connection: iscsiServer.connection,
  path: "/usr/local/bin/shortrack",
  source: new pulumi.asset.FileAsset("./shortrack"),
  mode: "755",
});

new SystemdUnit("shortrack.service", {
  connection: iscsiServer.connection,
  name: "shortrack.service",
  enabled: true,
  ensure: "started",
  unit: {
    "Description": "Like Longhorn, but shit",
    "Requires": "sys-kernel-config.mount modprobe@configfs.service modprobe@target_core_mod.service",
    "After": "sys-kernel-config.mount network.target local-fs.target",
  },
  service: {
    "Type": "simple",
    "ExecStart": pulumi.interpolate`${shortrackBinary.path} sigma --volume-dir /srv`,
    "Restart": "always",
    "RestartSec": "1",
  },
  install: {
    "WantedBy": "multi-user.target",
  },
}, {
  dependsOn: [
    shortrackBinary,
  ],
});

// const iscsiClient = new ProxmoxVM("iscsi-client", {
//   traits: [
//     new BaseConfigTrait("base", {
//       ansible: false,
//       mid: true,
//       cloudImage: {
//         diskConfig: {
//           size: 16,
//         },
//       },
//     }),
//   ],
// });
