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
        forward_lookup_filter = function(endpoint)
          if endpoint.source_properties.dhcp_pool == "LAN_Management" then
            return true
          elseif endpoint.source_properties.dhcp_pool == "LAN_Servers" then
            return not endpoint.hostname == "aqua"
          elseif endpoint.source_properties.dhcp_pool == "LAN_Internal" then
            local allowed_hostnames = {"homeassistant", "darkness", "playboy", "k3sdev", "steamdeck", "megumin"}
            for _, v in pairs(allowed_hostnames) do
              if v == endpoint.hostname then
                return true
              end
            end
          end
          return false
        end,
      },
    },
  },
}
