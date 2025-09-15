import * as proxmoxve from "@muhlba91/pulumi-proxmoxve";

import { Distro, IDistro, VLAN } from "../homelab-config";
import { Autoupdate, AutoupdateProps } from "../mid/Autoupdate";
import { BaselineUsers, BaselineUsersProps } from "../mid/BaselineUsers";
import { MidTarget, MidTargetProps } from "../mid/MidTarget";
import { NASClient, NASClientProps } from "../mid/NASClient";
import { OpenTelemetryCollector, OpenTelemetryCollectorProps } from "../mid/OpenTelemetryCollector";
import { PrometheusNodeExporter, PrometheusNodeExporterProps } from "../mid/PrometheusNodeExporter";
import { Selfheal, SelfhealProps } from "../mid/Selfheal";
import { Vector, VectorProps } from "../mid/Vector";
import { CloudImageTrait, CloudImageTraitConfig, CloudImageTraitConfigDownloadFileConfig } from "./CloudImageTrait";
import { DNSRecordTrait, DNSRecordTraitConfig } from "./DNSRecordTrait";
import { PrivateKeyTrait, PrivateKeyTraitConfig } from "./PrivateKeyTrait";
import { ProxmoxVM, ProxmoxVMProps } from "./ProxmoxVM";
import { ProxmoxVMTrait } from "./ProxmoxVMTrait";

export interface BaseConfigTraitMidConfig {
  autoupdate?: AutoupdateProps & {
    /**
     * @default true
     */
    enabled?: boolean;
  };
  baselineUsers?: BaselineUsersProps & {
    /**
     * @default true
     */
    enabled?: boolean;
  };
  midTarget?: MidTargetProps & {
    /**
     * @default true
     */
    enabled?: boolean;
  };
  nasClient?: NASClientProps & {
    /**
     * @default false
     */
    enabled?: boolean;
  };
  openTelemetryCollector?: OpenTelemetryCollectorProps & {
    /**
     * @default true
     */
    enabled?: boolean;
  };
  prometheusNodeExporter?: PrometheusNodeExporterProps & {
    /**
     * @default true
     */
    enabled?: boolean;
  };
  selfheal?: SelfhealProps & {
    /**
     * @default false
     */
    enabled?: boolean;
  };
  vector?: VectorProps & {
    /**
     * @default true
     */
    enabled?: boolean;
  };
}

export interface BaseConfigTraitConfig {
  /**
   * @default VLAN.SERVERS
   */
  vlanId?: VLAN | number;

  /**
   * @default Distro.UBUNTU_2404
   */
  distro?: IDistro;

  cloudImage?:
    | boolean
    | Partial<CloudImageTraitConfig> & {
      downloadFileConfig?: Partial<CloudImageTraitConfigDownloadFileConfig>;
    };

  mid?: boolean | BaseConfigTraitMidConfig;

  dnsRecord?: boolean | DNSRecordTraitConfig;

  privateKey?: boolean | PrivateKeyTraitConfig;
}

export const sapslajPasswd =
  "$y$j9T$r7CWaFZ5qBQPTwd7HoJPJ0$fiOZxuOs8Vr3oQXjK2rXzE7NxnNZ/V/O6Bi2a0axqG5";
export const sapslajSSHKey =
  "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDALIs2j0FT1nlmRdIoaGt+gzyn8iOgHDQS1lg5ivSYDpU3tKsLQgFB9l+q0zB0hODNaVSiJfekMi43gkULnUf20g5M0ysAgjowDKIeGsFQIKWifO9J7aXSEdAaupIcPDZt8oWqJysxqpxL5pICbQzU1+f7yk2L8bC5rd1mQGgoDWvRkwUCtAdL5pGndDpZ7xke2eYvTwglDEjr32F0zQf1u2t7XNGWPJhIbvvipEsRZY68W0HAgNKo3qWA/Q2jdbFvgNWXeEvvHKT+13exjhZrXFUaA3XCkZx0WZanCn5MMShENhVgn01HGGrKOLCm5jk49lJIesYHRkYfx5PzZT6B saps.laj@gmail.com";
