import * as proxmoxve from "@muhlba91/pulumi-proxmoxve";
import { remote as remote_inputs } from "@pulumi/command/types/input";
import * as pulumi from "@pulumi/pulumi";
import * as tls from "@pulumi/tls";

import { AnsibleProvisioner, AnsibleProvisionerProps } from "../ansible/AnsibleProvisioner";
import { GuestAgentHostLookup, IHostLookup } from "./host-lookup";
import { ProxmoxVM, ProxmoxVMProps } from "./ProxmoxVM";
import { ProxmoxVMTrait } from "./ProxmoxVMTrait";

export interface AnsibleTraitConfig extends Omit<AnsibleProvisionerProps, "connection"> {
  hostLookup?: IHostLookup;
  privateKeyConfig?: Partial<tls.PrivateKeyArgs>;
  connection?: Partial<remote_inputs.ConnectionArgs>;
}

export class AnsibleTrait implements ProxmoxVMTrait {
  privateKey?: tls.PrivateKey;

  constructor(public name: string, public config: AnsibleTraitConfig) {}

  forProps(props: ProxmoxVMProps, name: string, parent: ProxmoxVM): ProxmoxVMProps {
    let newProps = { ...props };

    if (!this.config.connection?.privateKey && !this.config.connection?.password) {
      this.privateKey = new tls.PrivateKey(`${name}-${this.name}-private-key`, {
        algorithm: "ED25519",
        ecdsaCurve: "P256",
        ...this.config.privateKeyConfig,
      }, { parent });

      if (newProps.userData === undefined) {
        newProps.userData = {};
      }
      if (newProps.userData.ssh_authorized_keys === undefined) {
        newProps.userData.ssh_authorized_keys = [];
      }

      newProps.userData.ssh_authorized_keys.push(this.privateKey.publicKeyOpenssh.apply((s) => s.trim()));

      if (this.config.connection === undefined) {
        this.config.connection = {};
      }
      this.config.connection.privateKey = this.privateKey.privateKeyOpenssh;
    }

    if (!this.config.ansibleInstallCommand && !newProps.userData?.packages?.includes("ansible")) {
      if (newProps.userData === undefined) {
        newProps.userData = {};
      }
      if (newProps.userData.packages === undefined) {
        newProps.userData.packages = [];
      }
      newProps.userData.packages.push("ansible");
    }

    return newProps;
  }

  forResource(
    machine: proxmoxve.vm.VirtualMachine,
    args: proxmoxve.vm.VirtualMachineArgs,
    name: string,
    parent: ProxmoxVM,
  ): void {
    let host: pulumi.Input<string>;
    if (this.config.connection?.host) {
      host = this.config.connection.host;
    } else {
      const hostLookup = this.config.hostLookup ?? new GuestAgentHostLookup();
      host = pulumi.output(hostLookup.resolve(machine));
    }
    const connection: remote_inputs.ConnectionArgs = {
      ...this.config.connection,
      host,
    };

    new AnsibleProvisioner(`${name}-${this.name}`, {
      ...this.config,
      connection,
    }, { parent });
  }
}
