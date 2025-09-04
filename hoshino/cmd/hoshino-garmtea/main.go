package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	garmclient "github.com/cloudbase/garm/client"
	"github.com/cloudbase/garm/client/login"
	"github.com/cloudbase/garm/params"
	openapiRuntimeClient "github.com/go-openapi/runtime/client"
	"github.com/labstack/echo-contrib/echoprometheus"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/ncruces/go-strftime"
	"go.opentelemetry.io/contrib/instrumentation/github.com/labstack/echo/otelecho"

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
	mainLogger := telemetry.DefaultLogger

	client := garmclient.NewHTTPClientWithConfig(nil, &garmclient.TransportConfig{
		Host:     "localhost:9997", // FIXME: don't hardcode this
		BasePath: garmclient.DefaultBasePath,
		Schemes:  garmclient.DefaultSchemes,
	})

	metrics := echo.New()
	metrics.HideBanner = true
	metrics.HidePort = true
	metrics.GET("/metrics", echoprometheus.NewHandler())

	e := echo.New()
	e.HideBanner = true
	e.HidePort = true
	e.Use(middleware.Recover())
	e.Use(middleware.RequestID())
	e.Use(echoprometheus.NewMiddleware("shimiko"))
	e.Use(otelecho.Middleware(telemetry.ServiceName))
	e.Use(NewRequestLoggerMiddleware(mainLogger))

	e.POST("/webhook/gitea/system/repository", func(c echo.Context) error {
		logger := LoggerWithEchoContext(c, nil)
		ctx := telemetry.ContextWithLogger(c.Request().Context(), logger)
		reader, err := c.Request().GetBody()
		if err != nil {
			logger.ErrorContext(ctx, "error reading body", slog.Any("error", err))
			return err
		}
		defer reader.Close()

		var payload PayloadRepository
		err = json.NewDecoder(reader).Decode(&payload)
		if err != nil {
			logger.ErrorContext(ctx, "error parsing payload", slog.Any("error", err))
			return err
		}

		// TODO: do this login once at startup instead of every request
		token, err := client.Login.Login(&login.LoginParams{
			Body: params.PasswordLoginParams{
				Username: "admin", // FIXME: don't hardcode this
				Password: os.Getenv("GARM_ADMIN_PASSWORD"),
			},
		}, nil)
		if err != nil {
			logger.ErrorContext(ctx, "login to garm failed", slog.Any("error", err))
		}

		authToken := openapiRuntimeClient.BearerToken(token.Payload.Token)

		switch payload.Action {
		case "deleted":
			return DeleteRepository(ctx, client, authToken, payload.Repository).AsResponse(c)
		case "created":
			return SetupRepository(ctx, client, authToken, payload.Repository).AsResponse(c)
		default:
			logger.WarnContext(ctx, "invalid payload action", slog.String("payload_action", payload.Action))
			return c.JSON(400, map[string]string{
				"status":  "error",
				"message": fmt.Sprintf("invalid payload action: %s", payload.Action),
			})
		}
	})

	errChan := make(chan error)

	mainLogger.Info("starting server", slog.Int("http_port", 8399), slog.Int("metrics_port", 9245))

	go func() {
		errChan <- metrics.Start(":9245")
	}()

	go func() {
		errChan <- e.Start(":8399")
	}()

	err := <-errChan
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		mainLogger.Error("error running server", slog.Any("error", err))
		os.Exit(1)
	}
	mainLogger.Info("shut down server")
	os.Exit(0)
}
