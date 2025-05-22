package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
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

	ReconcileInterval time.Duration

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

	s.ReconcileInterval, err = env.GetDefault[time.Duration]("SHIMIKO_RECONCILE_INTERVAL", 0)
	if err != nil {
		return s, fmt.Errorf("error setting reconcile interval: %w", err)
	}

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
		slog.Duration("reconcile_interval", s.ReconcileInterval),
		slog.Int("http_port", s.HTTPPort),
	)
	if s.HTTPSPort != 0 {
		logger = logger.With(
			slog.Int("https_port", s.HTTPSPort),
		)
	}
	logger.Info("starting server")

	errChan := make(chan error)

	go func() {
		if s.ReconcileInterval == 0 {
			logger.Info("reconcile interval is 0, reconciliation disabled")
			return
		}

		ctx := context.Background()
		logger.InfoContext(ctx, "starting initial record reconcile")
		err := s.ReconcileAll(ctx)
		if err == nil {
			logger.InfoContext(ctx, "finished initial record reconcile with no errors")
		} else {
			logger.WarnContext(ctx, "finished initial record reconcile with errors", "error", err)
		}

		for range time.Tick(s.ReconcileInterval) {
			ctx := context.Background()
			logger.InfoContext(ctx, "starting record reconcile")
			err := s.ReconcileAll(ctx)
			if err == nil {
				logger.InfoContext(ctx, "finished record reconcile with no errors")
			} else {
				logger.WarnContext(ctx, "finished record reconcile with errors", "error", err)
			}
		}
	}()

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

func (s *Server) ReconcileAll(ctx context.Context) error {
	returnErrors := s.FixMyself(ctx)

	logger := s.Logger.With("subsystem", "reconcile")

	var records []*persistence.DNSRecord
	result := s.DB.Unscoped().Find(&records)
	if result.Error != nil {
		logger.ErrorContext(ctx, "error querying DNS records", "error", result.Error)
		return errors.Join(returnErrors, result.Error)
	}

	logger.InfoContext(ctx, "starting persistence session for record deletions")
	ps, err := persistence.NewSession(ctx, s.DB)
	if err != nil {
		logger.ErrorContext(ctx, "error creating persistence session", "error", err)
		return errors.Join(returnErrors, err)
	}

	// start by deleting any records
	deleted := []*persistence.DNSRecord{}

	for _, record := range records {
		if record.DeletedAt.Time.IsZero() {
			// skip records without delete marker for now
			continue
		}

		recordLogger := logger.With(slog.Any("record", record))
		recordLogger.InfoContext(ctx, "record is soft-deleted")

		successfullyDeleted := true

		err := ps.CoreDNS.DeleteRecord(ctx, record)
		if err != nil {
			recordLogger.WarnContext(ctx, "record failed to be deleted from CoreDNS", "error", err)
			returnErrors = errors.Join(returnErrors, err)
			successfullyDeleted = false
		}

		err = ps.Route53.DeleteRecord(ctx, record)
		if err != nil {
			recordLogger.WarnContext(ctx, "record failed to be deleted from Route53", "error", err)
			returnErrors = errors.Join(returnErrors, err)
			successfullyDeleted = false
		}

		if successfullyDeleted {
			deleted = append(deleted, record)
		}
	}

	err = ps.Finish(ctx)
	if err != nil {
		logger.WarnContext(ctx, "failed to finish persistence session for record deletions")
		returnErrors = errors.Join(returnErrors, err)
	} else {
		logger.InfoContext(ctx, "finished persistence session for record deletions")
		for _, record := range deleted {
			logger.InfoContext(ctx, "deleting record permanently", "record_id", record.ID)
			tx := s.DB.Unscoped().Delete(&record)
			if tx.Error != nil {
				logger.WarnContext(ctx, "failed to delete record permanently", "record_id", record.ID)
				returnErrors = errors.Join(returnErrors, err)
			}
		}
	}

	logger.InfoContext(ctx, "starting persistence session for record updates")
	ps, err = persistence.NewSession(ctx, s.DB)
	if err != nil {
		logger.ErrorContext(ctx, "error creating persistence session", "error", err)
		return err
	}

	for _, record := range records {
		if !record.DeletedAt.Time.IsZero() {
			// skip deleted records
			continue
		}

		recordLogger := logger.With(slog.Any("record", record))
		recordLogger.InfoContext(ctx, "upserting record")

		err := ps.CoreDNS.UpsertRecord(ctx, record, record)
		if err != nil {
			recordLogger.WarnContext(ctx, "record failed to be updated in CoreDNS", "error", err)
			returnErrors = errors.Join(returnErrors, err)
		}

		err = ps.Route53.UpsertRecord(ctx, record, record)
		if err != nil {
			recordLogger.WarnContext(ctx, "record failed to be updated in Route53", "error", err)
			returnErrors = errors.Join(returnErrors, err)
		}
	}

	err = ps.Finish(ctx)
	if err != nil {
		logger.WarnContext(ctx, "failed to finish persistence session for record updates")
		returnErrors = errors.Join(returnErrors, err)
	}

	return returnErrors
}

