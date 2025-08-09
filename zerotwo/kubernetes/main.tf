terraform {
  backend "s3" {
    region         = "us-east-1"
    bucket         = "sapslaj-tf-state"
    key            = "homelab-pets/zerotwo/kubernetes.tfstate"
    dynamodb_table = "sapslaj-tf-state"
    assume_role = {
      role_arn = "arn:aws:iam::040054058260:role/tf-state"
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
