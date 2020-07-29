FROM mongo

MAINTAINER sapslaj (saps.laj@gmail.com)

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    unzip \
    wget \
    openjdk-6-jre-headless

ENV CONTROLLER_VERSION 4.8.18

RUN wget -O /root/UniFi.unix.zip "http://dl.ubnt.com/unifi/$CONTROLLER_VERSION/UniFi.unix.zip" \
  && unzip /root/UniFi.unix.zip -d /opt \
  && rm /root/UniFi.unix.zip

VOLUME /opt/UniFi/data

EXPOSE 8443 8843 8880 8080 3478

CMD ["java", "-jar", "/opt/UniFi/lib/ace.jar", "start"]
