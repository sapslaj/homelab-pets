#!/usr/bin/env python3
import json
import sys


def convert(ip):
    partitions = ip.split("::")
    expanded = partitions[0].split(":")
    if len(partitions) == 2:
        host_groups = partitions[1].split(":")
        for _ in range(8 - (len(expanded) + len(host_groups))):
            expanded.append("0000")
        expanded.extend(host_groups)
    expanded = [group.rjust(4, "0") for group in expanded]
    return ".".join(reversed(list("".join(expanded)))) + ".ip6.arpa."


if __name__ == "__main__":
    query = json.load(sys.stdin)
    ip = query["ipv6"]
    result = {
        "ptr": convert(ip),
    }
    json.dump(result, sys.stdout)
