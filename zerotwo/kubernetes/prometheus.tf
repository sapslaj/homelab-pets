module "prometheus_ingress_dns" {
  source = "./modules/ingress_dns"
  for_each = toset([
    "alertmanager",
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
    alertmanager = {
      ingress = {
        enabled = true
        hosts   = ["alertmanager.sapslaj.xyz"]
      }
    }
    server = {
      retention = "400d"
      ingress = {
        enabled = true
        hosts   = ["prometheus.sapslaj.xyz"]
      }
      statefulSet = {
        enabled = true
      }
    }
    extraScrapeConfigs = yamlencode([
      {
        job_name = "prometheus_remote"
        static_configs = [{
          targets = [
            "prometheus.direct.sapslaj.cloud:9090",
          ]
        }]
      },
      {
        job_name = "node_exporter"
        static_configs = [{
          targets = [
            "mems.homelab.sapslaj.com:9100",
            "playboy.homelab.sapslaj.com:9100",
            "aqua.homelab.sapslaj.com:9100",
            "rem.homelab.sapslaj.com:9100",
            "tohru.homelab.sapslaj.com:9100",
          ]
        }]
      },
      {
        job_name = "du_spank_bank"
        static_configs = [{
          targets = [
            "mems.homelab.sapslaj.com:9477",
          ]
        }]
      },
    ])
    alertmanagerFiles = {
      "alertmanager.yml" = {
        receivers = [{
          name = "opsgenie"
          opsgenie_configs = [{
            api_key = "d947cc27-398b-462d-bc15-fc9176f1641e"
          }]
        }]
        route = {
          receiver = "opsgenie"
          group_by = [
            "alertname",
            "instance",
          ]
        }
      }
    }
  })]
}
