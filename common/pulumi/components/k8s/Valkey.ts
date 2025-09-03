import * as kubernetes from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

import { mergeTags } from "../aws-utils";

export interface VolumeClaimTemplate {
  name: pulumi.Input<string>;
  mountPath: pulumi.Input<string>;
  spec: kubernetes.types.input.core.v1.PersistentVolumeClaimSpec;
}

export interface ValkeyProps {
  name: pulumi.Input<string>;
  namespace: pulumi.Input<string>;
  labels?: pulumi.Input<Record<string, pulumi.Input<string>>>;
  selectorLabels?: pulumi.Input<Record<string, pulumi.Input<string>>>;
  clusterName?: pulumi.Input<string>;
  replicas?: pulumi.Input<number>;
  volumeClaimTemplates?: pulumi.Input<pulumi.Input<VolumeClaimTemplate>[]>;
}

export class Valkey extends pulumi.ComponentResource {
  name: pulumi.Output<string>;
  namespace: pulumi.Output<string>;
  replicas: pulumi.Output<number>;
  clusterName: pulumi.Output<string>;
  serviceAccount: kubernetes.core.v1.ServiceAccount;
  role: kubernetes.rbac.v1.Role;
  roleBinding: kubernetes.rbac.v1.RoleBinding;
  headlessService: kubernetes.core.v1.Service;
  readService: kubernetes.core.v1.Service;
  readOnlyService: kubernetes.core.v1.Service;
  readWriteService: kubernetes.core.v1.Service;
  metricsService: kubernetes.core.v1.Service;
  statefulSet: kubernetes.apps.v1.StatefulSet;

