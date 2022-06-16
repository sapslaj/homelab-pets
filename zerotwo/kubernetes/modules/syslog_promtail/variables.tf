variable "create_namespace" {
  type    = bool
  default = true
}

variable "namespace" {
  type = string
}

variable "labels" {
  type = map(string)
  default = {
    app = "syslog-promtail"
  }
}
