#!/bin/sh
set -e

cp /conf/config.toml /opt/snmpcollector/conf/

exec "$@"
