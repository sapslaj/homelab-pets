terraform {
  backend "remote" {
    hostname     = "app.terraform.io"
    organization = "sapslaj"

    workspaces {
      name = "homelab-pets-zerotwo-system"
    }
  }

  required_providers {
    libvirt = {
      source = "dmacvicar/libvirt"
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
  version = "~> 0.4"

  base_volume_id = local.libvirt_platform.ubuntu_20_04_qcow2_id

  name   = "zerotwo"
  cpus   = 4
  memory = 6

  cloudinit         = local.libvirt_platform.cloudinit.base
  network_interface = local.libvirt_platform.networks.br0_vlan4
  root_volume = {
    attachment = "file"
    size       = 30
  }
}
