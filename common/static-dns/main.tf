terraform {
  backend "remote" {
    hostname     = "app.terraform.io"
    organization = "sapslaj"

    workspaces {
      name = "homelab-pets-common-static-dns"
    }
  }
}

resource "aws_route53_zone" "rdns_ipv4" {
  name = "24.172.in-addr.arpa"
}

resource "aws_route53_zone" "rdns_ipv6" {
  name = "2.2.0.e.0.7.4.0.1.0.0.2.ip6.arpa"
}

data "aws_route53_zone" "xyz" {
  name = "sapslaj.xyz."
}

locals {
  xyz_static = {
    rem = {
      a        = "172.24.4.2"
      aaaa     = "2001:470:e022:4::2"
      ipv6_ptr = "2.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.4.0.0.0.2.2.0.e.0.7.4.0.1.0.0.2.ip6.arpa."
    }
    ram = {
      a        = "172.24.4.3"
      aaaa     = "2001:470:e022:4::3"
      ipv6_ptr = "3.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.4.0.0.0.2.2.0.e.0.7.4.0.1.0.0.2.ip6.arpa."
    }
    aqua = {
      a        = "172.24.4.10"
      aaaa     = "2001:470:e022:4::a"
      ipv6_ptr = "a.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.4.0.0.0.2.2.0.e.0.7.4.0.1.0.0.2.ip6.arpa."
    }
    yor = {
      a = "172.24.0.0"
    }
    daki = {
      a = "172.24.2.2"
    }
    taiga = {
      a = "172.24.2.3"
    }
    pdu1 = {
      a = "172.24.2.4"
    }
    pdu2 = {
      a = "172.24.2.5"
    }
    ups1 = {
      a = "172.24.2.6"
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

resource "aws_route53_record" "xyz_static_ipv4_ptr" {
  for_each = { for name, config in local.xyz_static : name => try(config.a) if contains(keys(config), "a") }

  zone_id = aws_route53_zone.rdns_ipv4.zone_id
  name    = join(".", reverse(split(".", replace(each.value, "172.24.", ""))))
  type    = "PTR"
  ttl     = "120"
  records = ["${each.key}.sapslaj.xyz"]
}

resource "aws_route53_record" "xyz_static_ipv6_ptr" {
  for_each = { for name, config in local.xyz_static : name => try(config.ipv6_ptr) if contains(keys(config), "ipv6_ptr") }

  zone_id = aws_route53_zone.rdns_ipv6.zone_id
  name    = each.value
  type    = "PTR"
  ttl     = "120"
  records = ["${each.key}.sapslaj.xyz"]
}
