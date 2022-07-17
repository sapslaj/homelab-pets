# module "registry_creds" {
#   source = "./modules/registry_creds"

#   create_namespace = false
#   namespace        = "kube-system"

#   ecr = {
#     enabled           = true
#     create_role       = true
#     trusted_role_arns = [aws_iam_user.kube2iam.arn]
#     role_attachment_annotation = {
#       pod = {
#         arn = "iam.amazonaws.com/role"
#       }
#     }
#   }
# }

resource "random_password" "ghcr_creds" {
  length = 1

  lifecycle {
    ignore_changes = [
      length,
    ]
  }
}

module "ghcr_creds" {
  source = "./modules/ghcr_creds"

  auth = random_password.ghcr_creds.result
}
