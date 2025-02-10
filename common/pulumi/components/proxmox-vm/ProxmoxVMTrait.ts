import * as proxmoxve from "@muhlba91/pulumi-proxmoxve";

import { ProxmoxVM, ProxmoxVMProps } from "./ProxmoxVM";

export interface ProxmoxVMTrait {
  /**
   * mutates props before the rest of the constructor runs
   */
  forProps?(props: ProxmoxVMProps, name: string, parent: ProxmoxVM): ProxmoxVMProps;

  /**
   * mutates the config object right before passing it to the underlying
   * provider's constructor
   */
  forArgs?(args: proxmoxve.vm.VirtualMachineArgs, name: string, parent: ProxmoxVM): proxmoxve.vm.VirtualMachineArgs;

  /**
   * executes at the end of the constructor after `machine` has been
   * initialized
   */
  forResource?(
    machine: proxmoxve.vm.VirtualMachine,
    args: proxmoxve.vm.VirtualMachineArgs,
    name: string,
    parent: ProxmoxVM,
  ): void;
}
