return {
  sources = {
    vyos = {
      "vyos_ssh",
      config = {
        host = os.getenv("VYOS_HOST"),
        username = os.getenv("VYOS_USERNAME"),
        password = os.getenv("VYOS_PASSWORD"),
      },
    },
  },
  providers = {
    route53 = {
      "aws_route53",
      config = {
        record_suffix = ".sapslaj.xyz",
        forward_zone_id = "Z00048261CEI1B6JY63KT",
        ipv4_reverse_zone_id = "Z00206652RDLR1KV5OQ39",
        ipv6_reverse_zone_id = "Z00734311E53TPLAI5AXC",
      },
    },
  },
}
