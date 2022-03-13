data "aws_iam_policy_document" "traefik" {
  statement {
    actions   = ["route53:*"]
    resources = ["*"]
  }
}

resource "aws_iam_role" "traefik" {
  name_prefix        = "traefik"
  assume_role_policy = data.aws_iam_policy_document.assume_from_k8s.json

  inline_policy {
    name   = "traefik"
    policy = data.aws_iam_policy_document.traefik.json
  }
}

resource "kubernetes_manifest" "traefik_config" {
  manifest = {
    apiVersion = "helm.cattle.io/v1"
    kind       = "HelmChartConfig"
    metadata = {
      name      = "traefik"
      namespace = "kube-system"
    }
    spec = {
      valuesContent = yamlencode({
        deployment = {
          podAnnotations = {
            "iam.amazonaws.com/role" = aws_iam_role.traefik.arn
          }
        }
        ports = {
          websecure = {
            tls = {
              enabled      = true
              certResolver = "letsencrypt"
              domains = [{
                name = "sapslaj.xyz"
                sans = ["*.sapslaj.xyz"]
              }]
            }
          }
        }
        persistence = {
          enabled = true
          name    = "traefik-data"
          size    = "1Gi"
        }
        additionalArguments = [
          "--certificatesresolvers.letsencrypt.acme.dnschallenge.provider=route53",
          "--certificatesresolvers.letsencrypt.acme.storage=/data/acme.json",
        ]
      })
    }
  }
}