export const ciSSHKey =
  "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCmJsCb5da9gTwpettT9ba8cGQwlnKDUNZuwr64KnaLufzCkRaiSBFgsLC3UvFCrmnONZFnwXYruaQXRukKxThOvfRvCPz/ieiD/udzvgXRR/BHyhWUcLSs3IthNF7ic5EAqStL1Fo6Y6oEot43MvD/5W0IonF70J6bjjgxq5kajaubW7EKNUdhbzmycNc0orkEHO4NQSr7OWOULuXd9asVi/W4xG2kOqKEkZ9i5HtHcYsdHW8sbYVVQy/JlXm0I+UdpCQ6XrlasW/QuUrdT/qPKYC4b8a1jvyY1z8I8TMFahQq0UMCdm+QubMWKJCwkc0GskvezfwRO0GCmaNYKFus04qDzk6d5fAji1P8xJsmbm2I0GDD0snxNQ/+1cY+4Dc9g86Hh50HjeR6rCX+fvH5LG/m9G1uT7VbBxRQCpl0QfcKMn0U6w5FcGZIb/SfdXU8erKalAoPow3kCBZ8bwGc7SdWaBEpxpz4SorcDWn5wso+o/AH8dlY42fv7D81yrk= ci@sapslaj.com";

export class BaseConfigTrait implements ProxmoxVMTrait {
  distro: IDistro;

  constructor(public name: string, public config: BaseConfigTraitConfig = {}) {
    if (this.config.distro) {
      this.distro = this.config.distro;
    } else {
      this.distro = Distro.UBUNTU_24_04;
    }
  }

  forProps(props: ProxmoxVMProps, name: string, parent: ProxmoxVM): ProxmoxVMProps {
    let newProps = { ...props };

    if (!newProps.traits) {
      newProps.traits = [];
    }

    if (this.config.cloudImage !== false && !newProps.traits.find((t) => t instanceof CloudImageTrait)) {
      const cloudImageConfig = typeof this.config.cloudImage === "boolean" ? undefined : this.config.cloudImage;
      newProps.traits.push(
        new CloudImageTrait(`${this.name}-cloud-image`, {
          downloadFileConfig: {
            url: this.distro.url,
            ...cloudImageConfig?.downloadFileConfig,
          },
          ...cloudImageConfig,
        }),
      );

      if (!newProps.connectionArgs?.user) {
        newProps.connectionArgs = {
          user: this.distro.username,
          ...newProps.connectionArgs,
        };
      }
    }

    if (this.config.dnsRecord !== false && !newProps.traits.find((t) => t instanceof DNSRecordTrait)) {
      const dnsRecordTraitConfig = typeof this.config.dnsRecord === "boolean" ? undefined : this.config.dnsRecord;
      newProps.traits.push(new DNSRecordTrait(`${this.name}-dns-record`, dnsRecordTraitConfig));
    }

    if (this.config.privateKey !== false) {
      let privateKeyConfig: PrivateKeyTraitConfig = {};
      if (typeof this.config.privateKey === "object") {
        privateKeyConfig = this.config.privateKey;
      }
      newProps.traits.push(
        new PrivateKeyTrait(`${this.name}-private-key`, privateKeyConfig),
      );
    }

    if (!newProps.memory) {
      // Provisioning seems to get OOMKilled with 512MB of memory, so bump the
      // default up.
      newProps.memory = {
        dedicated: 1024,
      };
    }

    if (!newProps.userData) {
      newProps.userData = {};
    }

    if (!newProps.userData.ssh_authorized_keys) {
      newProps.userData.ssh_authorized_keys = [];
    }
    if (newProps.userData.ssh_authorized_keys.includes(sapslajSSHKey)) {
      newProps.userData.ssh_authorized_keys.push(sapslajSSHKey);
    }
    if (newProps.userData.ssh_authorized_keys.includes(ciSSHKey)) {
      newProps.userData.ssh_authorized_keys.push(ciSSHKey);
    }

    if (!newProps.userData.users) {
      newProps.userData.users = [];
    }
    newProps.userData.users = [
      "default",
      ...newProps.userData.users.filter((user: any) => user !== "default"),
    ];
    if (!newProps.userData.users.find((user: any) => user.name === "sapslaj")) {
      newProps.userData.users.push({
        name: "sapslaj",
        sudo: "ALL=(ALL) NOPASSWD:ALL",
        lock_passwd: false,
        passwd: sapslajPasswd,
        ssh_authorized_keys: [
          sapslajSSHKey,
        ],
      });
    }
    if (!newProps.userData.users.find((user: any) => user.name === "ci")) {
      newProps.userData.users.push({
        name: "ci",
        sudo: "ALL=(ALL) NOPASSWD:ALL",
        ssh_authorized_keys: [
          ciSSHKey,
        ],
      });
    }

    if (!newProps.networkDevices) {
      newProps.networkDevices = [
        {
          bridge: "vmbr1",
          vlanId: this.config.vlanId ?? VLAN.SERVERS,
        },
      ];
    }

    if (!newProps.ignoreChanges) {
      newProps.ignoreChanges = [];
    }

    return newProps;
  }

