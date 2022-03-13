terraform {
  backend "remote" {
    hostname     = "app.terraform.io"
    organization = "sapslaj"

    workspaces {
      name = "homelab-pets-zerotwo-kubernetes"
    }
  }
}

provider "kubernetes" {
  config_path = "~/.kube/config"
}

provider "helm" {
  kubernetes {
    config_path = "~/.kube/config"
  }
}

data "aws_route53_zone" "sapslaj_xyz" {
  name = "sapslaj.xyz"
}

data "dns_a_record_set" "homelab" {
  host = "homelab.sapslaj.com"
}

locals {
  dns_a_records         = data.dns_a_record_set.homelab.addrs
  dns_a_records_private = ["172.24.4.15"]
  dns_aaaa_records      = ["2001:470:e022:4:5054:ff:feea:5416"]
}
