package main

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/labstack/echo-contrib/echoprometheus"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/luthermonson/go-proxmox"
	"github.com/ncruces/go-strftime"
	"go.opentelemetry.io/contrib/instrumentation/github.com/labstack/echo/otelecho"

	"github.com/sapslaj/homelab-pets/hoshino/pkg/env"
	"github.com/sapslaj/homelab-pets/hoshino/pkg/telemetry"
)

func LoggerWithEchoContext(c echo.Context, logger *slog.Logger) *slog.Logger {
	if logger == nil {
		logger = telemetry.LoggerFromContext(c.Request().Context())
	}
	return logger.With(
		"request_id", c.Response().Header().Get(echo.HeaderXRequestID),
	)
}

func NewRequestLoggerMiddleware(parentLogger *slog.Logger) echo.MiddlewareFunc {
	return middleware.RequestLoggerWithConfig(middleware.RequestLoggerConfig{
		LogLatency:       true,
		LogProtocol:      true,
		LogRemoteIP:      true,
		LogHost:          true,
		LogMethod:        true,
		LogURI:           true,
		LogURIPath:       true,
		LogRoutePath:     true,
		LogReferer:       true,
		LogUserAgent:     true,
		LogStatus:        true,
		LogError:         true,
		LogContentLength: true,
		LogResponseSize:  true,
		LogValuesFunc: func(c echo.Context, v middleware.RequestLoggerValues) error {
			now := time.Now()
			logger := LoggerWithEchoContext(c, parentLogger).With(
				"start_time", v.StartTime,
				"end_time", now,
				"latency", v.Latency,
				"protocol", v.Protocol,
				"remote_ip", v.RemoteIP,
				"host", v.Host,
				"method", v.Method,
				"uri", v.URI,
				"uri_path", v.URIPath,
				"route_path", v.RoutePath,
				"referer", v.Referer,
				"user_agent", v.UserAgent,
				"status", v.Status,
				"content_length", v.ContentLength,
				"response_size", v.ResponseSize,
			)
			if v.Error != nil {
				logger = logger.With("error", v.Error)
			}

			var msg strings.Builder
			msg.WriteString(v.RemoteIP)
			msg.WriteString(" - ")
			msg.WriteString(fmt.Sprintf("\"%s\"", v.UserAgent))
			msg.WriteString(" ")
			msg.WriteString(fmt.Sprintf("[%s] ", strftime.Format("%d/%b/%Y:%H:%M:%S %z", v.StartTime)))
			msg.WriteRune('"')
			msg.WriteString(v.Method)
			msg.WriteString(" ")
			msg.WriteString(v.URIPath)
			msg.WriteString(" ")
			msg.WriteString(v.Protocol)
			msg.WriteRune('"')
			msg.WriteString(" ")
			msg.WriteString(fmt.Sprintf("%d", v.Status))
			msg.WriteString(" ")
			msg.WriteString(fmt.Sprintf("%d", v.ResponseSize))

			if v.Status >= 500 {
				logger.ErrorContext(c.Request().Context(), msg.String())
			} else if v.Error != nil {
				logger.WarnContext(c.Request().Context(), msg.String())
			} else {
				logger.InfoContext(c.Request().Context(), msg.String())
			}
			return nil
		},
	})
}

func main() {
	ctx := context.Background()
	var err error
	mainLogger := telemetry.DefaultLogger

	credentials := proxmox.Credentials{
		Username: env.MustGet[string]("PROXMOX_VE_USERNAME"),
		Password: env.MustGet[string]("PROXMOX_VE_PASSWORD"),
	}
	client := proxmox.NewClient(env.MustGet[string]("PROXMOX_VE_ENDPOINT")+"api2/json",
		proxmox.WithCredentials(&credentials),
		proxmox.WithHTTPClient(&http.Client{
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{
					InsecureSkipVerify: env.MustGetDefault("PROXMOX_VE_INSECURE", false),
				},
			},
		}),
	)

	version, err := client.Version(ctx)
	if err != nil {
		mainLogger.Error("error getting Proxmox version", slog.Any("error", err))
		os.Exit(1)
	}

	mainLogger.Info(version.Release)

	nodes, err := client.Nodes(ctx)
	if err != nil {
		mainLogger.Error("error getting Proxmox nodes", slog.Any("error", err))
		os.Exit(1)
	}

	for _, nodeStatus := range nodes {
		mainLogger.Info("node found", slog.Any("node_status", nodeStatus))
		node, err := client.Node(ctx, nodeStatus.Node)
		if err != nil {
			mainLogger.Error("error getting Proxmox node", slog.Any("node", nodeStatus), slog.Any("error", err))
			os.Exit(1)
		}

		vms, err := node.VirtualMachines(ctx)
		if err != nil {
			mainLogger.Error("error getting Proxmox node VMs", slog.Any("node", nodeStatus), slog.Any("error", err))
			os.Exit(1)
		}

		for _, vmInfo := range vms {
			vm, err := node.VirtualMachine(ctx, int(vmInfo.VMID))
			if err != nil {
				mainLogger.Error("error getting Proxmox node VM", slog.Any("node", nodeStatus), slog.Any("vm", vmInfo), slog.Any("error", err))
				os.Exit(1)
			}
			mainLogger.Info("VM found", slog.Any("node", nodeStatus), slog.Any("vm", vm), slog.Any("error", err))
		}
	}

	return

	metrics := echo.New()
	metrics.HideBanner = true
	metrics.HidePort = true
	metrics.GET("/metrics", echoprometheus.NewHandler())

	e := echo.New()
	e.HideBanner = true
	e.HidePort = true
	e.Use(middleware.Recover())
	e.Use(middleware.RequestID())
	e.Use(echoprometheus.NewMiddleware("hoshino"))
	e.Use(otelecho.Middleware(telemetry.ServiceName))
	e.Use(NewRequestLoggerMiddleware(mainLogger))

	errChan := make(chan error)

	mainLogger.Info("starting server", slog.Int("http_port", 8399), slog.Int("metrics_port", 9245))

	go func() {
		errChan <- metrics.Start(":9245")
	}()

	go func() {
		errChan <- e.Start(":8399")
	}()

	err = <-errChan
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		mainLogger.Error("error running server", slog.Any("error", err))
		os.Exit(1)
	}
	mainLogger.Info("shut down server")
	os.Exit(0)
}
