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

variable "config" {
  type    = any
  default = {}
}

variable "config_string" {
  type    = string
  default = "{}"
}

variable "config_files" {
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

variable "overwrite_config" {
  type = any
  default = {
    username        = "username"
    password        = "password"
    model           = "junos"
    resolve_dns     = true
    interval        = 3600
    use_syslog      = false
    debug           = false
    threads         = 30
    use_max_threads = false
    timeout         = 20
    retries         = 3
    rest            = "0.0.0.0:8888"
    next_adds_job   = false
    vars            = {}
    groups          = {}
    group_map       = {}
    models          = {}
    pid             = "/run/oxidized.pid"
    crash = {
      directory = "/root/.config/oxidized/crash"
      hostnames = false
    }
    stats = {
      history_size = 10
    }
    input = {
      default = "ssh, telnet"
      debug   = false
      ssh = {
        secure = false
      }
      ftp = {
        passive = true
      }
      utf8_encoded = true
    }
    output = {
      default = "file"
      file = {
        directory = "/data/configs"
      }
    }
    source = {
      default = "csv"
    }
    model_map = {
      cisco   = "ios"
      juniper = "junos"
    }
  }
}
