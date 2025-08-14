import * as proxmoxve from "@muhlba91/pulumi-proxmoxve";
import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

import { DNSRecord, DNSRecordInputs } from "../shimiko";
import { ProxmoxVM } from "./ProxmoxVM";
import { ProxmoxVMTrait } from "./ProxmoxVMTrait";

export interface DNSRecordTraitConfig extends Pick<Partial<DNSRecordInputs>, "name" | "ttl"> {
  enableIPv6?: boolean;
  lookupIPv6ViaSSH?: boolean;
}

export class DNSRecordTrait implements ProxmoxVMTrait {
  static traitStore = {
    dnsARecord: Symbol("dnsARecord"),
    dnsAAAARecord: Symbol("dnsAAAARecord"),
  };

  static dnsRecordFor(vm: ProxmoxVM): DNSRecord {
    return vm._traitStore[DNSRecordTrait.traitStore.dnsARecord]! as DNSRecord;
  }

  constructor(public name: string, public config: DNSRecordTraitConfig = {}) {}

  forResource(
    _machine: proxmoxve.vm.VirtualMachine,
    _args: proxmoxve.vm.VirtualMachineArgs,
    name: string,
    parent: ProxmoxVM,
  ): void {
    const dnsARecord = new DNSRecord(`${name}-${this.name}`, {
      name: parent.name,
      records: [parent.ipv4],
      type: "A",
      ...this.config,
    }, { parent });
    parent._traitStore[DNSRecordTrait.traitStore.dnsARecord] = dnsARecord;

    if (this.config.enableIPv6 !== false) {
      let records: pulumi.Input<pulumi.Input<string>[]>;
      if (this.config.lookupIPv6ViaSSH !== false) {
        records = pulumi.unsecret(
          mid.agent.execOutput({
            connection: parent.connection,
            command: [
              "/bin/sh",
              "-c",
              `
              set -eu
              iface="$(ip -br addr show to "$IPV4" | cut -f1 -d ' ')"
              if [ -z "$iface" ]; then
                exit 0
              fi
              for i in "$(grep "$iface" /proc/net/if_inet6)"; do
                echo "$i" | awk '{
                  split($1, _, "[0-9a-f]{,4}", seps)
                  joined = sep = ""
                  for (i=1; i in seps; i++) {
                    joined = joined sep seps[i]
                    sep = ":"
                  }
                  print joined
                }'
              done
            `,
            ],
            environment: {
              IPV4: parent.ipv4,
            },
          }).stdout.apply((output) => {
            if (output.length === 0) {
              return [];
            }
            return output.split("\n")
              .filter((ip) => ip !== "")
              .filter((ip) => !ip.startsWith("fe80"))
              .map((ip) => {
                let result = ip.split(":").map(terms => terms.replace(/\b0+/g, "") || "0").join(":");

                let zeros = [...result.matchAll(/\b:?(?:0+:?){2,}/g)];

                if (zeros.length > 0) {
                  let max = "";
                  zeros.forEach(item => {
                    if (item[0].replace(/:/g, "").length > max.replace(/:/g, "").length) {
                      max = item[0];
                    }
                  });
                  result = result.replace(max, "::");
                }
                return result;
              });
          }),
        );
      } else {
        records = parent.ipv6.apply((ipv6) => {
          if (ipv6 === undefined) {
            return [];
          }
          return [ipv6];
        });
      }
      const dnsAAAARecord = new DNSRecord(`${name}-${this.name}-aaaa`, {
        name: parent.name,
        records,
        type: "AAAA",
        noopOnEmpty: true,
        ...this.config,
      }, { parent });
      parent._traitStore[DNSRecordTrait.traitStore.dnsAAAARecord] = dnsAAAARecord;
    }
  }
}
