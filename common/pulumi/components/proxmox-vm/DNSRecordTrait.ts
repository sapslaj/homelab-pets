import * as proxmoxve from "@muhlba91/pulumi-proxmoxve";

import { DNSRecord, DNSRecordInputs } from "../shimiko";
import { ProxmoxVM } from "./ProxmoxVM";
import { ProxmoxVMTrait } from "./ProxmoxVMTrait";

export interface DNSRecordTraitConfig extends Pick<Partial<DNSRecordInputs>, "name" | "ttl"> {
}

export class DNSRecordTrait implements ProxmoxVMTrait {
  static traitStore = {
    dnsRecord: Symbol("dnsRecord"),
  };

  static dnsRecordFor(vm: ProxmoxVM): DNSRecord {
    return vm._traitStore[DNSRecordTrait.traitStore.dnsRecord]! as DNSRecord;
  }

  constructor(public name: string, public config: DNSRecordTraitConfig = {}) {}

  forResource(
    _machine: proxmoxve.vm.VirtualMachine,
    _args: proxmoxve.vm.VirtualMachineArgs,
    name: string,
    parent: ProxmoxVM,
  ): void {
    const dnsRecord = new DNSRecord(`${name}-${this.name}`, {
      name: parent.name,
      records: [parent.ipv4],
      type: "A",
      ...this.config,
    }, { parent });
    parent._traitStore[DNSRecordTrait.traitStore.dnsRecord] = dnsRecord;
  }
}
