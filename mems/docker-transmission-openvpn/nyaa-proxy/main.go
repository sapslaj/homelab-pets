package main

import (
	"flag"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
)

var (
	backend = flag.String("backend", "https://nyaa.si", "Target host for the proxy")
	port    = flag.Int("port", 80, "Port for proxy server to listen on")
)

func handleRequest(res http.ResponseWriter, req *http.Request) {
	target, err := url.Parse(*backend)
	if err != nil {
		log.Fatal(err)
	}
	proxy := httputil.NewSingleHostReverseProxy(target)

	req.URL.Host = target.Host
	req.URL.Scheme = target.Scheme
	req.Host = target.Host
	referrer := req.Header.Get("Referer")
	if len(referrer) != 0 {
		referrerURL, err := url.Parse(referrer)
		if err == nil {
			referrerURL.Host = target.Host
			referrerURL.Scheme = target.Scheme
			req.Header.Set("Referer", referrerURL.String())
		} else {
			req.Header.Del("Referer")
			log.Print(err)
		}
	}

	log.Printf("handler: %v %v", req.Method, req.URL.String())

	proxy.ServeHTTP(res, req)
}

func main() {
	flag.Parse()
	log.Printf("Starting proxy server on port %d and forwarding to backend %s", *port, *backend)
	http.HandleFunc("/", handleRequest)
	log.Fatal(http.ListenAndServe(":"+strconv.Itoa(*port), nil))
}
