variable "name" {
  type     = string
  nullable = false
}

variable "zone_id" {
  type     = string
  default  = null
  nullable = true
}

variable "ipv4_rdns_zone_id" {
  type     = string
  default  = null
  nullable = true
}

variable "ipv6_rdns_zone_id" {
  type     = string
  default  = null
  nullable = true
}

variable "v4" {
  type     = string
  default  = null
  nullable = true
}

variable "v6" {
  type     = string
  default  = null
  nullable = true
}

variable "ttl" {
  type     = string
  default  = 120
  nullable = false
}

variable "rdns_suffix" {
  type     = string
  default  = ""
  nullable = false
}
