import * as fs from "fs";

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

import { getSecretValueOutput } from "../common/pulumi/components/infisical";
import { Autoupdate } from "../common/pulumi/components/mid/Autoupdate";
import { BaselineUsers } from "../common/pulumi/components/mid/BaselineUsers";
import { MidTarget } from "../common/pulumi/components/mid/MidTarget";
import { PrometheusNodeExporter } from "../common/pulumi/components/mid/PrometheusNodeExporter";
import { SystemdUnit } from "../common/pulumi/components/mid/SystemdUnit";
import { Vector } from "../common/pulumi/components/mid/Vector";

const midProvider = new mid.Provider("playboy", {
  connection: {
    host: "playboy.sapslaj.xyz",
    port: 22,
    user: "ci",
    privateKey: getSecretValueOutput({
      folder: "/ci",
      key: "SSH_PRIVATE_KEY",
    }),
  },
});

const midTarget = new MidTarget("playboy", {}, {
  provider: midProvider,
});

new BaselineUsers("playboy", {
  users: {
    ci: {
      additionalGroups: ["lpadmin"],
    },
    sapslaj: {
      additionalGroups: ["lpadmin"],
    },
  },
}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new PrometheusNodeExporter("playboy", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new Vector("playboy", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new Autoupdate("playboy", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

const cupsPackage = new mid.resource.Apt("cups", {
  name: "cups",
}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

const cupsFiltersModule = new mid.resource.File("/etc/modules-load.d/cups-filters.conf", {
  path: "/etc/modules-load.d/cups-filters.conf",
  ensure: "absent",
}, {
  provider: midProvider,
  dependsOn: [
    cupsPackage,
  ],
});

new mid.resource.SystemdService("systemd-modules-load.service", {
  name: "systemd-modules-load.service",
  ensure: "started",
  triggers: {
    refresh: [
      cupsFiltersModule.triggers.lastChanged,
    ],
  },
}, {
  provider: midProvider,
  dependsOn: [
    cupsFiltersModule,
  ],
});

new mid.resource.Exec("cups-permissions", {
  create: {
    command: [
      "cupsctl",
      "--remote-any",
    ],
  },
}, {
  provider: midProvider,
  dependsOn: [
    cupsPackage,
  ],
});

const cupsdConf = new mid.resource.File("/etc/cups/cupsd.conf", {
  path: "/etc/cups/cupsd.conf",
  content: fs.readFileSync("./cupsd.conf", { encoding: "utf8" }),
}, {
  provider: midProvider,
  dependsOn: [
    cupsPackage,
  ],
});

const cups = new mid.resource.SystemdService("cups.service", {
  name: "cups.service",
  enabled: true,
  triggers: {
    refresh: [
      cupsdConf.triggers.lastChanged,
    ],
  },
}, {
  provider: midProvider,
  dependsOn: [
    cupsdConf,
  ],
});

const nodesourceRepoSet = new mid.resource.Exec("nodesource-repo-setup", {
  create: {
    command: [
      "/bin/bash",
      "-c",
      `sudo curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -`,
    ],
  },
  delete: {
    command: [
      "rm",
      "-rf",
      "/usr/share/keyrings/nodesource.gpg",
      "/etc/apt/sources.list.d/nodesource.list",
      "/etc/apt/preferences.d/nsolid",
      "/etc/apt/preferences.d/nodejs",
    ],
  },
}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

const nodePackages = new mid.resource.Apt("nodejs", {
  updateCache: true,
  names: [
    "nodejs",
    "git",
    "make",
    "g++",
    "gcc",
    "libsystemd-dev",
  ],
}, {
  provider: midProvider,
  dependsOn: [
    nodesourceRepoSet,
  ],
});

const zigbee2mqttUser = new mid.resource.User("zigbee2mqtt", {
  name: "zigbee2mqtt",
  system: true,
  groupsExclusive: false,
  groups: [
    "dialout",
  ],
}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

const zigbee2mqttRepo = new mid.resource.Exec("zigbee2mqtt-repo", {
  dir: "/opt",
  create: {
    command: [
      "bash",
      "-c",
      "test ! -d zigbee2mqtt && git clone https://github.com/Koenkk/zigbee2mqtt.git && chown -R zigbee2mqtt /opt/zigbee2mqtt",
    ],
  },
  delete: {
    command: [
      "rm",
      "-rf",
      "/opt/zigbee2mqtt",
    ],
  },
}, {
  provider: midProvider,
  dependsOn: [
    zigbee2mqttUser,
  ],
});

const corepackEnable = new mid.resource.Exec("zigbee2mqtt-corepack-enable", {
  create: {
    command: [
      "corepack",
      "enable",
    ],
  },
  delete: {
    command: [
      "corepack",
      "disable",
    ],
  },
}, {
  provider: midProvider,
  dependsOn: [
    nodePackages,
  ],
});

const zigbee2mqttNpmInstall = new mid.resource.Exec("zigbee2mqtt-npm-install", {
  dir: "/opt/zigbee2mqtt",
  create: {
    command: [
      "sudo",
      "-u",
      "zigbee2mqtt",
      "pnpm",
      "install",
      "--frozen-lockfile",
    ],
  },
}, {
  deletedWith: zigbee2mqttRepo,
  provider: midProvider,
  dependsOn: [
    corepackEnable,
    zigbee2mqttRepo,
    zigbee2mqttUser,
    nodePackages,
  ],
});

new SystemdUnit("zigbee2mqtt.service", {
  name: "zigbee2mqtt.service",
  enabled: true,
  unit: {
    Description: "zigbee2mqtt",
    After: "network.target",
  },
  service: {
    Environment: "NODE_ENV=production",
    Type: "notify",
    ExecStart: "/usr/bin/node index.js",
    WorkingDirectory: "/opt/zigbee2mqtt",
    StandardOutput: "inherit",
    StandardError: "inherit",
    WatchdogSec: "10s",
    Restart: "always",
    RestartSec: "10s",
    User: zigbee2mqttUser.name,
  },
  install: {
    WantedBy: "multi-user.target",
  },
}, {
  provider: midProvider,
  dependsOn: [
    zigbee2mqttNpmInstall,
  ],
});
