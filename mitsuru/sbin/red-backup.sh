#!/bin/bash
set -euxo pipefail

ts="$(date -Iseconds | sed 's/:/-/g')"
snapshots="$(zfs list -t snapshot)"
if [[ "$snapshots" == *"red@backup-latest"* ]]; then
  zfs destroy 'red@backup-latest'
fi
zfs snapshot 'red@backup-latest'
zfs send 'red@backup-latest' | gzip > "/mnt/exos/volumes/red/snapshots/red-backup-$ts.gz"
find '/mnt/exos/volumes/red/snapshots' -maxdepth 1 -mtime +35 -type f -delete
