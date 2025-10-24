import * as fs from "fs";

import * as mid from "@sapslaj/pulumi-mid";
import * as YAML from "yaml";

import { getSecretValue, getSecretValueOutput } from "../common/pulumi/components/infisical";
import { Autoupdate } from "../common/pulumi/components/mid/Autoupdate";
import { BaselineUsers } from "../common/pulumi/components/mid/BaselineUsers";
import { MidTarget } from "../common/pulumi/components/mid/MidTarget";
import { PrometheusNodeExporter } from "../common/pulumi/components/mid/PrometheusNodeExporter";
import { Rclone } from "../common/pulumi/components/mid/Rclone";
import { Selfheal } from "../common/pulumi/components/mid/Selfheal";
import { SystemdUnit } from "../common/pulumi/components/mid/SystemdUnit";
import { Vector } from "../common/pulumi/components/mid/Vector";
import { DNSRecord } from "../common/pulumi/components/shimiko";

new DNSRecord("A", {
  name: "aqua",
  records: ["172.24.4.10"],
  type: "A",
});

new DNSRecord("AAAA", {
  name: "aqua",
  records: ["2001:470:e022:4::a"],
  type: "AAAA",
});

const midProvider = new mid.Provider("aqua", {
  connection: {
    host: "172.24.4.10",
    port: 22,
    user: "ci",
    privateKey: getSecretValueOutput({
      folder: "/ci",
      key: "SSH_PRIVATE_KEY",
    }),
  },
});

const midTarget = new MidTarget("aqua", {}, {
  provider: midProvider,
});

