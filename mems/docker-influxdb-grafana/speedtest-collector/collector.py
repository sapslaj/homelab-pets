import schedule
import time
import os
from speedtest import Speedtest
from influxdb import InfluxDBClient, SeriesHelper
import collections
from datetime import datetime


# https://stackoverflow.com/questions/6027558/flatten-nested-python-dictionaries-compressing-keys
def flatten(d, parent_key='', sep='_'):
    items = []
    for k, v in d.items():
        new_key = parent_key + sep + k if parent_key else k
        if isinstance(v, collections.MutableMapping):
            items.extend(flatten(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)


def collect():
    test = Speedtest()
    server = test.get_best_server()
    download = test.download()
    upload = test.upload()
    return test.results.dict()


def send(results):
    client = InfluxDBClient(
        os.getenv('INFLUXDB_HOST', 'localhost'), 
        int(os.getenv('INFLUXDB_PORT', '8086')), 
        os.getenv('INFLUXDB_USER', 'root'), 
        os.getenv('INFLUXDB_PASSWORD', 'root'), 
        os.getenv('INFLUXDB_DBNAME', 'speedtests')
    )

    flattened_results = flatten(results)

    tag_keys = ['server_url', 'server_name', 'server_country', 'server_cc', 'server_sponsor', 'server_id', 'server_host', 'client_ip', 'client_isp', 'client_country']
    field_keys = ['download', 'upload', 'ping', 'server_lat', 'server_lon', 'server_d', 'server_latency', 'timestamp', 'bytes_sent', 'bytes_received', 'share', 'client_lat', 'client_lon', 'client_isprating', 'client_rating', 'client_ispdlavg', 'client_ispulavg', 'client_loggedin']

    tags = {}
    fields = {}

    for tag_key in tag_keys:
        tags[tag_key] = flattened_results[tag_key]

    for field_key in field_keys:
        fields[field_key] = flattened_results[field_key]

    points = [
        {
            'measurement': 'speedtest',
            'time': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
            'tags': tags,
            'fields': fields
        }
    ]

    print(points)

    return client.write_points(points)


def collect_and_send():
    results = collect()
    print(results)
    print(send(results))


def main():
    collect_and_send()

    minutes = int(os.getenv('SCHEDULE_MINUTES', '1'))
    schedule.every(minutes).minutes.do(collect_and_send)

    while True:
        schedule.run_pending()
        time.sleep(30)


if __name__ == "__main__":
    main()