func (s *Server) FixMyself(ctx context.Context) error {
	logger := s.Logger.With("subsystem", "reconcile")

	envCertDomains, err := env.Get[string]("SHIMIKO_CERT_DOMAINS")
	if err != nil {
		logger.WarnContext(ctx, "could not fix myself: couldn't figure out what domains I'm supposed to use (╥_╥)", "error", err)
		return err
	}
	domains := strings.Split(envCertDomains, ",")

	if len(domains) == 0 {
		logger.WarnContext(ctx, "could not fix myself: no domains configured to fix myself with <( ⸝⸝•̀ - •́⸝⸝)>")
		return nil
	}

	conn, err := net.Dial("udp", "172.24.0.0:1")
	if err != nil {
		logger.WarnContext(ctx, "could not fix myself: Go doesn't want me to know my local IP address! ( ｡ •̀ ⤙ •́ ｡ )", "error", err)
		return err
	}
	udpAddr, ok := conn.LocalAddr().(*net.UDPAddr)
	if !ok {
		err = fmt.Errorf("expected conn.LocalAddr() type to be *net.UDPAddr but got %T", conn.LocalAddr())
		logger.WarnContext(ctx, "could not fix myself: I need a *net.UDPAddr but Go said no! (● w ● 🔪)", "error", err)
		return err
	}
	address := strings.Split(udpAddr.String(), ":")[0]
	logger = logger.With("address", address)

	ps, err := persistence.NewSession(ctx, s.DB)
	if err != nil {
		logger.WarnContext(ctx, "could not fix myself: couldn't start a persistence session (╯︵╰,)✲", "error", err)
		return err
	}

	var multierr error
	for _, domain := range domains {
		domainLogger := logger.With("domain", domain)

		var dnsRecord *persistence.DNSRecord
		ps.DB.Where("name = ? AND type = ?", strings.TrimSuffix(domain, ".sapslaj.xyz"), "A").First(&dnsRecord)

		if dnsRecord == nil {
			domainLogger.InfoContext(ctx, "no record registered for this domain; skipping")
			continue
		}

		domainLogger.InfoContext(ctx, "updating record")

		dnsRecord.Records = []string{address}

		err := dnsRecord.Upsert(ctx, ps)
		if err != nil {
			multierr = errors.Join(multierr, err)
			domainLogger.WarnContext(ctx, "could not update record", "error", "err")
			continue
		}

		domainLogger.InfoContext(ctx, "record updated")
	}

	if multierr != nil {
		logger.WarnContext(ctx, "could not fix myself: errors updating records (๑´•.̫ • `๑)", "error", multierr)
	}

	err = ps.Finish(ctx)
	if err != nil {
		multierr = errors.Join(multierr, err)
		logger.WarnContext(ctx, "could not fix myself: couldn't finish persistence session (╯⌒︵⌒)╯", "error", err)
	}

	return multierr
}
