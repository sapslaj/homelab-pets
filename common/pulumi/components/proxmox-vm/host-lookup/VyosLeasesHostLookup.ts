import * as proxmoxve from "@muhlba91/pulumi-proxmoxve";
import * as pulumi from "@pulumi/pulumi";
import { Config as SSHConfig, NodeSSH } from "node-ssh";

import { IHostLookup } from "./IHostLookup";

export enum NUD {
  PERMANENT = "PERMANENT",
  NOARP = "NOARP",
  REACHABLE = "REACHABLE",
  STALE = "STALE",
  NONE = "NONE",
  INCOMPLETE = "INCOMPLETE",
  DELAY = "DELAY",
  PROBE = "PROBE",
  FAILED = "FAILED",
}

export const ValidNUDs = [
  NUD.PERMANENT.toString(),
  NUD.NOARP.toString(),
  NUD.REACHABLE.toString(),
  NUD.STALE.toString(),
  NUD.NONE.toString(),
  NUD.INCOMPLETE.toString(),
  NUD.DELAY.toString(),
  NUD.PROBE.toString(),
  NUD.FAILED.toString(),
];

export interface Neighbor {
  to: string;
  dev: string;
  lladdr: string;
  nud: NUD;
}

export class VyosLeasesHostLookup implements IHostLookup {
  constructor(public options: { sshConfig: SSHConfig; timeout?: number }) {}

  resolveIpv4(machine: proxmoxve.vm.VirtualMachine): pulumi.Input<string> {
    return pulumi.all({ networkDevices: machine.networkDevices }).apply(async ({ networkDevices }) => {
      if (!networkDevices) {
        throw new Error("cannot lookup host without network devices");
      }
      const ssh = new NodeSSH();
      const conn = await ssh.connect(this.options.sshConfig);
      const timeout = new Date().getTime() + (this.options.timeout ?? 60000);
      while (timeout > new Date().getTime()) {
        const out = await conn.exec("/usr/libexec/vyos/op_mode/dhcp.py", ["show_server_leases", "--family", "inet"]);
        const rows = this.tabulateParse(out);
        for (const networkDevice of networkDevices) {
          const matched = rows.filter((row) => {
            if (row["MAC address"] && networkDevice.macAddress) {
              return row["MAC address"].toLowerCase() === networkDevice.macAddress.toLowerCase();
            } else {
              return false;
            }
          });
          for (const found of matched) {
            if (found && found["IP Address"]) {
              conn.dispose();
              ssh.dispose();
              return found["IP Address"];
            }
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
      const ssh = new NodeSSH();
      const conn = await ssh.connect(this.options.sshConfig);
      const timeout = new Date().getTime() + (this.options.timeout ?? 60000);
      while (timeout > new Date().getTime()) {
        const out = await conn.exec("ip", ["-f", "inet6", "neigh", "show"]);
        const neighbors = this.neighborsParse(out);
        for (const networkDevice of networkDevices) {
          const matched = neighbors.filter((neighbor) => {
            if (neighbor.lladdr && networkDevice.macAddress) {
              return neighbor.lladdr.toLowerCase() === networkDevice.macAddress.toLowerCase();
            } else {
              return false;
            }
          });
          console.log(networkDevice.macAddress.toLowerCase());
          for (const found of matched) {
            if (found && found.to && found.to !== "") {
              conn.dispose();
              ssh.dispose();
              return found.to;
            }
          }
        }
      }
      return undefined;
    });
  }

  neighborsParse(input: string): Neighbor[] {
    return input.split("\n").map((line) => {
      let neighbor: Neighbor = {
        to: "",
        dev: "",
        lladdr: "",
        nud: NUD.FAILED,
      };
      const parts = line.split(" ");
      for (let i = 0; i < parts.length; i++) {
        if (i === 0) {
          neighbor.to = parts[i];
          continue;
        }
        if (parts[i] === "dev") {
          i++;
          neighbor.dev = parts[i];
          continue;
        }
        if (parts[i] === "lladdr") {
          i++;
          neighbor.lladdr = parts[i];
        }
        const maybeNUD = parts[i].toUpperCase();
        if (ValidNUDs.includes(maybeNUD)) {
          neighbor.nud = maybeNUD as NUD;
          continue;
        }
      }
      return neighbor;
    });
  }

  tabulateParse(input: string): Record<string, string>[] {
    const lines = input.split("\n");
    if (lines.length < 2) {
      throw new Error("invalid input: expected at least two lines");
    }

    const columns: { header: string; length: number; start: number; end: number }[] = [];
    let currentColumnLength = 0;
    for (let i = 0; i < lines[1].length; i++) {
      if (lines[1][i] == "-") {
        currentColumnLength += 1;
      } else if (currentColumnLength > 0) {
        columns.push({
          header: "",
          length: currentColumnLength,
          start: i - currentColumnLength,
          end: i,
        });
        currentColumnLength = 0;
      }
    }

    for (let i = 0; i < columns.length; i++) {
      columns[i].header = lines[0].slice(columns[i].start, Math.min(lines[0].length, columns[i].end)).trim();
    }

    const rows: Record<string, string>[] = [];
    for (const line of lines.slice(2)) {
      const row: Record<string, string> = {};
      for (const column of columns) {
        row[column.header] = line.slice(column.start, Math.min(line.length, column.end)).trim();
      }
      rows.push(row);
    }
    return rows;
  }
}
