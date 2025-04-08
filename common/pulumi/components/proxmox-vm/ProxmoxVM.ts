import * as proxmoxve from "@muhlba91/pulumi-proxmoxve";
import * as proxmoxve_inputs from "@muhlba91/pulumi-proxmoxve/types/input";
import { VirtualMachineArgs } from "@muhlba91/pulumi-proxmoxve/vm";
import { remote as remote_inputs } from "@pulumi/command/types/input";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as std from "@pulumi/std";

import { GuestAgentHostLookup, IHostLookup, VyosLeasesHostLookup } from "./host-lookup";
import { ProxmoxVMTrait } from "./ProxmoxVMTrait";

export enum ProxmoxVMAgentType {
  ISA = "isa",
  VIRTIO = "virtio",
}

export interface ProxmoxVMAgentConfig extends proxmoxve_inputs.VM.VirtualMachineAgent {
  enabled?: pulumi.Input<boolean>;
  timeout?: pulumi.Input<string>;
  trim?: pulumi.Input<boolean>;
  type?: ProxmoxVMAgentType;
}

export enum ProxmoxVMAudioDeviceType {
  AC97 = "AC97",
  ICH9_INTEL_HDA = "ich9-intel-hda",
  INTEL_HDA = "intel-hda",
}

export interface ProxmoxVMAudioDeviceConfig extends proxmoxve_inputs.VM.VirtualMachineAudioDevice {
  device?: ProxmoxVMAudioDeviceType;
  driver?: pulumi.Input<string>;
  enabled?: pulumi.Input<boolean>;
}

export enum ProxmoxVMBiosType {
  OVMF = "ovmf",
  SEABIOS = "seabios",
}

export enum ProxmoxVMCPUArchitecture {
  AARCH64 = "aarch64",
  X86_64 = "x86_64",
}

export interface ProxmoxVMCPUFlagsConfig {
  aes?: pulumi.Input<boolean>;
  amdNoSsb?: pulumi.Input<boolean>;
  amdSsbd?: pulumi.Input<boolean>;
  hvEvmcs?: pulumi.Input<boolean>;
  hvTlbflush?: pulumi.Input<boolean>;
  ibpb?: pulumi.Input<boolean>;
  mdClear?: pulumi.Input<boolean>;
  pcid?: pulumi.Input<boolean>;
  pdpe1gb?: pulumi.Input<boolean>;
  specCtrl?: pulumi.Input<boolean>;
  ssbd?: pulumi.Input<boolean>;
  virtSsbd?: pulumi.Input<boolean>;
}

export function proxmoxCpuFlags(config: ProxmoxVMCPUFlagsConfig): pulumi.Input<pulumi.Input<string>[]> {
  let result: string[] = [];
  const map: Record<keyof ProxmoxVMCPUFlagsConfig, string> = {
    aes: "aes",
    amdNoSsb: "amd-no-ssb",
    amdSsbd: "amd-ssbd",
    hvEvmcs: "hv-evmcs",
    hvTlbflush: "hv-tlbflush",
    ibpb: "ibpb",
    mdClear: "md-clear",
    pcid: "pcid",
    pdpe1gb: "pdpe1gb",
    specCtrl: "spec-ctrl",
    ssbd: "ssbd",
    virtSsbd: "virt-ssbd",
  };
  Object.entries(map).forEach(([key, value]) => {
    const configValue = config[key as keyof ProxmoxVMCPUFlagsConfig] as boolean | undefined;
    if (configValue === undefined) {
      return;
    }
    if (configValue) {
      result.push(`+${value}`);
    } else {
      result.push(`-${value}`);
    }
  });
  return result;
}

