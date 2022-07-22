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
        labels = local.labels

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
      port = local.port
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
