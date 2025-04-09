import { BaseConfig, BaseConfigBuilder } from "../ansible/BaseConfigBuilder";
import { AnsibleTrait, AnsibleTraitConfig } from "./AnsibleTrait";
import { CloudImageTrait, CloudImageTraitConfig, CloudImageTraitConfigDownloadFileConfig } from "./CloudImageTrait";
import { DNSRecordTrait, DNSRecordTraitConfig } from "./DNSRecordTrait";
import { ProxmoxVM, ProxmoxVMProps } from "./ProxmoxVM";
import { ProxmoxVMTrait } from "./ProxmoxVMTrait";

export interface IDistro {
  url: string;
  username: string;
  ansibleInstallCommand?: string;
}

export class Distro implements IDistro {
  static UBUNTU_24_04 = new Distro({
    url: "https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img",
    username: "ubuntu",
    ansibleInstallCommand: [
      "export DEBIAN_FRONTEND=noninteractive",
      "with_backoff sudo apt-get update",
      "with_backoff sudo apt-get install -y ansible git",
    ].join(" && "),
  });

  static UBUNTU_NOBLE = Distro.UBUNTU_24_04;

  static DEBIAN_12 = new Distro({
    url: "https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2",
    username: "debian",
    ansibleInstallCommand: [
      "export DEBIAN_FRONTEND=noninteractive",
      "with_backoff sudo apt-get update",
      "with_backoff sudo apt-get install -y ansible git",
    ].join(" && "),
  });

  static DEBIAN_BOOKWORM = Distro.DEBIAN_12;

  static ALPINE_3_21_2 = new Distro({
    url: "https://dl-cdn.alpinelinux.org/alpine/v3.21/releases/cloud/nocloud_alpine-3.21.2-x86_64-bios-tiny-r0.qcow2",
    username: "alpine",
    ansibleInstallCommand: "with_backoff sudo apk add ansible git",
  });

  static ALPINE_3_21 = Distro.ALPINE_3_21_2;
  static ALPINE_3 = Distro.ALPINE_3_21;

  url: string;
  username: string;
  ansibleInstallCommand?: string;

  constructor(distro: IDistro) {
    this.url = distro.url;
    this.username = distro.username;
    this.ansibleInstallCommand = distro.ansibleInstallCommand;
  }
}

export enum VLAN {
  NATIVE = 1,
  MANAGEMENT = 2,
  JAIL = 3,
  SERVERS = 4,
  INTERNAL = 5,
}

export interface BaseConfigTraitAnsibleConfig extends AnsibleTraitConfig {
  base?: BaseConfig;
  roles?: any[];
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
      downloadFileConfig: Partial<CloudImageTraitConfigDownloadFileConfig>;
    };

  ansible?: boolean | BaseConfigTraitAnsibleConfig;

  dnsRecord?: boolean | DNSRecordTraitConfig;
}

export const sapslajPasswd =
  "$6$HKmDQSk/$prBGGB/SR0Kw5VTyquE3gfiHhYcy7xOr2yUpVIPdfZy./DC2BYljx0KYhqTX.d5ELFcf7mrQk2KeP0nuIaXCz1";
export const sapslajSSHKey =
  "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDALIs2j0FT1nlmRdIoaGt+gzyn8iOgHDQS1lg5ivSYDpU3tKsLQgFB9l+q0zB0hODNaVSiJfekMi43gkULnUf20g5M0ysAgjowDKIeGsFQIKWifO9J7aXSEdAaupIcPDZt8oWqJysxqpxL5pICbQzU1+f7yk2L8bC5rd1mQGgoDWvRkwUCtAdL5pGndDpZ7xke2eYvTwglDEjr32F0zQf1u2t7XNGWPJhIbvvipEsRZY68W0HAgNKo3qWA/Q2jdbFvgNWXeEvvHKT+13exjhZrXFUaA3XCkZx0WZanCn5MMShENhVgn01HGGrKOLCm5jk49lJIesYHRkYfx5PzZT6B saps.laj@gmail.com";
