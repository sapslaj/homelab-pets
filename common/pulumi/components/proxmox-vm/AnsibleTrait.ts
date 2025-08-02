import * as proxmoxve from "@muhlba91/pulumi-proxmoxve";
import * as tls from "@pulumi/tls";

import { AnsibleProvisioner, AnsibleProvisionerProps } from "@sapslaj/pulumi-ansible-provisioner";
import { remote } from "@pulumi/command/types/input";

import { PrivateKeyTrait, PrivateKeyTraitConfig } from "./PrivateKeyTrait";
import { ProxmoxVM, ProxmoxVMProps } from "./ProxmoxVM";
import { ProxmoxVMTrait } from "./ProxmoxVMTrait";

export interface AnsibleTraitConfig extends Omit<AnsibleProvisionerProps, "connection">, PrivateKeyTraitConfig {}

export class AnsibleTrait implements ProxmoxVMTrait {
  static traitStore = {
    ansibleProvisioner: Symbol("ansibleProvisioner"),
  };

  static privateKeyFor(vm: ProxmoxVM): tls.PrivateKey | undefined {
    return PrivateKeyTrait.privateKeyFor(vm);
  }

  static ansibleProvisionerFor(vm: ProxmoxVM): AnsibleProvisioner {
    return vm._traitStore[AnsibleTrait.traitStore.ansibleProvisioner]! as AnsibleProvisioner;
  }

  constructor(public name: string, public config: AnsibleTraitConfig) {}

  forProps(props: ProxmoxVMProps, name: string, parent: ProxmoxVM): ProxmoxVMProps {
    let newProps = { ...props };

    if (!newProps.traits) {
      newProps.traits = [];
    }

    if (!newProps.traits.find((t) => t instanceof PrivateKeyTrait)) {
      newProps.traits = [
        new PrivateKeyTrait(`${name}-${this.name}-private-key`, {
          ...this.config,
        }),
        ...newProps.traits,
      ];
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
    const provisioner = new AnsibleProvisioner(`${name}-${this.name}`, {
      ...this.config,
      connection: parent.connection as remote.ConnectionArgs,
    }, { parent });
    parent._traitStore[AnsibleTrait.traitStore.ansibleProvisioner] = provisioner;
  }
}
