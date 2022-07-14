resource "kubernetes_namespace_v1" "monitoring" {
  metadata {
    name = "monitoring"
  }
}

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
            "eris.sapslaj.xyz:9100",
            "maki.sapslaj.xyz:9100",
            "playboy.sapslaj.xyz:9100",
            "ram.sapslaj.xyz:9100",
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
      {
        job_name = "du"
        static_configs = [{
          targets = [
            "aqua.sapslaj.xyz:9477"
          ]
        }]
      },
      {
        job_name = "libvirt"
        static_configs = [{
          targets = [
            "aqua.sapslaj.xyz:9177"
          ]
        }]
      },
      {
        job_name = "adguard"
        static_configs = [{
          targets = [
            "rem.sapslaj.xyz:9617",
            "ram.sapslaj.xyz:9617",
          ]
        }]
      },
      {
        job_name = "shellyht"
        static_configs = [{
          targets = [
            "darkness.sapslaj.xyz:33333",
          ]
        }]
      },
      {
        job_name        = "librenms"
        scrape_interval = "5m"
        static_configs = [{
          targets = [
            "librenms-prometheus-pushgateway.librenms.svc.cluster.local:9091",
          ]
          labels = {
            job = "librenms"
          }
        }]
        metric_relabel_configs = [{
          source_labels = ["exported_instance"]
          target_label  = "instance"
          }, {
          regex  = "exported_(instance|job)"
          action = "labeldrop"
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

module "loki_ingress_dns" {
  source = "./modules/ingress_dns"
  for_each = toset([
    "loki",
  ])

  name = each.key
}

resource "helm_release" "loki" {
  name      = "loki"
  namespace = kubernetes_namespace_v1.monitoring.metadata[0].name

  repository = "https://grafana.github.io/helm-charts"
  chart      = "loki"

  values = [yamlencode({
    ingress = {
      enabled = true
      hosts = [{
        host  = "loki.sapslaj.xyz"
        paths = ["/"]
      }]
    }
    persistence = {
      enabled          = true
      accessModes      = ["ReadWriteMany"]
      storageClassName = "nfs"
    }
  })]
}

resource "helm_release" "promtail" {
  name      = "promtail"
  namespace = kubernetes_namespace_v1.monitoring.metadata[0].name

  repository = "https://grafana.github.io/helm-charts"
  chart      = "promtail"

  values = [yamlencode({
    config = {
      clients = [{
        url = "http://loki:3100/loki/api/v1/push"
      }]
    }
  })]
}
