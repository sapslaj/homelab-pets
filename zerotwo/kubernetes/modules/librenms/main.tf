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
  app_labels = merge({
    "librenms.sapslaj.com/component" = "app"
  })
  db_labels = merge({
    "librenms.sapslaj.com/component" = "db"
  })
  redis_labels = merge({
    "librenms.sapslaj.com/component" = "redis"
  })
}

resource "kubernetes_stateful_set_v1" "redis" {
  metadata {
    name      = "librenms-redis"
    namespace = local.namespace
    labels    = local.redis_labels
  }

  spec {
    replicas     = 1
    service_name = "librenms-redis"

    selector {
      match_labels = local.redis_labels
    }

    template {
      metadata {
        labels = local.redis_labels
      }

      spec {
        container {
          name  = "redis"
          image = "redis:5.0-alpine"

          port {
            container_port = 6379
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "redis" {
  metadata {
    name      = "librenms-redis"
    namespace = local.namespace
    labels    = local.redis_labels
  }

  spec {
    selector = kubernetes_stateful_set_v1.redis.spec[0].template[0].metadata[0].labels

    port {
      port = 6379
    }
  }
}

resource "random_password" "db" {
  length = 16
}

resource "kubernetes_persistent_volume_claim_v1" "db" {
  metadata {
    name      = "librenms-db"
    namespace = local.namespace
    labels    = local.db_labels
  }

  spec {
    access_modes = ["ReadWriteOnce"]

    resources {
      requests = {
        storage = "4Gi"
      }
    }
  }
}

resource "kubernetes_stateful_set_v1" "db" {
  metadata {
    name      = "librenms-db"
    namespace = local.namespace
    labels    = local.db_labels
  }

  spec {
    replicas     = 1
    service_name = "librenms-db"

    selector {
      match_labels = local.db_labels
    }

    template {
      metadata {
        labels = local.db_labels
      }

      spec {
        volume {
          name = "db"

          persistent_volume_claim {
            claim_name = kubernetes_persistent_volume_claim_v1.db.metadata[0].name
          }
        }
        container {
          name  = "mariadb"
          image = "mariadb:10.5"
          args = [
            "mysqld",
            "--innodb-file-per-table=1",
            "--lower-case-table-names=0",
            "--character-set-server=utf8mb4",
            "--collation-server=utf8mb4_unicode_ci",
          ]

          volume_mount {
            name       = "db"
            mount_path = "/var/lib/mysql"
          }

          env {
            name  = "MYSQL_ALLOW_EMPTY_PASSWORD"
            value = "yes"
          }

          env {
            name  = "MYSQL_DATABASE"
            value = "librenms"
          }

          env {
            name  = "MYSQL_USER"
            value = "librenms"
          }

          env {
            name  = "MYSQL_PASSWORD"
            value = random_password.db.result
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "db" {
  metadata {
    name      = "librenms-db"
    namespace = local.namespace
    labels    = local.db_labels
  }

  spec {
    selector = kubernetes_stateful_set_v1.db.spec[0].template[0].metadata[0].labels

    port {
      port = 3306
    }
  }
}

resource "kubernetes_persistent_volume_claim_v1" "data" {
  metadata {
    name      = "librenms-data"
    namespace = local.namespace
    labels    = local.app_labels
  }

  spec {
    access_modes = ["ReadWriteOnce"]

    resources {
      requests = {
        storage = "4Gi"
      }
    }
  }
}

resource "kubernetes_config_map_v1" "app_env" {
  metadata {
    name      = "librenms-app-env"
    namespace = local.namespace
    labels    = local.app_labels
  }

  data = {
    DB_HOST     = kubernetes_service_v1.db.metadata[0].name
    DB_NAME     = "librenms"
    DB_USER     = "librenms"
    DB_PASSWORD = random_password.db.result
    REDIS_HOST  = kubernetes_service_v1.redis.metadata[0].name
    REDIS_PORT  = "3306"
    REDIS_DB    = "0"
  }
}

resource "kubernetes_stateful_set_v1" "app" {
  metadata {
    name      = "librenms"
    namespace = local.namespace
    labels    = local.app_labels
  }

  spec {
    replicas     = 1
    service_name = "librenms"

    selector {
      match_labels = local.app_labels
    }

    template {
      metadata {
        labels = local.app_labels
      }

      spec {
        volume {
          name = "data"

          persistent_volume_claim {
            claim_name = kubernetes_persistent_volume_claim_v1.data.metadata[0].name
          }
        }

        container {
          name  = "librenms"
          image = "librenms/librenms:latest"

          port {
            container_port = 8000
          }

          env_from {
            config_map_ref {
              name = kubernetes_config_map_v1.app_env.metadata[0].name
            }
          }

          security_context {
            capabilities {
              add = [
                "NET_ADMIN",
                "NET_RAW",
              ]
            }
          }

          volume_mount {
            name       = "data"
            mount_path = "/data"
          }
        }

        container {
          name  = "dispatcher"
          image = "librenms/librenms:latest"

          env {
            name  = "SIDECAR_DISPATCHER"
            value = "1"
          }

          env_from {
            config_map_ref {
              name = kubernetes_config_map_v1.app_env.metadata[0].name
            }
          }

          security_context {
            capabilities {
              add = [
                "NET_ADMIN",
                "NET_RAW",
              ]
            }
          }

          volume_mount {
            name       = "data"
            mount_path = "/data"
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "app" {
  metadata {
    name      = "librenms"
    namespace = local.namespace
    labels    = local.app_labels
  }

  spec {
    selector = kubernetes_stateful_set_v1.app.spec[0].template[0].metadata[0].labels

    port {
      port = 8000
    }
  }
}

resource "kubernetes_ingress_v1" "app" {
  count = var.enable_ingress ? 1 : 0

  metadata {
    name      = "librenms"
    namespace = local.namespace
    labels    = local.app_labels
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
                name = kubernetes_service_v1.app.metadata[0].name

                port {
                  number = 8000
                }
              }
            }
          }
        }
      }
    }
  }
}