export enum ProxmoxVMCPUType {
  INTEL_486 = "486",
  BROADWELL = "Broadwell",
  BROADWELL_IBRS = "Broadwell-IBRS",
  BROADWELL_NOTSX = "Broadwell-noTSX",
  BROADWELL_NOTSX_IBRS = "Broadwell-noTSX-IBRS",
  CASCADELAKE_SERVER = "Cascadelake-Server",
  CASCADELAKE_SERVER_NOTSX = "Cascadelake-Server-noTSX",
  CASCADELAKE_SERVER_V2 = "Cascadelake-Server-v2",
  CASCADELAKE_SERVER_V4 = "Cascadelake-Server-v4",
  CASCADELAKE_SERVER_V5 = "Cascadelake-Server-v5",
  CONROE = "Conroe",
  COOPERLAKE = "Cooperlake",
  COOPERLAKE_V2 = "Cooperlake-v2",
  EPYC = "EPYC",
  EPYC_IBPB = "EPYC-IBPB",
  EPYC_MILAN = "EPYC-Milan",
  EPYC_ROME = "EPYC-Rome",
  EPYC_ROME_V2 = "EPYC-Rome-v2",
  EPYC_V3 = "EPYC-v3",
  HASWELL = "Haswell",
  HASWELL_IBRS = "Haswell-IBRS",
  HASWELL_NOTSX = "Haswell-noTSX",
  HASWELL_NOTSX_IBRS = "Haswell-noTSX-IBRS",
  ICELAKE_CLIENT = "Icelake-Client",
  ICELAKE_CLIENT_NOTSX = "Icelake-Client-noTSX",
  ICELAKE_SERVER = "Icelake-Server",
  ICELAKE_SERVER_NOTSX = "Icelake-Server-noTSX",
  ICELAKE_SERVER_V3 = "Icelake-Server-v3",
  ICELAKE_SERVER_V4 = "Icelake-Server-v4",
  ICELAKE_SERVER_V5 = "Icelake-Server-v5",
  ICELAKE_SERVER_V6 = "Icelake-Server-v6",
  IVYBRIDGE = "IvyBridge",
  IVYBRIDGE_IBRS = "IvyBridge-IBRS",
  KNIGHTSMILL = "KnightsMill",
  NEHALEM = "Nehalem",
  NEHALEM_IBRS = "Nehalem-IBRS",
  OPTERON_G1 = "Opteron_G1",
  OPTERON_G2 = "Opteron_G2",
  OPTERON_G3 = "Opteron_G3",
  OPTERON_G4 = "Opteron_G4",
  OPTERON_G5 = "Opteron_G5",
  PENRYN = "Penryn",
  SANDYBRIDGE = "SandyBridge",
  SANDYBRIDGE_IBRS = "SandyBridge-IBRS",
  SAPPHIRERAPIDS = "SapphireRapids",
  SKYLAKE_CLIENT = "Skylake-Client",
  SKYLAKE_CLIENT_IBRS = "Skylake-Client-IBRS",
  SKYLAKE_CLIENT_NOTSX_IBRS = "Skylake-Client-noTSX-IBRS",
  SKYLAKE_CLIENT_V4 = "Skylake-Client-v4",
  SKYLAKE_SERVER = "Skylake-Server",
  SKYLAKE_SERVER_IBRS = "Skylake-Server-IBRS",
  SKYLAKE_SERVER_NOTSX_IBRS = "Skylake-Server-noTSX-IBRS",
  SKYLAKE_SERVER_V4 = "Skylake-Server-v4",
  SKYLAKE_SERVER_V5 = "Skylake-Server-v5",
  WESTMERE = "Westmere",
  WESTMERE_IBRS = "Westmere-IBRS",
  ATHLON = "athlon",
  CORE2DUO = "core2duo",
  COREDUO = "coreduo",
  HOST = "host",
  KVM32 = "kvm32",
  KVM64 = "kvm64",
  MAX = "max",
  PENTIUM = "pentium",
  PENTIUM2 = "pentium2",
  PENTIUM3 = "pentium3",
  PHENOM = "phenom",
  QEMU32 = "qemu32",
  QEMU64 = "qemu64",
  X86_64_V2 = "x86-64-v2",
  X86_64_V2_AES = "x86-64-v2-AES",
  X86_64_V3 = "x86-64-v3",
  X86_64_V4 = "x86-64-v4",
}

export interface ProxmoxVMCPUConfig extends Omit<proxmoxve_inputs.VM.VirtualMachineCpu, "flags"> {
  archtecture?: ProxmoxVMCPUArchitecture;
  cores?: pulumi.Input<number>;
  flags?: ProxmoxVMCPUFlagsConfig;
  hotplugged?: pulumi.Input<number>;
  limit?: pulumi.Input<number>;
  numa?: pulumi.Input<boolean>;
  sockets?: pulumi.Input<number>;
  type?: ProxmoxVMCPUType | pulumi.Input<string>;
  units?: pulumi.Input<number>;
}

