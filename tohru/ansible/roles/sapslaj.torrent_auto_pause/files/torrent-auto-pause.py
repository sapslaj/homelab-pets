#!/usr/bin/env python3
import argparse
import clutch
import sys
import os


def tf(torrent, seeders):
    stats = f"<{torrent.id}> (s: {seeders}; r: {torrent.upload_ratio}; %: {torrent.percent_done})".ljust(40)
    return f"{stats} {torrent.name}"


def gather(stop: bool, start: bool, percent_done: float = 1.0, ratio: float = 2.0, min_seeders: int = 10):
    stop_torrents = []
    start_torrents = []
    for torrent in torrents:
        seeders = sum([stats.seeder_count for stats in torrent.tracker_stats])
        should_be_paused = all([
            torrent.percent_done == percent_done,
            torrent.upload_ratio > ratio,
            seeders > min_seeders,
        ])
        if all([
            start,
            torrent.status == clutch.schema.user.response.torrent.accessor.Status.STOPPED,
            not should_be_paused
        ]):
            print(f"Starting {tf(torrent, seeders)}")
            start_torrents.append(torrent.id)
        if all([
            stop,
            torrent.status != clutch.schema.user.response.torrent.accessor.Status.STOPPED,
            should_be_paused
        ]):
            print(f"Stopping {tf(torrent, seeders)}")
            stop_torrents.append(torrent.id)
    return stop_torrents, start_torrents


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pause or restart torrents")
    parser.add_argument("--start", action="store_true", help="Start torrents instead of pausing")
    parser.add_argument("--dry-run", action="store_true", help="Don't take action")
    parser.add_argument("--address", default=os.environ.get("TRANSMISSION_ADDRESS"))
    args = parser.parse_args()

    client = clutch.Client(address=args.address)
    torrents = client.torrent.accessor(all_fields=True).arguments.torrents

    stop_torrents, start_torrents = gather(stop=not args.start, start=args.start)

    if args.dry_run:
        print("Dry Run, no action taken")
        sys.exit(0)
    if stop_torrents:
        print(f"Stopping torrents {stop_torrents}")
        client.torrent.action(clutch.schema.user.method.torrent.action.TorrentActionMethod.STOP, ids=stop_torrents)
    if start_torrents:
        print(f"Starting torrents {start_torrents}")
        client.torrent.action(clutch.schema.user.method.torrent.action.TorrentActionMethod.START, ids=start_torrents)
