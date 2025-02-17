import * as path from "path";

import { remote } from "@pulumi/command";
import * as kubernetes from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as tls from "@pulumi/tls";

import { ControlPlane } from "./ControlPlane";
import { NodeGroup } from "./NodeGroup";

const k3sVersion = "v1.31.5+k3s1";

const controlPlane = new ControlPlane("k3s-control-plane", {
  k3sVersion,
  serverArgs: [
    "--disable-helm-controller",
    "--disable traefik",
    "--disable coredns",
    "--disable local-storage",
    "--disable metrics-server",
    "--node-label k3s.sapslaj.xyz/role=control-plane",
    "--node-taint k3s.sapslaj.xyz/role=control-plane:NoSchedule",
    "--write-kubeconfig-mode 644",
  ],
  nodeConfig: {
    memory: {
      dedicated: 1024,
    },
  },
});

export const server = controlPlane.server;

const nodeGroup = new NodeGroup("k3s-node-group", {
  k3sVersion,
  k3sToken: controlPlane.k3sToken,
  server: controlPlane.server,
  nodeConfig: {
    memory: {
      dedicated: 8192,
    },
  },
}, { dependsOn: [controlPlane] });

const provider = new kubernetes.Provider("k3s", {
  kubeconfig: controlPlane.kubeconfig,
});

const prometheusOperatorCrds = new kubernetes.helm.v3.Chart("prometheus-operator-crds", {
  chart: "prometheus-operator-crds",
  fetchOpts: {
    repo: "https://prometheus-community.github.io/helm-charts",
  },
}, { provider });

const coredns = new kubernetes.helm.v3.Chart("coredns", {
  chart: "coredns",
  namespace: "kube-system",
  version: "1.39.0",
  fetchOpts: {
    repo: "https://coredns.github.io/helm",
  },
  values: {
    replicaCount: 3,
    resources: {
      limits: {
        cpu: "1",
      },
    },
    prometheus: {
      service: {
        monitor: {
          enabled: true,
        },
      },
    },
    tolerations: [
      {
        key: "k3s.sapslaj.xyz/role",
        operator: "Equal",
        value: "control-plane",
        effect: "NoSchedule",
      },
    ],
  },
}, {
  provider,
  dependsOn: [
    prometheusOperatorCrds,
  ],
});

const monitoringNamespace = new kubernetes.core.v1.Namespace("monitoring", {
  metadata: {
    name: "monitoring",
  },
}, { provider });

const victoriaMetrics = new kubernetes.helm.v3.Chart("victoria-metrics", {
  chart: "victoria-metrics-k8s-stack",
  fetchOpts: {
    repo: "https://victoriametrics.github.io/helm-charts/",
  },
  namespace: monitoringNamespace.metadata.name,
  values: {
    nameOverride: "victoria-metrics",
    fullnameOverride: "victoria-metrics",
  },
}, {
  provider,
  dependsOn: [
    prometheusOperatorCrds,
  ],
});

const traefikNamespace = new kubernetes.core.v1.Namespace("traefik", {
  metadata: {
    name: "traefik",
  },
}, { provider });

const traefik = new kubernetes.helm.v3.Chart("traefik", {
  chart: "traefik",
  fetchOpts: {
    repo: "https://traefik.github.io/charts",
  },
  namespace: traefikNamespace.metadata.name,
  values: {
    deployment: {
      replicas: 3,
    },
    ingressClass: {
      enabled: true,
      isDefaultClass: true,
    },
    ingressRoute: {
      dashboard: {
        enabled: false,
      },
    },
    providers: {
      kubernetesCRD: {
        enabled: true,
        allowCrossNamespace: true,
        allowExternalNameServices: true,
        allowEmptyServices: true,
      },
      kubernetesIngress: {
        enabled: true,
        allowExternalNameServices: true,
        allowEmptyServices: true,
      },
      kubernetesGateway: {
        enabled: true,
      },
    },
    logs: {
      general: {
        format: "json",
        level: "INFO",
      },
      access: {
        enabled: true,
        format: "json",
      },
    },
    metrics: {
      addInternals: true,
      prometheus: {
        service: {
          enabled: true,
        },
        serviceMonitor: {
          enabled: true,
        },
        prometheusRule: {
          enabled: true,
        },
      },
    },
    globalArguments: [],
  },
}, {
  provider,
  dependsOn: [
    prometheusOperatorCrds,
  ],
});

