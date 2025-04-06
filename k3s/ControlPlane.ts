import * as path from "path";

import { remote } from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as tls from "@pulumi/tls";

import { BaseConfigBuilder } from "../common/pulumi/components/ansible/BaseConfigBuilder";
import { AnsibleTrait } from "../common/pulumi/components/proxmox-vm/AnsibleTrait";
import { BaseConfigTrait } from "../common/pulumi/components/proxmox-vm/BaseConfigTrait";
import { ProxmoxVM, ProxmoxVMProps } from "../common/pulumi/components/proxmox-vm/ProxmoxVM";
import { DNSRecord } from "../common/pulumi/components/shimiko";

export interface ControlPlaneProps {
  k3sVersion: pulumi.Input<string>;
  dnsName?: pulumi.Input<string>;
  nodeCount?: number;
  nodeConfig?: ProxmoxVMProps;
  serverArgs?: pulumi.Input<string>[];
  serverEnv?: Record<string, pulumi.Input<string>>;
}

export class ControlPlane extends pulumi.ComponentResource {
  k3sVersion: pulumi.Output<string>;

  dnsName: pulumi.Output<string>;

  dnsFullname: pulumi.Output<string>;

  nodeCount: number;

  k3sToken: pulumi.Output<string>;

  nodes: ProxmoxVM[];

  kubeconfig: pulumi.Output<string>;

  dnsRecord: DNSRecord;

  server: pulumi.Output<string>;

  constructor(id: string, props: ControlPlaneProps, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:k3s:ControlPlane", id, {}, opts);

    this.k3sVersion = pulumi.output(props.k3sVersion);

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

    this.dnsName = pulumi.output(props.dnsName ?? id);

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
          pulumi.all({ dnsName: this.dnsName, server: this.server, node1: this.nodes[0].ipv4 }).apply(
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

      serverArgs.push("--tls-san", this.dnsFullname);

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
        ...props.nodeConfig,
      }, {
        parent: this,
        dependsOn: [...this.nodes],
      });

      this.nodes.push(node);
    }

    this.dnsRecord = new DNSRecord(id, {
      name: this.dnsName,
      type: "A",
      records: this.nodes.map((node) => node.ipv4),
    });

    const kubeconfigSlurp = new remote.Command(`${id}-kubeconfig`, {
      connection: {
        host: this.dnsRecord.fullname,
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
}
