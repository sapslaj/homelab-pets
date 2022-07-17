resource "kubernetes_secret_v1" "dockerconfigjson" {
  for_each = toset(var.namespaces)

  metadata {
    name      = var.name
    namespace = each.key
  }

  type = "kubernetes.io/dockerconfigjson"

  data = {
    ".dockerconfigjson" = jsonencode({
      auths = {
        for registry in var.registries : registry => {
          auth = base64encode(var.auth)
        }
      }
    })
  }
}
