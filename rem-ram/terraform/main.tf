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
      name = "homelab-pets-rem-ram"
    }
  }
}

module "rem" {
  source = "./modules/vm"

  name = "rem"
  addresses = [
    "172.24.4.2/24",
    "2001:470:e022:4::2/64",
  ]
}