export enum ProxmoxVMDiskCache {
  NONE = "none",
  DIRECTSYNC = "directsync",
  WRITETHROUGH = "writethrough",
  WRITEBACK = "writeback",
  UNSAFE = "unsafe",
}

export enum ProxmoxVMDiskDiscard {
  ON = "on",
  IGNORE = "ignore",
}

export function proxmoxVMDiskDiscard(
  config: ProxmoxVMDiskDiscard | pulumi.Input<boolean> | pulumi.Input<string>,
): pulumi.Input<string> {
  if (typeof config === "boolean") {
    if (config as boolean) {
      return "on";
    } else {
      return "ignore";
    }
  }
  return config as pulumi.Input<string>;
}

export enum ProxmoxVMDiskFileFormat {
  QCOW2 = "qcow2",
  RAW = "raw",
  VMDK = "vmdk",
}

export interface ProxmoxVMDiskSpeed {
  iopsRead?: pulumi.Input<number>;
  iopsReadBurstable?: pulumi.Input<number>;
  iopsWrite?: pulumi.Input<number>;
  iopsWriteBurstable?: pulumi.Input<number>;
  read?: pulumi.Input<number>;
  readBurstable?: pulumi.Input<number>;
  write?: pulumi.Input<number>;
  writeBurstable?: pulumi.Input<number>;
}

export interface ProxmoxVMDiskConfig extends Omit<proxmoxve_inputs.VM.VirtualMachineDisk, "discard"> {
  cache?: ProxmoxVMDiskCache;
  datastoreId?: pulumi.Input<string>;
  discard?: ProxmoxVMDiskDiscard | pulumi.Input<boolean> | pulumi.Input<string>;
  fileFormat?: ProxmoxVMDiskFileFormat;
  fileId?: pulumi.Input<string>;
  interface: pulumi.Input<string>;
  iothread?: pulumi.Input<boolean>;
  pathInDatastore?: pulumi.Input<string>;
  size?: pulumi.Input<number>;
  ssd?: pulumi.Input<boolean>;
  speed?: ProxmoxVMDiskSpeed;
}

export function proxmoxVMArgsAddDisk(
  args: proxmoxve.vm.VirtualMachineArgs,
  disks: ProxmoxVMDiskConfig[],
): proxmoxve.vm.VirtualMachineArgs {
  const newDisks: proxmoxve_inputs.VM.VirtualMachineDisk[] = disks.map((diskConfig) => {
    let discard = diskConfig.discard === undefined ? undefined : proxmoxVMDiskDiscard(diskConfig.discard);

    return {
      ...diskConfig,
      discard,
    };
  });
  let newProps = args;
  if (newProps.disks === undefined) {
    newProps.disks = [];
  }
  if (Array.isArray(newProps.disks)) {
    newProps.disks.push(...newDisks);
  } else if (typeof (newProps.disks as any).then === "function") {
    newProps.disks = (newProps.disks as Promise<pulumi.Input<proxmoxve_inputs.VM.VirtualMachineDisk>[]>).then(
      (value) => {
        return [
          ...value,
          ...newDisks,
        ];
      },
    );
  } else if (typeof (newProps.disks as any).apply === "function") {
    newProps.disks = (newProps.disks as pulumi.OutputInstance<pulumi.Input<proxmoxve_inputs.VM.VirtualMachineDisk>[]>)
      .apply((value) => {
        return [
          ...value,
          ...newDisks,
        ];
      });
  } else {
    throw new Error(`unable to figure out how to add disk to '${newProps.disks}' (typeof ${typeof newProps.disks})`);
  }
  return newProps;
}

export interface ProxmoxVMEFIDiskConfig extends proxmoxve_inputs.VM.VirtualMachineEfiDisk {
  datastoreId?: string;
  fileFormat: ProxmoxVMDiskFileFormat;
  preEnrolledKeys?: boolean;
  type?: "4m" | "2m";
}

