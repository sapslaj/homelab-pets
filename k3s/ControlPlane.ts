import * as path from "path";

import { remote } from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as tls from "@pulumi/tls";

import { BaseConfigBuilder } from "../common/pulumi/components/ansible/BaseConfigBuilder";
import { AnsibleTrait } from "../common/pulumi/components/proxmox-vm/AnsibleTrait";
import { BaseConfigTrait } from "../common/pulumi/components/proxmox-vm/BaseConfigTrait";
import { ProxmoxVM, ProxmoxVMProps } from "../common/pulumi/components/proxmox-vm/ProxmoxVM";

export interface ControlPlaneProps {
  k3sVersion: string;
  nodeCount?: number;
  nodeConfig?: ProxmoxVMProps;
  serverArgs?: pulumi.Input<string>[];
  serverEnv?: Record<string, pulumi.Input<string>>;
}

export class ControlPlane extends pulumi.ComponentResource {
  k3sToken: pulumi.Output<string>;

  nodes: ProxmoxVM[];

  kubeconfig: pulumi.Output<string>;

  constructor(id: string, props: ControlPlaneProps, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:k3s:ControlPlane", id, {}, opts);

    const k3sToken = new random.RandomPassword(`${id}-k3s-token`, {
      length: 64,
      special: false,
    }, {
      parent: this,
    }).result;

    this.k3sToken = k3sToken;

    this.nodes = [];

    const baseConfigBuilder = new BaseConfigBuilder({
      ansibleTarget: true,
      dockerStandalone: false,
      nasClient: false,
      nodeExporter: false,
      processExporter: false,
      promtail: false,
      qemuGuest: false,
      rsyncBackup: false,
      selfheal: false,
      unfuckUbuntu: true,
      users: true,
    });

    const rolePaths = baseConfigBuilder.buildRolePaths();
    const roles = baseConfigBuilder.buildRoles();

    rolePaths.push(path.join(__dirname, "./ansible/roles"));

    const privateKey = new tls.PrivateKey(`${id}-private-key`, {
      algorithm: "ED25519",
      ecdsaCurve: "P256",
    }, { parent: this });

    const baseConfigTrait = new BaseConfigTrait("base", {
      ansible: false,
    });

    const nodeCount = props.nodeCount ?? 3;

    for (let i = 1; i <= nodeCount; i++) {
      const serverArgs: pulumi.Input<string>[] = [
        ...(props.serverArgs ?? []),
      ];
      if (i == 1) {
        serverArgs.push("--cluster-init");
      } else {
        serverArgs.push("--server");
        serverArgs.push(this.server);
      }

      const node = new ProxmoxVM(`${id}-${i}`, {
        traits: [
          ...(props.nodeConfig?.traits ?? []),
          baseConfigTrait,
          new AnsibleTrait("base", {
            privateKey,
            rolePaths,
            roles: [
              ...roles,
              {
                role: "sapslaj.k3s_master",
                vars: {
                  k3s_extra_server_args: pulumi.output(serverArgs).apply((args) => args.join(" ")),
                  k3s_version: props.k3sVersion,
                  k3s_env: {
                    K3S_TOKEN: k3sToken,
                    ...props.serverEnv,
                  },
                },
              },
            ],
          }),
        ],
        connectionArgs: {
          user: baseConfigTrait.distro.username,
        },
        ...props.nodeConfig,
      }, { parent: this });

      this.nodes.push(node);
    }

    const kubeconfigSlurp = new remote.Command(`${id}-kubeconfig`, {
      connection: {
        host: this.nodes[0].ipv4,
        user: baseConfigTrait.distro.username,
        privateKey: privateKey.privateKeyOpenssh,
      },
      create: "sudo cat /etc/rancher/k3s/k3s.yaml",
    }, {
      parent: this,
      dependsOn: this.nodes,
    });

    this.kubeconfig = pulumi.all({ kubeconfig: kubeconfigSlurp.stdout, server: this.server }).apply((
      { kubeconfig, server },
    ) => kubeconfig.replace("https://127.0.0.1:6443", server));
  }

  get server(): pulumi.Output<string> {
    return pulumi.interpolate`https://${this.nodes[0].ipv4}:6443`;
  }
}
