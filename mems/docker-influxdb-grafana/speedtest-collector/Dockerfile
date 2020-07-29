FROM python:3
RUN pip install speedtest-cli influxdb schedule
COPY . /
CMD python /collector.py