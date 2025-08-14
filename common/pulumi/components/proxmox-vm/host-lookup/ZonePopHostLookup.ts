import * as proxmoxve from "@muhlba91/pulumi-proxmoxve";
import * as pulumi from "@pulumi/pulumi";

import { IHostLookup } from "./IHostLookup";

export class ZonePopHostLookup implements IHostLookup {
  constructor(public options: { endpoint?: string; timeout?: number }) {
    if (!this.options.endpoint) {
      this.options.endpoint = process.env.SHIMIKO_ENDPOINT ?? "https://shimiko.sapslaj.xyz";
      if (this.options.endpoint.endsWith("/")) {
        this.options.endpoint = this.options.endpoint.slice(0, -1);
      }
      this.options.endpoint += "/zonepop";
    }
  }

  resolveIpv4(machine: proxmoxve.vm.VirtualMachine): pulumi.Input<string> {
    return pulumi.all({ networkDevices: machine.networkDevices }).apply(async ({ networkDevices }) => {
      if (!networkDevices) {
        throw new Error("cannot lookup host without network devices");
      }
      const timeout = new Date().getTime() + (this.options.timeout ?? 60000);
      while (timeout > new Date().getTime()) {
        const endpoints = await (await fetch(`${this.options.endpoint}/endpoints/forward`)).json();
        for (const networkDevice of networkDevices) {
          const found = endpoints.find((endpoint: any) => {
            if (endpoint.source_properties?.hardware_address && networkDevice.macAddress) {
              return endpoint.source_properties?.hardware_address === networkDevice.macAddress.toLowerCase();
            } else {
              return false;
            }
          });
          if (found && Array.isArray(found.ipv4s) && found.ipv4s.length > 0) {
            return found.ipv4s[0];
          }
        }
      }
      throw new Error("could not determine IP for host");
    });
  }

  resolveIpv6(machine: proxmoxve.vm.VirtualMachine): pulumi.Input<string | undefined> {
    return pulumi.all({ networkDevices: machine.networkDevices }).apply(async ({ networkDevices }) => {
      if (!networkDevices) {
        throw new Error("cannot lookup host without network devices");
      }
      const timeout = new Date().getTime() + (this.options.timeout ?? 60000);
      while (timeout > new Date().getTime()) {
        const endpoints = await (await fetch(`${this.options.endpoint}/endpoints/forward`)).json();
        for (const networkDevice of networkDevices) {
          const found = endpoints.find((endpoint: any) => {
            if (endpoint.source_properties?.hardware_address && networkDevice.macAddress) {
              return endpoint.source_properties?.hardware_address === networkDevice.macAddress.toLowerCase();
            } else {
              return false;
            }
          });
          if (found && Array.isArray(found.ipv6s) && found.ipv6s.length > 0) {
            return found.ipv6s[0];
          }
        }
      }
      return undefined;
    });
  }
}
