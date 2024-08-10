resource "kubernetes_namespace_v1" "misc" {
  metadata {
    name = "misc"
  }
}

module "misc_ingress_dns" {
  source = "./modules/ingress_dns/"
  name   = "misc"
}

resource "kubernetes_persistent_volume_claim_v1" "misc" {
  metadata {
    name      = "misc"
    namespace = kubernetes_namespace_v1.misc.metadata[0].name
    labels = {
      "app.kubernetes.io/name" = "misc"
    }
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

resource "kubernetes_deployment_v1" "misc" {
  metadata {
    name      = "misc"
    namespace = kubernetes_namespace_v1.misc.metadata[0].name
    labels = {
      "app.kubernetes.io/name" = "misc"
    }
  }

  spec {
    replicas = 2

    selector {
      match_labels = {
        "app.kubernetes.io/name" = "misc"
      }
    }

    template {
      metadata {
        labels = {
          "app.kubernetes.io/name" = "misc"
        }
      }

      spec {
        volume {
          name = "html"

          persistent_volume_claim {
            claim_name = kubernetes_persistent_volume_claim_v1.misc.metadata[0].name
          }
        }

        container {
          name  = "nginx"
          image = "nginx"

          volume_mount {
            name       = "html"
            mount_path = "/usr/share/nginx/html"
          }

          port {
            container_port = 80
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "misc" {
  metadata {
    name      = "misc"
    namespace = kubernetes_namespace_v1.misc.metadata[0].name
    labels = {
      "app.kubernetes.io/name" = "misc"
    }
  }

  spec {
    selector = kubernetes_deployment_v1.misc.spec[0].template[0].metadata[0].labels

    port {
      port = 80
    }
  }
}

resource "kubernetes_ingress_v1" "misc" {
  metadata {
    name      = "misc"
    namespace = kubernetes_namespace_v1.misc.metadata[0].name
    labels = {
      "app.kubernetes.io/name" = "misc"
    }
  }

  spec {
    rule {
      host = "misc.sapslaj.xyz"

      http {
        path {
          path = "/"

          backend {
            service {
              name = kubernetes_service_v1.misc.metadata[0].name

              port {
                number = 80
              }
            }
          }
        }
      }
    }
  }
}
