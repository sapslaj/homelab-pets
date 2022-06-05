module "librenms" {
  source = "./modules/librenms"

  namespace      = "librenms"
  enable_ingress = true
  ingress_hosts  = ["librenms.sapslaj.xyz"]
}

module "librenms_ingress_dns" {
  source = "./modules/ingress_dns"

  name = "librenms"
}
