import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

import { getSecretValueOutput } from "../common/pulumi/components/infisical";
import { Autoupdate } from "../common/pulumi/components/mid/Autoupdate";
import { BaselineUsers } from "../common/pulumi/components/mid/BaselineUsers";
import { DockerHost } from "../common/pulumi/components/mid/DockerHost";
import { MidTarget } from "../common/pulumi/components/mid/MidTarget";
import { NASClient } from "../common/pulumi/components/mid/NASClient";
import { PrometheusNodeExporter } from "../common/pulumi/components/mid/PrometheusNodeExporter";
import { RsyncBackup } from "../common/pulumi/components/mid/RsyncBackup";
import { Vector } from "../common/pulumi/components/mid/Vector";

const midProvider = new mid.Provider("koyuki", {
  connection: {
    host: "koyuki.sapslaj.xyz",
    port: 22,
    user: "ci",
    privateKey: getSecretValueOutput({
      folder: "/ci",
      key: "SSH_PRIVATE_KEY",
    }),
  },
});

const midTarget = new MidTarget("koyuki", {}, {
  provider: midProvider,
});

new BaselineUsers("koyuki", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new PrometheusNodeExporter("koyuki", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new Vector("koyuki", {
  sources: {
    metrics_docker: {
      type: "prometheus_scrape",
      endpoints: ["http://localhost:9323/metrics"],
      scrape_interval_secs: 60,
      scrape_timeout_secs: 45,
    },
    metrics_cadvisor: {
      type: "prometheus_scrape",
      endpoints: ["http://localhost:9338/metrics"],
      scrape_interval_secs: 60,
      scrape_timeout_secs: 45,
    },
    metrics_watchtower: {
      type: "prometheus_scrape",
      endpoints: ["http://localhost:9420/metrics"],
      scrape_interval_secs: 60,
      scrape_timeout_secs: 45,
      auth: {
        strategy: "bearer",
        token: "adminadmin",
      },
    },
    metrics_morbius: {
      type: "prometheus_scrape",
      endpoints: ["http://localhost:9269/metrics"],
      scrape_interval_secs: 60,
      scrape_timeout_secs: 45,
    },
    metrics_qbittorrent: {
      type: "prometheus_scrape",
      endpoints: ["http://localhost:9365/metrics"],
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

new Autoupdate("koyuki", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

const nasClient = new NASClient("koyuki", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

const docker = new DockerHost("koyuki", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new RsyncBackup("koyuki", {
  backupTimer: {
    onCalendar: "hourly",
    randomizedDelaySec: 1800,
    fixedRandomDelay: true,
  },
  backupJobs: [
    {
      src: "/var/docker/volumes",
      dest: "/mnt/exos/volumes/koyuki/docker-volumes",
    },
  ],
}, {
  provider: midProvider,
  dependsOn: [
    nasClient,
  ],
});
