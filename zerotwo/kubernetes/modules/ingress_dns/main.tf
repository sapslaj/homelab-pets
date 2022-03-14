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

resource "aws_route53_record" "aaaa" {
  name    = var.name
  ttl     = 300
  type    = "AAAA"
  zone_id = data.aws_route53_zone.sapslaj_xyz.zone_id
  records = local.dns_aaaa_records
}

resource "aws_route53_record" "a" {
  name    = var.name
  ttl     = 300
  type    = "A"
  zone_id = data.aws_route53_zone.sapslaj_xyz.zone_id
  records = local.dns_a_records_private
}
