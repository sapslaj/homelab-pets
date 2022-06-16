resource "kubernetes_namespace_v1" "this" {
  count = var.create_namespace ? 1 : 0

  metadata {
    name   = var.namespace
    labels = var.labels
  }
}

locals {
  labels    = var.labels
  namespace = var.create_namespace ? kubernetes_namespace_v1.this[0].metadata[0].name : var.namespace
}

resource "kubernetes_config_map_v1" "syslog_ng_config" {
  metadata {
    name      = "syslog-promtail-syslog-ng-config"
    namespace = local.namespace
    labels    = local.labels
  }

  data = {
    "syslog-ng.conf" = file("${path.module}/syslog-ng.conf")
  }
}

resource "kubernetes_config_map_v1" "promtail_config" {
  metadata {
    name      = "syslog-promtail-promtail-config"
    namespace = local.namespace
    labels    = local.labels
  }

  data = {
    "promtail.yaml" = file("${path.module}/promtail.yaml")
  }
}

resource "kubernetes_deployment_v1" "this" {
  metadata {
    name      = "syslog-promtail"
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
          name = "syslog-ng-config"

          config_map {
            name = kubernetes_config_map_v1.syslog_ng_config.metadata[0].name
          }
        }

        volume {
          name = "promtail-config"

          config_map {
            name = kubernetes_config_map_v1.promtail_config.metadata[0].name
          }
        }

        container {
          name  = "syslog-ng"
          image = "lscr.io/linuxserver/syslog-ng"

          volume_mount {
            name       = "syslog-ng-config"
            mount_path = "/defaults/syslog-ng.conf"
            sub_path   = "syslog-ng.conf"
          }

          port {
            name           = "syslog-tcp"
            container_port = 6601
            protocol       = "TCP"
            host_port      = 6601
          }

          port {
            name           = "syslog-udp"
            container_port = 5514
            protocol       = "UDP"
            host_port      = 5514
          }
        }

        container {
          name  = "promtail"
          image = "grafana/promtail"
          args = [
            "-config.file=/etc/promtail/promtail.yaml"
          ]

          volume_mount {
            name       = "promtail-config"
            mount_path = "/etc/promtail"
          }

          port {
            name           = "promtail-syslog"
            container_port = 1514
            protocol       = "TCP"
          }

          port {
            name           = "promtail-http"
            container_port = 9080
            protocol       = "TCP"
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "syslog" {
  metadata {
    name      = "syslog-promtail-syslog"
    namespace = local.namespace
    labels    = local.labels
  }

  spec {
    selector = kubernetes_deployment_v1.this.spec[0].template[0].metadata[0].labels
    type     = "NodePort"

    port {
      name        = "syslog-tcp"
      target_port = 6601
      port        = 6601
      protocol    = "TCP"
    }

    port {
      name        = "syslog-udp"
      target_port = 5514
      port        = 5514
      protocol    = "UDP"
    }
  }
}
