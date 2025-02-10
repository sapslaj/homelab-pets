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
  name: string;
  config: CloudImageTraitConfig;
  file?: proxmoxve.download.File;

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
    this.file = new proxmoxve.download.File(`${name}-${this.name}-file`, {
      contentType: "iso",
      datastoreId: "local",
      nodeName: args.nodeName,
      fileName: `${name}-${this.name}.img`,
      ...this.config.downloadFileConfig,
    }, { parent });
    return proxmoxVMArgsAddDisk(args, [
      {
        datastoreId: "local-lvm",
        fileId: this.file.id,
        interface: "scsi0",
      },
    ]);
  }
}
