package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/ncruces/go-strftime"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/persistence"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/telemetry"
)

type Server struct {
	e       *echo.Echo
	address string
	p       *persistence.Persistence
}

func NewServer() (*Server, error) {
	// TODO: HTTPS
	port := os.Getenv("SHIMIKO_SERVER_PORT")
	if port == "" {
		port = "8080"
	}
	s := &Server{
		e:       echo.New(),
		address: ":" + port,
	}

	p, err := persistence.NewPersistence(s.logger())
	s.p = p
	if err != nil {
		return s, err
	}

	s.e.HideBanner = true
	s.e.HidePort = true

	s.e.Use(middleware.Recover())
	s.e.Use(middleware.RequestID())
	s.e.Use(s.requestLoggerMiddleware())

	s.routes()

	return s, nil
}

func (s *Server) Run(ctx context.Context) error {
	logger := s.logger()
	logger.Info("starting server", "address", s.address)
	err := s.e.Start(s.address)
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.ErrorContext(ctx, "failed to start server", "error", err)
		return err
	}
	logger.InfoContext(ctx, "shut down server")
	return nil
}

func (s *Server) logger() *slog.Logger {
	return telemetry.DefaultLogger.With("cmd", "server")
}

func (s *Server) loggerWithContext(_ context.Context) *slog.Logger {
	// placeholder
	return s.logger()
}

func (s *Server) loggerWithEchoContext(c echo.Context) *slog.Logger {
	return s.loggerWithContext(c.Request().Context()).With(
		"request_id", c.Response().Header().Get(echo.HeaderXRequestID),
	)
}

func (s *Server) requestLogger(c echo.Context, v middleware.RequestLoggerValues) error {
	now := time.Now()
	logger := s.loggerWithEchoContext(c).With(
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
}

func (s *Server) requestLoggerMiddleware() echo.MiddlewareFunc {
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
		LogValuesFunc:    s.requestLogger,
	})
}