export enum ProxmoxVMTPMStateVersion {
  V1_2 = "v1.2",
  V2_0 = "v2.0",
}

export interface ProxmoxVMTPMState extends proxmoxve_inputs.VM.VirtualMachineTpmState {
  version?: ProxmoxVMTPMStateVersion;
}

export enum ProxmoxVMKeyboardLayout {
  DA = "da",
  DE = "de",
  DE_CH = "de-ch",
  EN_GB = "en-gb",
  EN_US = "en-us",
  ES = "es",
  FI = "fi",
  FR = "fr",
  FR_BE = "fr-be",
  FR_CA = "fr-ca",
  FR_CH = "fr-ch",
  HU = "hu",
  IS = "is",
  IT = "it",
  JA = "ja",
  LT = "lt",
  MK = "mk",
  NL = "nl",
  NO = "no",
  PL = "pl",
  PT = "pt",
  PT_BR = "pt-br",
  SL = "sl",
  SV = "sv",
  TR = "tr",
}

export enum ProxmoxVMMachine {
  PC = "pc",
  Q35 = "q35",
}

export enum ProxmoxVMNetworkDeviceModel {
  E1000 = "e1000",
  RTL8139 = "rtl8139",
  VIRTIO = "virtio",
  VMXNET3 = "vmxnet3",
}

export interface ProxmoxVMNetworkDeviceConfig extends proxmoxve_inputs.VM.VirtualMachineNetworkDevice {
  bridge?: pulumi.Input<string>;
  enabled?: pulumi.Input<boolean>;
  firewall?: pulumi.Input<boolean>;
  macAddress?: pulumi.Input<string>;
  model?: ProxmoxVMNetworkDeviceModel;
  mtu?: pulumi.Input<number>;
  queues?: pulumi.Input<number>;
  rateLimit?: pulumi.Input<number>;
  trunks?: pulumi.Input<string>;
  vlanId?: pulumi.Input<number>;
}

export enum ProxmoxVMOperatingSystemType {
  L24 = "l24",
  L26 = "l26",
  OTHER = "other",
  SOLARIS = "solaris",
  W2K = "w2k",
  W2K3 = "w2k3",
  W2K8 = "w2k8",
  WIN7 = "win7",
  WIN8 = "win8",
  WIN10 = "win10",
  WIN11 = "win11",
  WVISTA = "wvista",
  WXP = "wxp",
}

export interface ProxmoxVMOperatingSystemConfig extends proxmoxve_inputs.VM.VirtualMachineOperatingSystem {
  type?: ProxmoxVMOperatingSystemType;
}

export enum ProxmoxVMSCSIHardware {
  LSI = "lsi",
  LSI53C810 = "lsi53c810",
  VIRTIO_SCSI_PCI = "virtio-scsi-pci",
  VIRTIO_SCSI_SINGLE = "virtio-scsi-single",
  MEGASAS = "megasas",
  PVSCSI = "pvscsi",
}

export enum ProxmoxVMVGAType {
  CIRRUS = "cirrus",
  QX1 = "qx1",
  QX12 = "qx12",
  QX13 = "qx13",
  QX14 = "qx14",
  SERIAL0 = "serial0",
  SERIAL1 = "serial1",
  SERIAL2 = "serial2",
  SERIAL3 = "serial3",
  STD = "std",
  VIRTIO = "virtio",
  VMWARE = "vmware",
}

export interface ProxmoxVMVGAConfig extends proxmoxve_inputs.VM.VirtualMachineVga {
  enabled?: pulumi.Input<boolean>;
  memory?: pulumi.Input<number>;
  type?: ProxmoxVMVGAType;
}

export interface ProxmoxVMTimeoutConfig {
  clone?: pulumi.Input<number>;
  create?: pulumi.Input<number>;
  moveDisk?: pulumi.Input<number>;
  migrate?: pulumi.Input<number>;
  reboot?: pulumi.Input<number>;
  shutdown?: pulumi.Input<number>;
  start?: pulumi.Input<number>;
  stop?: pulumi.Input<number>;
}

