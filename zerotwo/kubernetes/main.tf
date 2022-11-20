terraform {
  backend "remote" {
    hostname     = "app.terraform.io"
    organization = "sapslaj"

    workspaces {
      name = "homelab-pets-zerotwo-kubernetes"
    }
  }
}

provider "kubectl" {
  config_path    = "~/.kube/config"
  config_context = "zerotwo"
}

provider "kubernetes" {
  config_path    = "~/.kube/config"
  config_context = "zerotwo"
}

provider "helm" {
  kubernetes {
    config_path    = "~/.kube/config"
    config_context = "zerotwo"
  }
}
