import * as proxmoxve from "@muhlba91/pulumi-proxmoxve";
import * as pulumi from "@pulumi/pulumi";

import { IHostLookup } from "./IHostLookup";

export class ZonePopHostLookup implements IHostLookup {
  constructor(public options: { endpoint: string; timeout?: number }) {}

  resolve(machine: proxmoxve.vm.VirtualMachine): pulumi.Input<string> {
    return pulumi.all({ networkDevices: machine.networkDevices }).apply(async ({ networkDevices }) => {
      if (!networkDevices) {
        throw new Error("cannot lookup host without network devices");
      }
      const timeout = new Date().getTime() + (this.options.timeout ?? 60000);
      while (timeout > new Date().getTime()) {
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
