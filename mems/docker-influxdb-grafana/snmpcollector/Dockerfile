FROM tonimoreno/snmpcollector
COPY ./config.toml /conf/config.toml

COPY ./docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT [ "/docker-entrypoint.sh" ]

CMD ./bin/snmpcollector
