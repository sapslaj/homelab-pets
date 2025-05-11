import * as path from "path";

import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as tls from "@pulumi/tls";
import { AnsibleProvisioner } from "@sapslaj/pulumi-ansible-provisioner";

import { BaseConfigTrait } from "../../common/pulumi/components/proxmox-vm/BaseConfigTrait";
import { ProxmoxVM, ProxmoxVMProps } from "../../common/pulumi/components/proxmox-vm/ProxmoxVM";

export interface NodeGroupProps {
  name?: pulumi.Input<string>;
  k3sVersion: pulumi.Input<string>;
  nodeLabels?: Record<string, pulumi.Input<string>>;
  nodeTaints?: Record<string, pulumi.Input<string>>;
  k3sToken: pulumi.Input<string>;
  server: pulumi.Input<string>;
  nodeCount?: number;
  nodeConfig?: ProxmoxVMProps;
  serverArgs?: pulumi.Input<string>[];
  serverEnv?: Record<string, pulumi.Input<string>>;
}

export interface Node {
  vm: ProxmoxVM;
  randomId: random.RandomId;
  provisioner: AnsibleProvisioner;
}

export class NodeGroup extends pulumi.ComponentResource {
  name: pulumi.Output<string>;
  nodes: Node[];
  privateKey: tls.PrivateKey;

  constructor(id: string, props: NodeGroupProps, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:k3s:NodeGroup", id, {}, opts);

    this.name = pulumi.output(props.name ?? id);

    this.nodes = [];

    this.privateKey = new tls.PrivateKey(id, {
      algorithm: "ED25519",
      ecdsaCurve: "P256",
    }, { parent: this });

    const nodeCount = props.nodeCount ?? 1;

    for (let i = 1; i <= nodeCount; i++) {
      const serverArgs: pulumi.Input<string>[] = [
        ...(props.serverArgs ?? []),
      ];

      for (const [key, value] of Object.entries(props.nodeLabels ?? {})) {
        serverArgs.push("--node-label", pulumi.interpolate`${key}=${value}`);
      }
      for (const [key, value] of Object.entries(props.nodeTaints ?? {})) {
        serverArgs.push("--node-taint", pulumi.interpolate`${key}=${value}`);
      }

      const randomId = new random.RandomId(`${id}-${i}`, {
        byteLength: 8,
        keepers: {
          "serial": "1",
          nodeLabels: pulumi.output(props.nodeLabels).apply((nodeLabels) => JSON.stringify(nodeLabels ?? {})),
          nodeTaints: pulumi.output(props.nodeTaints).apply((nodeTaints) => JSON.stringify(nodeTaints ?? {})),
        },
      }, {
        parent: this,
      });

      const vm = new ProxmoxVM(`${id}-${i}`, {
        name: pulumi.all({ id: randomId.id, name: this.name }).apply(({ id, name }) => {
          const nodeId = id
            .replace(/['\"!@#$%^&\*\(\)\[\]\{\};:\,\./<>\?\|`~=_\-+ ]/g, "")
            .toLowerCase()
            .replace(/\-+$/, "")
            .replace(/^\-+/, "");
          return `${name}-${nodeId}`;
        }),
        traits: [
          ...(props.nodeConfig?.traits ?? []),
          new BaseConfigTrait("base", {
            ansible: {
              clean: false,
              base: {
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
              },
              privateKey: this.privateKey,
            },
            cloudImage: {
              diskConfig: {
                size: 64,
              },
            },
          }),
        ],
        ...props.nodeConfig,
      }, {
        parent: this,
        replaceOnChanges: ["*"],
        transforms: [
          (args) => {
            if (args.type === "sapslaj:pulumi-ansible-provisioner:AnsibleProvisioner") {
              return {
                props: args.props,
                opts: pulumi.mergeOptions(args.opts, {
                  replaceOnChanges: ["*"],
                }),
              };
            }
            return undefined;
          },
        ],
      });

      const nodeLabels = props.nodeLabels ?? {};
      if (nodeLabels["topology.kubernetes.io/zone"] === undefined) {
        nodeLabels["topology.kubernetes.io/zone"] = vm.nodeName;
      }

      for (const [key, value] of Object.entries(props.nodeLabels ?? {})) {
        serverArgs.push("--node-label", pulumi.interpolate`${key}=${value}`);
      }
      for (const [key, value] of Object.entries(props.nodeTaints ?? {})) {
        serverArgs.push("--node-taint", pulumi.interpolate`${key}=${value}`);
      }

      const provisioner = new AnsibleProvisioner(`${id}-${i}`, {
        connection: vm.connection,
        rolePaths: [
          path.join(__dirname, "./ansible/roles"),
        ],
        clean: false,
        tasks: [
          {
            apt: {
              name: "nfs-common",
            },
          },
        ],
        roles: [
          {
            role: "sapslaj.k3s_node",
            vars: {
              k3s_extra_server_args: pulumi.output(serverArgs).apply((args) => args.join(" ")),
              k3s_url: props.server,
              k3s_version: props.k3sVersion,
              k3s_token: props.k3sToken,
              k3s_env: props.serverEnv,
            },
          },
        ],
      }, {
        parent: this,
        replaceOnChanges: ["*"],
      });

      this.nodes.push({
        randomId,
        vm,
        provisioner,
      });
    }
  }
}
