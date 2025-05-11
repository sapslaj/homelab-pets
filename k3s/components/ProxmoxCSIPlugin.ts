import * as path from "path";

import * as proxmoxve from "@muhlba91/pulumi-proxmoxve";
import * as kubernetes from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as tls from "@pulumi/tls";

export interface ProxmoxCSIPluginProps {
}

export class ProxmoxCSIPlugin extends pulumi.ComponentResource {
  role: proxmoxve.permission.Role;
  user: proxmoxve.permission.User;
  token: proxmoxve.user.Token;
  namespace: kubernetes.core.v1.Namespace;
  chart: kubernetes.helm.v3.Chart;

  constructor(name: string, props: ProxmoxCSIPluginProps = {}, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:k3s:ProxmoxCSIPlugin", name, {}, opts);

    const randomId = new random.RandomId(name, {
      byteLength: 4,
      prefix: name,
    }, {
      parent: this,
    });

    const id = randomId.id.apply((id) =>
      name + "-" + (
        id
          .replace(/['\"!@#$%^&\*\(\)\[\]\{\};:\,\./<>\?\|`~=_\-+ ]/g, "")
          .toLowerCase()
          .replace(/\-+$/, "")
          .replace(/^\-+/, "")
      )
    );

    this.role = new proxmoxve.permission.Role(name, {
      roleId: id,
      privileges: [
        "VM.Audit",
        "VM.Config.Disk",
        "Datastore.Allocate",
        "Datastore.AllocateSpace",
        "Datastore.Audit",
      ],
    }, {
      parent: this,
    });

    this.user = new proxmoxve.permission.User(name, {
      // userId: pet.id.apply((id) => id.replace(/\-/g, "")),
      userId: pulumi.interpolate`${id}@pve`,
      acls: [
        {
          path: "/",
          roleId: this.role.roleId,
          propagate: true,
        },
      ],
    }, {
      parent: this,
    });

    this.token = new proxmoxve.user.Token(name, {
      userId: this.user.userId,
      tokenName: id,
    }, {
      parent: this,
    });

    this.namespace = new kubernetes.core.v1.Namespace(name, {
      metadata: {
        name,
      },
    }, {
      parent: this,
    });

    this.chart = new kubernetes.helm.v3.Chart(name, {
      chart: "oci://ghcr.io/sergelogvinov/charts/proxmox-csi-plugin",
      namespace: this.namespace.metadata.name,
      // fetchOpts: {
      //   repo: "oci://ghcr.io/sergelogvinov/charts",
      // },
      values: {
        config: {
          clusters: [
            {
              url: "https://mitsuru.sapslaj.xyz:8006/api2/json",
              insecure: true,
              token_id: [this.user.userId, this.token.tokenName].join("!"),
              token_secret: this.token.value,
              region: "homelab",
            },
          ],
        },
        storageClass: [
          {
            name: "proxmox",
            storage: "local-lvm",
            reclaimPolicy: "Delete",
            fstype: "ext4",
            annotations: {
              "storageclass.kubernetes.io/is-default-class": "true",
            },
          },
        ],
      },
    }, {
      parent: this,
      dependsOn: [
        this.namespace,
      ],
    });
  }
}
