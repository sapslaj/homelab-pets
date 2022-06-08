module "prometheus_ingress_dns" {
  source = "./modules/ingress_dns"
  for_each = toset([
    "alertmanager",
    "prometheus",
  ])

  name = each.key
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
            "aqua.sapslaj.xyz:9100",
            "maki.sapslaj.xyz:9100",
            "playboy.sapslaj.xyz:9100",
            "rem.sapslaj.xyz:9100",
            "tohru.sapslaj.xyz:9100",
          ]
        }]
      },
      {
        job_name = "standalone_docker"
        static_configs = [{
          targets = [
            "maki.sapslaj.xyz:9323"
          ]
        }]
      },
      {
        job_name = "standalone_docker_cadvisor"
        static_configs = [{
          targets = [
            "maki.sapslaj.xyz:9338"
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
