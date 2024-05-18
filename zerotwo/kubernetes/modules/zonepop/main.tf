resource "kubernetes_namespace_v1" "this" {
  count = var.create_namespace ? 1 : 0

  metadata {
    name   = var.namespace
    labels = var.labels
  }
}

locals {
  labels = merge({
    app = "zonepop"
  }, var.labels)
  namespace = var.create_namespace ? kubernetes_namespace_v1.this[0].metadata[0].name : var.namespace
  service_monitor_namespace = coalesce(var.service_monitor_namespace, local.namespace)

  config_files = var.config_files
}

resource "kubernetes_config_map_v1" "config" {
  metadata {
    name      = "zonepop-config"
    namespace = local.namespace
    labels    = local.labels
  }

  data = local.config_files
}

resource "kubernetes_deployment_v1" "this" {
  metadata {
    name      = "zonepop"
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
        annotations = var.pod_annotations
      }

      spec {
        volume {
          name = "config"

          config_map {
            name = kubernetes_config_map_v1.config.metadata[0].name
          }
        }

        container {
          name  = "zonepop"
          image = "ghcr.io/sapslaj/zonepop:latest"
          command = [
            "/bin/zonepop",
            "-interval",
            var.interval,
            "-config-file",
            "/etc/zonepop/config.lua",
          ]

          volume_mount {
            name       = "config"
            mount_path = "/etc/zonepop"
          }

          port {
            name           = "http"
            container_port = 9412
            protocol       = "TCP"
          }

          env {
            name  = "CONFIG_HASH"
            value = md5(jsonencode(kubernetes_config_map_v1.config.data))
          }

          dynamic "env" {
            for_each = var.env

            content {
              name  = env.key
              value = env.value
            }
          }

          dynamic "env" {
            for_each = var.secrets_env

            content {
              name = env.key

              secret_key_ref {
                name     = env.value.name
                key      = env.value.key
                optional = env.value.optional
              }
            }
          }

          dynamic "env_from" {
            for_each = var.secrets_env_from

            content {
              secret_ref {
                name = env_from.value
              }
            }
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "this" {
  metadata {
    name      = "zonepop"
    namespace = local.namespace
    labels    = local.labels
  }

  spec {
    selector = kubernetes_deployment_v1.this.spec[0].selector[0].match_labels

    port {
      name = "http"
      port = 9412
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
