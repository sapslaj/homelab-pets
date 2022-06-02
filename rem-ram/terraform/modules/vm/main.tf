data "terraform_remote_state" "libvirt_platform" {
  backend = "remote"
  config = {
    organization = "sapslaj"
    workspaces = {
      name = "homelab-pets-aqua-libvirt-platform"
    }
  }
}

locals {
  libvirt_platform = data.terraform_remote_state.libvirt_platform.outputs
  cloudinit_network = {
    version = 2
    ethernets = {
      all-en = {
        match = {
          name = "en*"
        }
        dhcp4     = false
        dhcp6     = false
        addresses = var.addresses
        gateway4  = "172.24.4.1"
        gateway6  = "2001:470:e022:4::1"
        nameservers = {
          addresses = [
            "1.1.1.1",
            "1.0.0.1",
          ]
        }
      }
    }
  }
  a_records    = [for a in var.addresses : replace(a, "//.*$/", "") if length(regexall(":", a)) == 0]
  aaaa_records = [for a in var.addresses : replace(a, "//.*$/", "") if length(regexall(":", a)) > 0]
}

module "vm" {
  source  = "sapslaj/standalone-instance/libvirt"
  version = "0.2.0"

  base_volume_id = local.libvirt_platform.ubuntu_20_04_qcow2_id

  name   = var.name
  cpus   = 2
  memory = 1

  cloudinit         = local.libvirt_platform.cloudinit.base
  cloudinit_network = local.cloudinit_network
  network_interface = local.libvirt_platform.networks.bridge
  root_volume = {
    size = 16
  }
}

data "aws_route53_zone" "sapslaj_xyz" {
  name = "sapslaj.xyz"
}

resource "aws_route53_record" "a" {
  name    = var.name
  ttl     = 300
  type    = "A"
  zone_id = data.aws_route53_zone.sapslaj_xyz.zone_id
  records = local.a_records
}

resource "aws_route53_record" "aaaa" {
  name    = var.name
  ttl     = 300
  type    = "AAAA"
  zone_id = data.aws_route53_zone.sapslaj_xyz.zone_id
  records = local.aaaa_records
}
