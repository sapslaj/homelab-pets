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

~Currently dead 💀~ it's back (somehow?) but unused 💀

### homeassistant

HAOS VM running inside [aqua](#aqua). Due to my negligence the current name of the VM is `ha` while the DNS name is `homeassistant`. It is deployed as an appliance and is thus (mostly) excluded from being managed as code.

Home Assistant is deployed as a VM instead of on a dedicated Rasberry Pi or similar SBC because it is much easier to do backups of VM disks than it is to do physical disks, especially when access to the underlying OS is somewhat limited as is the case with HAOS. It was never designed with infra-as-code in mind and is hard to shoehorn it in, so for my own sanity I treat it more or less as a black box managed service and just back up the VM disk.

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

This is used for network devices (routers, switches, etc) that can't natively run Promtail or another Loki client but can send logs to a network syslog server.

- Syslog-NG listens on 6601/tcp and 5514/udp
- Silently converts to RFC5424 before sending to Promtail sidecar
- Promtail sidecar forwards to Loki

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

### oci

VM inside [mitsuru](#mitsuru).

Docker/OCI registry. Eventually I wanna get it to be some kind of pull through
cache for Docker Hub but that doesn't work yet.

### playboy

Raspberry Pi 4 running Raspbian located behind the Bedroom TV.

#### Uses

##### CUPS Print Server

Unfortunately we still need a printer for some things. So getting a free Brother laser printer and installing CUPS on a Raspberry Pi seemed like the most sane option.

##### Zigbee2MQTT server

Home assistant is installed on a VM and I didn't want to deal with USB passthrough so that meant having the Zigbee radio on a separate machine. This Pi is in the bedroom (not burried away in a rack in my office) and is more central to the house anyway so it makes more sense to do this.

##### Steam Link client

The Pi has a desktop running and the Steam Link client auto-starts. This isn't used as much anymore since I got my Steam Deck.

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

##### ACME _(planned? maybe?)_

Due to the whole not having things exposed to the world thing it's hard to get
Let's Encrypt certs, but it sure would be nice to do so. I'm thinking about
either implementing an ACME protocol proxy or something more simple like
[acme-dns](https://github.com/joohoi/acme-dns) to make getting certs easier.

### tohru

VM inside [aqua](#aqua).

#### Uses

##### GitHub Actions CI

Actions runner for this repository and some others. Needed since direct access to these servers is not possible from the outside via IPv4.

##### DDNS

_TODO: should this be a [shimiko](#shimiko) responsibility?_

- Cloudflare DDNS to update current public IP to `sapslaj.com` Cloudflare zone.
- VSDD for doing dynamic DNS updates to `sapslaj.xyz` Route53 zone based on DHCP leases and IPv6 neighbors.

### zerotwo (+ichigo)

zerotwo (k3s control plane) is a VM running inside [aqua](#aqua).

ichigo is a physical server running Ubuntu (node)

#### Uses

##### Kubernetes (k3s)

k3s is installed on all nodes. zerotwo is the single control plane because it is a VM and makes backups easy.

Notable apps running on Kubernetes:

- LibreNMS
- Oxidized
- Traefik
- Prometheus
- Loki
