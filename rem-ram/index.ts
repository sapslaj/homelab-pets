import * as fs from "fs";

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

import { getSecretValueOutput } from "../common/pulumi/components/infisical";
import { getGoarchOutput, latestGithubReleaseOutput } from "../common/pulumi/components/mid-utils";
import { Autoupdate } from "../common/pulumi/components/mid/Autoupdate";
import { BaselineUsers } from "../common/pulumi/components/mid/BaselineUsers";
import { MidTarget } from "../common/pulumi/components/mid/MidTarget";
import { NASClient } from "../common/pulumi/components/mid/NASClient";
import { PrometheusNodeExporter } from "../common/pulumi/components/mid/PrometheusNodeExporter";
import { Vector } from "../common/pulumi/components/mid/Vector";
import { DNSRecord } from "../common/pulumi/components/shimiko";

interface NodeProps {
  connection: mid.types.input.ConnectionArgs;
  ipv4Address: pulumi.Input<string>;
  ipv6Address: pulumi.Input<string>;
}

class Node extends pulumi.ComponentResource {
  constructor(name: string, props: NodeProps, opts?: pulumi.ComponentResourceOptions) {
    super("sapslaj:rem-ram:Node", name, {}, opts);

    new DNSRecord(`${name}-A`, {
      name,
      records: [props.ipv4Address],
      type: "A",
    }, {
      parent: this,
    });

    new DNSRecord(`${name}-AAAA`, {
      name,
      records: [props.ipv6Address],
      type: "AAAA",
    }, {
      parent: this,
    });

    const midTarget = new MidTarget(name, {
      connection: props.connection,
    }, {
      parent: this,
    });

    new BaselineUsers(name, {
      connection: props.connection,
    }, {
      parent: this,
      dependsOn: [
        midTarget,
      ],
    });

    new PrometheusNodeExporter(name, {
      connection: props.connection,
    }, {
      parent: this,
      dependsOn: [
        midTarget,
      ],
    });

    new Vector(name, {
      connection: props.connection,
      sources: {
        metrics_adguard: {
          type: "prometheus_scrape",
          endpoints: ["http://localhost:9617/metrics"],
          scrape_interval_secs: 60,
          scrape_timeout_secs: 45,
        },
        metrics_coredns: {
          type: "prometheus_scrape",
          endpoints: ["http://localhost:9153/metrics"],
          scrape_interval_secs: 60,
          scrape_timeout_secs: 45,
        },
      },
    }, {
      parent: this,
      dependsOn: [
        midTarget,
      ],
    });

    new Autoupdate(name, {
      connection: props.connection,
    }, {
      parent: this,
      dependsOn: [
        midTarget,
      ],
    });

    const curl = new mid.resource.Apt(`${name}-curl`, {
      connection: props.connection,
      name: "curl",
    }, {
      retainOnDelete: true,
      parent: this,
      dependsOn: [
        midTarget,
      ],
    });

    const goarch = getGoarchOutput({
      connection: props.connection,
    }, {
      parent: this,
      dependsOn: [
        midTarget,
      ],
    });

    const coreDNSVersion = latestGithubReleaseOutput("coredns/coredns").apply((v) => {
      if (v.startsWith("v")) {
        return v.replace(/^v/, "");
      }
      return v;
    });

    const coreDNSInstall = new mid.resource.AnsibleTaskList(`${name}-coredns-install`, {
      connection: props.connection,
      tasks: {
        create: [
          {
            module: "group",
            args: {
              name: "coredns",
              state: "present",
              system: true,
            },
          },
          {
            module: "user",
            args: {
              name: "coredns",
              state: "present",
              system: true,
              groups: ["coredns"],
              shell: "/usr/sbin/nologin",
              createhome: false,
              home: "/",
            },
          },
          {
            module: "systemd_service",
            args: {
              name: "coredns.service",
              state: "stopped",
            },
            ignoreErrors: true,
          },
          {
            module: "unarchive",
            args: {
              dest: "/usr/local/bin/",
              src: pulumi
                .interpolate`https://github.com/coredns/coredns/releases/download/v${coreDNSVersion}/coredns_${coreDNSVersion}_linux_${goarch}.tgz`,
              remote_src: true,
            },
          },
          {
            module: "systemd_service",
            args: {
              name: "coredns.service",
              state: "started",
            },
            ignoreErrors: true,
          },
        ],
        delete: [
          {
            module: "systemd_service",
            args: {
              name: "coredns.service",
              state: "stopped",
            },
            ignoreErrors: true,
          },
          {
            module: "file",
            args: {
              path: "/usr/local/bin/coredns",
              state: "absent",
            },
          },
          {
            module: "user",
            args: {
              name: "coredns",
              state: "absent",
            },
          },
          {
            module: "group",
            args: {
              name: "coredns",
              state: "absent",
            },
          },
        ],
      },
    }, {
      parent: this,
      dependsOn: [
        midTarget,
      ],
    });

    const etcCoredns = new mid.resource.File(`${name}-/etc/coredns`, {
      connection: props.connection,
      config: {
        check: false,
      },
      path: "/etc/coredns",
      ensure: "directory",
      group: "coredns",
      owner: "coredns",
    }, {
      parent: this,
      dependsOn: [
        coreDNSInstall,
      ],
    });

    const corefile = new mid.resource.File(`${name}-/etc/coredns/Corefile`, {
      connection: props.connection,
      config: {
        check: false,
      },
      path: "/etc/coredns/Corefile",
      content: fs.readFileSync("./Corefile", { encoding: "utf8" }),
      group: "coredns",
      owner: "coredns",
    }, {
      parent: this,
      dependsOn: [
        etcCoredns,
      ],
    });

    const vsddUser = new mid.resource.User(`${name}-vsdd`, {
      connection: props.connection,
      config: {
        check: false,
      },
      name: "vsdd",
      password:
        "$6$HZ.QSIxXeW1iKA8N$G3dXZDM/n8qSn2YjiLkW2/0jsVNfcOvDkf5L6agLnWDYSxklDxOIPfrjVT7Lj0XzuYxg.aTt241FdfAaFCQxl.",
      groupsExclusive: false,
      groups: [
        "coredns",
      ],
    }, {
      parent: this,
      dependsOn: [
        coreDNSInstall,
      ],
    });

    new mid.resource.File(`${name}-/etc/coredns/2.2.0.e.0.7.4.0.1.0.0.2.ip6.arpa.zone`, {
      connection: props.connection,
      config: {
        check: false,
      },
      path: "/etc/coredns/2.2.0.e.0.7.4.0.1.0.0.2.ip6.arpa.zone",
      ensure: "file",
      owner: "vsdd",
      group: "coredns",
      mode: "655",
    }, {
      parent: this,
      dependsOn: [
        vsddUser,
      ],
    });

    new mid.resource.File(`${name}-/etc/coredns/24.172.in-addr.arpa.zone`, {
      connection: props.connection,
      config: {
        check: false,
      },
      path: "/etc/coredns/24.172.in-addr.arpa.zone",
      ensure: "file",
      mode: "655",
    }, {
      parent: this,
      dependsOn: [
        vsddUser,
      ],
    });

    new mid.resource.File(`${name}-/etc/coredns/sapslaj.xyz.zone`, {
      connection: props.connection,
      config: {
        check: false,
      },
      path: "/etc/coredns/sapslaj.xyz.zone",
      ensure: "file",
      mode: "655",
    }, {
      parent: this,
      dependsOn: [
        vsddUser,
      ],
    });

    new mid.resource.File(`${name}-/etc/coredns/zonepop.hosts`, {
      connection: props.connection,
      config: {
        check: false,
      },
      path: "/etc/coredns/zonepop.hosts",
      ensure: "file",
      mode: "655",
    }, {
      parent: this,
      dependsOn: [
        vsddUser,
      ],
    });

    // const adguardHomeInstall = new mid.resource.Exec(`${name}-adguardhome-install`, {
    //   connection: props.connection,
    //   create: {
    //     command: [
    //       "/bin/sh",
    //       "-c",
    //       `curl -s -S -L https://raw.githubusercontent.com/AdguardTeam/AdGuardHome/master/scripts/install.sh | sh -s -- -v`,
    //     ],
    //   },
    //   delete: {
    //     command: [
    //       "/bin/sh",
    //       "-c",
    //       `curl -s -S -L https://raw.githubusercontent.com/AdguardTeam/AdGuardHome/master/scripts/install.sh | sh -s -- -v -u`,
    //     ],
    //   },
    // }, {
    //   parent: this,
    //   dependsOn: [
    //     curl,
    //   ],
    // });
  }
}

new Node("rem", {
  connection: {
    host: "172.24.4.2",
    port: 22,
    user: "ci",
    privateKey: getSecretValueOutput({
      folder: "/ci",
      key: "SSH_PRIVATE_KEY",
    }),
  },
  ipv4Address: "172.24.4.2",
  ipv6Address: "2001:470:e022:4::2",
});

new Node("ram", {
  connection: {
    host: "172.24.4.3",
    port: 22,
    user: "ci",
    privateKey: getSecretValueOutput({
      folder: "/ci",
      key: "SSH_PRIVATE_KEY",
    }),
  },
  ipv4Address: "172.24.4.3",
  ipv6Address: "2001:470:e022:4::3",
});
