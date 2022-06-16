ip = ARGV.last
invalid_ip = "#{ip} doesn't appear to be a valid IPv6 address"
raise invalid_ip unless ip.include?(":")

partitions = ip.split("::")
raise invalid_ip if partitions.size > 2

expanded = partitions.first.split(":")

host_groups =
  if partitions.size == 2
    partitions.last.split(":")
  else
    []
  end
until expanded.size + host_groups.size == 8
  expanded.append("0")
end
expanded.append(*host_groups)

puts(expanded.join("").reverse.split("").join("."))
