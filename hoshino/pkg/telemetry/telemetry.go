package telemetry

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"

	"github.com/sapslaj/homelab-pets/hoshino/pkg/env"
)

type ContextKey string

const ServiceName = "hoshino"

var Tracer = otel.Tracer(ServiceName)

func StartTelemetry(ctx context.Context) func() {
	endpoint, err := env.Get[string]("OTEL_EXPORTER_OTLP_ENDPOINT")
	if err != nil {
		if env.IsErrVarNotFound(err) {
			slog.Info("OTEL_EXPORTER_OTLP_ENDPOINT not set, disabling otel")
			return func() {}
		}
		slog.Error("error reading OTEL_EXPORTER_OTLP_ENDPOINT environment variable", slog.Any("error", err))
		return func() {}
	}

	exporter, err := otlptrace.New(
		ctx,
		otlptracegrpc.NewClient(
			otlptracegrpc.WithInsecure(),
			otlptracegrpc.WithEndpointURL(endpoint),
		),
	)
	if err != nil {
		slog.Error("error setting up otlptrace", slog.Any("error", err))
		return func() {}
	}

	res, err := resource.New(
		context.Background(),
		resource.WithAttributes(
			attribute.String("service.name", ServiceName),
			attribute.String("library.language", "go"),
		),
	)
	if err != nil {
		slog.Error("error setting up otel resource", slog.Any("error", err))
		return func() {}
	}

	otel.SetTracerProvider(
		sdktrace.NewTracerProvider(
			sdktrace.WithSampler(sdktrace.AlwaysSample()),
			sdktrace.WithBatcher(exporter),
			sdktrace.WithResource(res),
		),
	)

	return func() {
		time.Sleep(time.Second)
		exporter.Shutdown(ctx)
	}
}

// OtelJSON JSON marshals any value into an otel attribute.KeyValue
func OtelJSON(key string, value any) attribute.KeyValue {
	data, err := json.Marshal(value)
	if err != nil {
		return attribute.String(key, "err!"+err.Error())
	}
	return attribute.String(key, string(data))
}
