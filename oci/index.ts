import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

import { DockerContainer } from "../common/pulumi/components/mid/DockerContainer";
import { DockerHost } from "../common/pulumi/components/mid/DockerHost";
import { BaseConfigTrait } from "../common/pulumi/components/proxmox-vm/BaseConfigTrait";
import { ProxmoxVM } from "../common/pulumi/components/proxmox-vm/ProxmoxVM";
import { DNSRecord } from "../common/pulumi/components/shimiko";

const vm = new ProxmoxVM("oci", {
  name: pulumi.getStack() === "prod" ? "oci" : `oci-${pulumi.getStack()}`,
  traits: [
    new BaseConfigTrait("base", {
      mid: {
        vector: {
          enabled: true,
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
            metrics_proxy_zot: {
              type: "prometheus_scrape",
              endpoints: ["http://localhost:9523/metrics"],
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
          },
        },
      },
      cloudImage: {
        diskConfig: {
          size: 128,
        },
      },
    }),
  ],
});

const dockerInstall = new DockerHost("oci", {
  connection: vm.connection,
  // default is the proxy, but _we're_ the proxy so we can't proxy ourselves.
  watchtowerImage: "containrrr/watchtower",
}, {
  dependsOn: [
    vm,
  ],
});

const iamUser = new aws.iam.User("oci-traefik", {});
const iamKey = new aws.iam.AccessKey("oci-traefik", {
  user: iamUser.name,
});
new aws.iam.UserPolicyAttachment("oci-traefik-route53", {
  user: iamUser.name,
  policyArn: "arn:aws:iam::aws:policy/AmazonRoute53FullAccess",
});

[
  "proxy",
  "traefik",
].map((subdomain) => {
  new DNSRecord(subdomain, {
    name: pulumi.interpolate`${subdomain}.${vm.name}`,
    records: [
      pulumi.interpolate`${vm.name}.sapslaj.xyz.`,
    ],
    type: "CNAME",
  });
});

new DockerContainer("traefik", {
  connection: vm.connection,
  name: "traefik",
  image: "public.ecr.aws/docker/library/traefik:v3.5",
  restartPolicy: "unless-stopped",
  command: [
    "--accesslog.fields.defaultmode=keep",
    "--accesslog.fields.headers.defaultmode=drop",
    "--accesslog.format=json",
    "--accesslog=true",
    "--api.dashboard=true",
    "--certificatesresolvers.letsencrypt.acme.caServer=https://acme-v02.api.letsencrypt.org/directory",
    "--certificatesresolvers.letsencrypt.acme.dnsChallenge.provider=route53",
    "--certificatesresolvers.letsencrypt.acme.dnsChallenge.resolvers=1.1.1.1:53,8.8.8.8:53",
    "--certificatesresolvers.letsencrypt.acme.email=alerts@sapslaj.com",
    "--certificatesresolvers.letsencrypt.acme.storage=/data/acme.json",
    "--entryPoints.metrics.address=:8082/tcp",
    "--entryPoints.web.address=:80/tcp",
    "--entryPoints.web.http.redirections.entryPoint.permanent=true",
    "--entryPoints.web.http.redirections.entryPoint.scheme=https",
    "--entryPoints.web.http.redirections.entryPoint.to=:443",
    "--entryPoints.websecure.address=:443/tcp",
    "--entryPoints.websecure.http.tls.certResolver=letsencrypt",
    pulumi.interpolate`--entryPoints.websecure.http.tls.domains[0].main=${vm.name}.sapslaj.xyz`,
    pulumi.interpolate`--entryPoints.websecure.http.tls.domains[0].sans=*.${vm.name}.sapslaj.xyz`,
    "--entryPoints.websecure.http.tls=true",
    "--log.format=json",
    "--log.level=INFO",
    "--metrics.prometheus.entrypoint=metrics",
    "--metrics.prometheus=true",
    "--ping=true",
    "--providers.docker=true",
  ],
  env: {
    AWS_REGION: "us-east-1",
    AWS_ACCESS_KEY_ID: iamKey.id,
    AWS_SECRET_ACCESS_KEY: iamKey.secret,
  },
  publishedPorts: [
    "80:80",
    "443:443",
    "8082:8082",
  ],
  volumes: [
    "/var/docker/volumes/traefik-data:/data",
    "/var/run/docker.sock:/var/run/docker.sock",
  ],
  labels: {
    "traefik.http.routers.dashboard.rule": "HostRegexp(`traefik\\..+`)",
    "traefik.http.routers.dashboard.entrypoints": "websecure",
    "traefik.http.routers.dashboard.service": "api@internal",
  },
}, {
  dependsOn: [
    dockerInstall,
  ],
});

