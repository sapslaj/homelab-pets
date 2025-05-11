import * as path from "path";

import { remote } from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as tls from "@pulumi/tls";
import { AnsibleProvisioner } from "@sapslaj/pulumi-ansible-provisioner";

import { BaseConfigTrait } from "../../common/pulumi/components/proxmox-vm/BaseConfigTrait";
import { ProxmoxVM, ProxmoxVMProps } from "../../common/pulumi/components/proxmox-vm/ProxmoxVM";
import { DNSRecord } from "../../common/pulumi/components/shimiko";

export interface ControlPlaneProps {
  name?: pulumi.Input<string>;
  k3sVersion: pulumi.Input<string>;
  nodeLabels?: Record<string, pulumi.Input<string>>;
  nodeTaints?: Record<string, pulumi.Input<string>>;
  dnsName?: pulumi.Input<string>;
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

export class ControlPlane extends pulumi.ComponentResource {
  k3sVersion: pulumi.Output<string>;
  name: pulumi.Output<string>;
  dnsName: pulumi.Output<string>;
  dnsFullname: pulumi.Output<string>;
  nodeCount: number;
  k3sToken: pulumi.Output<string>;
  nodes: Node[];
  kubeconfig: pulumi.Output<string>;
  dnsRecord: DNSRecord;
  server: pulumi.Output<string>;
  privateKey: tls.PrivateKey;

  constructor(id: string, props: ControlPlaneProps, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:k3s:ControlPlane", id, {}, opts);

    this.name = pulumi.output(props.name ?? id);

    this.k3sVersion = pulumi.output(props.k3sVersion);

    this.k3sToken = new random.RandomPassword(`${id}-k3s-token`, {
      length: 64,
      special: false,
    }, {
      parent: this,
    }).result;

    this.nodes = [];

    this.privateKey = new tls.PrivateKey(id, {
      algorithm: "ED25519",
      ecdsaCurve: "P256",
    }, { parent: this });

    this.dnsName = pulumi.output(props.dnsName ?? this.name);

    this.dnsFullname = this.dnsName.apply((dnsName) => {
      if (dnsName.endsWith(".sapslaj.xyz")) {
        return dnsName;
      } else {
        return `${dnsName}.sapslaj.xyz`;
      }
    });

    this.server = this.dnsFullname.apply((dnsFullname) => {
      return pulumi.interpolate`https://${dnsFullname}:6443`;
    });

    this.nodeCount = props.nodeCount ?? 3;

    for (let i = 1; i <= this.nodeCount; i++) {
      const serverArgs: pulumi.Input<string>[] = [
        ...(props.serverArgs ?? []),
      ];
      if (i == 1) {
        serverArgs.push(
          pulumi.all({ dnsName: this.dnsName, server: this.server }).apply(async ({ dnsName, server }) => {
            const req = await fetch(`https://shimiko.sapslaj.xyz/v1/dns-records/A/${dnsName}`);
            if (req.status === 404) {
              return "--cluster-init";
            }

            if (req.status !== 200) {
              throw new Error(`shimiko is wack (${req.status}): ${await req.text()}`);
            }

            return `--server ${server}`;
          }),
        );
      } else {
        serverArgs.push(
          pulumi.all({ dnsName: this.dnsName, server: this.server, node1: this.nodes[0].vm.ipv4 }).apply(
            async ({ dnsName, server, node1 }) => {
              const req = await fetch(`https://shimiko.sapslaj.xyz/v1/dns-records/A/${dnsName}`);
              if (req.status === 404) {
                return `--server https://${node1}:6443`;
              }

              if (req.status !== 200) {
                throw new Error(`shimiko is wack (${req.status}): ${await req.text()}`);
              }

              return `--server ${server}`;
            },
          ),
        );
      }

      const randomId = new random.RandomId(`${id}-${i}`, {
        byteLength: 8,
        keepers: {
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
                size: 32,
              },
            },
          }),
        ],
        ...props.nodeConfig,
      }, {
        parent: this,
        dependsOn: [
          ...this.nodes.map((node) => node.provisioner),
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

      serverArgs.push("--tls-san", this.dnsFullname);
      const provisioner = new AnsibleProvisioner(`${id}-${i}`, {
        connection: vm.connection,
        rolePaths: [
          path.join(__dirname, "./ansible/roles"),
        ],
        clean: false,
        roles: [
          {
            role: "sapslaj.k3s_master",
            vars: {
              k3s_extra_server_args: pulumi.output(serverArgs).apply((args) => args.join(" ")),
              k3s_version: props.k3sVersion,
              k3s_env: {
                K3S_TOKEN: this.k3sToken,
                ...props.serverEnv,
              },
            },
          },
        ],
      }, {
        parent: this,
        dependsOn: [
          vm,
        ],
      });

      this.nodes.push({
        randomId,
        vm,
        provisioner,
      });
    }

    this.dnsRecord = new DNSRecord(id, {
      name: this.dnsName,
      type: "A",
      records: this.nodes.map((node) => node.vm.ipv4),
    }, {
      parent: this,
    });

    const kubeconfigSlurp = new remote.Command(`${id}-kubeconfig`, {
      connection: this.nodes[0].vm.connection,
      create: "sudo cat /etc/rancher/k3s/k3s.yaml",
    }, {
      parent: this,
      dependsOn: this.nodes.map((node) => node.vm),
    });

    this.kubeconfig = pulumi.all({ kubeconfig: kubeconfigSlurp.stdout, server: this.server }).apply((
      { kubeconfig, server },
    ) => kubeconfig.replace("https://127.0.0.1:6443", server));
  }
}
