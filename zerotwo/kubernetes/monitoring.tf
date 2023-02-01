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
    "shelly-ht-report",
    "victoria-metrics",
  ])

  name = each.key
}

resource "random_password" "hass_token" {
  length = 1

  lifecycle {
    ignore_changes = [
      length,
    ]
  }
}

resource "kubernetes_secret_v1" "hass_token" {
  metadata {
    name      = "hass-token"
    namespace = kubernetes_namespace_v1.monitoring.metadata[0].name
  }

  data = {
    HASS_TOKEN = random_password.hass_token.result
  }
}

resource "helm_release" "prometheus" {
  name      = "prometheus"
  namespace = kubernetes_namespace_v1.monitoring.metadata[0].name
  version   = "15.18.0"

  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "prometheus"

  values = [yamlencode({
    alertmanager = {
      ingress = {
        enabled = true
        hosts   = ["alertmanager.sapslaj.xyz"]
      }
      persistentVolume = {
        enabled      = true
        accessModes  = ["ReadWriteMany"]
        storageClass = "nfs"
      }
    }
    pushgateway = {
      persistentVolume = {
        enabled      = true
        accessModes  = ["ReadWriteMany"]
        storageClass = "nfs"
      }
    }
    server = {
      extraFlags = [
        "web.enable-lifecycle",
        "web.enable-admin-api",
      ]
      retention = "400d"
      ingress = {
        enabled = true
        hosts   = ["prometheus.sapslaj.xyz"]
      }
      statefulSet = {
        enabled = true
      }
      persistentVolume = {
        enabled      = true
        accessModes  = ["ReadWriteMany"]
        storageClass = "nfs"
      }
    }
    extraScrapeConfigs = yamlencode([
      {
        job_name = "prometheus_remote"
        static_configs = [{
          targets = [
            # "prometheus.direct.sapslaj.cloud:9090",
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
      {
        job_name     = "homeassistant"
        metrics_path = "/api/prometheus"
        bearer_token = random_password.hass_token.result
        static_configs = [{
          targets = [
            "homeassistant.sapslaj.xyz:8123",
          ]
        }]
      }
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
    serverFiles = {
      "alerting_rules.yml" = {
        groups = flatten(
          [
            for f in fileset(path.module, "prometheus_files/alert_rules/*.yml") :
            yamldecode(
              file(f)
            )["groups"]
          ]
        )
      }
    }
  })]
}

resource "helm_release" "prometheus_operator_crds" {
  name      = "prometheus-operator-crds"
  namespace = kubernetes_namespace_v1.monitoring.metadata[0].name

  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "prometheus-operator-crds"
}

resource "helm_release" "victoria_metrics" {
  name      = "victoria-metrics"
  namespace = kubernetes_namespace_v1.monitoring.metadata[0].name

  repository = "https://victoriametrics.github.io/helm-charts"
  chart      = "victoria-metrics-k8s-stack"

  values = [
    yamlencode({
      fullnameOverride = "victoria-metrics"
    }),
    yamlencode({
      victoria-metrics-operator = {
        rbac = {
          pspEnabled = false
        }
        operator = {
          disable_prometheus_converter = false
        }
      }
    }),
    yamlencode({
      vmsingle = {
        spec = {
          retentionPeriod = "100y"
          extraArgs = {
            "search.maxConcurrentRequests" = "4"
          }
          storage = {
            accessModes      = ["ReadWriteMany"]
            storageClassName = "nfs"
          }
        }
        ingress = {
          enabled = true
          hosts   = ["victoria-metrics.sapslaj.xyz"]
        }
      }
    }),
    yamlencode({
      grafana = {
        enabled = false
      }
    }),
    yamlencode({
      prometheus-node-exporter = {
        service = {
          # TODO: consolidate with node-exporter from prometheus installation
          port       = 9099
          targetPort = 9099
        }
      }
    }),
    yamlencode({
      alertmanager = {
        config = {
          route = {
            receiver = "opsgenie"
            group_by = [
              "alertname",
              "instance",
            ]
          }
          receivers = [{
            name = "opsgenie"
            opsgenie_configs = [{
              api_key = "d947cc27-398b-462d-bc15-fc9176f1641e"
            }]
          }]
        }
      }
    }),
  ]
}

resource "kubernetes_manifest" "static_scrape_node_exporter" {
  manifest = {
    apiVersion = "operator.victoriametrics.com/v1beta1"
    kind       = "VMStaticScrape"
    metadata = {
      name      = "node-exporter"
      namespace = kubernetes_namespace_v1.monitoring.metadata[0].name
    }
    spec = {
      jobName = "node_exporter"
      targetEndpoints = [{
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
    }
  }
}

resource "kubernetes_manifest" "static_scrape_standalone_docker" {
  manifest = {
    apiVersion = "operator.victoriametrics.com/v1beta1"
    kind       = "VMStaticScrape"
    metadata = {
      name      = "standalone-docker"
      namespace = kubernetes_namespace_v1.monitoring.metadata[0].name
    }
    spec = {
      jobName = "standalone_docker"
      targetEndpoints = [{
        targets = [
          "maki.sapslaj.xyz:9323",
          "eris.sapslaj.xyz:9323",
        ]
      }]
    }
  }
}

resource "kubernetes_manifest" "static_scrape_standalone_docker_cadvisor" {
  manifest = {
    apiVersion = "operator.victoriametrics.com/v1beta1"
    kind       = "VMStaticScrape"
    metadata = {
      name      = "standalone-docker-cadvisor"
      namespace = kubernetes_namespace_v1.monitoring.metadata[0].name
    }
    spec = {
      jobName = "standalone_docker"
      targetEndpoints = [{
        targets = [
          "maki.sapslaj.xyz:9338",
          "eris.sapslaj.xyz:9338",
        ]
      }]
    }
  }
}

resource "kubernetes_manifest" "static_scrape_du" {
  manifest = {
    apiVersion = "operator.victoriametrics.com/v1beta1"
    kind       = "VMStaticScrape"
    metadata = {
      name      = "du"
      namespace = kubernetes_namespace_v1.monitoring.metadata[0].name
    }
    spec = {
      jobName = "du"
      targetEndpoints = [{
        targets = [
          "aqua.sapslaj.xyz:9477",
        ]
      }]
    }
  }
}

resource "kubernetes_manifest" "static_scrape_libvirt" {
  manifest = {
    apiVersion = "operator.victoriametrics.com/v1beta1"
    kind       = "VMStaticScrape"
    metadata = {
      name      = "libvirt"
      namespace = kubernetes_namespace_v1.monitoring.metadata[0].name
    }
    spec = {
      jobName = "libvirt"
      targetEndpoints = [{
        targets = [
          "aqua.sapslaj.xyz:9177",
        ]
      }]
    }
  }
}

resource "kubernetes_manifest" "static_scrape_qbittorrent" {
  manifest = {
    apiVersion = "operator.victoriametrics.com/v1beta1"
    kind       = "VMStaticScrape"
    metadata = {
      name      = "qbittorrent"
      namespace = kubernetes_namespace_v1.monitoring.metadata[0].name
    }
    spec = {
      jobName = "qbittorrent"
      targetEndpoints = [{
        scrapeTimeout = "1m"
        targets = [
          "eris.sapslaj.xyz:9365",
        ]
      }]
    }
  }
}

resource "kubernetes_manifest" "static_scrape_adguard" {
  manifest = {
    apiVersion = "operator.victoriametrics.com/v1beta1"
    kind       = "VMStaticScrape"
    metadata = {
      name      = "adguard"
      namespace = kubernetes_namespace_v1.monitoring.metadata[0].name
    }
    spec = {
      jobName = "adguard"
      targetEndpoints = [{
        targets = [
          "rem.sapslaj.xyz:9617",
          "ram.sapslaj.xyz:9617",
        ]
      }]
    }
  }
}

resource "kubernetes_manifest" "static_scrape_homeassistant" {
  manifest = {
    apiVersion = "operator.victoriametrics.com/v1beta1"
    kind       = "VMStaticScrape"
    metadata = {
      name      = "homeassistant"
      namespace = kubernetes_namespace_v1.monitoring.metadata[0].name
    }
    spec = {
      jobName = "homeassistant"
      targetEndpoints = [{
        path = "/api/prometheus"
        bearerTokenSecret = {
          name = kubernetes_secret_v1.hass_token.metadata[0].name
          key  = "HASS_TOKEN"
        }
        targets = [
          "homeassistant.sapslaj.xyz:8123",
        ]
      }]
    }
  }
}

module "shelly_ht_exporter" {
  source = "./modules/shelly_ht_exporter"

  namespace      = kubernetes_namespace_v1.monitoring.metadata[0].name
  enable_ingress = true
  ingress_hosts = [
    "shelly-ht-report.sapslaj.xyz",
  ]
  enable_service_monitor = true
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
  version    = "3.10.0"

  values = [
    yamlencode({
      loki = {
        auth_enabled = false
        commonConfig = {
          replication_factor = 1
        }
        storage = {
          type = "filesystem"
        }
        analytics = {
          reporting_enabled = false
        }
      }
    }),
    yamlencode({
      singleBinary = {
        podAnnotations = {
          "prometheus.io/scrape" = "true"
          "prometheus.io/port"   = "3100"
        }
        resources = {
          limits = {
            memory = "2G"
          }
        }
        affinity = null
        persistence = {
          storageClass = "nfs"
        }
      }
    }),
    yamlencode({
      ingress = {
        enabled = true
        hosts   = ["loki.sapslaj.xyz"]
      }
    }),
    yamlencode({
      test = {
        enabled = false
      }
    }),
    yamlencode({
      monitoring = {
        dashboards = {
          enabled = false
        }
        selfMonitoring = {
          enabled = false
          grafanaAgent = {
            installOperator = false
          }
        }
        lokiCanary = {
          enabled = false
        }
      }
    }),
  ]
}

resource "helm_release" "promtail" {
  name      = "promtail"
  namespace = kubernetes_namespace_v1.monitoring.metadata[0].name

  repository = "https://grafana.github.io/helm-charts"
  chart      = "promtail"
  version    = "6.8.1"

  values = [
    yamlencode({
      podAnnotations = {
        "prometheus.io/scrape" = "true"
        "prometheus.io/port"   = "3101"
      }
    }),
    yamlencode({
      serviceMonitor = {
        enabled = true
      }
    }),
    yamlencode({
      config = {
        clients = [{
          url = "http://loki:3100/loki/api/v1/push"
        }]
      }
    })
  ]
}