export interface ProxmoxVMProps extends Omit<proxmoxve.vm.VirtualMachineArgs, "cpu" | "disks" | "nodeName"> {
  hostLookup?: IHostLookup;
  traits?: ProxmoxVMTrait[];
  connectionArgs?: Partial<remote_inputs.ConnectionArgs>;
  userData?: Record<string, any>;
  userDataFileConfig?: Partial<proxmoxve.storage.FileArgs>;
  acpi?: pulumi.Input<boolean>;
  agent?: ProxmoxVMAgentConfig;
  audioDevice?: ProxmoxVMAudioDeviceConfig;
  bios?: ProxmoxVMBiosType;
  bootOrder?: pulumi.Input<pulumi.Input<string>[]>;
  cpu?: ProxmoxVMCPUConfig;
  description?: pulumi.Input<string>;
  disks?: ProxmoxVMDiskConfig[];
  efiDisk?: ProxmoxVMEFIDiskConfig;
  tpmState?: ProxmoxVMTPMState;
  keyboardLayout?: ProxmoxVMKeyboardLayout;
  kvmArguments?: pulumi.Input<string>;
  machine?: ProxmoxVMMachine;
  migrate?: pulumi.Input<boolean>;
  name?: pulumi.Input<string>;
  networkDevices?: ProxmoxVMNetworkDeviceConfig[];
  nodeName?: pulumi.Input<string>;
  onBoot?: pulumi.Input<boolean>;
  operatingSystem?: ProxmoxVMOperatingSystemConfig;
  poolId?: pulumi.Input<string>;
  reboot?: pulumi.Input<boolean>;
  scsiHardware?: ProxmoxVMSCSIHardware;
  started?: pulumi.Input<boolean>;
  tabletDevice?: pulumi.Input<boolean>;
  tags?: pulumi.Input<pulumi.Input<string>[]>;
  template?: pulumi.Input<boolean>;
  stopOnDestroy?: pulumi.Input<boolean>;
  timeout?: ProxmoxVMTimeoutConfig;
  vga?: ProxmoxVMVGAConfig;
}

export class ProxmoxVM extends pulumi.ComponentResource {
  machine: proxmoxve.vm.VirtualMachine;
  userDataFile?: proxmoxve.storage.File;
  name: pulumi.Output<string>;
  nodeName: pulumi.Output<string>;

  _traitStore: Record<symbol, any> = {};

  public static defaultHostLookup: (props?: ProxmoxVMProps) => IHostLookup = () => {
    if (process.env.VYOS_HOST) {
      return new VyosLeasesHostLookup({
        sshConfig: {
          host: process.env.VYOS_HOST,
          username: process.env.VYOS_USERNAME,
          password: process.env.VYOS_PASSWORD,
        },
      });
    } else {
      return new GuestAgentHostLookup();
    }
  };

  protected hostLookup: IHostLookup;

  protected connectionArgs: Partial<remote_inputs.ConnectionArgs>;

  private _ipv4: pulumi.Output<string> | undefined;

