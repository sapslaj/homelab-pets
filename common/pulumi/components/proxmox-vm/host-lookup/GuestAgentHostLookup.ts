import * as proxmoxve from "@muhlba91/pulumi-proxmoxve";
import * as pulumi from "@pulumi/pulumi";

import { IHostLookup } from "./IHostLookup";

export class GuestAgentHostLookup implements IHostLookup {
  resolveIpv4(machine: proxmoxve.vm.VirtualMachine): pulumi.Input<string> {
    return machine.ipv4Addresses.apply((a) => a.flat().find((ip) => ip !== "127.0.0.1")!);
  }
}
