import * as path from "path";

import { remote } from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as tls from "@pulumi/tls";

import { BaseConfigBuilder } from "../common/pulumi/components/ansible/BaseConfigBuilder";
import { AnsibleTrait } from "../common/pulumi/components/proxmox-vm/AnsibleTrait";
import { BaseConfigTrait } from "../common/pulumi/components/proxmox-vm/BaseConfigTrait";
import { ProxmoxVM, ProxmoxVMProps } from "../common/pulumi/components/proxmox-vm/ProxmoxVM";

export interface NodeGroupProps {
  k3sVersion: string;
  k3sToken: pulumi.Input<string>;
  server: pulumi.Input<string>;
  nodeCount?: number;
  nodeConfig?: ProxmoxVMProps;
  serverArgs?: pulumi.Input<string>[];
  serverEnv?: Record<string, pulumi.Input<string>>;
}

export class NodeGroup extends pulumi.ComponentResource {
  nodes: ProxmoxVM[];

  constructor(id: string, props: NodeGroupProps, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:k3s:NodeGroup", id, {}, opts);

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

    const nodeCount = props.nodeCount ?? 1;

    for (let i = 1; i <= nodeCount; i++) {
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
                role: "sapslaj.k3s_node",
                vars: {
                  k3s_extra_server_args: pulumi.output(props.serverArgs ?? []).apply((args) => args.join(" ")),
                  k3s_url: props.server,
                  k3s_version: props.k3sVersion,
                  k3s_token: props.k3sToken,
                  k3s_env: props.serverEnv,
                },
              },
            ],
          }),
        ],
        ...props.nodeConfig,
      }, { parent: this });

      this.nodes.push(node);
    }
  }
}
