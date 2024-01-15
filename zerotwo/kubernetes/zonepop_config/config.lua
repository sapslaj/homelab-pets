local log = require("log")
return {
  sources = {
    vyos = {
      "vyos_ssh",
      config = {
        host = os.getenv("VYOS_HOST"),
        username = os.getenv("VYOS_USERNAME"),
        password = os.getenv("VYOS_PASSWORD"),
        record_ttl = 300,
        collect_ipv6_neighbors = true,
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
        clean_ipv4_reverse_zone = true,
        clean_ipv6_reverse_zone = true,
        forward_lookup_filter = function(endpoint)
          local log_labels = {
            filter_direction = "forward",
            hostname = endpoint.hostname,
            dhcp_pool = endpoint.source_properties.dhcp_pool,
          }
          if endpoint.source_properties.dhcp_pool == "LAN_Management" then
            log.info("endpoint is in LAN_Management, allowing", log_labels)
            return true
          elseif endpoint.source_properties.dhcp_pool == "LAN_Servers" then
            local skip_hostnames = {"aqua"}
            for _, v in pairs(skip_hostnames) do
              if v == endpoint.hostname then
                log.info("endpoint is in LAN_Servers and should be skipped", log_labels)
                return false
              end
            end
            log.info("endpoint is in LAN_Servers", log_labels)
            return true
          elseif endpoint.source_properties.dhcp_pool == "LAN_Internal" then
            local allowed_hostnames = {"homeassistant", "darkness", "playboy", "k3sdev", "steamdeck", "megumin", "silverwolf"}
            for _, v in pairs(allowed_hostnames) do
              if v == endpoint.hostname then
                log.info("endpoint is in LAN_Internal and is an allowed hostname", log_labels)
                return true
              end
            end
            local allowed_hostname_parts = {"BroadLink", "shellyht"}
            for _, v in pairs(allowed_hostname_parts) do
              if string.find(endpoint.hostname, v) then
                log.info("endpoint is in LAN_Internal and contains allowed hostname part", log_labels)
                return true
              end
            end
          end
          log.info("endpoint is not explicitly handled so skipping", log_labels)
          return false
        end,
      },
    },
  },
}