  forResource(
    machine: proxmoxve.vm.VirtualMachine,
    args: proxmoxve.vm.VirtualMachineArgs,
    name: string,
    parent: ProxmoxVM,
  ): void {
    if (this.config.mid !== false) {
      let midBaseConfig: BaseConfigTraitMidConfig = {};
      if (typeof this.config.mid === "object") {
        midBaseConfig = this.config.mid;
      }
      let midTarget: MidTarget | undefined = undefined;
      if (midBaseConfig.midTarget?.enabled !== false) {
        midTarget = new MidTarget(`${name}-${this.name}`, {
          connection: parent.connection,
          ...midBaseConfig.midTarget,
        }, {
          deletedWith: machine,
          parent,
        });
      }

      if (midBaseConfig.autoupdate?.enabled !== false) {
        new Autoupdate(`${name}-${this.name}`, {
          connection: parent.connection,
          ...midBaseConfig.autoupdate,
        }, {
          deletedWith: machine,
          dependsOn: midTarget,
          parent,
        });
      }

      if (midBaseConfig.baselineUsers?.enabled !== false) {
        new BaselineUsers(`${name}-${this.name}`, {
          connection: parent.connection,
          ...midBaseConfig.baselineUsers,
        }, {
          deletedWith: machine,
          dependsOn: midTarget,
          parent,
        });
      }

      if (midBaseConfig.nasClient?.enabled === true) {
        new NASClient(`${name}-${this.name}`, {
          connection: parent.connection,
          ...midBaseConfig.nasClient,
        }, {
          deletedWith: machine,
          dependsOn: midTarget,
          parent,
        });
      }

      if (midBaseConfig.openTelemetryCollector?.enabled !== false) {
        new OpenTelemetryCollector(`${name}-${this.name}`, {
          connection: parent.connection,
          ...midBaseConfig.openTelemetryCollector,
        }, {
          deletedWith: machine,
          dependsOn: midTarget,
          parent,
        });
      }

      if (midBaseConfig.prometheusNodeExporter?.enabled !== false) {
        new PrometheusNodeExporter(`${name}-${this.name}`, {
          connection: parent.connection,
          ...midBaseConfig.prometheusNodeExporter,
        }, {
          deletedWith: machine,
          dependsOn: midTarget,
          parent,
        });
      }

      if (midBaseConfig.selfheal?.enabled === true) {
        new Selfheal(`${name}-${this.name}`, {
          connection: parent.connection,
          ...midBaseConfig.selfheal,
        }, {
          deletedWith: machine,
          dependsOn: midTarget,
          parent,
        });
      }

      if (midBaseConfig.vector?.enabled !== false) {
        new Vector(`${name}-${this.name}`, {
          connection: parent.connection,
          ...midBaseConfig.vector,
        }, {
          deletedWith: machine,
          dependsOn: midTarget,
          parent,
        });
      }
    }
  }
}
