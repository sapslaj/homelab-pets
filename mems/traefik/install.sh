#!/bin/sh -xeu
get_latest_version() {
  curl -s https://api.github.com/repos/traefik/traefik/releases/latest | grep tag_name | cut -d: -f2 | tr -d \"\,\v | awk '{$1=$1};1'
}
VERSION=${1:-`get_latest_version`}
wget https://github.com/traefik/traefik/releases/download/v${VERSION}/traefik_v${VERSION}_linux_amd64.tar.gz -O traefik.tar.gz
tar xvf traefik.tar.gz
sudo mv ./traefik /usr/local/bin
rm -f traefik.tar.gz CHANGELOG.md LICENSE.md
