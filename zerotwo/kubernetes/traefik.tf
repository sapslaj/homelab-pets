resource "kubernetes_namespace_v1" "ingress" {
  metadata {
    name = "ingress"
  }
}

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

resource "helm_release" "traefik" {
  name      = "traefik"
  namespace = kubernetes_namespace_v1.ingress.metadata[0].name

  repository = "https://traefik.github.io/charts"
  chart      = "traefik"
  version    = "20.2.0"

  values = [yamlencode({
    deployment = {
      podAnnotations = {
        "iam.amazonaws.com/role" = aws_iam_role.traefik.arn
      }
      initContainers = [
        {
          name    = "volume-permissions"
          image   = "busybox:1.31.1"
          command = ["sh", "-c", "touch /data/acme.json && chmod -Rv 600 /data/* && chown 65532:65532 /data/acme.json"]
          volumeMounts = [{
            name      = "traefik-data"
            mountPath = "/data"
          }]
        }
      ]
    }
    ingressRoute = {
      dashboard = {
        enabled = false
      }
    }
    providers = {
      kubernetesCRD = {
        allowCrossNamespace       = true
        allowExternalNameServices = true
        allowEmptyServices        = true
      }
      kubernetesIngress = {
        allowExternalNameServices = true
        allowEmptyServices        = true
        publishedService = {
          enabled = true
        }
      }
    }
    logs = {
      general = {
        format = "json"
        level  = "INFO"
      }
      access = {
        enabled = true
        format  = "json"
      }
    }
    metrics = {
      service = {
        enabled = true
      }
      # serviceMonitor = {}
    }
    globalArguments = []
    additionalArguments = [
      "--certificatesresolvers.letsencrypt.acme.dnschallenge.provider=route53",
      "--certificatesresolvers.letsencrypt.acme.storage=/data/acme.json",
      "--providers.kubernetescrd.allowCrossNamespace=true",
    ]
    ports = {
      # web = {
      #   redirectTo = "websecure"
      # }
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
    service = {
      spec = {
        externalTrafficPolicy = "Local"
      }
      ipFamilyPolicy = "PreferDualStack"
    }
    persistence = {
      enabled      = true
      name         = "traefik-data"
      size         = "1Gi"
      storageClass = "nfs"
      accessMode   = "ReadWriteMany"
    }
  })]
}
