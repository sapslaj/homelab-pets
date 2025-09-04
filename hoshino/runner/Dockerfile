FROM gitea/act_runner:latest as act_runner

FROM catthehacker/ubuntu:act-latest

COPY --from=act_runner /usr/local/bin/act_runner /usr/local/bin/act_runner
COPY --from=act_runner /usr/local/bin/run.sh /usr/local/bin/run.sh

RUN set -eux && \
  export DEBIAN_FRONTEND=noninteractive && \
  apt-get update && \
  apt-get install -y --no-install-recommends \
    tini \
    && \
  useradd runner && \
  usermod -aG docker runner && \
  echo 'runner ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/90-runner

ENTRYPOINT ["/usr/bin/tini", "--", "run.sh"]
