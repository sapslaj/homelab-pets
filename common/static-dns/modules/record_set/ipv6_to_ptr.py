#!/usr/bin/env python3
import json
import sys


query = json.load(sys.stdin)

ip = query["ipv6"]
partitions = ip.split("::")
expanded = partitions[0].split(":")
host_groups = []
if len(partitions) == 2:
    host_groups = partitions[1].split(":")
for _ in range(8 - len(expanded) + len(host_groups)):
    expanded.append("0000")
expanded.extend(host_groups)
expanded = [group.rjust(4, "0") for group in expanded]
ptr = ".".join(reversed(list("".join(expanded)))) + ".ip6.arpa."

result = {
    "ptr": ptr
}
json.dump(result, sys.stdout)
