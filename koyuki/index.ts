import * as fs from "fs";

import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

import { getSecretValueOutput } from "../common/pulumi/components/infisical";
import { Autoupdate } from "../common/pulumi/components/mid/Autoupdate";
import { BaselineUsers } from "../common/pulumi/components/mid/BaselineUsers";
import { DockerContainer } from "../common/pulumi/components/mid/DockerContainer";
import { DockerHost } from "../common/pulumi/components/mid/DockerHost";
import { MidTarget } from "../common/pulumi/components/mid/MidTarget";
import { NASClient } from "../common/pulumi/components/mid/NASClient";
import { PrometheusNodeExporter } from "../common/pulumi/components/mid/PrometheusNodeExporter";
import { RsyncBackup } from "../common/pulumi/components/mid/RsyncBackup";
import { Selfheal } from "../common/pulumi/components/mid/Selfheal";
import { SystemdUnit } from "../common/pulumi/components/mid/SystemdUnit";
import { Vector } from "../common/pulumi/components/mid/Vector";
import { base64encode, yamlencode } from "../common/pulumi/components/std";

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

new mid.resource.SystemdService("apparmor.service", {
  name: "apparmor.service",
  enabled: false,
  ensure: "stopped",
}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
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

new Selfheal("koyuki", {
  tasks: fs.readdirSync("./selfheal/").reduce((obj, filename) => {
    if (!filename.endsWith(".yml") || filename.endsWith(".disabled.yml")) {
      return obj;
    }
    return {
      ...obj,
      [filename.replace(/\.yml$/, "")]: fs.readFileSync(`./selfheal/${filename}`, { encoding: "utf8" }),
    };
  }, {}),
}, {
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

const varDocker = new mid.resource.File("/var/docker", {
  path: "/var/docker",
  ensure: "directory",
  recurse: false,
}, {
  provider: midProvider,
});

const dockerVolumes = new mid.resource.File("/var/docker/volumes", {
  path: "/var/docker/volumes",
  ensure: "directory",
  recurse: false,
}, {
  provider: midProvider,
  dependsOn: [
    varDocker,
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

const vpn = new DockerContainer("vpn", {
  name: "vpn",
  image: "ghcr.io/bubuntux/nordlynx",
  restartPolicy: "unless-stopped",
  capabilities: [
    "NET_ADMIN",
  ],
  publishedPorts: [
    "0.0.0.0:9117:9117", // Jackett
    "[::]:9117:9117",
    "0.0.0.0:8080:8080", // qBittorrent
    "[::]:8080:8080",
    "0.0.0.0:8191:8191", // FlairSolverr
    "[::]:8191:8191",
  ],
  env: {
    PRIVATE_KEY: getSecretValueOutput({
      key: "nordvpn-private-key",
    }),
    NET_LOCAL: "192.168.0.0/16,172.16.0.0/12,10.0.0.0/8",
    NET6_LOCAL: "2600:1f18:1a9:7200::/56,2001:470:e022::/48,fe80::/10",
  },
}, {
  provider: midProvider,
  dependsOn: [
    docker,
  ],
});

new DockerContainer("qbittorrent", {
  name: "qbittorrent",
  image: "lscr.io/linuxserver/qbittorrent:latest",
  entrypoint: [
    "/usr/bin/qbittorrent-nox",
  ],
  restartPolicy: "unless-stopped",
  networkMode: "container:vpn",
  memory: "1536M",
  env: {
    PUID: "0",
    PGID: "0",
    TZ: "America/New_York",
  },
  volumes: [
    "/var/docker/volumes/qbittorrent-config:/config",
    "/mnt/exos/Media:/data",
  ],
}, {
  provider: midProvider,
  dependsOn: [
    docker,
    dockerVolumes,
    nasClient,
    vpn,
  ],
});

new DockerContainer("qbittorrent-exporter", {
  name: "qbittorrent-exporter",
  image: "proxy.oci.sapslaj.xyz/docker-hub/esanchezm/prometheus-qbittorrent-exporter",
  restartPolicy: "unless-stopped",
  env: {
    QBITTORRENT_HOST: "172.17.0.1",
    QBITTORRENT_PORT: "8080",
  },
}, {
  provider: midProvider,
  dependsOn: [
    docker,
  ],
});

new DockerContainer("flairsolverr", {
  name: "flairsolverr",
  image: "ghcr.io/flaresolverr/flaresolverr:latest",
  restartPolicy: "unless-stopped",
  networkMode: "container:vpn",
}, {
  provider: midProvider,
  dependsOn: [
    docker,
    vpn,
  ],
});

new DockerContainer("jackett", {
  name: "jackett",
  image: "lscr.io/linuxserver/jackett",
  restartPolicy: "unless-stopped",
  networkMode: "container:vpn",
  env: {
    PUID: "33",
    PGID: "33",
    TZ: "America/New_York",
  },
  volumes: [
    "/var/docker/volumes/jackett-config:/config",
  ],
}, {
  provider: midProvider,
  dependsOn: [
    docker,
    dockerVolumes,
    vpn,
  ],
});

new DockerContainer("lidarr", {
  name: "lidarr",
  image: "lscr.io/linuxserver/lidarr",
  restartPolicy: "unless-stopped",
  links: [
    "vpn:jackett",
  ],
  publishedPorts: [
    "0.0.0.0:8687:8686",
    "[::]:8687:8686",
  ],
  env: {
    PUID: "0",
    PGID: "0",
  },
  volumes: [
    "/var/docker/volumes/lidarr-config:/config",
    "/mnt/exos/Media:/data",
  ],
}, {
  provider: midProvider,
  dependsOn: [
    docker,
    dockerVolumes,
    nasClient,
    vpn,
  ],
});

new DockerContainer("prowlarr", {
  name: "prowlarr",
  image: "lscr.io/linuxserver/prowlarr",
  restartPolicy: "unless-stopped",
  links: [
    "vpn:jackett",
  ],
  publishedPorts: [
    "0.0.0.0:9696:9696",
    "[::]:9696:9696",
  ],
  env: {
    PUID: "0",
    PGID: "0",
  },
  volumes: [
    "/var/docker/volumes/prowlarr-config:/config",
    "/mnt/exos/Media:/data",
  ],
}, {
  provider: midProvider,
  dependsOn: [
    docker,
    dockerVolumes,
    nasClient,
    vpn,
  ],
});

new DockerContainer("radarr", {
  name: "radarr",
  image: "lscr.io/linuxserver/radarr",
  restartPolicy: "unless-stopped",
  links: [
    "vpn:jackett",
  ],
  publishedPorts: [
    "0.0.0.0:7878:7878",
    "[::]:7878:7878",
  ],
  env: {
    PUID: "0",
    PGID: "0",
  },
  volumes: [
    "/var/docker/volumes/radarr-config:/config",
    "/mnt/exos/Media:/data",
  ],
}, {
  provider: midProvider,
  dependsOn: [
    docker,
    dockerVolumes,
    nasClient,
    vpn,
  ],
});

new DockerContainer("sonarr", {
  name: "sonarr",
  image: "lscr.io/linuxserver/sonarr",
  restartPolicy: "unless-stopped",
  links: [
    "vpn:jackett",
  ],
  publishedPorts: [
    "0.0.0.0:8989:8989",
    "[::]:8989:8989",
  ],
  env: {
    PUID: "0",
    PGID: "0",
  },
  volumes: [
    "/var/docker/volumes/sonarr-config:/config",
    "/mnt/exos/Media:/data",
  ],
}, {
  provider: midProvider,
  dependsOn: [
    docker,
    dockerVolumes,
    nasClient,
    vpn,
  ],
});

new DockerContainer("plex", {
  name: "plex",
  image: "lscr.io/linuxserver/plex",
  restartPolicy: "unless-stopped",
  networkMode: "host",
  memory: "1024M",
  env: {
    TZ: "America/New_York",
  },
  volumes: [
    "/var/docker/volumes/plex-config:/config",
    "/mnt/exos/Media:/data/media:ro",
  ],
}, {
  provider: midProvider,
  dependsOn: [
    docker,
    dockerVolumes,
    nasClient,
    vpn,
  ],
});

new DockerContainer("jellyfin", {
  name: "jellyfin",
  image: "proxy.oci.sapslaj.xyz/docker-hub/jellyfin/jellyfin:latest",
  restartPolicy: "unless-stopped",
  networkMode: "host",
  memory: "1536M",
  volumes: [
    "/var/docker/volumes/jellyfin-cache:/cache",
    "/var/docker/volumes/jellyfin-config:/config",
    "/mnt/exos/Media:/data/media:ro",
  ],
}, {
  provider: midProvider,
  dependsOn: [
    docker,
    dockerVolumes,
    nasClient,
    vpn,
  ],
});

const syslogngConfigDir = new mid.resource.File("/var/docker/volumes/syslog-ng-config", {
  path: "/var/docker/volumes/syslog-ng-config",
  ensure: "directory",
}, {
  provider: midProvider,
  dependsOn: [
    dockerVolumes,
  ],
});

const syslogngConfig = new mid.resource.File("/var/docker/volumes/syslog-ng-config/syslog-ng.conf", {
  path: "/var/docker/volumes/syslog-ng-config/syslog-ng.conf",
  content: fs.readFileSync("./syslog-ng.conf", { encoding: "utf8" }),
}, {
  provider: midProvider,
  dependsOn: [
    syslogngConfigDir,
  ],
});

new DockerContainer("syslog-ng", {
  triggers: {
    refresh: [
      syslogngConfig.triggers.lastChanged,
    ],
  },
  name: "syslog-ng",
  image: "lscr.io/linuxserver/syslog-ng",
  restartPolicy: "unless-stopped",
  networkMode: "host",
  env: {
    "TZ": "Etc/UTC",
  },
  command: [
    "tail",
    "-f",
    "/config/log/current",
    "/config/log/debug.log",
  ],
  volumes: [
    "/var/docker/volumes/syslog-ng-config:/config",
  ],
}, {
  provider: midProvider,
  dependsOn: [
    docker,
    syslogngConfig,
  ],
});

const vectorConfigDir = new mid.resource.File("/var/docker/volumes/vector-config", {
  path: "/var/docker/volumes/vector-config",
  ensure: "directory",
}, {
  provider: midProvider,
  dependsOn: [
    dockerVolumes,
  ],
});

const vectorConfig = new mid.resource.File("/var/docker/volumes/vector-config/vector.yaml", {
  path: "/var/docker/volumes/vector-config/vector.yaml",
  content: yamlencode({
    sources: {
      syslog: {
        type: "syslog",
        address: "0.0.0.0:1514",
        mode: "tcp",
        path: "/syslog.sock",
      },
    },
    sinks: {
      victorialogs: {
        type: "elasticsearch",
        inputs: [
          "syslog",
        ],
        api_version: "v8",
        compression: "gzip",
        endpoints: [
          "https://victoriametrics-vlinsert.sapslaj.xyz/insert/elasticsearch",
        ],
        healthcheck: {
          enabled: false,
        },
        mode: "bulk",
        request: {
          headers: {
            Authorization: pulumi.concat(
              "Basic ",
              base64encode(
                pulumi.concat(
                  "remotewrite:",
                  getSecretValueOutput({
                    folder: "/victoria-metrics-ingress-users/remotewrite",
                    key: "bcrypthash",
                  }),
                ),
              ),
            ),
            AccountID: "0",
            ProjectID: "0",
            "VL-Msg-Field": "message,msg,_msg,log.msg,log.message,log",
            "VL-Stream-Fields": "stream,hostname",
            "VL-Time-Field": "timestamp",
          },
        },
      },
    },
  }),
}, {
  provider: midProvider,
  dependsOn: [
    vectorConfigDir,
  ],
});

new DockerContainer("vector", {
  triggers: {
    refresh: [
      vectorConfig.triggers.lastChanged,
    ],
  },
  name: "vector",
  image: "proxy.oci.sapslaj.xyz/docker-hub/timberio/vector:0.48.0-debian",
  restartPolicy: "unless-stopped",
  publishedPorts: [
    "127.0.0.1:1514:1514",
  ],
  volumes: [
    "/var/docker/volumes/vector-config:/etc/vector",
    "/var/docker/volumes/vector-data:/var/lib/vector",
  ],
}, {
  provider: midProvider,
  dependsOn: [
    docker,
    vectorConfig,
  ],
});

new DockerContainer("syncthing", {
  name: "syncthing",
  image: "lscr.io/linuxserver/syncthing:latest",
  restartPolicy: "unless-stopped",
  networkMode: "host",
  env: {
    TZ: "America/New_York",
    PUID: "1000",
    PGID: "1000",
  },
  volumes: [
    "/var/docker/volumes/syncthing-config:/config",
    "/mnt/exos:/mnt/exos",
  ],
}, {
  provider: midProvider,
  dependsOn: [
    docker,
    dockerVolumes,
    nasClient,
  ],
});

const etcMorbius = new mid.resource.File("/etc/morbius", {
  path: "/etc/morbius",
  ensure: "directory",
}, {
  provider: midProvider,
});

const morbiusConfig = new mid.resource.File("/etc/morbius/config.yaml", {
  path: "/etc/morbius/config.yaml",
  content: fs.readFileSync("./morbius-config.yaml", { encoding: "utf8" }),
}, {
  provider: midProvider,
  dependsOn: [
    etcMorbius,
  ],
});

const varMorbius = new mid.resource.File("/var/morbius", {
  path: "/var/morbius",
  ensure: "directory",
}, {
  provider: midProvider,
});

const geoliteSync = new DockerContainer("geolite-sync", {
  name: "geolite-sync",
  image: "proxy.oci.sapslaj.xyz/docker-hub/debian:latest",
  restartPolicy: "unless-stopped",
  volumes: [
    "/var/morbius:/var/morbius",
    "/mnt/exos:/mnt/exos",
  ],
  command: [
    "/bin/bash",
    "-c",
    `
      set -euxo pipefail
      while :; do
        mkdir -p /var/morbius/mmdb
        cp /mnt/exos/volumes/misc/geolite/* /var/morbius/mmdb/
        sleep 3600
      done
    `,
  ],
}, {
  provider: midProvider,
  dependsOn: [
    docker,
    varMorbius,
    nasClient,
  ],
});

new DockerContainer("morbius", {
  triggers: {
    refresh: [
      morbiusConfig.triggers.lastChanged,
    ],
  },
  name: "morbius",
  image: "ghcr.io/sapslaj/morbius:latest",
  restartPolicy: "unless-stopped",
  networkMode: "host",
  volumes: [
    "/etc/morbius:/etc/morbius",
    "/var/morbius:/var/morbius",
  ],
}, {
  provider: midProvider,
  dependsOn: [
    docker,
    geoliteSync,
    morbiusConfig,
    nasClient,
  ],
});
