package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/ncruces/go-strftime"
	"gorm.io/gorm"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/env"
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
	Echo   *echo.Echo
	Logger *slog.Logger
	DB     *gorm.DB

	HTTPPort  int
	HTTPSPort int

	TLSCertFile string
	TLSKeyFile  string
}

func NewServer(ctx context.Context) (*Server, error) {
	s := &Server{
		Echo:   echo.New(),
		Logger: telemetry.LoggerFromContext(ctx),
	}

	RegisterLegoLogger(s.Logger)

	var err error
	s.HTTPPort, err = env.GetDefault("SHIMIKO_HTTP_PORT", 8080)
	if err != nil {
		return s, fmt.Errorf("error setting HTTP port: %w", err)
	}

	s.HTTPSPort, err = env.GetDefault("SHIMIKO_HTTPS_PORT", 0)
	if err != nil {
		return s, fmt.Errorf("error setting HTTPS port: %w", err)
	}

	if s.HTTPSPort != 0 {
		var err error

		certsPath := env.MustGetDefault("SHIMIKO_CERTS_PATH", ".")
		s.TLSCertFile = path.Join(certsPath, "shimiko-server.cert.pem")
		s.TLSKeyFile = path.Join(certsPath, "shimiko-server.key.pem")

		accountPrivateKey, err := GetOrGeneratePrivateKey(ctx, path.Join(certsPath, "shimiko-server.acme-account-key.pem"))
		if err != nil {
			return s, err
		}

		certificatePrivateKey, err := GetOrGeneratePrivateKey(ctx, s.TLSKeyFile)
		if err != nil {
			return s, err
		}

		legoCertConfig := &LegoCertConfig{
			CertificatePrivateKey: certificatePrivateKey,
			AccountPrivateKey:     accountPrivateKey,
		}

		legoCertConfig.Email, err = env.Get[string]("SHIMIKO_ACME_EMAIL")
		if err != nil && !env.IsErrVarNotFound(err) {
			return s, err
		}

		if env.IsErrVarNotFound(err) || legoCertConfig.Email == "" {
			s.Logger.InfoContext(ctx, "no ACME email found, generating self-signed cert")

			envCertDomains, err := env.Get[string]("SHIMIKO_CERT_DOMAINS")
			if err != nil {
				if !env.IsErrVarNotFound(err) {
					return s, err
				}
				legoCertConfig.Domains = []string{"localhost"}
				hostname, err := os.Hostname()
				if err == nil {
					legoCertConfig.Domains = append(legoCertConfig.Domains, hostname)
				}
			} else {
				legoCertConfig.Domains = strings.Split(envCertDomains, ",")
			}

			err = GetOrGenerateSelfSignedCert(ctx, s.TLSCertFile, legoCertConfig)
			if err != nil {
				return s, err
			}
		} else {
			s.Logger.InfoContext(ctx, "ACME email set, generating ACME cert")

			envCertDomains, err := env.Get[string]("SHIMIKO_CERT_DOMAINS")
			if err != nil {
				return s, err
			}
			legoCertConfig.Domains = strings.Split(envCertDomains, ",")

			legoCertConfig.ACMEUrl = env.MustGetDefault(
				"SHIMIKO_ACME_URL",
				"https://acme-staging-v02.api.letsencrypt.org/directory",
			)

			legoCertConfig.Route53HostedZoneID = persistence.Route53HostedZoneId

			err = GetOrGenerateACMECert(ctx, s.TLSCertFile, legoCertConfig)
			if err != nil {
				return s, err
			}
		}
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
	logger := s.Logger.With(
		slog.Int("http_port", s.HTTPPort),
	)
	if s.HTTPSPort != 0 {
		logger = logger.With(
			slog.Int("https_port", s.HTTPSPort),
		)
	}
	logger.Info(
		"starting server",
		slog.Int("http_port", s.HTTPPort),
		slog.Int("https_port", s.HTTPSPort),
	)

	errChan := make(chan error)

	go func() {
		errChan <- s.Echo.Start(fmt.Sprintf(":%d", s.HTTPPort))
	}()

	if s.HTTPSPort != 0 {
		go func() {
			errChan <- s.Echo.StartTLS(fmt.Sprintf(":%d", s.HTTPSPort), s.TLSCertFile, s.TLSKeyFile)
		}()
	}

	err := <-errChan
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("failed to start server", "error", err)
		return err
	}
	logger.Info("shut down server")
	return nil
}

func (s *Server) Run() error {
	return RunServer(s)
}

func (s *Server) RequestLogger(c echo.Context) *slog.Logger {
	return LoggerWithEchoContext(c, s.Logger)
}
