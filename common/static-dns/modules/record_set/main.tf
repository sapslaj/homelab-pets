data "external" "ipv6_to_ptr" {
  count = (var.ipv6_rdns_zone_id != null && var.v6 != null) ? 1 : 0

  program = ["python", "${path.module}/ipv6_to_ptr.py"]
  query = {
    ipv6 = var.v6
  }
}

resource "aws_route53_record" "a" {
  count = (var.zone_id != null && var.v4 != null) ? 1 : 0

  zone_id = var.zone_id
  name    = var.name
  type    = "A"
  ttl     = var.ttl
  records = [var.v4]
}

resource "aws_route53_record" "aaaa" {
  count = (var.zone_id != null && var.v6 != null) ? 1 : 0

  zone_id = var.zone_id
  name    = var.name
  type    = "AAAA"
  ttl     = var.ttl
  records = [var.v6]
}

resource "aws_route53_record" "v4_ptr" {
  count = (var.ipv4_rdns_zone_id != null && var.v4 != null) ? 1 : 0

  zone_id = var.ipv4_rdns_zone_id
  name    = join(".", concat(reverse(split(".", var.v4))), ["in-addr", "arpa"])
  type    = "PTR"
  ttl     = var.ttl
  records = [join("", [var.name, var.rdns_suffix])]
}

resource "aws_route53_record" "v6_ptr" {
  count = (var.ipv6_rdns_zone_id != null && var.v6 != null) ? 1 : 0

  zone_id = var.ipv6_rdns_zone_id
  name    = data.external.ipv6_to_ptr[0].result.ptr
  type    = "PTR"
  ttl     = var.ttl
  records = [join("", [var.name, var.rdns_suffix])]
}
