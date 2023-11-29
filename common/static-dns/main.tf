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

module "xyz_static" {
  for_each = {
    rem = {
      a    = "172.24.4.2"
      aaaa = "2001:470:e022:4::2"
    }
    ram = {
      a    = "172.24.4.3"
      aaaa = "2001:470:e022:4::3"
    }
    aqua = {
      a    = "172.24.4.10"
      aaaa = "2001:470:e022:4::a"
    }
    yor = {
      v4 = [
        "172.24.0.0",
        "172.24.1.1",
        "172.24.2.1",
        "172.24.3.1",
        "172.24.4.1",
        "172.24.5.1",
      ]
      v6 = [
        "2001:470:e022:1::1",
        "2001:470:e022:2::1",
        "2001:470:e022:3::1",
        "2001:470:e022:4::1",
        "2001:470:e022:5::1",
      ]
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
  source = "./modules/record_set"

  name              = lookup(each.value, "name", each.key)
  zone_id           = data.aws_route53_zone.xyz.zone_id
  ipv4_rdns_zone_id = aws_route53_zone.rdns_ipv4.zone_id
  ipv6_rdns_zone_id = aws_route53_zone.rdns_ipv6.zone_id
  v4                = try(each.value.v4, [each.value.a], null)
  v6                = try(each.value.v6, [each.value.aaaa], null)
  ttl               = lookup(each.value, "ttl", null)
  rdns_suffix       = lookup(each.value, "rdns_suffix", ".sapslaj.xyz")
}

resource "aws_route53_record" "xyz_cname" {
  for_each = {
    "syslog.sapslaj.xyz" = "koyuki.sapslaj.xyz"
  }

  zone_id = data.aws_route53_zone.xyz.zone_id
  name    = each.key
  type    = "CNAME"
  ttl     = 300
  records = [each.value]
}
