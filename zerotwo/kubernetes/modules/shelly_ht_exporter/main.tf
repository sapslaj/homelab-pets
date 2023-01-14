locals {
  namespace = var.namespace
  labels = merge({
    app = "shelly_ht_exporter"
  }, var.labels)
  port  = var.port
  image = join(":", [var.image, var.image_tag])
  pod_annotations = coalesce(var.pod_annotations, {
    "prometheus.io/scrape" = "true"
    "prometheus.io/port"   = tostring(local.port)
  })
  service_monitor_namespace = coalesce(var.service_monitor_namespace, local.namespace)
}

resource "kubernetes_deployment_v1" "this" {
  metadata {
    name      = "shelly-ht-exporter"
    namespace = local.namespace
    labels    = local.labels
  }

  spec {
    replicas = 1

    selector {
      match_labels = local.labels
    }

    template {
      metadata {
        labels      = local.labels
        annotations = local.pod_annotations
      }

      spec {
        container {
          name  = "shelly-ht-exporter"
          image = local.image
          command = [
            "shelly_ht_exporter",
            "--port",
            local.port,
          ]

          port {
            name           = "http"
            container_port = local.port
            protocol       = "TCP"
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "this" {
  metadata {
    name      = "shelly-ht-exporter"
    namespace = local.namespace
    labels    = local.labels
  }

  spec {
    selector = kubernetes_deployment_v1.this.spec[0].template[0].metadata[0].labels

    port {
      name = "http"
      port = local.port
    }
  }
}

resource "kubernetes_manifest" "service_monitor" {
  count = var.enable_service_monitor ? 1 : 0

  manifest = {
    apiVersion = "monitoring.coreos.com/v1"
    kind       = "ServiceMonitor"
    metadata = {
      name      = "shelly-ht-exporter"
      namespace = local.service_monitor_namespace
      labels    = local.labels
    }
    spec = {
      selector = {
        matchLabels = kubernetes_service_v1.this.spec[0].selector
      }
      namespaceSelector = {
        matchNames = [local.namespace]
      }
      endpoints = [{
        port = "http"
      }]
    }
  }
}

resource "kubernetes_ingress_v1" "this" {
  count = var.enable_ingress ? 1 : 0

  metadata {
    name      = "shelly-ht-exporter"
    namespace = local.namespace
    labels    = local.labels
  }

  spec {
    dynamic "rule" {
      for_each = var.ingress_hosts

      content {
        host = rule.value

        http {
          path {
            path = "/"

            backend {
              service {
                name = kubernetes_service_v1.this.metadata[0].name

                port {
                  number = local.port
                }
              }
            }
          }
        }
      }
    }
  }
}
