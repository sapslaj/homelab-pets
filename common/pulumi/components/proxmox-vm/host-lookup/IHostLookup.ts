import * as proxmoxve from "@muhlba91/pulumi-proxmoxve";
import * as pulumi from "@pulumi/pulumi";

export interface IHostLookup {
  resolve(machine: proxmoxve.vm.VirtualMachine): pulumi.Input<string>;
}
