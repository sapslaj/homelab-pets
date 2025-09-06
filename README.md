# homelab-pets

Pet servers; and an attempt to make them less pet-like.

## Servers

### aqua

Physical server running Debian.

#### Uses

##### NAS

- LVM+XFS
- NFS accessible from `172.24.4.0/24`
- Backups to Wasabi via rclone every week-ish (see `rclone-sync@.service`)

##### KVM host

- libvirtd
- [virt-backup](https://github.com/aruhier/virt-backup) backs up all VMs to main datastore (which is then backed up to Wasabi)

### eris

Raspberry Pi 4 running Raspbian.

~~Currently dead 💀~~ it's back (somehow?) but unused 💀

### ganyu

Physical server running Proxmox Backup Server (Debian-based)

#### Uses

##### Proxmox Backup Server

for [mitsuru](#mitsuru), mainly.

### homeassistant

HAOS VM running inside [aqua](#aqua). Due to my negligence the current name of the VM is `ha` while the DNS name is `homeassistant`. It is deployed as an appliance and is thus (mostly) excluded from being managed as code.

Home Assistant is deployed as a VM instead of on a dedicated Rasberry Pi or similar SBC because it is much easier to do backups of VM disks than it is to do physical disks, especially when access to the underlying OS is somewhat limited as is the case with HAOS. It was never designed with infra-as-code in mind and is hard to shoehorn it in, so for my own sanity I treat it more or less as a black box managed service and just back up the VM disk.

### hoshino

VM inside [mitsuru](#mitsuru).

all (most) things CI

#### Uses

##### act_runner

Runs [Gitea act_runner](https://gitea.com/gitea/act_runner) as a Docker
container and spins up other Docker containers for running jobs.

##### GARM

Runs a (currently broken) [garm](https://github.com/cloudbase/garm) config with the following providers:

- AWS Sandbox account us-east-1
- Incus container
- Incus virtual machine
- K8s Nekopara

garm is set up with Gitea and GitHub but repository provisioning is currently
manual.

### koyuki

Physical server running Ubuntu

#### Uses

##### Syncthing

General purpose file syncing hub. Backup destination for portable devices. Needs host networking.

##### Media servers

Need host networking for DLNA to work right

- Plex
- Jellyfin

##### network syslog

Needs host networking because UDP in containers is still painful.

This is used for network devices (routers, switches, etc) that can't natively
run ~~Promtail~~ Vector or another ~~Loki~~ VictoriaLogs client but can send logs
to a network syslog server.

- Syslog-NG listens on 6601/tcp and 5514/udp
- Silently converts to RFC5424 before sending to Vector sidecar
- Vector sidecar forwards to VictoriaLogs

##### PVR

need to do complicated container networking to make appropriate traffic flow through VPN container

```
                      +---------------------+
                      |                     |
                      |      Nord VPN       -
                      |                     |
                      +----------|----------+
                                 | sends
                                 | egress
+---------------+                | traffic      +---------------+
|               |                | through      |               |
| flairsolverr  -----------------+---------------  qBittorrent  |
|               |                |              |               |
+-------|-------+                |              +-------|-------+
        |is used                 |             download |
        |by                      |             client   |
+-------|-------+                |             for      |
|               |                |                      |
|    Jackett    -----------------+                      |
|               |                                       |
+-------|-------+          +------------+               |
        |                  |            |               |
        |-------------------   Sonarr   ----------------|
        |indexer           |            |               |
        |backend           +------------+               |
        |for                                            |
        |                  +------------+               |
        |                  |            |               |
        |-------------------   Radarr   ----------------|
        |                  |            |               |
        |                  +------------+               |
        |                                               |
        |                  +------------+               |
        |                  |            |               |
        +-------------------   Lidarr   ----------------+
                           |            |
                           +------------+
```

### misc

VM inside [mitsuru](#mitsuru).

A static file web server. No auth, no smarts. It's using Caddy as the server
implementation for now, might change later if it pisses me off enough. It is
rebuilt using [xcaddy](https://github.com/caddyserver/xcaddy) on every startup
because Caddy's plugin system is fucking stupid.

### mitsuru

Dell Precision Tower 7910 running Proxmox.

#### Uses

##### Proxmox

Main Proxmox node.

##### NAS

Secondary NAS that specializes in fast SSD storage. This is mainly to enable
persistent volumes in [Nekopara](https://github.com/sapslaj/nekopara).

### miyabi

VM inside [mitsuru](#mitsuru).

#### Uses

##### Tailscale router

Currently a Tailscale subnet router _and_ exit node.

### oci

VM inside [mitsuru](#mitsuru).

Docker/OCI registry and Docker Hub caching proxy.

- main OCI endpoint: `oci.sapslaj.xyz`
- Proxy endpoint: `proxy.oci.sapslaj.xyz`
  - e.g. `ubuntu:24.04` => `proxy.oci.sapslaj.xyz/docker-hub/ubuntu:24.04`

### playboy

Raspberry Pi 4 running Ubuntu located behind the Bedroom TV.

#### Uses

##### CUPS Print Server

Unfortunately we still need a printer for some things. So getting a free Brother laser printer and installing CUPS on a Raspberry Pi seemed like the most sane option.

##### Zigbee2MQTT server

Home assistant is installed on a VM and I didn't want to deal with USB passthrough so that meant having the Zigbee radio on a separate machine. This Pi is in the bedroom (not burried away in a rack in my office) and is more central to the house anyway so it makes more sense to do this.

### rem/ram

rem is a VM runing inside [aqua](#aqua). ram is a Raspberry Pi colocated in the same rack.

rem, being a VM, makes backups easy. ram is running not a VM in the event of aqua being down so that DNS will continue to work in the network.

#### Uses

##### AdGuard Home DNS

Runs [AdGuard Home](https://github.com/AdguardTeam/AdGuardHome) with [AdGuardHome sync](https://github.com/bakito/adguardhome-sync) to keep the instances in sync. Also uses [adguard-exporter](https://github.com/ebrianne/adguard-exporter) for Prometheus metrics scraping.

### shimiko

VM inside [mitsuru](#mitsuru).

This server runs the server software of the same name. The purpose is to
DNS-related management and bookkeeping, service discovery, and anything else
DNS or SD related that I need.

#### Uses

##### DNS management

shimiko is not a DNS resolver (that is taken care of my rem and ram) but
provides a RESTful interface for managing DNS records that sync to both rem/ram
and Route53. It also runs [ZonePop](https://github.com/sapslaj/zonepop) for
dynamic forward and reverse lookup entries.

##### Service Discovery _(planned)_

Consul-like SD without actually having to deal with the overhead of running
Consul. It's supposed to be _dead_ simple.

##### ACME

Implements the [acme-dns](https://github.com/joohoi/acme-dns) protocol.

- `ACMEDNS_BASE_URL` - `https://shimiko.sapslaj.xyz/acme-dns`
- `ACMEDNS_SUBDOMAIN` - `example.sapslaj.xyz` (`_acme-challenge` subdomain will be added automatically, only subdomains of `sapslaj.xyz` are supported)
- `ACMEDNS_USERNAME` - _ignored_
- `ACMEDNS_PASSWORD` - _ignored_

### tohru

VM inside [aqua](#aqua).

#### Uses

##### GitHub Actions CI

Actions runner for this repository and some others. Needed since direct access to these servers is not possible from the outside via IPv4.

##### DDNS

_TODO: should this be a [shimiko](#shimiko) responsibility?_

- Cloudflare DDNS to update current public IP to `sapslaj.com` Cloudflare zone.
- VSDD for doing dynamic DNS updates to `sapslaj.xyz` Route53 zone based on DHCP leases and IPv6 neighbors.

### uptime-kuma

Vultr VM

#### Uses

##### Uptime Kuma (metamonitoring and status page)

It runs [Uptime Kuma](https://github.com/louislam/uptime-kuma).

Accessible at https://status.sapslaj.com