export const ciSSHKey =
  "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCmJsCb5da9gTwpettT9ba8cGQwlnKDUNZuwr64KnaLufzCkRaiSBFgsLC3UvFCrmnONZFnwXYruaQXRukKxThOvfRvCPz/ieiD/udzvgXRR/BHyhWUcLSs3IthNF7ic5EAqStL1Fo6Y6oEot43MvD/5W0IonF70J6bjjgxq5kajaubW7EKNUdhbzmycNc0orkEHO4NQSr7OWOULuXd9asVi/W4xG2kOqKEkZ9i5HtHcYsdHW8sbYVVQy/JlXm0I+UdpCQ6XrlasW/QuUrdT/qPKYC4b8a1jvyY1z8I8TMFahQq0UMCdm+QubMWKJCwkc0GskvezfwRO0GCmaNYKFus04qDzk6d5fAji1P8xJsmbm2I0GDD0snxNQ/+1cY+4Dc9g86Hh50HjeR6rCX+fvH5LG/m9G1uT7VbBxRQCpl0QfcKMn0U6w5FcGZIb/SfdXU8erKalAoPow3kCBZ8bwGc7SdWaBEpxpz4SorcDWn5wso+o/AH8dlY42fv7D81yrk= ci@sapslaj.com";

export function buildAnsibleTraitConfig(
  config: BaseConfigTraitConfig,
  props: ProxmoxVMProps,
): AnsibleTraitConfig {
  const ansibleConfig = typeof config.ansible === "boolean" ? {} : config.ansible ?? {};
  const baseConfig = ansibleConfig.base ?? {};
  const builder = new BaseConfigBuilder(baseConfig);

  if (builder.promtailConfig.scrapeConfigs?.journal !== false) {
    builder.addPromtailScrapeConfig(BaseConfigBuilder.journalPromtailScrapeConfig);
  }

  if (builder.promtailConfig.scrapeConfigs?.syslog !== false) {
    builder.addPromtailScrapeConfig(BaseConfigBuilder.syslogPromtailScrapeConfig);
    builder.rsyslogPromtail = true;
  }

  if (baseConfig.qemuGuest !== false && props.agent?.enabled) {
    builder.qemuGuest = true;
  }

  if (builder.dockerStandalone) {
    if (baseConfig.selfheal !== false) {
      builder.selfHeal = true;
    }
    if (builder.dockerStandaloneConfig.enableSelfheal !== false) {
      builder.dockerStandaloneConfig.enableSelfheal = builder.selfHeal;
    }
    if (baseConfig.rsyncBackup !== false) {
      builder.rsyncBackup = true;
      builder.addRsyncBackupJob({
        src: "/var/docker/volumes",
        dest: "/mnt/exos/volumes/{{ ansible_hostname }}/docker-volumes",
        ...builder.dockerStandaloneConfig.rsyncBackupJob,
      });
    }
    builder.addPromtailScrapeConfig(BaseConfigBuilder.dockerPromtailScrapeConfig);
  }

  if (baseConfig.nasClient !== false && builder.rsyncBackup) {
    builder.nasClient = true;
  }

  const roles = builder.buildRoles();
  const rolePaths = builder.buildRolePaths();

  ansibleConfig?.rolePaths?.forEach((rolePath) => rolePaths.push(rolePath));
  ansibleConfig?.roles?.forEach((role) => roles.push(role));

  return {
    ...ansibleConfig,
    rolePaths,
    roles,
  };
}

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

    if (this.config.ansible !== false) {
      let ansibleConfig = buildAnsibleTraitConfig(this.config, newProps);
      if (!newProps.connectionArgs?.user) {
        newProps.connectionArgs = {
          user: this.distro.username,
          ...newProps.connectionArgs,
        };
      }
      if (ansibleConfig.ansibleInstallCommand === undefined) {
        ansibleConfig.ansibleInstallCommand = this.distro.ansibleInstallCommand;
      }
      newProps.traits.push(
        new AnsibleTrait(`${this.name}-ansible`, ansibleConfig),
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

    return newProps;
  }
}
