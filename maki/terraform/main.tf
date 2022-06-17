terraform {
  required_providers {
    libvirt = {
      source = "dmacvicar/libvirt"
    }
  }

  backend "remote" {
    hostname     = "app.terraform.io"
    organization = "sapslaj"

    workspaces {
      name = "homelab-pets-maki"
    }
  }
}

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
}

module "vm" {
  source  = "sapslaj/standalone-instance/libvirt"
  version = "0.1.0"

  base_volume_id = local.libvirt_platform.ubuntu_20_04_qcow2_id

  name   = "maki"
  cpus   = 4
  memory = 4

  cloudinit = local.libvirt_platform.cloudinit.base
  network_interfaces = {
    vlan4 = local.libvirt_platform.networks.br0_vlan4
    vlan5 = local.libvirt_platform.networks.br0_vlan5
  }
  root_volume = {
    size = 30
  }
}
