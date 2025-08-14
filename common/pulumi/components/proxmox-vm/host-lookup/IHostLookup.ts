import * as proxmoxve from "@muhlba91/pulumi-proxmoxve";
import * as pulumi from "@pulumi/pulumi";

export interface IHostLookup {
  resolveIpv4: (machine: proxmoxve.vm.VirtualMachine) => pulumi.Input<string>;
  resolveIpv6?: (machine: proxmoxve.vm.VirtualMachine) => pulumi.Input<string | undefined>;
}
