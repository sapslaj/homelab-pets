variable "create_namespace" {
  type    = bool
  default = true
}

variable "namespace" {
  type = string
}

variable "config_files" {
  type = map(string)
}

variable "env" {
  type    = map(string)
  default = {}
}

variable "secrets_env" {
  type = map(object({
    name     = string
    key      = string
    optional = optional(bool)
  }))
  default = {}
}

variable "secrets_env_from" {
  type    = map(string)
  default = {}
}

variable "pod_annotations" {
  type    = map(string)
  default = {}
}

variable "labels" {
  type    = map(string)
  default = {}
}

variable "interval" {
  type    = string
  default = "1m"
}
