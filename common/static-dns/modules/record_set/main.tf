data "external" "ipv6_to_ptr" {
  for_each = toset(var.ipv6_rdns_zone_id == null ? [] : var.v6)

  program = ["python", "${path.module}/ipv6_to_ptr.py"]
  query = {
    ipv6 = each.value
  }
}

locals {
  v4_ptr = var.ipv4_rdns_zone_id == null ? {} : {
    for address in var.v4 : address => join(".", concat(reverse(split(".", address))), ["in-addr", "arpa"])
  }
  v6_ptr = var.ipv6_rdns_zone_id == null ? {} : {
    for address in var.v6 : address => data.external.ipv6_to_ptr[address].result.ptr
  }
}

resource "aws_route53_record" "a" {
  count = (var.zone_id != null && length(var.v4) > 0) ? 1 : 0

  zone_id = var.zone_id
  name    = var.name
  type    = "A"
  ttl     = var.ttl
  records = var.v4
}

resource "aws_route53_record" "aaaa" {
  count = (var.zone_id != null && length(var.v6) > 0) ? 1 : 0

  zone_id = var.zone_id
  name    = var.name
  type    = "AAAA"
  ttl     = var.ttl
  records = var.v6
}

resource "aws_route53_record" "v4_ptr" {
  for_each = local.v4_ptr

  zone_id = var.ipv4_rdns_zone_id
  name    = each.value
  type    = "PTR"
  ttl     = var.ttl
  records = [join("", [var.name, var.rdns_suffix])]
}

resource "aws_route53_record" "v6_ptr" {
  for_each = local.v6_ptr

  zone_id = var.ipv6_rdns_zone_id
  name    = each.value
  type    = "PTR"
  ttl     = var.ttl
  records = [join("", [var.name, var.rdns_suffix])]
}
