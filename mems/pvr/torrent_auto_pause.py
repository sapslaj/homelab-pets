import clutch

client = clutch.Client(address="http://mems.homelab.sapslaj.com:8080/transmission/rpc")
torrents = client.torrent.accessor(all_fields=True).arguments.torrents

start_torrents = []
stop_torrents = []

for torrent in torrents:
    should_be_active = not all([
        torrent.percent_done == 1.0,
        torrent.upload_ratio > 2.0,
        sum([stats.seeder_count for stats in torrent.tracker_stats]) > 10,
    ])
    if torrent.status == clutch.schema.user.response.torrent.accessor.Status.STOPPED and should_be_active:
        print(f"Queueing {torrent.name} <{torrent.id}> to be started")
        start_torrents.append(torrent.id)
    elif torrent.status != clutch.schema.user.response.torrent.accessor.Status.STOPPED and not should_be_active:
        print(f"Queueing {torrent.name} <{torrent.id}> to be stopped")
        stop_torrents.append(torrent.id)

if stop_torrents:
    print(f"Stopping torrents {stop_torrents}")
    client.torrent.action(clutch.schema.user.method.torrent.action.TorrentActionMethod.STOP, ids=stop_torrents)
if start_torrents:
    print(f"Starting torrents {start_torrents}")
    client.torrent.action(clutch.schema.user.method.torrent.action.TorrentActionMethod.START, ids=start_torrents)
