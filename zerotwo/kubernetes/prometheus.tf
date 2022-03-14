module "prometheus_ingress_dns" {
  source = "./modules/ingress_dns"
  for_each = toset([
    "prometheus",
  ])

  name = each.key
}

moved {
  from = aws_route53_record.prometheus_aaaa
  to   = module.prometheus_ingress_dns["prometheus"].aws_route53_record.aaaa
}

moved {
  from = aws_route53_record.prometheus_a
  to   = module.prometheus_ingress_dns["prometheus"].aws_route53_record.a
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
