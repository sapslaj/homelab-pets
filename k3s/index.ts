import * as path from "path";

import { remote } from "@pulumi/command";
import * as kubernetes from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as tls from "@pulumi/tls";

import { DNSRecord } from "../common/pulumi/components/shimiko";
import { ClickHouse } from "./components/ClickHouse";
import { ControlPlane } from "./components/ControlPlane";
import { NodeGroup } from "./components/NodeGroup";
import { ProxmoxCCM } from "./components/ProxmoxCCM";
import { ProxmoxCSIPlugin } from "./components/ProxmoxCSIPlugin";

const k3sVersion = "v1.31.5+k3s1";

const controlPlane = new ControlPlane("k3s-control-plane", {
  name: `k3s-${pulumi.getStack()}`,
  k3sVersion,
  nodeLabels: {
    "k3s.sapslaj.xyz/role": "control-plane",
    "topology.kubernetes.io/region": "homelab",
  },
  nodeTaints: {
    "k3s.sapslaj.xyz/role": "control-plane:NoSchedule",
  },
  serverArgs: [
    "--disable-helm-controller",
    "--disable traefik",
    "--disable coredns",
    "--disable local-storage",
    "--disable metrics-server",
    "--write-kubeconfig-mode 644",
    "--kubelet-arg '--cloud-provider=external'",
  ],
  nodeConfig: {
    cpu: {
      cores: 4,
    },
    memory: {
      dedicated: 2048,
    },
  },
});

export const server = controlPlane.server;

const nodeGroup = new NodeGroup("k3s-node-group", {
  name: `k3s-node-${pulumi.getStack()}`,
  k3sVersion,
  k3sToken: controlPlane.k3sToken,
  server: controlPlane.server,
  nodeLabels: {
    "topology.kubernetes.io/region": "homelab",
  },
  serverArgs: [
    "--kubelet-arg '--cloud-provider=external'",
  ],
  nodeCount: 4,
  nodeConfig: {
    cpu: {
      cores: 8,
    },
    memory: {
      dedicated: 8192 * 2,
    },
  },
}, {
  dependsOn: [
    controlPlane,
  ],
});

const provider = new kubernetes.Provider("k3s", {
  kubeconfig: controlPlane.kubeconfig,
  deleteUnreachable: true,
});

const prometheusOperatorCrds = new kubernetes.helm.v3.Chart("prometheus-operator-crds", {
  chart: "prometheus-operator-crds",
  fetchOpts: {
    repo: "https://prometheus-community.github.io/helm-charts",
  },
}, {
  provider,
  deletedWith: controlPlane,
  dependsOn: [
    controlPlane,
    nodeGroup,
  ],
});

const coredns = new kubernetes.helm.v3.Chart("coredns", {
  chart: "coredns",
  namespace: "kube-system",
  version: "1.39.0",
  fetchOpts: {
    repo: "https://coredns.github.io/helm",
  },
  values: {
    replicaCount: controlPlane.nodeCount,
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
    service: {
      clusterIP: "10.43.0.10",
      name: "kube-dns",
    },
    tolerations: [
      {
        key: "k3s.sapslaj.xyz/role",
        operator: "Equal",
        value: "control-plane",
        effect: "NoSchedule",
      },
    ],
    k8sAppLabelOverride: "kube-dns",
  },
}, {
  provider,
  deletedWith: controlPlane,
  dependsOn: [
    controlPlane,
    nodeGroup,
    prometheusOperatorCrds,
  ],
});

const metricsServer = new kubernetes.helm.v3.Chart("metrics-server", {
  chart: "metrics-server",
  namespace: "kube-system",
  version: "3.12.2",
  fetchOpts: {
    repo: "https://kubernetes-sigs.github.io/metrics-server/",
  },
  values: {
    serviceMonitor: {
      enabled: true,
    },
  },
}, {
  provider,
  deletedWith: controlPlane,
  dependsOn: [
    controlPlane,
    nodeGroup,
    prometheusOperatorCrds,
  ],
});

// const seaweedfsCSIDriverNamespace = new kubernetes.core.v1.Namespace("seaweedfs-csi-driver", {
//   metadata: {
//     name: "seaweedfs-csi-driver",
//   },
// }, { provider });

// const seaweedfsCSIDriver = new kubernetes.helm.v3.Chart("seaweedfs-csi-driver", {
//   chart: "seaweedfs-csi-driver",
//   fetchOpts: {
//     repo: "https://seaweedfs.github.io/seaweedfs-csi-driver/helm",
//   },
//   namespace: seaweedfsCSIDriverNamespace.metadata.name,
//   values: {
//     seaweedfsFiler: "172.24.4.10:8888",
//     isDefaultStorageClass: true,
//   },
// }, {
//   provider,
//   dependsOn: [
//     // prometheusOperatorCrds,
//   ],
// });

