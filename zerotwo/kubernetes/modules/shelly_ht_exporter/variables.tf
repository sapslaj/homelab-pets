variable "namespace" {
  type = string
}

variable "labels" {
  type    = map(string)
  default = {}
}

variable "pod_annotations" {
  type     = map(string)
  default  = null
  nullable = true
}

variable "port" {
  type    = number
  default = 9439
}

variable "image" {
  type    = string
  default = "ghcr.io/sapslaj/shelly_ht_exporter"
}

variable "image_tag" {
  type    = string
  default = "latest"
}

variable "enable_ingress" {
  type    = bool
  default = false
}

variable "ingress_hosts" {
  type    = list(string)
  default = []
}
