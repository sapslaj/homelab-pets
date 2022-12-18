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
        hostname_leases = {}
        for lease in leases:
            if not lease.hostname:
                continue
            if not lease.hostname in hostname_leases:
                hostname_leases[lease.hostname] = []
            hostname_leases[lease.hostname].append(lease)
        changes = []
        for hostname, leases in hostname_leases.items():
            ipv4 = self._ipv4_record(hostname, leases)
            if ipv4:
                changes.append(ipv4)
            ipv6 = self._ipv6_record(hostname, leases)
            if ipv6:
                changes.append(ipv6)
        for change in changes:
            try:
                route53.change_resource_record_sets(HostedZoneId=self.hosted_zone_id, ChangeBatch={"Changes": [change]})
            except route53.exceptions.InvalidChangeBatch as e:
                logging.error(e)

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

    def _ipv4_record(self, hostname, leases):
        addresses = [lease.ip for lease in leases]
        if addresses:
            return self._dns_change(name=lease.hostname, addresses=addresses, suffix=self.suffix, record_type="A")

    def _ipv6_record(self, hostname, leases):
        addresses = [ip for lease in leases for ip in lease.ipv6s]
        if addresses:
            return self._dns_change(name=lease.hostname, addresses=addresses, suffix=self.suffix, record_type="AAAA")


class Route53IPv4PTRUpdater:
    def __init__(self, hosted_zone_id: str, forward_lookup_suffix: str):
        self.hosted_zone_id = hosted_zone_id
        self.forward_lookup_suffix = forward_lookup_suffix

    def update(self, leases):
        route53 = boto3.client("route53")
        zone_name = route53.get_hosted_zone(Id=self.hosted_zone_id)["HostedZone"]["Name"]
        changes = []
        for lease in leases:
            hostname = lease.hostname
            if not hostname:
                hostname = "ip-" + lease.ip.replace(".", "-")
            if not self._fits_in_zone(ip=lease.ip, zone_name=zone_name):
                continue
            changes.append(
                self._dns_change(ip=lease.ip, hosts=[self._dns_safe_name(hostname) + self.forward_lookup_suffix])
            )
        if changes:
            return route53.change_resource_record_sets(HostedZoneId=self.hosted_zone_id, ChangeBatch={"Changes": changes})

    def _dns_safe_name(self, name):
        return re.sub(r"\s", "-", name)

    def _fits_in_zone(self, ip: str, zone_name: str):
        ip_octets = ip.split(".")
        zone_octets = reversed(zone_name.replace(".in-addr.arpa.", "").split("."))
        for idx, zone_octet in enumerate(zone_octets):
            if zone_octet != ip_octets[idx]:
                return False
        return True

    def _ip_to_ptr(self, ip: str):
        return ".".join(reversed(ip.split("."))) + ".in-addr.arpa."

    def _dns_change(self, ip: str, hosts, ttl=120):
        return {
            "Action": "UPSERT",
            "ResourceRecordSet": {
                "Name": self._ip_to_ptr(ip),
                "Type": "PTR",
                "TTL": ttl,
                "ResourceRecords": [{"Value": host} for host in hosts],
            },
        }


class Route53IPv6PTRUpdater:
    def __init__(self, hosted_zone_id: str, forward_lookup_suffix: str):
        self.hosted_zone_id = hosted_zone_id
        self.forward_lookup_suffix = forward_lookup_suffix

    def update(self, leases):
        route53 = boto3.client("route53")
        zone_name = route53.get_hosted_zone(Id=self.hosted_zone_id)["HostedZone"]["Name"]
        changes = []
        for lease in leases:
            hostname = lease.hostname
            if not hostname:
                hostname = "ip-" + lease.ip.replace(".", "-")
            for ip in lease.ipv6s:
                if not self._fits_in_zone(ip=lease.ip, zone_name=zone_name):
                    continue
                changes.append(
                    self._dns_change(ip=ip, hosts=[self._dns_safe_name(hostname) + self.forward_lookup_suffix])
                )
        if changes:
            return route53.change_resource_record_sets(HostedZoneId=self.hosted_zone_id, ChangeBatch={"Changes": changes})

    def _dns_safe_name(self, name):
        return re.sub(r"\s", "-", name)

    def _ip_to_ptr(self, ip: str):
        partitions = ip.split("::")
        expanded = partitions[0].split(":")
        host_groups = []
        if len(partitions) == 2:
            host_groups = partitions[1].split(":")
        for _ in range(8 - len(expanded) + len(host_groups)):
            expanded.append("0000")
        expanded.extend(host_groups)
        expanded = [group.rjust(4, "0") for group in expanded]
        return ".".join(reversed(list("".join(expanded)))) + ".ip6.arpa."

    def _fits_in_zone(self, ip: str, zone_name: str):
        ptr_nibbles = list(reversed(self._ip_to_ptr(ip).split(".")))
        zone_nibbles = list(reversed(zone_name.split(".")))
        for idx, zone_nibble in enumerate(zone_nibbles):
            if zone_nibble != ptr_nibbles[idx]:
                return False
        return True


    def _dns_change(self, ip: str, hosts, ttl=120):
        return {
            "Action": "UPSERT",
            "ResourceRecordSet": {
                "Name": self._ip_to_ptr(ip),
                "Type": "PTR",
                "TTL": ttl,
                "ResourceRecords": [{"Value": host} for host in hosts],
            },
        }


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
            return lease.hostname in {"homeassistant", "darkness", "playboy", "k3sdev", "steamdeck", "megumin"}

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

    logging.info("Updating 24.172.in-addr.arpa zone with leases")
    updater = Route53IPv4PTRUpdater(hosted_zone_id="Z00206652RDLR1KV5OQ39", forward_lookup_suffix=".sapslaj.xyz")
    updater.update(leases)

    logging.info("Updating 2.2.0.e.0.7.4.0.1.0.0.2.ip6.arpa zone with leases")
    updater = Route53IPv6PTRUpdater(hosted_zone_id="Z00734311E53TPLAI5AXC", forward_lookup_suffix=".sapslaj.xyz")
    updater.update(leases)

    leases = list(filter(lease_filter, leases))

    logging.info("Updating sapslaj.xyz zone with leases")
    updater = Route53Updater(hosted_zone_id="Z00048261CEI1B6JY63KT", suffix=".sapslaj.xyz")
    updater.update(leases)

    logging.info("Complete")
