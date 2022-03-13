resource "aws_route53_record" "prometheus_aaaa" {
  name    = "prometheus"
  ttl     = 300
  type    = "AAAA"
  zone_id = data.aws_route53_zone.sapslaj_xyz.zone_id
  records = local.dns_aaaa_records
}

resource "aws_route53_record" "prometheus_a" {
  name    = "prometheus"
  ttl     = 300
  type    = "A"
  zone_id = data.aws_route53_zone.sapslaj_xyz.zone_id
  records = local.dns_a_records_private
}

resource "helm_release" "prometheus" {
  name = "prometheus"

  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "prometheus"

  values = [yamlencode({
    server = {
      ingress = {
        enabled = true
        hosts   = ["prometheus.sapslaj.xyz"]
      }
    }
  })]
}
