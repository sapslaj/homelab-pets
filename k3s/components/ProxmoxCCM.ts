import * as path from "path";

import * as proxmoxve from "@muhlba91/pulumi-proxmoxve";
import * as kubernetes from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as tls from "@pulumi/tls";

export interface ProxmoxCCMProps {
}

export class ProxmoxCCM extends pulumi.ComponentResource {
  role: proxmoxve.permission.Role;
  user: proxmoxve.permission.User;
  token: proxmoxve.user.Token;
  chart: kubernetes.helm.v3.Chart;

  constructor(name: string, props: ProxmoxCCMProps = {}, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:k3s:ProxmoxCCM", name, {}, opts);

    const pet = new random.RandomPet(name, {
      prefix: name,
    }, {
      parent: this,
    });

    this.role = new proxmoxve.permission.Role(name, {
      roleId: pet.id,
      privileges: [
        "VM.Audit",
      ],
    }, {
      parent: this,
    });

    this.user = new proxmoxve.permission.User(name, {
      userId: pulumi.interpolate`${pet.id}@pve`,
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
      tokenName: pet.id,
    }, {
      parent: this,
    });

    this.chart = new kubernetes.helm.v3.Chart(name, {
      chart: "oci://ghcr.io/sergelogvinov/charts/proxmox-cloud-controller-manager",
      namespace: "kube-system",
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
      },
    }, {
      parent: this,
    });
  }
}
