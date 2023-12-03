#!/bin/bash

VERSION="main"
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)

FILES=(
	"monitoring.coreos.com_alertmanagerconfigs.yaml"
	"monitoring.coreos.com_alertmanagers.yaml"
	"monitoring.coreos.com_podmonitors.yaml"
	"monitoring.coreos.com_probes.yaml"
	"monitoring.coreos.com_prometheusagents.yaml"
	"monitoring.coreos.com_prometheuses.yaml"
	"monitoring.coreos.com_prometheusrules.yaml"
	"monitoring.coreos.com_scrapeconfigs.yaml"
	"monitoring.coreos.com_servicemonitors.yaml"
	"monitoring.coreos.com_thanosrulers.yaml"
)

DESTINATION="${SCRIPT_DIR}/../files/prometheus_operator_crds.yaml"
echo -n '' > "$DESTINATION"

for file in "${FILES[@]}"; do
	URL="https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/$VERSION/example/prometheus-operator-crd/$file"

	echo -e "Downloading Prometheus Operator CRD with Version ${VERSION}:\n${URL}\n"

	if ! curl --silent --retry-all-errors --fail --location "${URL}" >> "${DESTINATION}"; then
		echo -e "Failed to download ${URL}!"
		exit 1
	fi
done