  constructor(id: string, props: ProxmoxVMProps = {}, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:promxmox-vm:ProxmoxVM", id, {}, opts);

    const traits: ProxmoxVMTrait[] = [];
    let mutatedProps = props;

    // max 1,000 iterations to prevent infinite loops
    for (let i = 0; i < 1000; i++) {
      if (mutatedProps.traits === undefined || mutatedProps.traits.length === 0) {
        break;
      }
      const trait = mutatedProps.traits.find((t) => !traits.includes(t));
      if (trait === undefined) {
        break;
      }
      traits.push(trait);
      if (trait.forProps !== undefined) {
        mutatedProps = trait.forProps(mutatedProps, id, this);
      }
    }

    let {
      traits: _,
      hostLookup,
      connectionArgs,
      userData,
      cpu,
      disks,
      name,
      nodeName,
      timeout,
      ...rest
    } = mutatedProps;
    let config: Partial<proxmoxve.vm.VirtualMachineArgs> = {
      ...rest,
      timeoutClone: timeout?.clone,
      timeoutCreate: timeout?.create,
      timeoutMigrate: timeout?.migrate,
      timeoutMoveDisk: timeout?.moveDisk,
      timeoutReboot: timeout?.reboot,
      timeoutShutdownVm: timeout?.shutdown,
      timeoutStartVm: timeout?.start,
      timeoutStopVm: timeout?.stop,
    };

    this.hostLookup = hostLookup ?? ProxmoxVM.defaultHostLookup(mutatedProps);

    this.connectionArgs = connectionArgs ?? {};

    if (cpu === undefined) {
      // Default to giving every VM 2 CPU cores unless otherwise defined
      // because there's no reason to not have at least 2.
      config = {
        ...config,
        cpu: {
          cores: 2,
        },
      };
    } else {
      config = {
        ...config,
        cpu: {
          cores: 2,
          ...cpu,
          flags: cpu.flags === undefined ? undefined : proxmoxCpuFlags(cpu.flags),
        },
      };
    }

    if (disks !== undefined) {
      config = proxmoxVMArgsAddDisk(config as proxmoxve.vm.VirtualMachineArgs, disks);
    }

    if (!nodeName) {
      const availableNodes = proxmoxve.cluster.getNodesOutput();
      const shuffle = new random.RandomShuffle(`${id}-random-node`, {
        inputs: availableNodes.names,
        resultCount: 1,
      }, {
        parent: this,
      });
      nodeName = shuffle.results.apply((r) => r[0]) as any as string;
      config = {
        ...config,
        nodeName,
      };
    }

    if (!name) {
      name = [
        pulumi.getProject(),
        pulumi.getStack(),
        id,
      ].join("-").toLowerCase();
    }
    config = {
      ...config,
      name,
    };

    // HACK: workaround weird provider issue where it forces a network device
    // to be present.
    if (!config.networkDevices) {
      config.networkDevices = [
        {
          bridge: "vmbr0",
        },
      ];
    }

    if (userData !== undefined) {
      // Apply some sensible defaults if they are undefined.
      if (userData.hostname === undefined) {
        userData.hostname = config.name;
      }
      if (userData.manage_etc_hosts === undefined) {
        userData.manage_etc_hosts = true;
      }
      if (userData.fqdn === undefined) {
        userData.fqdn = config.name;
      }
      if (userData.users === undefined) {
        userData.users = ["default"];
      }
      if (userData.chpasswd?.expire === undefined) {
        userData.chpasswd = {
          expire: false,
          ...userData.chpasswd,
        };
      }

      const data = pulumi.concat(
        "#cloud-config\n",
        std.jsonencodeOutput({
          input: userData,
        }).result,
      );

      this.userDataFile = new proxmoxve.storage.File(id, {
        datastoreId: "local",
        nodeName: config.nodeName!,
        contentType: "snippets",
        ...mutatedProps.userDataFileConfig,
        sourceRaw: {
          fileName: pulumi.interpolate`${name}-user-data.yaml`,
          data,
          ...mutatedProps.userDataFileConfig?.sourceRaw,
        },
      }, { parent: this });
      config.initialization = {
        userDataFileId: this.userDataFile.id,
        ...config.initialization,
      };

      // Make sure networking will come up by default
      if (config.initialization.ipConfigs === undefined) {
        config.initialization.ipConfigs = [
          {
            ipv4: {
              address: "dhcp",
            },
            ipv6: {
              address: "dhcp",
            },
          },
        ];
      }
    }

    traits.forEach((trait) => {
      if (trait.forArgs === undefined) {
        return;
      }
      config = trait.forArgs(config as VirtualMachineArgs, id, this);
    });

    this.machine = new proxmoxve.vm.VirtualMachine(`${id}-vm`, config as VirtualMachineArgs, {
      parent: this,
      ignoreChanges: [
        // HACK: because the provider always thinks there is a diff with the speed
        "disks[0].speed",
      ],
    });
    this.name = pulumi.output(name);
    this.nodeName = pulumi.output(nodeName);

    traits.forEach((trait) => {
      if (trait.forResource === undefined) {
        return;
      }
      trait.forResource(this.machine, config as VirtualMachineArgs, id, this);
    });
  }

  public get ipv4(): pulumi.Output<string> {
    if (!this._ipv4) {
      this._ipv4 = pulumi.output(this.hostLookup.resolve(this.machine));
    }
    return this._ipv4;
  }

  public get connection(): remote_inputs.ConnectionArgs {
    return {
      host: this.ipv4,
      ...this.connectionArgs,
    };
  }
}
