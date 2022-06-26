resource "kubernetes_namespace_v1" "this" {
  count = var.create_namespace ? 1 : 0

  metadata {
    name   = var.namespace
    labels = var.labels
  }
}

data "utils_deep_merge_yaml" "config" {
  input = [
    yamlencode(var.overwrite_config),
    yamlencode(var.config),
    var.config_string,
  ]
}

locals {
  labels = merge({
    app = "oxidized"
  }, var.labels)
  namespace = var.create_namespace ? kubernetes_namespace_v1.this[0].metadata[0].name : var.namespace
  config    = data.utils_deep_merge_yaml.config.output
  config_files = merge({
    "config" = local.config
  }, var.config_files)
}

resource "kubernetes_persistent_volume_claim_v1" "data" {
  metadata {
    name      = "oxidized-data"
    namespace = local.namespace
    labels    = local.labels
  }

  spec {
    storage_class_name = "nfs"
    access_modes       = ["ReadWriteMany"]

    resources {
      requests = {
        storage = "4Gi"
      }
    }
  }
}

resource "kubernetes_config_map_v1" "config" {
  metadata {
    name      = "oxidized-config"
    namespace = local.namespace
    labels    = local.labels
  }

  data = local.config_files
}

resource "kubernetes_deployment_v1" "this" {
  metadata {
    name      = "oxidized"
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
        volume {
          name = "data"

          persistent_volume_claim {
            claim_name = kubernetes_persistent_volume_claim_v1.data.metadata[0].name
          }
        }

        volume {
          name = "config"

          config_map {
            name = kubernetes_config_map_v1.config.metadata[0].name
          }
        }

        volume {
          name = "logs"

          empty_dir {}
        }

        volume {
          name = "crashes"

          empty_dir {}
        }

        container {
          name  = "oxidized"
          image = "oxidized/oxidized:latest"
          args = [
            "oxidized",
            "-d",
          ]

          volume_mount {
            name       = "data"
            mount_path = "/data"
          }

          volume_mount {
            name       = "config"
            mount_path = "/config"
          }

          volume_mount {
            name       = "logs"
            mount_path = "/logs"
          }

          port {
            name           = "http"
            container_port = 8888
            protocol       = "TCP"
          }

          env {
            name  = "OXIDIZED_HOME"
            value = "/config"
          }

          env {
            name  = "OXIDIZED_LOGS"
            value = "/logs"
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "this" {
  metadata {
    name      = "oxidized"
    namespace = local.namespace
    labels    = local.labels
  }

  spec {
    selector = kubernetes_deployment_v1.this.spec[0].template[0].metadata[0].labels

    port {
      port = 8888
    }
  }
}

resource "kubernetes_ingress_v1" "this" {
  count = var.enable_ingress ? 1 : 0

  metadata {
    name      = "oxidized"
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
                  number = 8888
                }
              }
            }
          }
        }
      }
    }
  }
}
