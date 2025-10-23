#!/bin/bash
set -euxo pipefail
ssh-keyscan uptime-kuma.sapslaj.xyz >> ~/.ssh/known_hosts
sudo mkdir -p /mnt/exos/volumes/uptime-kuma
ssh uptime-kuma.sapslaj.xyz sudo rm -rf /tmp/docker-volumes
ssh uptime-kuma.sapslaj.xyz sudo cp -rv /var/docker/volumes /tmp/docker-volumes
ssh uptime-kuma.sapslaj.xyz sudo chown -Rv ci:ci /tmp/docker-volumes
rsync -avhuP uptime-kuma.sapslaj.xyz:/tmp/docker-volumes/ /mnt/exos/volumes/uptime-kuma/
