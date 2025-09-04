.PHONY: build
build:
	docker build -t oci.sapslaj.xyz/garm/runner:latest .

.PHONY: push
push: build
	docker push oci.sapslaj.xyz/garm/runner:latest
