data "aws_route53_zone" "sapslaj_xyz" {
  name = "sapslaj.xyz"
}

resource "aws_route53_record" "cname" {
  name    = var.name
  ttl     = 300
  type    = "CNAME"
  zone_id = data.aws_route53_zone.sapslaj_xyz.zone_id
  records = ["zerotwo.sapslaj.xyz."]
}