//
// const baseConfigBuilder = new BaseConfigBuilder({
//   ansibleTarget: true,
//   dockerStandalone: false,
//   nasClient: false,
//   nodeExporter: false,
//   processExporter: false,
//   promtail: false,
//   qemuGuest: false,
//   rsyncBackup: false,
//   selfheal: false,
//   unfuckUbuntu: true,
//   users: true,
// });
//
// const rolePaths = baseConfigBuilder.buildRolePaths();
// const roles = baseConfigBuilder.buildRoles();
//
// rolePaths.push(path.join(__dirname, "./ansible/roles"));
//
// const privateKey = new tls.PrivateKey("private-key", {
//   algorithm: "ED25519",
//   ecdsaCurve: "P256",
// });
//
// const baseConfigTrait = new BaseConfigTrait("base", {
//   ansible: false,
// });
//
// const k3sToken = new random.RandomPassword("k3s-token", {
//   length: 64,
//   special: false,
// }).result;
//
// const master1 = new ProxmoxVM("master-1", {
//   traits: [
//     baseConfigTrait,
//     new AnsibleTrait("base", {
//       privateKey,
//       rolePaths,
//       connection: {
//         user: baseConfigTrait.distro.username,
//       },
//       roles: [
//         ...roles,
//         {
//           role: "sapslaj.k3s_master",
//           vars: {
//             k3s_extra_server_args:
//               "--disable-helm-controller --disable traefik --write-kubeconfig-mode 644 --cluster-init",
//             k3s_version: k3sVersion,
//             k3s_token: pulumi.unsecret(k3sToken),
//           },
//         },
//       ],
//     }),
//   ],
//   memory: {
//     dedicated: 4096,
//   },
// });

// const master1 = pulumi.all({ k3sToken }).apply(({ k3sToken }) => {
//   return new ProxmoxVM("master-1", {
//     traits: [
//       baseConfigTrait,
//       new AnsibleTrait("master-ansible", {
//         hostLookup,
//         privateKey,
//         rolePaths,
//         connection: {
//           user: baseConfigTrait.distro.username,
//         },
//         roles: [
//           ...roles,
//           {
//             role: "sapslaj.k3s_master",
//             vars: {
//               k3s_extra_server_args:
//                 "--disable-helm-controller --disable traefik --write-kubeconfig-mode 644 --cluster-init",
//               k3s_version: k3sVersion,
//               k3s_token: k3sToken,
//             },
//           },
//         ],
//       }),
//     ],
//     memory: {
//       dedicated: 4096,
//     },
//   });
// });

// const master2 = pulumi.all({ k3sToken, master: hostLookup.resolve(master1.machine) }).apply(({ k3sToken, master }) => {
//   return new ProxmoxVM("master-2", {
//     traits: [
//       baseConfigTrait,
//       new AnsibleTrait("master-ansible", {
//         hostLookup,
//         privateKey,
//         rolePaths,
//         connection: {
//           user: baseConfigTrait.distro.username,
//         },
//         roles: [
//           ...roles,
//           {
//             role: "sapslaj.k3s_master",
//             vars: {
//               k3s_extra_server_args: "--disable-helm-controller --disable traefik --write-kubeconfig-mode 644",
//               k3s_version: k3sVersion,
//               k3s_token: k3sToken,
//             },
//           },
//         ],
//       }),
//     ],
//     memory: {
//       dedicated: 4096,
//     },
//   });
// });

// const master1 = new ProxmoxVM("master-1", {
//   traits: [
//     baseConfigTrait,
//     new AnsibleTrait("master-ansible", {
//       hostLookup,
//       privateKey,
//       rolePaths,
//       connection: {
//         user: baseConfigTrait.distro.username,
//       },
//       roles: [
//         ...roles,
//         {
//           role: "sapslaj.k3s_master",
//           vars: {
//             k3s_extra_server_args: "--disable-helm-controller --disable traefik --write-kubeconfig-mode 644",
//             k3s_version: k3sVersion,
//           },
//         },
//       ],
//     }),
//   ],
//   memory: {
//     dedicated: 4096,
//   },
// });

// function slurp(path: string): pulumi.Output<string> {
//   return new remote.Command(`slurp-${path}`, {
//     connection: {
//       host: hostLookup.resolve(master.machine),
//       user: baseConfigTrait.distro.username,
//       privateKey: privateKey.privateKeyOpenssh,
//     },
//     create: `sudo cat '${path}'`,
//   }).stdout.apply((stdout) => stdout.trim());
// }
//
// const nodeToken = slurp("/var/lib/rancher/k3s/server/node-token");
//
// pulumi.all({ nodeToken, masterHostname: hostLookup.resolve(master.machine) }).apply(({ nodeToken, masterHostname }) => {
//   for (let i = 1; i <= 2; i++) {
//     new ProxmoxVM(`node-${i}`, {
//       traits: [
//         baseConfigTrait,
//         new AnsibleTrait("node-ansible", {
//           hostLookup,
//           privateKey,
//           rolePaths,
//           connection: {
//             user: baseConfigTrait.distro.username,
//           },
//           roles: [
//             ...roles,
//             {
//               role: "sapslaj.k3s_node",
//               vars: {
//                 k3s_master_hostname: masterHostname,
//                 k3s_version: k3sVersion,
//                 k3s_token: nodeToken,
//               },
//             },
//           ],
//         }),
//       ],
//       memory: {
//         dedicated: 4096,
//       },
//     });
//   }
// });
