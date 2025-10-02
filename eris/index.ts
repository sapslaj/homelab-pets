import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as mid from "@sapslaj/pulumi-mid";

import { getSecretValueOutput, Secret, SecretFolder } from "../common/pulumi/components/infisical";
import { Autoupdate } from "../common/pulumi/components/mid/Autoupdate";
import { BaselineUsers } from "../common/pulumi/components/mid/BaselineUsers";
import { MidTarget } from "../common/pulumi/components/mid/MidTarget";
import { NASClient } from "../common/pulumi/components/mid/NASClient";
import { PrometheusNodeExporter } from "../common/pulumi/components/mid/PrometheusNodeExporter";
import { Vector } from "../common/pulumi/components/mid/Vector";

const midProvider = new mid.Provider("eris", {
  connection: {
    host: "eris.sapslaj.xyz",
    port: 22,
    user: "ci",
    privateKey: getSecretValueOutput({
      folder: "/ci",
      key: "SSH_PRIVATE_KEY",
    }),
  },
});

const midTarget = new MidTarget("eris", {}, {
  provider: midProvider,
});

new BaselineUsers("eris-baseline-users", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new PrometheusNodeExporter("eris-node-exporter", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new Vector("eris-vector", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new Autoupdate("eris-autoupdate", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new NASClient("eris-nas-client", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

const nutSecretFolder = new SecretFolder("/nut", {
  name: "nut",
});

const usersSecretFolder = new SecretFolder("/nut/users", {
  name: "users",
  parent: nutSecretFolder.path,
});

const users = [
  "homeassistant",
  "monuser",
] as const;

type User = typeof users[number];

const userPasswords: Record<User, pulumi.Input<string>> = users.reduce((obj, user) => {
  obj[user] = new random.RandomPassword(user as string, {
    length: 32,
    special: false,
  }).result;
  new Secret(`/nut/users/${user}`, {
    parent: usersSecretFolder.path,
    name: user,
    value: obj[user],
  });
  return obj;
}, {} as Record<User, pulumi.Input<string>>);

const nutPackage = new mid.resource.Apt("nut", {
  name: "nut",
}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

const nutSnmpPackage = new mid.resource.Apt("nut-snmp", {
  name: "nut-snmp",
}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

const nutConf = new mid.resource.File("/etc/nut/nut.conf", {
  path: "/etc/nut/nut.conf",
  content: "MODE=netserver\n",
}, {
  provider: midProvider,
  dependsOn: [
    nutPackage,
    nutSnmpPackage,
  ],
});

const upsConf = new mid.resource.File("/etc/nut/ups.conf", {
  path: "/etc/nut/ups.conf",
  content: `[ups1]
\tdriver = snmp-ups
\tport = ups1.sapslaj.xyz
\tmibs = cyberpower
\tcommunity = public
\tdesc = "ups1"

[ups2]
\tdriver = snmp-ups
\tport = ups2.sapslaj.xyz
\tmibs = cyberpower
\tcommunity = public
\tdesc = "ups2"

[pdu1]
\tdriver = snmp-ups
\tport = pdu1.sapslaj.xyz
\tcommunity = public
\tdesc = "pdu1"

[pdu2]
\tdriver = snmp-ups
\tport = pdu2.sapslaj.xyz
\tcommunity = public
\tdesc = "pdu2"
`,
}, {
  provider: midProvider,
  dependsOn: [
    nutPackage,
  ],
});

const upsdConf = new mid.resource.File("/etc/nut/upsd.conf", {
  path: "/etc/nut/upsd.conf",
  content: `LISTEN 0.0.0.0 3493
LISTEN :: 3493
`,
}, {
  provider: midProvider,
  dependsOn: [
    nutPackage,
  ],
});

const upsdUsers = new mid.resource.File("/etc/nut/upsd.users", {
  path: "/etc/nut/upsd.users",
  content: `
[homeassistant]
\tpassword = ${userPasswords.homeassistant}
\tactions = set
\tactions = fsd
\tinstcmds = all

[monuser]
\tpassword = ${userPasswords.monuser}
\tupsmon master
`,
}, {
  provider: midProvider,
  dependsOn: [
    nutPackage,
  ],
});

// Notification script for power events
const notifyScript = new mid.resource.File("/usr/local/bin/nut-notify", {
  path: "/usr/local/bin/nut-notify",
  mode: "a+x",
  content: `#!/bin/bash
# NUT notification script
# Called with: NOTIFYTYPE UPSNAME

logger -t nut-notify "UPS event: \${1} on \${2}"

# Add your custom notification logic here
# Example: send to monitoring system, webhook, etc.
`,
}, {
  provider: midProvider,
  dependsOn: [
    nutPackage,
  ],
});

const upsmonConf = new mid.resource.File("/etc/nut/upsmon.conf", {
  path: "/etc/nut/upsmon.conf",
  content: `MONITOR ups1@localhost 1 monuser ${userPasswords.monuser} master
MONITOR ups2@localhost 1 monuser ${userPasswords.monuser} master

MINSUPPLIES 1
SHUTDOWNCMD "/sbin/shutdown -h +0"
NOTIFYCMD /usr/local/bin/nut-notify
POLLFREQ 5
POLLFREQALERT 5
HOSTSYNC 15
DEADTIME 15
POWERDOWNFLAG /etc/killpower

NOTIFYMSG ONLINE "UPS %s on line power"
NOTIFYMSG ONBATT "UPS %s on battery"
NOTIFYMSG LOWBATT "UPS %s battery is low"
NOTIFYMSG FSD "UPS %s: forced shutdown in progress"
NOTIFYMSG COMMOK "Communications with UPS %s established"
NOTIFYMSG COMMBAD "Communications with UPS %s lost"
NOTIFYMSG SHUTDOWN "Auto logout and shutdown proceeding"
NOTIFYMSG REPLBATT "UPS %s battery needs to be replaced"
NOTIFYMSG NOCOMM "UPS %s is unavailable"
NOTIFYMSG NOPARENT "upsmon parent process died - shutdown impossible"

NOTIFYFLAG ONLINE SYSLOG+WALL+EXEC
NOTIFYFLAG ONBATT SYSLOG+WALL+EXEC
NOTIFYFLAG LOWBATT SYSLOG+WALL+EXEC
NOTIFYFLAG FSD SYSLOG+WALL+EXEC
NOTIFYFLAG COMMOK SYSLOG+WALL+EXEC
NOTIFYFLAG COMMBAD SYSLOG+WALL+EXEC
NOTIFYFLAG SHUTDOWN SYSLOG+WALL+EXEC
NOTIFYFLAG REPLBATT SYSLOG+WALL+EXEC
NOTIFYFLAG NOCOMM SYSLOG+WALL+EXEC
NOTIFYFLAG NOPARENT SYSLOG+WALL+EXEC

RBWARNTIME 43200
NOCOMMWARNTIME 300
FINALDELAY 5
`,
}, {
  provider: midProvider,
  dependsOn: [
    nutPackage,
    notifyScript,
  ],
});

new mid.resource.SystemdService("nut-server.service", {
  name: "nut-server.service",
  enabled: true,
  ensure: "started",
  triggers: {
    refresh: [
      nutConf.triggers.lastChanged,
      upsConf.triggers.lastChanged,
      upsdConf.triggers.lastChanged,
      upsdUsers.triggers.lastChanged,
      notifyScript.triggers.lastChanged,
      upsmonConf.triggers.lastChanged,
    ],
  },
}, {
  provider: midProvider,
  dependsOn: [
    nutPackage,
  ],
});

new mid.resource.SystemdService("nut-monitor.service", {
  name: "nut-monitor.service",
  enabled: true,
  ensure: "started",
  triggers: {
    refresh: [
      nutConf.triggers.lastChanged,
      upsConf.triggers.lastChanged,
      upsdConf.triggers.lastChanged,
      upsdUsers.triggers.lastChanged,
      notifyScript.triggers.lastChanged,
      upsmonConf.triggers.lastChanged,
    ],
  },
}, {
  provider: midProvider,
  dependsOn: [
    nutPackage,
  ],
});

new mid.resource.SystemdService("nut-driver.target", {
  name: "nut-driver.target",
  enabled: true,
  ensure: "started",
  triggers: {
    refresh: [
      nutConf.triggers.lastChanged,
      upsConf.triggers.lastChanged,
      upsdConf.triggers.lastChanged,
      upsdUsers.triggers.lastChanged,
      notifyScript.triggers.lastChanged,
      upsmonConf.triggers.lastChanged,
    ],
  },
}, {
  provider: midProvider,
  dependsOn: [
    nutPackage,
  ],
});
