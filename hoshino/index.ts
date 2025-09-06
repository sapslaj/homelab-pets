import * as TOML from "@iarna/toml";
import * as aws from "@pulumi/aws";
import * as kubernetes from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as mid from "@sapslaj/pulumi-mid";
import * as YAML from "yaml";

import { getSecretValue, getSecretValueOutput } from "../common/pulumi/components/infisical";
import { getKubeconfig, newK3sProvider } from "../common/pulumi/components/k3s-shared";
import { IngressDNS } from "../common/pulumi/components/k8s/IngressDNS";
import { DockerContainer } from "../common/pulumi/components/mid/DockerContainer";
import { DockerHost } from "../common/pulumi/components/mid/DockerHost";
import { SystemdUnit } from "../common/pulumi/components/mid/SystemdUnit";
import { BaseConfigTrait } from "../common/pulumi/components/proxmox-vm/BaseConfigTrait";
import { ProxmoxVM, ProxmoxVMCPUType } from "../common/pulumi/components/proxmox-vm/ProxmoxVM";

const kubernetesProvider = newK3sProvider();

const namespace = new kubernetes.core.v1.Namespace("garm", {
  metadata: {
    name: "garm",
  },
}, {
  provider: kubernetesProvider,
});

const vm = new ProxmoxVM("hoshino", {
  name: pulumi.getStack() === "prod" ? "hoshino" : `hoshino-${pulumi.getStack()}`,
  traits: [
    new BaseConfigTrait("base", {
      mid: {
        openTelemetryCollector: {
          enabled: false,
        },
        vector: {
          enabled: true,
          sources: {
            metrics_garm: {
              type: "prometheus_scrape",
              endpoints: ["http://localhost:9997/metrics"],
              scrape_interval_secs: 60,
              scrape_timeout_secs: 45,
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
  cpu: {
    type: ProxmoxVMCPUType.HOST,
    cores: 16,
  },
  memory: {
    dedicated: 16 * 1024,
  },
});

const dockerHost = new DockerHost("garm", {
  connection: vm.connection,
}, {
  deletedWith: vm,
  dependsOn: [
    vm,
  ],
});

const etcActRunner = new mid.resource.File("/etc/act_runner", {
  connection: vm.connection,
  config: {
    check: false,
  },
  path: "/etc/act_runner",
  ensure: "directory",
}, {
  deletedWith: vm,
  dependsOn: [
    vm,
  ],
});

const actRunnerConfig = new mid.resource.File("/etc/act_runner/config.yaml", {
  connection: vm.connection,
  config: {
    check: false,
  },
  path: "/etc/act_runner/config.yaml",
  content: YAML.stringify({
    log: {
      level: "info",
    },
    runner: {
      file: ".runner",
      capacity: 8,
      timeout: "3h",
      shutdown_timeout: "0s",
      fetch_timeout: "5s",
      fetch_interval: "2s",
      labels: [
        "ubuntu-latest:docker://docker.gitea.com/runner-images:ubuntu-latest",
        "ubuntu-22.04:docker://docker.gitea.com/runner-images:ubuntu-22.04",
        "ubuntu-20.04:docker://docker.gitea.com/runner-images:ubuntu-20.04",
      ],
    },
    cache: {
      enabled: false,
    },
    container: {
      privileged: true,
      options: "--device /dev/kvm",
      force_pull: true,
      force_rebuild: false,
      require_docker: true,
      docker_timeout: "0s",
    },
  }),
}, {
  deletedWith: vm,
  dependsOn: [
    vm,
    etcActRunner,
  ],
});

new DockerContainer("act_runner", {
  connection: vm.connection,
  name: "act_runner",
  image: "proxy.oci.sapslaj.xyz/docker-hub/gitea/act_runner:latest",
  restartPolicy: "unless-stopped",
  env: {
    GITEA_INSTANCE_URL: "https://git.sapslaj.cloud",
    GITEA_RUNNER_REGISTRATION_TOKEN: getSecretValue({
      folder: "/garm",
      key: "gitea-runner-token",
    }),
    GITEA_RUNNER_NAME: "hoshino",
    CONFIG_FILE: actRunnerConfig.path,
  },
  volumes: [
    "/var/run/docker.sock:/var/run/docker.sock",
    "/etc/act_runner:/etc/act_runner",
  ],
  devices: [
    "/dev/kvm",
  ],
}, {
  deletedWith: vm,
  dependsOn: [
    dockerHost,
    actRunnerConfig,
  ],
});

const incusPackages = new mid.resource.Apt("incus-packages", {
  connection: vm.connection,
  names: [
    "cpu-checker",
    "dnsmasq",
    "incus",
    "ovmf",
    "qemu-system",
    "qemu-system-modules-spice",
    "qemu-utils",
  ],
}, {
  deletedWith: vm,
  dependsOn: [
    vm,
  ],
});

const buildPackages = new mid.resource.Apt("build-packages", {
  connection: vm.connection,
  names: [
    "apg",
    "build-essential",
    "git",
    "golang-go",
  ],
}, {
  deletedWith: vm,
  dependsOn: [
    vm,
  ],
});

const garmGroup = new mid.resource.Group("garm", {
  connection: vm.connection,
  name: "garm",
  system: true,
}, {
  deletedWith: vm,
  dependsOn: [
    vm,
  ],
});

const garmUser = new mid.resource.User("garm", {
  connection: vm.connection,
  config: {
    check: false,
  },
  name: "garm",
  system: true,
  shell: "/usr/sbin/nologin",
  group: garmGroup.name,
  home: "/var/garm",
  manageHome: false,
  groups: [
    "incus-admin",
  ],
}, {
  deletedWith: vm,
  dependsOn: [
    vm,
    incusPackages,
  ],
});

const etcGarm = new mid.resource.File("/etc/garm", {
  connection: vm.connection,
  config: {
    check: false,
  },
  path: "/etc/garm",
  ensure: "directory",
  owner: garmUser.name,
  group: garmGroup.name,
  mode: "750",
}, {
  deletedWith: vm,
  dependsOn: [
    vm,
  ],
});

const etcGarmProvidersd = new mid.resource.File("/etc/garm/providers.d", {
  connection: vm.connection,
  config: {
    check: false,
  },
  path: "/etc/garm/providers.d",
  ensure: "directory",
  owner: garmUser.name,
  group: garmGroup.name,
  mode: "750",
}, {
  deletedWith: vm,
  dependsOn: [
    vm,
    etcGarm,
  ],
});

const optGarm = new mid.resource.File("/opt/garm", {
  connection: vm.connection,
  config: {
    check: false,
  },
  path: "/opt/garm",
  ensure: "directory",
  owner: "root",
  group: garmGroup.name,
  mode: "755",
}, {
  deletedWith: vm,
  dependsOn: [
    vm,
  ],
});

const optGarmBin = new mid.resource.File("/opt/garm/bin", {
  connection: vm.connection,
  config: {
    check: false,
  },
  path: "/opt/garm/bin",
  ensure: "directory",
  owner: "root",
  group: garmGroup.name,
  mode: "755",
}, {
  deletedWith: vm,
  dependsOn: [
    vm,
    optGarm,
  ],
});

const varGarm = new mid.resource.File("/var/garm", {
  connection: vm.connection,
  config: {
    check: false,
  },
  path: "/var/garm",
  ensure: "directory",
  owner: garmUser.name,
  group: garmGroup.name,
  mode: "750",
}, {
  deletedWith: vm,
  dependsOn: [
    vm,
  ],
});

const jwtTokenSecret = new random.RandomPassword("jwt-token-secret", {
  length: 64,
});

const dbEncryptionPassphrase = new random.RandomPassword("db-encryption-passphrase", {
  length: 32,
  special: false,
});

const githubAppPrivateKey = new mid.resource.File("/etc/garm/github-app-private-key.pem", {
  connection: vm.connection,
  config: {
    check: false,
  },
  path: "/etc/garm/github-app-private-key.pem",
  owner: garmUser.name,
  group: garmGroup.name,
  mode: "600",
  content: getSecretValueOutput({
    folder: "/garm",
    key: "github-app-private-key",
  }),
}, {
  deletedWith: etcGarm,
  dependsOn: [
    etcGarm,
  ],
});

const garmIncusContainerProviderConfig = new mid.resource.File("/etc/garm/providers.d/incus-container.toml", {
  connection: vm.connection,
  path: "/etc/garm/providers.d/incus-container.toml",
  content: TOML.stringify({
    unix_socket_path: "/var/lib/incus/unix.socket",
    include_default_profile: false,
    instance_type: "container",
    secure_boot: false,
    project_name: "default",
    image_remotes: {
      images: {
        addr: "https://images.linuxcontainers.org",
        public: true,
        protocol: "simplestreams",
        skip_verify: false,
      },
    },
  }),
}, {
  deletedWith: etcGarmProvidersd,
  dependsOn: [
    etcGarmProvidersd,
  ],
});

const garmIncusVMProviderConfig = new mid.resource.File("/etc/garm/providers.d/incus-virtual-machine.toml", {
  connection: vm.connection,
  path: "/etc/garm/providers.d/incus-virtual-machine.toml",
  content: TOML.stringify({
    unix_socket_path: "/var/lib/incus/unix.socket",
    include_default_profile: false,
    instance_type: "virtual-machine",
    secure_boot: false,
    project_name: "default",
    image_remotes: {
      images: {
        addr: "https://images.linuxcontainers.org",
        public: true,
        protocol: "simplestreams",
        skip_verify: false,
      },
    },
  }),
}, {
  deletedWith: etcGarmProvidersd,
  dependsOn: [
    etcGarmProvidersd,
  ],
});

const garmProviderIncusInstall = new mid.resource.Exec("garm-provider-incus-install", {
  connection: vm.connection,
  dir: optGarm.path,
  create: {
    command: [
      "/bin/bash",
      "-c",
      `
        set -euo pipefail
        test ! -d garm-provider-incus && git clone https://github.com/cloudbase/garm-provider-incus
        cd garm-provider-incus
        git fetch
        git checkout bfb551e585cb0d79bc5b47352bd9cf00cff5b921
        go build .
        systemctl stop garm.service || true
        cp garm-provider-incus /usr/local/bin/garm-provider-incus
      `,
    ],
  },
  delete: {
    command: [
      "/bin/bash",
      "-c",
      `
        set -euo pipefail
        rm -f /usr/local/bin/garm-provider-incus
        rm -rf garm-provider-incus
      `,
    ],
  },
}, {
  deletedWith: vm,
  dependsOn: [
    buildPackages,
    optGarm,
  ],
});

const awsSandboxProvider = new aws.Provider("aws-sandbox", {
  region: "us-east-1",
  assumeRole: {
    roleArn: "arn:aws:iam::854523357306:role/OrganizationAccountAccessRole",
  },
});

const awsSandboxUser = new aws.iam.User("aws-sandbox-garm", {
  name: "garm",
}, {
  provider: awsSandboxProvider,
});

const awsSandboxUserKey = new aws.iam.AccessKey("aws-sandbox-garm", {
  user: awsSandboxUser.name,
}, {
  provider: awsSandboxProvider,
});

new aws.iam.UserPolicyAttachment("aws-sandbox-garm-admin", {
  user: awsSandboxUser.name,
  policyArn: "arn:aws:iam::aws:policy/AdministratorAccess",
}, {
  provider: awsSandboxProvider,
});

const garmAWSSandboxUSE1ProviderConfig = new mid.resource.File("/etc/garm/providers.d/aws-sandbox-us-east-1.toml", {
  connection: vm.connection,
  path: "/etc/garm/providers.d/aws-sandbox-us-east-1.toml",
  content: pulumi.all({
    id: awsSandboxUserKey.id,
    secret: awsSandboxUserKey.secret,
  }).apply(({ id, secret }) => {
    return TOML.stringify({
      region: "us-east-1",
      subnet_id: "subnet-0ccfcfe5ed9d63726",
      credentials: {
        credential_type: "static",
        static: {
          access_key_id: id,
          secret_access_key: secret,
        },
      },
    });
  }),
}, {
  deletedWith: etcGarmProvidersd,
  dependsOn: [
    etcGarmProvidersd,
  ],
});

const garmProviderAWSInstall = new mid.resource.Exec("garm-provider-aws-install", {
  connection: vm.connection,
  dir: optGarm.path,
  create: {
    command: [
      "/bin/bash",
      "-c",
      `
        set -euo pipefail
        test ! -d garm-provider-aws && git clone https://github.com/cloudbase/garm-provider-aws
        cd garm-provider-aws
        git fetch
        git checkout e2b0aee740113d30aa004fd2e63a225cd8ee1bbe
        go build .
        systemctl stop garm.service || true
        cp garm-provider-aws /usr/local/bin/garm-provider-aws
      `,
    ],
  },
  delete: {
    command: [
      "/bin/bash",
      "-c",
      `
        set -euo pipefail
        rm -f /usr/local/bin/garm-provider-incus
        rm -rf garm-provider-incus
      `,
    ],
  },
}, {
  deletedWith: vm,
  dependsOn: [
    buildPackages,
    optGarm,
  ],
});

const garmK8sNekoparaKubeconfig = new mid.resource.File("/etc/garm/providers.d/k8s-nekopara.toml", {
  connection: vm.connection,
  path: "/etc/garm/providers.d/k8s-nekopara.kubeconfig.yaml",
  content: getKubeconfig(), // TODO: set up dedicated ServiceAccount, CR, and CRB.
}, {
  deletedWith: etcGarmProvidersd,
  dependsOn: [
    etcGarmProvidersd,
  ],
});

const garmK8sekoparaProviderConfig = new mid.resource.File("/etc/garm/providers.d/k8s-nekopara.yaml", {
  connection: vm.connection,
  path: "/etc/garm/providers.d/k8s-nekopara.yaml",
  content: pulumi.all({
    kubeConfigPath: garmK8sNekoparaKubeconfig.path,
    runnerNamespace: namespace.metadata.name,
  }).apply(({ kubeConfigPath, runnerNamespace }) => {
    return YAML.stringify({
      kubeConfigPath,
      runnerNamespace,
      podTemplate: {
        spec: {},
      },
      flavors: {
        default: {
          requests: {
            cpu: "2",
            memory: "2Gi",
          },
          limits: {
            cpu: "2",
            memory: "2Gi",
          },
        },
      },
    });
  }),
}, {
  deletedWith: etcGarmProvidersd,
  dependsOn: [
    etcGarmProvidersd,
  ],
});

const garmProviderK8sInstall = new mid.resource.Exec("garm-provider-k8s-install", {
  connection: vm.connection,
  dir: optGarm.path,
  create: {
    command: [
      "/bin/bash",
      "-c",
      `
        set -euo pipefail
        mkdir -p garm-provider-k8s
        cd garm-provider-k8s
        wget -q -O - https://github.com/mercedes-benz/garm-provider-k8s/releases/download/v0.3.2/garm-provider-k8s_Linux_x86_64.tar.gz | tar xzf -
        systemctl stop garm.service || true
        cp garm-provider-k8s /usr/local/bin/garm-provider-k8s
      `,
    ],
  },
  delete: {
    command: [
      "/bin/bash",
      "-c",
      `
        set -euo pipefail
        rm -f /usr/local/bin/garm-provider-k8s
        rm -rf garm-provider-k8s
      `,
    ],
  },
}, {
  deletedWith: vm,
  dependsOn: [
    buildPackages,
    optGarm,
  ],
});

const garmConfig = new mid.resource.File("/etc/garm/config.toml", {
  connection: vm.connection,
  config: {
    check: false,
  },
  path: "/etc/garm/config.toml",
  content: pulumi.all({
    dbEncryptionPassphraseResult: dbEncryptionPassphrase.result,
    awsSandboxUSE1ProviderConfigPath: garmAWSSandboxUSE1ProviderConfig.path,
    incusContainerProviderConfigPath: garmIncusContainerProviderConfig.path,
    incusVMProviderConfigPath: garmIncusVMProviderConfig.path,
    k8sNekoparaConfigPath: garmK8sekoparaProviderConfig.path,
    jwtTokenSecretResult: jwtTokenSecret.result,
  }).apply(({
    awsSandboxUSE1ProviderConfigPath,
    dbEncryptionPassphraseResult,
    incusContainerProviderConfigPath,
    incusVMProviderConfigPath,
    jwtTokenSecretResult,
    k8sNekoparaConfigPath,
  }) => {
    return TOML.stringify({
      default: {
        enable_webhook_management: true,
      },
      logging: {
        enable_log_streamer: true,
        log_format: "json",
        log_level: "debug",
        log_source: true,
      },
      metrics: {
        enable: true,
        disable_auth: true,
      },
      jwt_auth: {
        secret: jwtTokenSecretResult,
        time_to_live: "8760h",
      },
      apiserver: {
        bind: "0.0.0.0",
        port: 9997,
        use_tls: false,
        webui: {
          enable: true,
        },
      },
      database: {
        debug: false,
        backend: "sqlite3",
        passphrase: dbEncryptionPassphraseResult,
        sqlite3: {
          db_file: "/var/garm/garm.db",
        },
      },
      provider: [
        {
          name: "aws_sandbox_us_east_1",
          provider_type: "external",
          description: "AWS Sandbox account us-east-1",
          external: {
            provider_executable: "/usr/local/bin/garm-provider-aws",
            config_file: awsSandboxUSE1ProviderConfigPath,
          },
        },
        {
          name: "incus_container",
          provider_type: "external",
          description: "Incus containers",
          external: {
            provider_executable: "/usr/local/bin/garm-provider-incus",
            config_file: incusContainerProviderConfigPath,
          },
        },
        {
          name: "incus_virtual_machine",
          provider_type: "external",
          description: "Incus virtual machines",
          external: {
            provider_executable: "/usr/local/bin/garm-provider-incus",
            config_file: incusVMProviderConfigPath,
          },
        },
        {
          name: "k8s_nekopara",
          provider_type: "external",
          description: "Nekopara Kubernetes cluster",
          external: {
            provider_executable: "/usr/local/bin/garm-provider-k8s",
            config_file: k8sNekoparaConfigPath,
          },
        },
      ],
    });
  }),
}, {
  deletedWith: etcGarm,
  dependsOn: [
    etcGarm,
  ],
});

const garmInstall = new mid.resource.Exec("garm-install", {
  connection: vm.connection,
  dir: optGarm.path,
  create: {
    command: [
      "/bin/bash",
      "-c",
      `
        set -euo pipefail
        test ! -d garm && git clone https://github.com/cloudbase/garm
        cd garm
        git fetch
        git checkout 7b0046b614c803e328b051ee8c41e7bffe804c43
        make clean build
        systemctl stop garm.service || true
        cp bin/garm /usr/local/bin/garm
        cp bin/garm-cli /usr/local/bin/garm-cli
      `,
    ],
  },
  delete: {
    command: [
      "/bin/bash",
      "-c",
      `
        set -euo pipefail
        rm -f /usr/local/bin/garm /usr/local/bin/garm-cli
        rm -rf garm
      `,
    ],
  },
}, {
  deletedWith: vm,
  dependsOn: [
    buildPackages,
    optGarm,
  ],
});

const garmService = new SystemdUnit("garm.service", {
  connection: vm.connection,
  triggers: {
    refresh: [
      garmConfig.triggers.lastChanged,
      garmInstall.triggers.lastChanged,
      garmProviderIncusInstall.triggers.lastChanged,
    ],
  },
  name: "garm.service",
  ensure: "started",
  enabled: true,
  unit: {
    Description: "GitHub Actions Runner Manager (garm)",
    After: "multi-user.target",
  },
  service: {
    Type: "simple",
    ExecStart: "/usr/local/bin/garm -config /etc/garm/config.toml",
    ExecReload: "/bin/kill -HUP $MAINPID",
    Restart: "on-failure",
    RestartSec: "5s",
    User: "garm",
  },
  install: {
    WantedBy: "multi-user.target",
  },
}, {
  deletedWith: vm,
  dependsOn: [
    garmConfig,
    garmGroup,
    garmInstall,
    garmProviderAWSInstall,
    garmProviderIncusInstall,
    garmUser,
    githubAppPrivateKey,
    optGarm,
    optGarmBin,
    varGarm,
  ],
});

const kubernetesService = new kubernetes.core.v1.Service("garm", {
  metadata: {
    name: "garm",
    namespace: namespace.metadata.name,
  },
  spec: {
    type: "ExternalName",
    externalName: pulumi.concat(vm.name, ".sapslaj.xyz"),
    ports: [
      {
        name: "http",
        port: 9997,
        targetPort: 9997,
      },
    ],
  },
}, {
  provider: kubernetesProvider,
});

const ipAllowListMiddleware = new kubernetes.apiextensions.CustomResource("garm-ipallowlist-middleware", {
  apiVersion: "traefik.io/v1alpha1",
  kind: "Middleware",
  metadata: {
    name: "garm-ipallowlist",
    namespace: namespace.metadata.name,
  },
  spec: {
    ipAllowList: {
      sourceRange: [
        "100.64.0.0/10",
        "172.24.4.0/24",
        "172.24.5.0/24",
      ],
    },
  },
}, {
  provider: kubernetesProvider,
});

new kubernetes.apiextensions.CustomResource("garm-ingressroute", {
  apiVersion: "traefik.io/v1alpha1",
  kind: "IngressRoute",
  metadata: {
    name: "garm",
    namespace: namespace.metadata.name,
  },
  spec: {
    routes: [
      {
        kind: "Rule",
        match: "Host(`garm.sapslaj.xyz`)",
        middlewares: [
          {
            name: ipAllowListMiddleware.metadata.name,
            namespace: ipAllowListMiddleware.metadata.namespace,
          },
        ],
        services: [
          {
            kind: kubernetesService.kind,
            namespace: kubernetesService.metadata.namespace,
            name: kubernetesService.metadata.name,
            port: 9997,
          },
        ],
      },
      {
        kind: "Rule",
        match: "Host(`garm.sapslaj.xyz`) && PathPrefix(`/webhooks`)",
        services: [
          {
            kind: kubernetesService.kind,
            namespace: kubernetesService.metadata.namespace,
            name: kubernetesService.metadata.name,
            port: 9997,
          },
        ],
      },
    ],
  },
}, {
  provider: kubernetesProvider,
});

new IngressDNS("garm.sapslaj.xyz");
