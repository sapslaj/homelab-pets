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
	"gorm.io/gorm"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/persistence"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/telemetry"
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

type Server struct {
	Echo    *echo.Echo
	Address string
	Logger  *slog.Logger
	DB      *gorm.DB
}

func NewServer(ctx context.Context) (*Server, error) {
	logger := telemetry.LoggerFromContext(ctx)
	// TODO: HTTPS
	port := os.Getenv("SHIMIKO_SERVER_PORT")
	if port == "" {
		port = "8080"
	}
	s := &Server{
		Echo:    echo.New(),
		Address: ":" + port,
		Logger:  logger,
	}

	db, err := persistence.OpenDB(ctx)
	s.DB = db
	if err != nil {
		return s, err
	}

	s.Echo.HideBanner = true
	s.Echo.HidePort = true

	s.Echo.Use(middleware.Recover())
	s.Echo.Use(middleware.RequestID())
	s.Echo.Use(NewRequestLoggerMiddleware(s.Logger))

	s.Routes()

	return s, nil
}

func RunServer(s *Server) error {
	s.Logger.Info("starting server", "address", s.Address)
	err := s.Echo.Start(s.Address)
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		s.Logger.Error("failed to start server", "error", err)
		return err
	}
	s.Logger.Info("shut down server")
	return nil
}

func (s *Server) Run() error {
	return RunServer(s)
}

func (s *Server) RequestLogger(c echo.Context) *slog.Logger {
	return LoggerWithEchoContext(c, s.Logger)
}