  constructor(name: string, props: ValkeyProps, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:nekopara:Valkey", name, {}, opts);

    this.name = pulumi.output(props.name);
    this.namespace = pulumi.output(props.namespace);

    const replicas = pulumi.output(props.replicas ?? 2);
    this.replicas = replicas;

    const clusterName = props.clusterName ?? props.name;
    this.clusterName = pulumi.output(clusterName);

    const selectorLabels = mergeTags({
      "valkey.sapslaj.cloud/cluster": clusterName,
    }, props.selectorLabels);

    const labels = mergeTags(selectorLabels, props.labels);

    this.serviceAccount = new kubernetes.core.v1.ServiceAccount(name, {
      metadata: {
        name: props.name,
        namespace: props.namespace,
        labels,
      },
    }, {
      parent: this,
    });

    this.role = new kubernetes.rbac.v1.Role(`${name}-valkey-leader`, {
      metadata: {
        name: pulumi.concat(props.name, "-valkey-leader"),
        namespace: props.namespace,
        labels,
      },
      rules: [
        {
          apiGroups: [
            "",
          ],
          resources: [
            "configmaps",
          ],
          verbs: [
            "get",
            "list",
            "watch",
            "create",
            "update",
            "patch",
            "delete",
          ],
        },
        {
          apiGroups: [
            "coordination.k8s.io",
          ],
          resources: [
            "leases",
          ],
          verbs: [
            "get",
            "list",
            "watch",
            "create",
            "update",
            "patch",
            "delete",
          ],
        },
        {
          apiGroups: [
            "",
          ],
          resources: [
            "events",
          ],
          verbs: [
            "create",
            "patch",
          ],
        },
        {
          apiGroups: [
            "",
          ],
          resources: [
            "pods",
          ],
          verbs: [
            "get",
            "list",
            "watch",
            "update",
            "patch",
          ],
        },
      ],
    }, {
      parent: this,
    });

    this.roleBinding = new kubernetes.rbac.v1.RoleBinding(`${name}-valkey-leader`, {
      metadata: {
        name: pulumi.concat(props.name, "-valkey-leader"),
        namespace: props.namespace,
        labels,
      },
      roleRef: {
        apiGroup: "rbac.authorization.k8s.io",
        kind: "Role",
        name: this.role.metadata.name,
      },
      subjects: [
        {
          kind: "ServiceAccount",
          name: this.serviceAccount.metadata.name,
          namespace: this.serviceAccount.metadata.namespace,
        },
      ],
    }, {
      parent: this,
    });

    this.headlessService = new kubernetes.core.v1.Service(`${name}-headless`, {
      metadata: {
        name: pulumi.concat(props.name, "-headless"),
        namespace: props.namespace,
        labels,
      },
      spec: {
        clusterIP: "None",
        selector: selectorLabels,
        ports: [
          {
            name: "redis",
            port: 6379,
          },
        ],
      },
    }, {
      parent: this,
    });

    this.readService = new kubernetes.core.v1.Service(`${name}-read`, {
      metadata: {
        name: pulumi.concat(props.name, "-r"),
        namespace: props.namespace,
        labels,
      },
      spec: {
        selector: selectorLabels,
        ports: [
          {
            name: "redis",
            port: 6379,
          },
        ],
      },
    }, {
      parent: this,
    });

    this.readOnlyService = new kubernetes.core.v1.Service(`${name}-readonly`, {
      metadata: {
        name: pulumi.concat(props.name, "-ro"),
        namespace: props.namespace,
        labels,
      },
      spec: {
        selector: mergeTags({
          "valkey.sapslaj.cloud/instance-role": "replica",
        }, selectorLabels),
        ports: [
          {
            name: "redis",
            port: 6379,
          },
        ],
      },
    }, {
      parent: this,
    });

    this.readWriteService = new kubernetes.core.v1.Service(`${name}-readwrite`, {
      metadata: {
        name: pulumi.concat(props.name, "-rw"),
        namespace: props.namespace,
        labels,
      },
      spec: {
        selector: mergeTags({
          "valkey.sapslaj.cloud/instance-role": "primary",
        }, selectorLabels),
        ports: [
          {
            name: "redis",
            port: 6379,
          },
        ],
      },
    }, {
      parent: this,
    });

    this.metricsService = new kubernetes.core.v1.Service(`${name}-metrics`, {
      metadata: {
        name: pulumi.concat(props.name, "-metrics"),
        namespace: props.namespace,
        labels,
      },
      spec: {
        selector: selectorLabels,
        ports: [
          {
            name: "redis",
            port: 6379,
          },
        ],
      },
    }, {
      parent: this,
    });

    new kubernetes.apiextensions.CustomResource(`${name}-service-monitor`, {
      apiVersion: "monitoring.coreos.com/v1",
      kind: "ServiceMonitor",
      metadata: {
        name: props.name,
        namespace: props.namespace,
        labels,
      },
      spec: {
        selector: {
          matchLabels: selectorLabels,
        },
        endpoints: [
          {
            port: "metrics",
            interval: "30s",
            scrapeTimeout: "10s",
            path: "/metrics",
          },
        ],
      },
    }, {
      parent: this,
    });

    let volumeClaimTemplates:
      | pulumi.Input<pulumi.Input<kubernetes.types.input.core.v1.PersistentVolumeClaim>[]>
      | undefined = undefined;
    let volumeMounts:
      | pulumi.Input<pulumi.Input<kubernetes.types.input.core.v1.VolumeMount>[]>
      | undefined = undefined;
    if (props.volumeClaimTemplates !== undefined) {
      volumeClaimTemplates = pulumi.output(props.volumeClaimTemplates).apply((vcts) => {
        return vcts.map((vct) => {
          return {
            metadata: {
              name: vct.name,
            },
            spec: vct.spec,
          };
        });
      });
      volumeMounts = pulumi.output(props.volumeClaimTemplates).apply((vcts) => {
        return vcts.map((vct) => {
          return {
            name: vct.name,
            mountPath: vct.mountPath,
          };
        });
      });
    }

    this.statefulSet = new kubernetes.apps.v1.StatefulSet(name, {
      metadata: {
        name: props.name,
        namespace: props.namespace,
        labels,
      },
      spec: {
        serviceName: this.headlessService.metadata.name,
        replicas,
        selector: {
          matchLabels: selectorLabels,
        },
        volumeClaimTemplates,
        template: {
          metadata: {
            labels: mergeTags({
              "valkey.sapslaj.cloud/cluster": clusterName,
            }, labels),
          },
          spec: {
            serviceAccountName: this.serviceAccount.metadata.name,
            containers: [
              {
                name: "valkey",
                image: "proxy.oci.sapslaj.xyz/docker-hub/valkey/valkey:8",
                volumeMounts,
                ports: [
                  {
                    name: "redis",
                    containerPort: 6379,
                    protocol: "TCP",
                  },
                ],
              },
              {
                name: "valkey-leader",
                image: "ghcr.io/sapslaj/valkey-leader:latest",
                volumeMounts,
                env: [
                  {
                    name: "CLUSTER_NAME",
                    value: clusterName,
                  },
                  {
                    name: "NAMESPACE",
                    valueFrom: {
                      fieldRef: {
                        fieldPath: "metadata.namespace",
                      },
                    },
                  },
                  {
                    name: "POD_IP",
                    valueFrom: {
                      fieldRef: {
                        fieldPath: "status.podIP",
                      },
                    },
                  },
                  {
                    name: "POD_NAME",
                    valueFrom: {
                      fieldRef: {
                        fieldPath: "metadata.name",
                      },
                    },
                  },
                  {
                    name: "SERVICE_NAME",
                    value: this.headlessService.metadata.name,
                  },
                ],
              },
              {
                name: "redis-exporter",
                image: "proxy.oci.sapslaj.xyz/docker-hub/oliver006/redis_exporter:v1.66.0",
                volumeMounts,
                ports: [
                  {
                    name: "metrics",
                    containerPort: 9121,
                    protocol: "TCP",
                  },
                ],
                env: [
                  {
                    name: "REDIS_ADDR",
                    value: "redis://localhost:6379",
                  },
                ],
              },
            ],
          },
        },
      },
    }, {
      parent: this,
      dependsOn: [
        this.role,
        this.roleBinding,
      ],
      deleteBeforeReplace: true,
      replaceOnChanges: [
        "spec.volumeClaimTemplates",
      ],
    });
  }
}