new mid.resource.File("/etc/motd", {
  path: "/etc/motd",
  content: fs.readFileSync("./motd", { encoding: "utf8" }),
}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

const pipx = new mid.resource.Apt("pipx", {
  name: "pipx",
}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

const kvmPackages = new mid.resource.Apt("kvm-packages", {
  names: [
    "libvirt-clients",
    "libvirt-daemon",
    "libvirt-daemon-system",
    "libvirt-dev",
    "netcat",
    "ovmf",
    "ovmf-ia32",
    "qemu-system",
    "qemu-system-modules-spice",
    "qemu-utils",
  ],
}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new BaselineUsers("aqua-baseline-users", {
  users: {
    ci: {
      additionalGroups: [
        "libvirt",
      ],
    },
    sapslaj: {
      additionalGroups: [
        "libvirt",
      ],
    },
  },
}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new PrometheusNodeExporter("aqua-node-exporter", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new Vector("aqua-vector", {
  rsyslogForwarding: true,
  sources: {
    metrics_du: {
      type: "prometheus_scrape",
      endpoints: ["http://localhost:9477/metrics"],
      scrape_interval_secs: 60,
      scrape_timeout_secs: 45,
    },
    metrics_libvirt: {
      type: "prometheus_scrape",
      endpoints: ["http://localhost:9177/metrics"],
      scrape_interval_secs: 60,
      scrape_timeout_secs: 45,
    },
  },
}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new Autoupdate("aqua-autoupdate", {
  autoreboot: false,
}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new Selfheal("aqua-selfheal", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

const storagePackages = new mid.resource.Apt("storage-packages", {
  names: [
    "mdadm",
    "parted",
    "udisks2",
    "lvm2",
    "udisks2-lvm2",
    "xfsprogs",
    "xfsdump",
    "acl",
    "attr",
    "quota",
    "smartmontools",
  ],
}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

const duExporterBinary = new mid.resource.File("/usr/local/bin/du_exporter", {
  path: "/usr/local/bin/du_exporter",
  remoteSource: "https://misc.sapslaj.xyz/du-exporter-binaries/du_exporter",
  mode: "a+x",
}, {
  provider: midProvider,
});

new SystemdUnit("du_exporter.service", {
  triggers: {
    refresh: [
      duExporterBinary.triggers.lastChanged,
    ],
  },
  name: "du_exporter.service",
  ensure: "started",
  enabled: true,
  unit: {
    Description: "du_exporter",
    After: "network-online.target",
    Wants: "network-online.target",
  },
  service: {
    Type: "simple",
    WorkingDirectory: "/mnt/exos",
    ExecStart: "/usr/local/bin/du_exporter -w -i 300 -L -l -d 1 archive Darktable Media volumes",
    Restart: "on-failure",
  },
  install: {
    WantedBy: "multi-user.target",
  },
}, {
  provider: midProvider,
  dependsOn: [
    duExporterBinary,
  ],
});

const shortrackBinary = new mid.resource.File("/usr/local/bin/shortrack", {
  path: "/usr/local/bin/shortrack",
  remoteSource: "https://misc.sapslaj.xyz/shortrack-binaries/shortrack",
  mode: "a+x",
}, {
  provider: midProvider,
});

new SystemdUnit("shortrack.service", {
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
  provider: midProvider,
  dependsOn: [
    shortrackBinary,
  ],
});

new mid.resource.AnsibleTaskList("networking-sysctl", {
  tasks: {
    create: [
      {
        module: "sysctl",
        args: {
          name: "net.ipv4.ip_forward",
          value: "1",
          sysctl_set: true,
        },
      },
      {
        module: "sysctl",
        args: {
          name: "net.ipv6.conf.all.forwarding",
          value: "1",
          sysctl_set: true,
        },
      },
      {
        module: "sysctl",
        args: {
          name: "net.ipv6.conf.default.forwarding",
          value: "1",
          sysctl_set: true,
        },
      },
    ],
  },
}, {
  provider: midProvider,
});

const networkingPackages = new mid.resource.Apt("networking-packages", {
  names: [
    "lldpd",
    "network-manager",
  ],
}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

const nmManageAllInterfaces = new mid.resource.FileLine("network-manager-manage-all-interfaces", {
  path: "/etc/NetworkManager/NetworkManager.conf",
  regexp: "^managed=",
  line: "managed=true",
}, {
  provider: midProvider,
  dependsOn: [
    networkingPackages,
  ],
});

const networkmanagerService = new mid.resource.SystemdService("NetworkManager.service", {
  triggers: {
    refresh: [
      nmManageAllInterfaces.triggers.lastChanged,
    ],
  },
  name: "NetworkManager.service",
  enabled: true,
  ensure: "started",
}, {
  provider: midProvider,
  dependsOn: [
    nmManageAllInterfaces,
  ],
});

new mid.resource.AnsibleTaskList("networking-config", {
  tasks: {
    create: [
      {
        module: "nmcli",
        args: {
          state: "present",
          conn_name: "enp7s0f0np0",
          dns4: [
            "172.24.4.2",
            "172.24.4.3",
          ],
          dns6: [
            "2001:470:e022:4::2",
            "2001:470:e022:4::3",
          ],
          gw4: "172.24.4.1",
          gw6: "2001:470:e022:4::1",
          ip4: [
            "172.24.4.10/24",
          ],
          ip6: [
            "2001:470:e022:4::a/64",
          ],
          method4: "manual",
          method6: "manual",
          type: "ethernet",
        },
      },
      {
        module: "nmcli",
        args: {
          state: "present",
          conn_name: "vm.br0.4",
          type: "bridge",
          method4: "disabled",
          method6: "disabled",
          priority: 36864,
        },
      },
      {
        module: "nmcli",
        args: {
          state: "present",
          conn_name: "enp7s0f2np2.4",
          master: "vm.br0.4",
          type: "vlan",
          vlandev: "enp7s0f2np2",
          vlanid: 4,
          slave_type: "bridge",
        },
      },
      {
        module: "nmcli",
        args: {
          state: "present",
          conn_name: "vm.br0.5",
          type: "bridge",
          method4: "disabled",
          method6: "disabled",
          priority: 36864,
        },
      },
      {
        module: "nmcli",
        args: {
          state: "present",
          conn_name: "enp7s0f2np2.5",
          master: "vm.br0.5",
          type: "vlan",
          vlandev: "enp7s0f2np2",
          vlanid: 5,
          slave_type: "bridge",
        },
      },
    ],
  },
}, {
  provider: midProvider,
  dependsOn: [
    networkingPackages,
    networkmanagerService,
  ],
});

const libvirtExporterBinary = new mid.resource.File("/usr/local/bin/libvirt_exporter", {
  path: "/usr/local/bin/libvirt_exporter",
  remoteSource: "https://misc.sapslaj.xyz/libvirt-exporter-binaries/libvirt_exporter",
  mode: "a+x",
}, {
  provider: midProvider,
});

new SystemdUnit("libvirt_exporter.service", {
  triggers: {
    refresh: [
      duExporterBinary.triggers.lastChanged,
    ],
  },
  name: "libvirt_exporter.service",
  ensure: "started",
  enabled: true,
  unit: {
    Description: "libvirt_exporter",
    After: "network-online.target",
    Wants: "network-online.target",
  },
  service: {
    Type: "simple",
    ExecStart: "/usr/local/bin/libvirt_exporter",
    Restart: "on-failure",
  },
  install: {
    WantedBy: "multi-user.target",
  },
}, {
  provider: midProvider,
  dependsOn: [
    libvirtExporterBinary,
  ],
});

const virtBackupInstall = new mid.resource.AnsibleTaskList("virt-backup-install", {
  tasks: {
    create: [
      {
        module: "pipx",
        args: {
          name: "virt-backup",
          state: "install",
        },
      },
    ],
    delete: [
      {
        module: "pipx",
        args: {
          name: "virt-backup",
          state: "uninstall",
        },
      },
    ],
  },
}, {
  provider: midProvider,
  dependsOn: [
    pipx,
  ],
});

const etcVirtBackup = new mid.resource.File("/etc/virt-backup", {
  path: "/etc/virt-backup",
  ensure: "directory",
}, {
  provider: midProvider,
});

const virtBackupConfig = new mid.resource.File("/etc/virt-backup/config.yml", {
  path: "/etc/virt-backup/config.yml",
  content: YAML.stringify({
    debug: true,
    threads: 0,
    uri: "qemu:///system",
    groups: {
      all: {
        target: "/mnt/exos/archive/virt-backup/aqua/all",
        packager: "tar",
        packager_opts: {
          compression: "xz",
          compression_lvl: 6,
        },
        hourly: 6,
        daily: 30,
        weekly: 12,
        monthly: 12,
        yearly: 99,
        quiesce: true,
        hosts: [
          "r:^.*",
        ],
      },
    },
  }),
}, {
  provider: midProvider,
  dependsOn: [
    etcVirtBackup,
  ],
});

const virtBackupBackupService = new SystemdUnit("virt-backup-backup.service", {
  name: "virt-backup-backup.service",
  unit: {
    Description: "virt-backup backup",
  },
  service: {
    Type: "oneshot",
    ExecStart: "/root/.local/bin/virt-backup backup",
  },
}, {
  provider: midProvider,
  dependsOn: [
    virtBackupInstall,
    virtBackupConfig,
  ],
});

new SystemdUnit("virt-backup-backup.timer", {
  name: "virt-backup-backup.timer",
  ensure: "started",
  enabled: true,
  unit: {
    Description: "virt-backup backup",
  },
  timer: {
    OnCalendar: "Thu *-*-* 00:00:00",
  },
  install: {
    WantedBy: "timers.target",
  },
}, {
  provider: midProvider,
  dependsOn: [
    virtBackupBackupService,
  ],
});

const nfsPackages = new mid.resource.Apt("nfs-packages", {
  names: [
    "nfs-kernel-server",
  ],
}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

const nfsExports = new mid.resource.File("/etc/exports", {
  path: "/etc/exports",
  content: `/mnt/exos 172.24.4.0/24(rw,sync,no_root_squash,no_subtree_check)\n`,
}, {
  provider: midProvider,
  dependsOn: [
    nfsPackages,
  ],
});

new mid.resource.SystemdService("nfs-kernel-server.service", {
  name: "nfs-kernel-server.service",
  enabled: true,
  ensure: "started",
  triggers: {
    refresh: [
      nfsExports.triggers.lastChanged,
    ],
  },
}, {
  provider: midProvider,
  retainOnDelete: true,
  dependsOn: [
    nfsPackages,
    nfsExports,
  ],
});

new mid.resource.Apt("cockpit", {
  names: [
    "cockpit",
    "cockpit-machines",
    "cockpit-networkmanager",
    "cockpit-storaged",
    "python3-gi",
  ],
}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

const seaweedFSInstall = new mid.resource.AnsibleTaskList("seaweedfs-install", {
  tasks: {
    create: [
      {
        module: "file",
        args: {
          path: "/tmp/seaweedfs-3.86",
          state: "directory",
        },
      },
      {
        module: "unarchive",
        args: {
          src: "https://github.com/seaweedfs/seaweedfs/releases/download/3.86/linux_amd64.tar.gz",
          dest: "/tmp/seaweedfs-3.86",
          remote_src: true,
        },
      },
      {
        module: "copy",
        args: {
          src: "/tmp/seaweedfs-3.86/weed",
          dest: "/usr/local/bin/weed",
          remote_src: true,
          mode: "a+x",
        },
      },
    ],
    delete: [
      {
        module: "file",
        args: {
          path: "/usr/local/bin/weed",
          state: "absent",
        },
      },
      {
        module: "file",
        args: {
          path: "/tmp/seaweedfs-3.86",
          state: "absent",
        },
      },
    ],
  },
}, {
  provider: midProvider,
});

new SystemdUnit("weed.service", {
  triggers: {
    refresh: [
      seaweedFSInstall.triggers.lastChanged,
    ],
  },
  name: "weed.service",
  ensure: "started",
  enabled: true,
  unit: {
    Description: "SeaweedFS",
    After: "network-online.target",
  },
  service: {
    Type: "simple",
    ExecStart: "/usr/local/bin/weed server -dir /mnt/exos/weed -filer -s3",
    Restart: "always",
    RestartSec: "1",
  },
  install: {
    WantedBy: "multi-user.target",
  },
}, {
  provider: midProvider,
  dependsOn: [
    seaweedFSInstall,
  ],
});

new Rclone("aqua-rclone", {
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
      name: "exos-archive",
      properties: {
        type: "crypt",
        remote: "wasabi-use1:sapslaj-homelab-backups/exos-archive",
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
      name: "exos-media",
      properties: {
        type: "crypt",
        remote: "wasabi-use1:sapslaj-homelab-backups/exos-media",
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
      name: "exos-volumes",
      properties: {
        type: "crypt",
        remote: "wasabi-use1:sapslaj-homelab-backups/exos-volumes",
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
    "exos-archive": {
      src: "/mnt/exos/archive",
      dest: "exos-archive:",
      enabled: true,
      ensure: "started",
    },
    "exos-media": {
      src: "/mnt/exos/Media",
      dest: "exos-media:",
      enabled: true,
      ensure: "started",
    },
    "exos-volumes": {
      src: "/mnt/exos/volumes",
      dest: "exos-volumes:",
      enabled: true,
      ensure: "started",
    },
  },
}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});
