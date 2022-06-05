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

variable "enable_ingress" {
  type    = bool
  default = false
}

variable "ingress_hosts" {
  type    = list(string)
  default = []
}
