local log = require("log")

local forward_lookup_filter = function(endpoint)
  local log_labels = {
    filter_direction = "forward",
    hostname = endpoint.hostname,
    dhcp_pool = endpoint.source_properties.dhcp_pool,
  }
  if endpoint.source_properties.static then
    log.info("endpoint is static, allowing", log_labels)
    return true
  end
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
end

return {
  sources = {
    static = {
      "custom",
      config = {
        endpoints = function(config)
          local source_properties = { static = true, }
          return {
            {
              hostname = "rem",
              ipv4s = {"172.24.4.2"},
              ipv6s = {"2001:470:e022:4::2"},
              record_ttl = 300,
              source_properties = source_properties,
              provider_properties = nil,
            },
            {
              hostname = "ram",
              ipv4s = {"172.24.4.3"},
              ipv6s = {"2001:470:e022:4::3"},
              record_ttl = 300,
              source_properties = source_properties,
              provider_properties = nil,
            },
            {
              hostname = "aqua",
              ipv4s = {"172.24.4.10"},
              ipv6s = {"2001:470:e022:4::a"},
              record_ttl = 300,
              source_properties = source_properties,
              provider_properties = nil,
            },
            {
              hostname = "daki",
              ipv4s = {"172.24.2.2"},
              ipv6s = {},
              record_ttl = 300,
              source_properties = source_properties,
              provider_properties = nil,
            },
            {
              hostname = "taiga",
              ipv4s = {"172.24.2.3"},
              ipv6s = {},
              record_ttl = 300,
              source_properties = source_properties,
              provider_properties = nil,
            },
            {
              hostname = "pdu1",
              ipv4s = {"172.24.2.4"},
              ipv6s = {},
              record_ttl = 300,
              source_properties = source_properties,
              provider_properties = nil,
            },
            {
              hostname = "pdu2",
              ipv4s = {"172.24.2.5"},
              ipv6s = {},
              record_ttl = 300,
              source_properties = source_properties,
              provider_properties = nil,
            },
            {
              hostname = "ups1",
              ipv4s = {"172.24.2.6"},
              ipv6s = {},
              record_ttl = 300,
              source_properties = source_properties,
              provider_properties = nil,
            },
            {
              hostname = "yor",
              ipv4s = {
                "172.24.0.0",
                "172.24.1.1",
                "172.24.2.1",
                "172.24.3.1",
                "172.24.4.1",
                "172.24.5.1",
              },
              ipv6s = {
                "2001:470:e022:1::1",
                "2001:470:e022:2::1",
                "2001:470:e022:3::1",
                "2001:470:e022:4::1",
                "2001:470:e022:5::1",
              },
              record_ttl = 300,
              source_properties = source_properties,
              provider_properties = nil,
            },
          }
        end,
      },
    },
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
    rem_coredns = {
      "hosts_file",
      config = {
        forward_lookup_filter = forward_lookup_filter,
        record_suffix = ".sapslaj.xyz",
        file = "/etc/coredns/zonepop.hosts",
        ssh = {
          host = "rem.sapslaj.xyz",
          username = os.getenv("VYOS_USERNAME"),
          password = os.getenv("VYOS_PASSWORD"),
        }
      }
    },
    ram_coredns = {
      "hosts_file",
      config = {
        forward_lookup_filter = forward_lookup_filter,
        record_suffix = ".sapslaj.xyz",
        file = "/etc/coredns/zonepop.hosts",
        ssh = {
          host = "ram.sapslaj.xyz",
          username = os.getenv("VYOS_USERNAME"),
          password = os.getenv("VYOS_PASSWORD"),
        }
      }
    },
    route53 = {
      "aws_route53",
      config = {
        record_suffix = ".sapslaj.xyz",
        forward_zone_id = "Z00048261CEI1B6JY63KT",
        ipv4_reverse_zone_id = "Z00206652RDLR1KV5OQ39",
        ipv6_reverse_zone_id = "Z00734311E53TPLAI5AXC",
        clean_ipv4_reverse_zone = true,
        clean_ipv6_reverse_zone = true,
        forward_lookup_filter = forward_lookup_filter,
      },
    },
  },
}
