FROM golang:1.14
WORKDIR /usr/src/nyaa-proxy
COPY . .
# RUN go mod download
RUN go build
RUN cp nyaa-proxy /bin
WORKDIR /
EXPOSE 80
CMD ["nyaa-proxy"]
