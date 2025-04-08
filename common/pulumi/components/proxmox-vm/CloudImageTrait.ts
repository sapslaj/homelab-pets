import * as proxmoxve from "@muhlba91/pulumi-proxmoxve";
import * as pulumi from "@pulumi/pulumi";

import {
  ProxmoxVM,
  proxmoxVMArgsAddDisk,
  ProxmoxVMDiskConfig,
  ProxmoxVMOperatingSystemType,
  ProxmoxVMProps,
} from "./ProxmoxVM";
import { ProxmoxVMTrait } from "./ProxmoxVMTrait";

export interface CloudImageTraitConfigDownloadFileConfig extends Partial<proxmoxve.download.FileArgs> {
  url: pulumi.Input<string>;
}

export interface CloudImageTraitConfig {
  downloadFileConfig: CloudImageTraitConfigDownloadFileConfig;
  diskConfig?: Partial<ProxmoxVMDiskConfig>;
}

export class CloudImageTrait implements ProxmoxVMTrait {
  static traitStore = {
    file: Symbol("file"),
  };

  static fileFor(vm: ProxmoxVM): proxmoxve.download.File {
    return vm._traitStore[CloudImageTrait.traitStore.file]!;
  }

  name: string;
  config: CloudImageTraitConfig;

  constructor(name: string, config: CloudImageTraitConfig) {
    this.name = name;
    this.config = config;
  }

  forProps(props: ProxmoxVMProps, name: string, parent: ProxmoxVM): ProxmoxVMProps {
    if (!props.operatingSystem) {
      return {
        ...props,
        operatingSystem: {
          type: ProxmoxVMOperatingSystemType.L26,
        },
      };
    }
    return props;
  }

  forArgs(args: proxmoxve.vm.VirtualMachineArgs, name: string, parent: ProxmoxVM): proxmoxve.vm.VirtualMachineArgs {
    const file = new proxmoxve.download.File(`${name}-${this.name}-file`, {
      contentType: "iso",
      datastoreId: "local",
      nodeName: args.nodeName,
      fileName: pulumi.interpolate`${args.name ?? name}-${this.name}.img`,
      ...this.config.downloadFileConfig,
    }, {
      parent,
      ignoreChanges: [
        "fileName",
      ],
    });
    parent._traitStore[CloudImageTrait.traitStore.file] = file;
    return proxmoxVMArgsAddDisk(args, [
      {
        datastoreId: "local-lvm",
        fileId: file.id,
        interface: "scsi0",
      },
    ]);
  }
}
