variable "auth" {
  type      = string
  sensitive = true
}

variable "name" {
  type    = string
  default = "ghcr"
}

variable "namespaces" {
  type = list(string)
  default = [
    "default",
  ]
}

variable "registries" {
  type = list(string)
  default = [
    "ghcr.io",
  ]
}
