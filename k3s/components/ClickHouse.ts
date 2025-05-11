import * as path from "path";

import * as proxmoxve from "@muhlba91/pulumi-proxmoxve";
import * as kubernetes from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as tls from "@pulumi/tls";

export interface ClickHouseProps {
  namespace?: pulumi.Input<string>;
  name?: pulumi.Input<string>;
  image?: pulumi.Input<string>;
  labels?: pulumi.Input<Record<string, pulumi.Input<string>>>;
  annotations?: pulumi.Input<Record<string, pulumi.Input<string>>>;
  env?: pulumi.Input<Record<string, pulumi.Input<string>>>;
  storageConfig?: Partial<kubernetes.types.input.core.v1.PersistentVolumeClaim>;
}

export class ClickHouse extends pulumi.ComponentResource {
  service: kubernetes.core.v1.Service;
  statefulSet: kubernetes.apps.v1.StatefulSet;

  constructor(name: string, props: ClickHouseProps = {}, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:k3s:ClickHouse", name, {}, opts);

    const randomId = new random.RandomId(name, {
      byteLength: 4,
    }, {
      parent: this,
    });

    const selectorLabels = {
      "k8s.sapslaj.com/app-selector": pulumi.interpolate`${name}-${randomId.id}`,
    };

    const image = props.image ?? "clickhouse/clickhouse-server:latest";

    this.service = new kubernetes.core.v1.Service(name, {
      metadata: {
        namespace: props.namespace,
        labels: props.labels,
        annotations: props.annotations,
        name: props.name,
      },
      spec: {
        ports: [
          {
            name: "http",
            port: 8123,
            protocol: "TCP",
            targetPort: 8123,
          },
          {
            name: "native",
            port: 9000,
            protocol: "TCP",
            targetPort: 9000,
          },
        ],
        selector: selectorLabels,
      },
    }, {
      parent: this,
    });

    this.statefulSet = new kubernetes.apps.v1.StatefulSet(name, {
      metadata: {
        namespace: props.namespace,
        labels: props.labels,
        annotations: props.annotations,
        name: props.name,
      },
      spec: {
        serviceName: this.service.metadata.name,
        selector: {
          matchLabels: selectorLabels,
        },
        template: {
          metadata: {
            labels: pulumi.all([props.labels, selectorLabels]).apply(([labels, selectorLabels]) => ({
              ...labels,
              ...selectorLabels,
            })),
            annotations: props.annotations,
          },
          spec: {
            containers: [
              {
                name: "clickhouse",
                image,
                ports: [
                  {
                    name: "http",
                    protocol: "TCP",
                    containerPort: 8123,
                  },
                  {
                    name: "native",
                    protocol: "TCP",
                    containerPort: 9000,
                  },
                ],
                volumeMounts: [
                  {
                    name: pulumi.interpolate`${name}-data`,
                    mountPath: "/var/lib/clickhouse",
                  },
                ],
                env: pulumi.output(props.env ?? {}).apply((env) =>
                  Object.entries(env).map(([name, value]) => ({
                    name,
                    value,
                  }))
                ),
              },
            ],
          },
        },
        volumeClaimTemplates: [
          {
            ...props.storageConfig,
            metadata: {
              name: pulumi.interpolate`${name}-data`,
              ...props.storageConfig?.metadata,
            },
            spec: {
              accessModes: [
                "ReadWriteOnce",
              ],
              resources: {
                requests: {
                  storage: "10Gi",
                },
              },
              ...props.storageConfig?.spec,
            },
          },
        ],
      },
    }, {
      parent: this,
    });
  }
}
