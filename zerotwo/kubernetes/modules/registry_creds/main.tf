terraform {
  experiments = [module_variable_optional_attrs]
}

resource "kubernetes_namespace_v1" "this" {
  count = var.create_namespace ? 1 : 0

  metadata {
    name   = var.namespace
    labels = var.labels
  }
}

data "aws_caller_identity" "current" {
  count = try(var.ecr.enabled, false) ? 1 : 0
}

locals {
  namespace = var.create_namespace ? kubernetes_namespace_v1.this[0].metadata[0].name : var.namespace
  labels = merge({
    app = "registry-creds"
  }, var.labels)

  common_config_default = {
    existing_secret_key_ref = null
    terraform_state_secret  = false
    value                   = null
  }
  ecr_config = {
    aws_access_key_id = merge(
      local.common_config_default,
      {
        env = "AWS_ACCESS_KEY_ID"
      },
      coalesce(var.ecr.aws_access_key_id, {}),
    )
    aws_secret_access_key = merge(
      local.common_config_default,
      {
        env = "AWS_SECRET_ACCESS_KEY"
      },
      coalesce(var.ecr.aws_secret_access_key, {}),
    )
    aws_account = merge(
      local.common_config_default,
      {
        env = "awsaccount"
      },
      coalesce(var.ecr.aws_account, {
        value = try(data.aws_caller_identity.current[0].account_id, null)
      }),
    )
    aws_region = merge(
      local.common_config_default,
      {
        env = "awsregion"
      },
      coalesce(var.ecr.aws_region, {}),
    )
  }
  config = merge(
    var.ecr.enabled ? local.ecr_config : {},
  )

  terraform_state_secret = {
    for key, value in local.config : key => value if try(value.terraform_state_secret, false)
  }
  pod_annotations = merge(
    try(var.ecr.role_attachment_annotation.pod.arn, null) == null ? {} : {
      "${var.ecr.role_attachment_annotation.pod.arn}" = coalesce(module.iam_role[0].iam_role_arn, var.ecr.role_arn)
    },
    try(var.ecr.role_attachment_annotation.pod.name, null) == null ? {} : {
      "${var.ecr.role_attachment_annotation.pod.name}" = coalesce(module.iam_role[0].iam_role_name, var.ecr.role_name)
    },
  )
  env = {
    for key, value in local.config : key => value.value == null ? {
      name  = value.env
      value = null
      value_from = (
        contains(keys(local.terraform_state_secret), key) ? {
          secret_key_ref = {
            key  = key
            name = try(kubernetes_secret_v1.terraform_state_secret[0].metadata[0].name, null)
          }
          } : try(value.existing_secret_key_ref, null) != null ? {
          secret_key_ref = {
            key  = value.existing_secret_key_ref.key
            name = value.existing_secret_key_ref.name
          }
        } : null
      ),
      } : {
      name       = value.env
      value      = value.value
      value_from = null
    } if contains(keys(value), "env")
  }

  ecr_role_name = try(random_id.iam_role[0].b64_std, var.ecr.role_name, null)
}

resource "random_id" "iam_role" {
  count = try(var.ecr.role_name, null) == null ? 0 : 1

  byte_length = 8
  prefix      = "registry-creds-"
}

module "iam_role" {
  count   = try(var.ecr.create_role, false) ? 1 : 0
  source  = "terraform-aws-modules/iam/aws//modules/iam-assumable-role"
  version = "~> 5.2.0"

  trusted_role_arns     = coalesce(try(var.ecr.trusted_role_arns, null), [])
  trusted_role_services = coalesce(try(var.ecr.trusted_role_services, null), [])

  create_role = true

  role_name         = local.ecr_role_name
  role_requires_mfa = false

  custom_role_policy_arns = [
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
  ]
}

resource "random_password" "terraform_state_secret" {
  for_each = local.terraform_state_secret

  length = 1

  lifecycle {
    ignore_changes = [
      length,
    ]
  }
}

resource "kubernetes_secret_v1" "terraform_state_secret" {
  count = min(length(keys(local.terraform_state_secret)), 1)

  metadata {
    name      = "registry-creds-tfstate"
    namespace = local.namespace
    labels    = local.labels
  }

  data = {
    for key, value in random_password.terraform_state_secret : key => value.result
  }
}

resource "kubernetes_service_account_v1" "this" {
  metadata {
    name      = "registry-creds"
    namespace = local.namespace
    labels    = local.labels
  }
}

resource "kubernetes_cluster_role_v1" "this" {
  metadata {
    name   = "registry-creds"
    labels = local.labels
  }

  rule {
    api_groups = [""]
    resources  = ["namespaces"]
    verbs      = ["list", "watch"]
  }

  rule {
    api_groups = [""]
    resources  = ["secrets"]
    verbs      = ["create", "get", "update"]
  }

  rule {
    api_groups = [""]
    resources  = ["serviceaccounts"]
    verbs      = ["get", "update"]
  }
}

resource "kubernetes_cluster_role_binding_v1" "this" {
  metadata {
    name   = "registry-creds"
    labels = local.labels
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "ClusterRole"
    name      = kubernetes_cluster_role_v1.this.metadata[0].name
  }

  subject {
    kind      = "ServiceAccount"
    name      = kubernetes_service_account_v1.this.metadata[0].name
    namespace = kubernetes_service_account_v1.this.metadata[0].namespace
  }
}

resource "kubernetes_deployment_v1" "controller" {
  metadata {
    name      = "registry-creds"
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
        annotations = local.pod_annotations
      }

      spec {
        service_account_name = kubernetes_service_account_v1.this.metadata[0].name

        container {
          name  = "registry-creds"
          image = "upmcenterprises/registry-creds:1.10"

          dynamic "env" {
            for_each = { for key, value in local.env : key => value if value.value != null || value.value_from != null }
            content {
              name  = env.value.name
              value = env.value.value

              dynamic "value_from" {
                for_each = env.value.value_from == null ? [] : [null]
                content {
                  secret_key_ref {
                    key  = env.value.value_from.secret_key_ref.key
                    name = env.value.value_from.secret_key_ref.name
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