// const nfsCSIDriverNamespace = new kubernetes.core.v1.Namespace("nfs-csi-driver", {
//   metadata: {
//     name: "nfs-csi-driver",
//   },
// }, { provider });
// const nfsCSIDriver = new kubernetes.helm.v3.Chart("nfs-csi-driver", {
//   chart: "csi-driver-nfs",
//   version: "4.11.0",
//   fetchOpts: {
//     repo: "https://raw.githubusercontent.com/kubernetes-csi/csi-driver-nfs/master/charts",
//   },
//   namespace: nfsCSIDriverNamespace.metadata.name,
//   values: {
//     storageClass: {
//       create: true,
//       name: "nfs",
//       parameters: {
//         server: "172.24.4.10",
//         share: "/mnt/exos/",
//         subDir: `volumes/k3s-${pulumi.getStack()}`,
//       },
//     },
//   },
// }, {
//   provider,
//   dependsOn: [
//     // prometheusOperatorCrds,
//   ],
// });

// const nfsProvisionerNamespace = new kubernetes.core.v1.Namespace("nfs-provisioner", {
//   metadata: {
//     name: "nfs-provisioner",
//   },
// }, { provider });

// const nfsProvisioner = new kubernetes.helm.v3.Chart("nfs-subdir-external-provisioner", {
//   chart: "nfs-subdir-external-provisioner",
//   version: "4.0.18",
//   fetchOpts: {
//     repo: "https://kubernetes-sigs.github.io/nfs-subdir-external-provisioner",
//   },
//   namespace: nfsProvisionerNamespace.metadata.name,
//   values: {
//     nfs: {
//       server: "172.24.4.10",
//       path: `/mnt/exos/volumes/k3s-${pulumi.getStack()}`,
//     },
//     storageClass: {
//       create: true,
//       name: "nfs",
//       accessModes: "ReadWriteMany",
//     },
//   },
// }, {
//   provider,
//   dependsOn: [
//     // prometheusOperatorCrds,
//   ],
// });

// const proxmoxCCM = new ProxmoxCCM("proxmox-ccm", {}, {
//   providers: [provider],
// });

// const proxmoxCSIPlugin = new ProxmoxCSIPlugin("proxmox-csi-plugin", {}, {
//   providers: [provider],
//   dependsOn: [
//     controlPlane,
//     nodeGroup,
//   ],
// });

// const monitoringNamespace = new kubernetes.core.v1.Namespace("monitoring", {
//   metadata: {
//     name: "monitoring",
//   },
// }, { provider });

// const victoriaMetricsOperatorCRDs = new kubernetes.helm.v3.Chart("victoria-metrics-operator-crds", {
//   chart: "victoria-metrics-operator-crds",
//   fetchOpts: {
//     repo: "https://victoriametrics.github.io/helm-charts/",
//   },
//   namespace: monitoringNamespace.metadata.name,
//   values: {},
// }, {
//   provider,
//   dependsOn: [],
// });

// const victoriaMetrics = new kubernetes.helm.v3.Release("victoria-metrics", {
//   chart: "victoria-metrics-k8s-stack",
//   repositoryOpts: {
//     repo: "https://victoriametrics.github.io/helm-charts/",
//   },
//   namespace: monitoringNamespace.metadata.name,
//   skipCrds: true,
//   values: {
//     nameOverride: "victoria-metrics",
//     fullnameOverride: "victoria-metrics",
//   },
// }, {
//   provider,
//   dependsOn: [
//     prometheusOperatorCrds,
//     victoriaMetricsOperatorCRDs,
//   ],
// });

// const traefikCrds = new kubernetes.helm.v3.Chart("traefik-crds", {
//   chart: "traefik-crds",
//   fetchOpts: {
//     repo: "https://traefik.github.io/charts",
//   },
// }, {
//   provider,
//   deletedWith: controlPlane,
//   dependsOn: [
//     controlPlane,
//     nodeGroup,
//   ],
// });

// const traefikNamespace = new kubernetes.core.v1.Namespace("traefik", {
//   metadata: {
//     name: "traefik",
//   },
// }, {
//   provider,
//   deletedWith: controlPlane,
//   dependsOn: [
//     controlPlane,
//     nodeGroup,
//   ],
// });

