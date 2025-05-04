import * as proxmoxve from "@muhlba91/pulumi-proxmoxve";
import * as pulumi from "@pulumi/pulumi";

import { IHostLookup } from "./IHostLookup";

export class ZonePopHostLookup implements IHostLookup {
  constructor(public options: { endpoint?: string; timeout?: number; parseMetrics?: boolean }) {
    if (!this.options.endpoint) {
      this.options.endpoint = process.env.SHIMIKO_ENDPOINT ?? "https://shimiko.sapslaj.xyz";
      if (this.options.endpoint.endsWith("/")) {
        this.options.endpoint = this.options.endpoint.slice(0, -1);
      }
      this.options.endpoint += "/zonepop";
    }
  }

  resolve(machine: proxmoxve.vm.VirtualMachine): pulumi.Input<string> {
    return pulumi.all({ networkDevices: machine.networkDevices }).apply(async ({ networkDevices }) => {
      if (!networkDevices) {
        throw new Error("cannot lookup host without network devices");
      }
      const timeout = new Date().getTime() + (this.options.timeout ?? 60000);
      while (timeout > new Date().getTime()) {
        if (this.options.parseMetrics) {
          const metrics = this.parseMetrics(await (await fetch(`${this.options.endpoint}/metrics`)).text());
          for (const networkDevice of networkDevices) {
            const found = metrics.find((metric) => {
              if (metric["hardware_address"] && networkDevice.macAddress) {
                return metric["hardware_address"].toLowerCase() === networkDevice.macAddress.toLowerCase();
              } else {
                return false;
              }
            });
            if (found && found["ipv4"]) {
              return found["ipv4"];
            }
          }
        } else {
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
      }
      throw new Error("could not determine IP for host");
    });
  }

  parseMetrics(input: string): Record<string, string>[] {
    let metrics: Record<string, string>[] = [];
    input.split("\n").forEach((line) => {
      if (line.startsWith("#")) {
        return;
      }
      const lineMatch = line.match(/(.+?){(.+)} \d+/);
      if (!lineMatch) {
        return;
      }
      const metric: Record<string, string> = {
        __name__: lineMatch[1],
      };
      const rawLabels = lineMatch[2];
      const labelsMatch = rawLabels.matchAll(/(\w+)="(.*?)"/g);
      if (!labelsMatch) {
        metrics.push(metric);
        return;
      }
      Array.from(labelsMatch).forEach((match) => {
        metric[match[1]] = match[2];
      });
      metrics.push(metric);
    });
    return metrics;
  }
}
