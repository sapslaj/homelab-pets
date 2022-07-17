variable "create_namespace" {
  type    = bool
  default = true
}

variable "namespace" {
  type = string
}

variable "labels" {
  type    = map(string)
  default = {}
}

variable "ecr" {
  type = object({
    enabled               = optional(bool)
    create_role           = optional(bool)
    role_name             = optional(string)
    role_arn              = optional(string)
    trusted_role_arns     = optional(list(string))
    trusted_role_services = optional(list(string))
    role_attachment_annotation = optional(object({
      pod = optional(object({
        arn  = optional(string)
        name = optional(string)
      }))
    }))
    aws_access_key_id     = optional(any)
    aws_secret_access_key = optional(any)
    aws_account           = optional(any)
    aws_region            = optional(any)
    aws_assume_role       = optional(any)
  })
  default = {
    enabled = false
  }
}
