#!/bin/bash
set -euxo pipefail
ssh-keyscan playboy.sapslaj.xyz >> ~/.ssh/known_hosts
sudo mkdir -p /mnt/exos/volumes/playboy/zigbee2mqtt-data
rsync -avhuP playboy.sapslaj.xyz:/opt/zigbee2mqtt/data /mnt/exos/volumes/playboy/zigbee2mqtt-data
