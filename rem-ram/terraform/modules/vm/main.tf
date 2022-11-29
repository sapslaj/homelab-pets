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
}

module "vm" {
  source  = "sapslaj/standalone-instance/libvirt"
  version = "~> 0.4"

  base_volume_id = local.libvirt_platform.ubuntu_20_04_qcow2_id

  name   = var.name
  cpus   = 2
  memory = 1

  cloudinit         = local.libvirt_platform.cloudinit.base
  cloudinit_network = local.cloudinit_network
  network_interface = local.libvirt_platform.networks.br0_vlan4
  root_volume = {
    attachment = "file"
    size       = 16
  }
}
