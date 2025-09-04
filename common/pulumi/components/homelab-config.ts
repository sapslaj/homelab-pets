export interface IDistro {
  url: string;
  username: string;
}

export class Distro implements IDistro {
  static UBUNTU_24_04 = new Distro({
    // url: "https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img",
    // url: "https://misc.sapslaj.xyz/cloudimages/ubuntu/noble-server-cloudimg-amd64.img",
    url: "https://misc.sapslaj.xyz/cloudimages/ubuntu/noble-server-sapslaj-amd64.img",
    username: "ubuntu",
  });

  static UBUNTU_NOBLE = Distro.UBUNTU_24_04;

  static DEBIAN_12 = new Distro({
    // url: "https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2",
    url: "https://misc.sapslaj.xyz/cloudimages/debian/debian-12-genericcloud-amd64.qcow2",
    username: "debian",
  });

  static DEBIAN_BOOKWORM = Distro.DEBIAN_12;

  static ALPINE_3_21_2 = new Distro({
    // url: "https://dl-cdn.alpinelinux.org/alpine/v3.21/releases/cloud/nocloud_alpine-3.21.2-x86_64-bios-tiny-r0.qcow2",
    url: "https://misc.sapslaj.xyz/cloudimages/alpine/nocloud_alpine-3.21.2-x86_64-bios-tiny-r0.qcow2",
    username: "alpine",
  });

  static ALPINE_3_21 = Distro.ALPINE_3_21_2;
  static ALPINE_3 = Distro.ALPINE_3_21;

  static ROCKY_LINUX_10 = new Distro({
    // url: "https://dl.rockylinux.org/pub/rocky/10/images/x86_64/Rocky-10-GenericCloud-Base.latest.x86_64.qcow2",
    url: "https://misc.sapslaj.xyz/cloudimages/rocky/Rocky-10-GenericCloud-Base.latest.x86_64.qcow2",
    username: "rocky",
  });

  url: string;
  username: string;

  constructor(distro: IDistro) {
    this.url = distro.url;
    this.username = distro.username;
  }
}

export enum VLAN {
  NATIVE = 1,
  MANAGEMENT = 2,
  JAIL = 3,
  SERVERS = 4,
  INTERNAL = 5,
}
