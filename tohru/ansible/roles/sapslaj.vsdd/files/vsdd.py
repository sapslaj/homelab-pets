#!/usr/bin/env python3
# VyOS Shitty Dynamic DNS

from typing import Optional
from netmiko import ConnectHandler
from getpass import getpass
import json
import re
import boto3
import logging


class Neighbor:
    def __init__(self, **kwargs):
        self.to: Optional[str] = kwargs.get("to")
        self.dev: Optional[str] = kwargs.get("dev")
        self.lladdr: Optional[str] = kwargs.get("lladdr")
        self.nud: Optional[str] = kwargs.get("nud")

    @classmethod
    def parse_raw_line(cls, line: str):
        parts = list(reversed(line.split(" ")))
        to = parts.pop()
        dev = None
        lladdr = None
        nud = None
        while parts:
            part = parts.pop()
            if part == "dev":
                dev = parts.pop()
            elif part == "lladdr":
                lladdr = parts.pop()
            elif part.upper() in {
                "PERMANENT",
                "NOARP",
                "REACHABLE",
                "STALE",
                "NONE",
                "INCOMPLETE",
                "DELAY",
                "PROBE",
                "FAILED",
            }:
                nud = part
        return cls(to=to, dev=dev, lladdr=lladdr, nud=nud)


class Lease:
    def __init__(self, **kwargs):
        self.pool: str = kwargs["pool"]
        self.ip: str = kwargs["ip"]
        self.hostname: str = kwargs["hostname"]
        self.hardware_address: str = kwargs["hardware_address"]
        self.ipv6s: list(str) = []

    def associate_potential_ipv6s(self, neighbors):
        for neighbor in neighbors:
            if neighbor.to and neighbor.to.startswith("fe80"):
                continue
            if all(
                [
                    neighbor.to,
                    neighbor.lladdr and neighbor.lladdr.lower() == self.hardware_address.lower(),
                    neighbor.nud and neighbor.nud in {"REACHABLE", "STALE"},
                ]
            ):
                self.ipv6s.append(neighbor.to)


class Route53Updater:
    def __init__(self, hosted_zone_id: str, suffix: str):
        self.hosted_zone_id = hosted_zone_id
        self.suffix = suffix

    def update(self, leases):
        route53 = boto3.client("route53")
        changes = []
        for lease in leases:
            if not lease.hostname:
                continue
            changes.append(self._ipv4_record(lease))
            if lease.ipv6s:
                changes.append(self._ipv6_record(lease))
        return route53.change_resource_record_sets(HostedZoneId=self.hosted_zone_id, ChangeBatch={"Changes": changes})

    def _dns_safe_name(self, name):
        return re.sub(r"\s", "-", name)

    def _dns_change(self, name, addresses, suffix="", record_type="A", ttl=120):
        return {
            "Action": "UPSERT",
            "ResourceRecordSet": {
                "Name": self._dns_safe_name(name) + suffix,
                "Type": record_type,
                "TTL": ttl,
                "ResourceRecords": [{"Value": address} for address in addresses],
            },
        }

    def _ipv4_record(self, lease):
        return self._dns_change(name=lease.hostname, addresses=[lease.ip], suffix=self.suffix, record_type="A")

    def _ipv6_record(self, lease):
        return self._dns_change(name=lease.hostname, addresses=lease.ipv6s, suffix=self.suffix, record_type="AAAA")


def connect(host: str, username: str, password: str):
    logging.info(f"Connecting to {host}")
    return ConnectHandler(device_type="vyos", host=host, username=username, password=password)


def get_leases(net_connect, neighbors: bool = True):
    logging.info(f"Getting leases")
    leases = [
        Lease(**lease)
        for lease in json.loads(net_connect.send_command("/usr/libexec/vyos/op_mode/show_dhcp.py --leases --json"))
    ]
    if neighbors:
        logging.info(f"Associating IPv6 neighbors")
        neighbors = get_neighbors(net_connect)
        for lease in leases:
            lease.associate_potential_ipv6s(neighbors)
    return leases


def get_neighbors(net_connect):
    logging.info(f"Getting IPv6 neighbors")
    return [Neighbor.parse_raw_line(line) for line in net_connect.send_command("ip -f inet6 neigh show").splitlines()]


if __name__ == "__main__":
    import os
    import sys

    logging.basicConfig(
        format="%(asctime)s [%(levelname)-8s] %(name)-24s %(message)s", stream=sys.stdout, level=logging.INFO
    )

    host = os.environ["VYOS_HOST"]
    username = os.environ["VYOS_USERNAME"]
    password = os.environ["VYOS_PASSWORD"]

    net_connect = connect(host=host, username=username, password=password)
    leases = get_leases(net_connect)

    def lease_filter(lease):
        if lease.pool in {"LAN_Servers", "LAN_Management"}:
            return lease.hostname not in {"aqua"}
        if lease.pool in {"LAN_Internal"}:
            return lease.hostname in {"homeassistant", "darkness", "playboy"}

    leases = list(filter(lease_filter, leases))
    for lease in leases:
        logging.info(
            " ".join(
                [
                    f"ipv4={lease.ip}",
                    f"ipv6={repr(lease.ipv6s)}",
                    f"mac={lease.hardware_address}",
                    f"pool={lease.pool}",
                    f"hostname={lease.hostname}",
                ]
            )
        )

    logging.info("Updating sapslaj.xyz zone with leases")
    updater = Route53Updater(hosted_zone_id="Z00048261CEI1B6JY63KT", suffix=".sapslaj.xyz")
    updater.update(leases)
    logging.info("Complete")
