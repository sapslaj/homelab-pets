terraform {
  backend "remote" {
    hostname     = "app.terraform.io"
    organization = "sapslaj"

    workspaces {
      name = "homelab-pets-common-static-dns"
    }
  }
}

data "aws_route53_zone" "xyz" {
  name         = "sapslaj.xyz."
}

locals {
  xyz_static = {
    aqua = {
      a    = "172.24.4.10"
      aaaa = "2001:470:e022:4::a"
    }
  }
}

resource "aws_route53_record" "xyz_static_a" {
  for_each = { for name, config in local.xyz_static : name => try(config.a) if contains(keys(config), "a") }

  zone_id = data.aws_route53_zone.xyz.zone_id
  name    = each.key
  type    = "A"
  ttl     = "120"
  records = [each.value]
}

resource "aws_route53_record" "xyz_static_aaaa" {
  for_each = { for name, config in local.xyz_static : name => try(config.aaaa) if contains(keys(config), "aaaa") }

  zone_id = data.aws_route53_zone.xyz.zone_id
  name    = each.key
  type    = "AAAA"
  ttl     = "120"
  records = [each.value]
}
