resource "kubernetes_namespace_v1" "zonepop" {
  metadata {
    name = "zonepop"
  }
}

resource "random_password" "zonepop_vyos_password" {
  length = 1

  lifecycle {
    ignore_changes = [
      length,
    ]
  }
}

resource "kubernetes_secret_v1" "zonepop_credentials" {
  metadata {
    name      = "zonepop-credentials"
    namespace = kubernetes_namespace_v1.zonepop.metadata[0].name
  }

  data = {
    VYOS_HOST     = "yor.sapslaj.xyz"
    VYOS_USERNAME = "vsdd"
    VYOS_PASSWORD = random_password.zonepop_vyos_password.result
  }
}

data "aws_iam_policy_document" "zonepop" {
  statement {
    actions   = ["route53:*"]
    resources = ["*"]
  }
}

resource "aws_iam_role" "zonepop" {
  name_prefix        = "zonepop"
  assume_role_policy = data.aws_iam_policy_document.assume_from_k8s.json

  inline_policy {
    name   = "zonepop"
    policy = data.aws_iam_policy_document.zonepop.json
  }
}

module "zonepop" {
  source = "./modules/zonepop"

  create_namespace = false
  namespace        = kubernetes_namespace_v1.zonepop.metadata[0].name

  interval = "5m"

  config_files = {
    for f in fileset("${path.module}/zonepop_config", "*") : f => file("${path.module}/zonepop_config/${f}")
  }
  pod_annotations = {
    "iam.amazonaws.com/role" = aws_iam_role.zonepop.arn
  }
  secrets_env_from = {
    credentials = kubernetes_secret_v1.zonepop_credentials.metadata[0].name
  }
  env = {
    AWS_REGION = "us-east-1"
  }
}
