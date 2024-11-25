resource "random_password" "oxidized" {
  length  = 16
  special = false
}

module "oxidized_ingress_dns" {
  source = "./modules/ingress_dns"

  name = "oxidized"
}

module "oxidized" {
  source = "./modules/oxidized"

  create_namespace = true
  namespace        = "oxidized"

  enable_ingress = true
  ingress_hosts = [
    "oxidized.sapslaj.xyz",
  ]

  config = {
    username = "oxidized"
    password = random_password.oxidized.result
    output = {
      default = "git"
      git = {
        user  = "Oxidized"
        email = "oxidized@sapslaj.com"
        repo  = "/data/git-repos/oxidized.git"
      }
    }
    source = {
      default = "csv"
      csv = {
        file      = "/config/routers.db"
        delimiter = ":"
        map = {
          name  = 0
          model = 1
        }
      }
    }
  }

  config_files = {
    "routers.db" = join("\n", [
      "yor.sapslaj.xyz:vyatta",
      "daki.sapslaj.xyz:routeros",
      "shiroko.sapslaj.xyz:routeros",
    ])
  }
}