// const traefik = new kubernetes.helm.v3.Release("traefik", {
//   name: "traefik",
//   chart: "traefik",
//   version: "34.5.0",
//   repositoryOpts: {
//     repo: "https://traefik.github.io/charts",
//   },
//   namespace: traefikNamespace.metadata.name,
//   skipCrds: true,
//   values: {
//     deployment: {
//       replicas: 3,
//     },
//     ingressClass: {
//       enabled: true,
//       isDefaultClass: true,
//     },
//     ingressRoute: {
//       dashboard: {
//         enabled: false,
//       },
//     },
//     providers: {
//       kubernetesCRD: {
//         enabled: true,
//         allowCrossNamespace: true,
//         allowExternalNameServices: true,
//         allowEmptyServices: true,
//       },
//       kubernetesIngress: {
//         enabled: true,
//         allowExternalNameServices: true,
//         allowEmptyServices: true,
//       },
//       kubernetesGateway: {
//         enabled: false,
//       },
//     },
//     logs: {
//       general: {
//         format: "json",
//         level: "INFO",
//       },
//       access: {
//         enabled: true,
//         format: "json",
//       },
//     },
//     metrics: {
//       addInternals: true,
//       prometheus: {
//         service: {
//           enabled: true,
//         },
//         serviceMonitor: {
//           enabled: true,
//         },
//         prometheusRule: {
//           enabled: false,
//         },
//       },
//     },
//     globalArguments: [],
//     ports: {
//       web: {
//         redirections: {
//           entryPoint: {
//             to: "websecure",
//             scheme: "https",
//           },
//         },
//       },
//       websecure: {},
//     },
//     service: {
//       enabled: true,
//       annotations: {
//         "svccontroller.k3s.cattle.io/tolerations": JSON.stringify([
//           {
//             key: "k3s.sapslaj.xyz/role",
//             operator: "Equal",
//             value: "control-plane",
//             effect: "NoSchedule",
//           },
//         ]),
//       },
//     },
//   },
// }, {
//   provider,
//   deletedWith: controlPlane,
//   dependsOn: [
//     controlPlane,
//     nodeGroup,
//     prometheusOperatorCrds,
//     traefikCrds,
//   ],
// });

// const traefikDashboardDNS = new DNSRecord("traefik-dashboard", {
//   name: `traefik-dashboard.k3s-${pulumi.getStack()}`,
//   type: "CNAME",
//   records: [`k3s-${pulumi.getStack()}.sapslaj.xyz.`],
// });

// new kubernetes.apiextensions.CustomResource("traefik-dashboard", {
//   apiVersion: "traefik.io/v1alpha1",
//   kind: "IngressRoute",
//   metadata: {
//     name: "traefik-dashboard",
//     namespace: traefikNamespace.metadata.name,
//   },
//   spec: {
//     routes: [
//       {
//         kind: "Rule",
//         match: pulumi.interpolate`Host(\`${traefikDashboardDNS.fullname}\`)`,
//         services: [
//           {
//             kind: "TraefikService",
//             name: "api@internal",
//           },
//         ],
//       },
//     ],
//   },
// }, {
//   provider,
//   dependsOn: [
//     traefikCrds,
//     traefik,
//   ],
// });

// const signozNamespace = new kubernetes.core.v1.Namespace("signoz", {
//   metadata: {
//     name: "signoz",
//   },
// }, {
//   provider,
//   deletedWith: controlPlane,
//   dependsOn: [
//     controlPlane,
//   ],
// });

// const signozClickHouse = new ClickHouse("signoz-clickhouse", {
//   namespace: signozNamespace.metadata.name,
//   image: "clickhouse/clickhouse-server:25.3",
//   env: {
//     CLICKHOUSE_DB: "signoz",
//     CLICKHOUSE_USER: "signoz",
//     CLICKHOUSE_PASSWORD: "hunter2",
//   },
//   storageConfig: {
//     spec: {
//       storageClassName: "nfs",
//     },
//   },
// }, {
//   deletedWith: controlPlane,
//   dependsOn: [
//     controlPlane,
//     nfsProvisioner,
//   ],
// });

// const signoz = new kubernetes.helm.v3.Release("signoz", {
//   name: "signoz",
//   chart: "signoz",
//   version: "0.75.0",
//   repositoryOpts: {
//     repo: "https://charts.signoz.io",
//   },
//   namespace: signozNamespace.metadata.name,
//   skipCrds: false,
//   values: {
//     global: {
//       storageClass: "nfs",
//     },
//     clickhouse: {
//       enabled: false,
//     },
//     externalClickhouse: {
//       host: signozClickHouse.service.metadata.name,
//       database: "signoz",
//       user: "signoz",
//       password: "hunter2",
//     },
//   },
// }, {
//   provider,
//   deletedWith: controlPlane,
//   dependsOn: [
//     controlPlane,
//     prometheusOperatorCrds,
//     nfsProvisioner,
//   ],
// });