new DockerContainer("registry", {
  connection: vm.connection,
  name: "registry",
  image: "public.ecr.aws/docker/library/registry:3",
  restartPolicy: "unless-stopped",
  env: {
    OTEL_TRACES_EXPORTER: "none", // TODO: re-enable
    REGISTRY_LOG_ACCESS_LOG_DISABLED: "false",
    REGISTRY_LOG_FORMATTER: "json",
    REGISTRY_STORAGE_FILESYSTEM_ROOTDIRECTORY: "/var/lib/registry",
  },
  volumes: [
    "/var/docker/volumes/registry-data:/var/lib/registry",
  ],
  publishedPorts: [
    "5000:5000",
  ],
  labels: {
    "traefik.http.routers.registry.rule": "HostRegexp(`.+`)",
    "traefik.http.routers.registry.entrypoints": "websecure",
    "traefik.http.services.registry.loadbalancer.server.port": "5000",
  },
}, {
  dependsOn: [
    dockerInstall,
  ],
});

const proxyZotConfigDir = new mid.resource.File("/var/docker/volumes/proxy-zot-config", {
  connection: vm.connection,
  path: "/var/docker/volumes/proxy-zot-config",
  ensure: "directory",
  recurse: true,
});

const proxyZotConfig = new mid.resource.File("/var/docker/volumes/proxy-zot-config/zot.json", {
  connection: vm.connection,
  path: "/var/docker/volumes/proxy-zot-config/zot.json",
  content: JSON.stringify({
    storage: {
      rootDirectory: "/data",
      gc: true,
    },
    http: {
      address: "0.0.0.0",
      port: 8080,
    },
    log: {
      level: "debug",
    },
    extensions: {
      metrics: {
        enable: true,
        prometheus: {
          path: "/metrics",
        },
      },
      sync: {
        enable: true,
        registries: [
          {
            urls: ["https://docker.io"],
            content: [
              {
                prefix: "**",
                destination: "/docker-hub",
              },
            ],
            onDemand: true,
            tlsVerify: true,
          },
        ],
      },
    },
  }),
}, {
  dependsOn: [proxyZotConfigDir],
});

new DockerContainer("proxy", {
  connection: vm.connection,
  name: "proxy",
  image: "ghcr.io/project-zot/zot:v2.1.7",
  restartPolicy: "unless-stopped",
  volumes: [
    pulumi.interpolate`${proxyZotConfigDir.path}:/config`,
    "/var/docker/volumes/proxy-zot-data:/data",
  ],
  publishedPorts: [
    "9523:8080",
  ],
  labels: {
    "config-hash": proxyZotConfig.stat.sha256Checksum!.apply((c) => c ?? "[unknown]"),
    "traefik.http.routers.proxy.rule": "HostRegexp(`proxy\\..+`)",
    "traefik.http.routers.proxy.entrypoints": "websecure",
    "traefik.http.services.proxy.loadbalancer.server.port": "8080",
  },
  command: [
    "serve",
    "/config/zot.json",
  ],
}, {
  dependsOn: [
    dockerInstall,
    proxyZotConfig,
  ],
});
