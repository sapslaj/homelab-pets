package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
	"gorm.io/gorm"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/persistence"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/telemetry"
	"github.com/sapslaj/homelab-pets/shimiko/static"
)

func (s *Server) Routes() {
	e := s.Echo
	e.GET("/", s.Root)
	e.GET("/healthz", s.HealthzLiveness)
	e.GET("/healthz/liveness", s.HealthzLiveness)
	e.GET("/v1", s.V1Root)
	e.GET("/v1/zonepop/endpoints/forward", s.ZonePopEndpoints)
	e.GET("/v1/dns-records", s.IndexDNSRecords)
	e.POST("/v1/dns-records", s.UpsertDNSRecords)
	e.PUT("/v1/dns-records", s.UpsertDNSRecords)
	e.PATCH("/v1/dns-records", s.UpsertDNSRecords)
	e.DELETE("/v1/dns-records", s.DeleteDNSRecords)
	e.POST("/v1/dns-records/refresh", s.RefreshDNSRecords)
	e.GET("/v1/dns-records/:type/:name", s.ShowDNSRecord)
	e.POST("/v1/dns-records/:type/:name", s.UpsertDNSRecord)
	e.PUT("/v1/dns-records/:type/:name", s.UpsertDNSRecord)
	e.PATCH("/v1/dns-records/:type/:name", s.UpsertDNSRecord)
	e.DELETE("/v1/dns-records/:type/:name", s.DeleteDNSRecord)
	e.GET("/acme-dns/health", s.AcmeDNSHealth)
	e.POST("/acme-dns/register", s.AcmeDNSRegister)
	e.POST("/acme-dns/update", s.AcmeDNSUpdate)
}

func (s *Server) Root(c echo.Context) error {
	_, span := telemetry.Tracer.Start(
		c.Request().Context(),
		"shimiko/server.Server.Root",
	)
	defer span.End()

	file, err := static.Files.Open("index.html")
	if err != nil {
		span.SetStatus(codes.Error, err.Error())
		return c.NoContent(http.StatusNotFound)
	}
	defer file.Close()

	seeker, ok := file.(io.ReadSeeker)
	if !ok {
		span.SetStatus(codes.Error, "embedded file does not implement io.ReadSeeker")
		return c.NoContent(http.StatusInternalServerError)
	}

	span.SetStatus(codes.Ok, "")
	return c.Stream(http.StatusOK, "text/html", seeker)
}

func (s *Server) V1Root(c echo.Context) error {
	_, span := telemetry.Tracer.Start(
		c.Request().Context(),
		"shimiko/server.Server.V1Root",
	)
	defer span.End()

	span.SetStatus(codes.Ok, "")
	return c.JSON(200, map[string]any{
		"msg": "Hello, Sensei! It's Shimiko!",
	})
}

func (s *Server) HealthzLiveness(c echo.Context) error {
	_, span := telemetry.Tracer.Start(
		c.Request().Context(),
		"shimiko/server.Server.HealthzLiveness",
	)
	defer span.End()

	span.SetStatus(codes.Ok, "")
	return c.JSON(200, map[string]any{
		"msg": "OK",
	})
}

func (s *Server) ZonePopEndpoints(c echo.Context) error {
	ctx, span := telemetry.Tracer.Start(
		c.Request().Context(),
		"shimiko/server.Server.ZonePopEndpoints",
	)
	defer span.End()

	logger := s.RequestLogger(c)

	res, err := http.Get("http://localhost:9412/endpoints/forward")
	if err != nil {
		logger.ErrorContext(
			ctx,
			"error sending request to ZonePop",
			"error", err,
		)
		span.SetStatus(codes.Error, err.Error())
		return c.JSON(502, map[string]any{
			"msg": "error sending request to ZonePop",
		})
	}

	contentType := res.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}
	defer res.Body.Close()

	span.SetStatus(codes.Ok, "")
	return c.Stream(res.StatusCode, contentType, res.Body)
}

func (s *Server) IndexDNSRecords(c echo.Context) error {
	ctx, span := telemetry.Tracer.Start(
		c.Request().Context(),
		"shimiko/server.Server.IndexDNSRecords",
	)
	defer span.End()

	logger := s.RequestLogger(c)

	var records []*persistence.DNSRecord
	result := s.DB.Find(&records)
	if result.Error != nil {
		logger.ErrorContext(
			ctx,
			"error retrieving DNSRecords",
			"error", result.Error,
		)
		span.SetStatus(codes.Error, result.Error.Error())
		return result.Error
	}

	span.SetStatus(codes.Ok, "")
	return c.JSON(200, map[string]any{
		"records": records,
	})
}

func (s *Server) UpsertDNSRecords(c echo.Context) error {
	ctx, span := telemetry.Tracer.Start(
		c.Request().Context(),
		"shimiko/server.Server.UpsertDNSRecords",
	)
	defer span.End()

	logger := s.RequestLogger(c)

	type bodyType struct {
		Records []*persistence.DNSRecord `json:"records"`
	}
	var body bodyType
	decoder := json.NewDecoder(c.Request().Body)
	err := decoder.Decode(&body)
	if err != nil {
		span.SetStatus(codes.Error, err.Error())
		return c.JSON(400, map[string]any{
			"msg":   "error parsing request body",
			"error": err.Error(),
		})
	}
	span.SetAttributes(telemetry.OtelJSON("http.request.body", body))

	type responseResultType struct {
		Record     *persistence.DNSRecord           `json:"record"`
		Status     string                           `json:"status"`
		Error      string                           `json:"error,omitempty"`
		Validation *persistence.DNSRecordValidation `json:"validation,omitempty"`
	}
	type responseType struct {
		Results []responseResultType `json:"results"`
		Error   string               `json:"error,omitempty"`
	}
	response := responseType{
		Results: []responseResultType{},
	}

	ps, err := persistence.NewSession(ctx, s.DB)
	if err != nil {
		logger.ErrorContext(
			ctx,
			"failed to start persistence session",
			"error", err,
		)
		span.SetStatus(codes.Error, err.Error())
		return c.JSON(500, map[string]any{
			"msg":    "internal server error",
			"status": "ERROR",
			"error":  err.Error(),
		})
	}

	hasError := false
	failsValidation := false
	for _, record := range body.Records {
		validationErr := record.Validate()
		if validationErr != nil {
			failsValidation = true
			response.Results = append(response.Results, responseResultType{
				Record:     record,
				Status:     "ERROR",
				Validation: validationErr,
			})
			continue
		}
	}

	ps.Shallow = true
	for _, record := range body.Records {
		if !record.ExistsInDB(ctx, ps) {
			ps.Shallow = false
		}
	}

	for _, record := range body.Records {
		err := record.Upsert(ctx, ps)
		if err != nil {
			hasError = true
			logger.ErrorContext(
				ctx,
				"error upserting DNSRecord",
				"error", err,
				"dns_record", record,
			)
			response.Results = append(response.Results, responseResultType{
				Record: record,
				Status: "ERROR",
				Error:  err.Error(),
			})
		} else {
			response.Results = append(response.Results, responseResultType{
				Record: record,
				Status: "OK",
			})
		}
	}

	err = ps.Finish(ctx)
	if err != nil {
		span.SetStatus(codes.Error, err.Error())
		logger.ErrorContext(
			ctx,
			"failed to finish persistence session",
			"error", err,
		)
		hasError = true
		response.Error = err.Error()
	}

	if ps.Shallow {
		s.OnDemandReconcileAll.Store(true)
	}

	var statusCode int
	if hasError {
		statusCode = 500
	} else if failsValidation {
		statusCode = 400
	} else {
		statusCode = 200
	}

	span.SetAttributes(telemetry.OtelJSON("http.response.body", response))
	if statusCode >= 500 {
		span.SetStatus(codes.Error, fmt.Sprintf("status code = %d", statusCode))
	} else {
		span.SetStatus(codes.Ok, "")
	}
	return c.JSON(statusCode, response)
}

func (s *Server) DeleteDNSRecords(c echo.Context) error {
	ctx, span := telemetry.Tracer.Start(
		c.Request().Context(),
		"shimiko/server.Server.DeleteDNSRecords",
	)
	defer span.End()

	logger := s.RequestLogger(c)

	type bodyType struct {
		Records []*persistence.DNSRecord `json:"records"`
	}
	var body bodyType
	decoder := json.NewDecoder(c.Request().Body)
	err := decoder.Decode(&body)
	if err != nil {
		return c.JSON(400, map[string]any{
			"msg":   "error parsing request body",
			"error": err.Error(),
		})
	}
	span.SetAttributes(telemetry.OtelJSON("http.request.body", body))

	type responseResultType struct {
		Record *persistence.DNSRecord `json:"record"`
		Status string                 `json:"status"`
		Error  string                 `json:"error,omitempty"`
	}
	type responseType struct {
		Results []responseResultType `json:"results"`
		Error   string               `json:"error,omitempty"`
	}
	response := responseType{
		Results: []responseResultType{},
	}

	ps, err := persistence.NewSession(ctx, s.DB)
	if err != nil {
		logger.ErrorContext(
			ctx,
			"failed to start persistence session",
			"error", err,
		)
		span.SetStatus(codes.Error, err.Error())
		return c.JSON(500, map[string]any{
			"msg":    "internal server error",
			"status": "ERROR",
			"error":  err.Error(),
		})
	}

	hasError := false
	for _, record := range body.Records {
		err := record.Delete(ctx, ps)
		if err != nil {
			hasError = true
			logger.ErrorContext(
				ctx,
				"error deleting DNSRecord",
				"error", err,
				"dns_record", record,
			)
			response.Results = append(response.Results, responseResultType{
				Record: record,
				Status: "ERROR",
				Error:  err.Error(),
			})
		} else {
			response.Results = append(response.Results, responseResultType{
				Record: record,
				Status: "OK",
			})
		}
	}

	err = ps.Finish(ctx)
	if err != nil {
		logger.ErrorContext(
			ctx,
			"failed to finish persistence session",
			"error", err,
		)
		hasError = true
		response.Error = err.Error()
	}

	if ps.Shallow {
		s.OnDemandReconcileAll.Store(true)
	}

	var statusCode int
	if hasError {
		statusCode = 500
	} else {
		statusCode = 200
	}

	span.SetAttributes(telemetry.OtelJSON("http.response.body", response))
	if statusCode >= 500 {
		span.SetStatus(codes.Error, fmt.Sprintf("status code = %d", statusCode))
	} else {
		span.SetStatus(codes.Ok, "")
	}

	return c.JSON(statusCode, response)
}

func (s *Server) ShowDNSRecord(c echo.Context) error {
	ctx, span := telemetry.Tracer.Start(
		c.Request().Context(),
		"shimiko/server.Server.ShowDNSRecord",
	)
	defer span.End()

	logger := s.RequestLogger(c)

	typ := c.Param("type")
	name := c.Param("name")

	var record *persistence.DNSRecord
	tx := s.DB.Where("type = ? and name = ?", typ, name).First(&record)
	if tx.Error != nil || record == nil {
		if errors.Is(tx.Error, gorm.ErrRecordNotFound) {
			span.SetStatus(codes.Ok, "")
			return c.JSON(404, map[string]any{
				"msg": "not found",
			})
		} else {
			logger.ErrorContext(
				ctx,
				"error showing DNSRecord",
				"error", tx.Error,
				"dns_record", record,
			)
			span.SetStatus(codes.Error, tx.Error.Error())
			return c.JSON(503, map[string]any{
				"msg":   "error looking up DNS record",
				"error": tx.Error.Error(),
			})
		}
	}

	span.SetStatus(codes.Ok, "")
	return c.JSON(200, map[string]any{
		"record": record,
	})
}

func (s *Server) UpsertDNSRecord(c echo.Context) error {
	ctx, span := telemetry.Tracer.Start(
		c.Request().Context(),
		"shimiko/server.Server.UpsertDNSRecord",
	)
	defer span.End()

	logger := s.RequestLogger(c)

	type responseResultType struct {
		Record     *persistence.DNSRecord           `json:"record"`
		Status     string                           `json:"status"`
		Error      string                           `json:"error,omitempty"`
		Validation *persistence.DNSRecordValidation `json:"validation,omitempty"`
	}
	type bodyType struct {
		Record *persistence.DNSRecord `json:"record"`
	}
	var body bodyType

	decoder := json.NewDecoder(c.Request().Body)
	err := decoder.Decode(&body)
	if err != nil {
		span.SetStatus(codes.Error, err.Error())
		return c.JSON(400, map[string]any{
			"msg":   "error parsing request body",
			"error": err.Error(),
		})
	}
	span.SetAttributes(telemetry.OtelJSON("http.request.body", body))

	if body.Record == nil {
		span.SetStatus(codes.Ok, "")
		return c.JSON(400, responseResultType{
			Status: "ERROR",
			Error:  "no record present in request body",
		})
	}

	if body.Record.Type != c.Param("type") {
		span.SetStatus(codes.Ok, "")
		return c.JSON(400, responseResultType{
			Record: body.Record,
			Status: "ERROR",
			Error:  "record in body does not match the type specified in the URL path",
		})
	}
	if body.Record.Name != c.Param("name") {
		span.SetStatus(codes.Ok, "")
		return c.JSON(400, responseResultType{
			Record: body.Record,
			Status: "ERROR",
			Error:  "record in body does not match the name specified in the URL path",
		})
	}

	validationErr := body.Record.Validate()
	if validationErr != nil {
		span.SetStatus(codes.Ok, "")
		return c.JSON(400, responseResultType{
			Record:     body.Record,
			Status:     "ERROR",
			Validation: validationErr,
		})
	}

	ps, err := persistence.NewSession(ctx, s.DB)
	if err != nil {
		logger.ErrorContext(
			ctx,
			"failed to start persistence session",
			"error", err,
		)
		span.SetStatus(codes.Error, err.Error())
		return c.JSON(500, map[string]any{
			"msg":    "internal server error",
			"status": "ERROR",
			"error":  err.Error(),
		})
	}

	ps.Shallow = body.Record.ExistsInDB(ctx, ps)

	err = body.Record.Upsert(ctx, ps)
	if err != nil {
		logger.ErrorContext(
			ctx,
			"error upserting DNSRecord",
			"error", err,
			"dns_record", body.Record,
		)
		span.SetStatus(codes.Error, err.Error())
		return c.JSON(500, responseResultType{
			Record: body.Record,
			Status: "ERROR",
			Error:  err.Error(),
		})
	}

	err = ps.Finish(ctx)
	if err != nil {
		logger.ErrorContext(
			ctx,
			"failed to finish persistence session",
			"error", err,
		)
		span.SetStatus(codes.Error, err.Error())
		return c.JSON(500, responseResultType{
			Record: body.Record,
			Status: "ERROR",
			Error:  err.Error(),
		})
	}

	if ps.Shallow {
		s.OnDemandReconcileAll.Store(true)
	}

	span.SetStatus(codes.Ok, "")
	return c.JSON(200, responseResultType{
		Record: body.Record,
		Status: "OK",
	})
}

func (s *Server) DeleteDNSRecord(c echo.Context) error {
	ctx, span := telemetry.Tracer.Start(
		c.Request().Context(),
		"shimiko/server.Server.DeleteDNSRecord",
	)
	defer span.End()

	logger := s.RequestLogger(c)

	type responseResultType struct {
		Record     *persistence.DNSRecord           `json:"record"`
		Status     string                           `json:"status"`
		Error      string                           `json:"error,omitempty"`
		Validation *persistence.DNSRecordValidation `json:"validation,omitempty"`
	}

	ps, err := persistence.NewSession(ctx, s.DB)
	if err != nil {
		logger.ErrorContext(
			ctx,
			"failed to start persistence session",
			"error", err,
		)
		span.SetStatus(codes.Error, err.Error())
		return c.JSON(500, map[string]any{
			"msg":    "internal server error",
			"status": "ERROR",
			"error":  err.Error(),
		})
	}

	record := &persistence.DNSRecord{
		Type: c.Param("type"),
		Name: c.Param("name"),
	}

	err = record.Delete(ctx, ps)
	if err != nil {
		logger.ErrorContext(
			ctx,
			"error deleting DNSRecord",
			"error", err,
			"dns_record", record,
		)
		span.SetStatus(codes.Error, err.Error())
		return c.JSON(500, responseResultType{
			Record: record,
			Status: "ERROR",
			Error:  err.Error(),
		})
	}

	err = ps.Finish(ctx)
	if err != nil {
		logger.ErrorContext(
			ctx,
			"failed to finish persistence session",
			"error", err,
		)
		span.SetStatus(codes.Error, err.Error())
		return c.JSON(500, responseResultType{
			Record: record,
			Status: "ERROR",
			Error:  err.Error(),
		})
	}

	if ps.Shallow {
		s.OnDemandReconcileAll.Store(true)
	}

	span.SetStatus(codes.Ok, "")
	return c.JSON(200, responseResultType{
		Record: record,
		Status: "OK",
	})
}

func (s *Server) RefreshDNSRecords(c echo.Context) error {
	ctx, span := telemetry.Tracer.Start(
		c.Request().Context(),
		"shimiko/server.Server.RefreshDNSRecords",
	)
	defer span.End()

	logger := s.RequestLogger(c)
	logger.InfoContext(ctx, "starting record reconcile")
	err := s.ReconcileAll(ctx)
	if err == nil {
		logger.InfoContext(ctx, "finished record reconcile with no errors")
		span.SetStatus(codes.Ok, "")
		return c.JSON(200, map[string]any{
			"status": "OK",
		})
	} else {
		logger.WarnContext(ctx, "finished record reconcile with errors", "error", err)
		span.SetStatus(codes.Error, err.Error())
		return c.JSON(500, map[string]any{
			"status": "ERROR",
			"error":  err.Error(),
		})
	}
}

func (s *Server) AcmeDNSHealth(c echo.Context) error {
	_, span := telemetry.Tracer.Start(
		c.Request().Context(),
		"shimiko/server.Server.AcmeDNSHealth",
		trace.WithAttributes(
			attribute.String("user_agent.original", c.Request().Header.Get("User-Agent")),
		),
	)
	defer span.End()

	span.SetStatus(codes.Ok, "")
	return c.JSON(200, map[string]any{
		"msg": "OK",
	})
}

func (s *Server) AcmeDNSRegister(c echo.Context) error {
	ctx, span := telemetry.Tracer.Start(
		c.Request().Context(),
		"shimiko/server.Server.AcmeDNSRegister",
		trace.WithAttributes(
			attribute.Bool("acmedns_user.present", HasHeader(c.Request().Header, "X-Api-User")),
			attribute.Bool("acmedns_key.present", HasHeader(c.Request().Header, "X-Api-Key")),
			attribute.String("acmedns_user.value", c.Request().Header.Get("X-Api-User")),
			attribute.String("acmedns_key.value", c.Request().Header.Get("X-Api-Key")),
		),
	)
	defer span.End()

	logger := s.RequestLogger(c)

	body := map[string]any{}
	// decoder := json.NewDecoder(c.Request().Body)
	// err := decoder.Decode(&body)
	// if err != nil {
	// 	logger.ErrorContext(ctx, "acme-dns: error parsing request body", slog.Any("error", err))
	// 	span.SetStatus(codes.Error, err.Error())
	// 	return c.JSON(400, map[string]any{
	// 		"msg":   "error parsing request body",
	// 		"error": err.Error(),
	// 	})
	// }
	// span.SetAttributes(telemetry.OtelJSON("http.request.body", body))

	body["fulldomain"] = ""
	body["password"] = ""
	body["subdomain"] = ""
	body["username"] = ""

	logger.InfoContext(ctx, "acme-dns: register called")
	return c.JSON(200, body)
}

func (s *Server) AcmeDNSUpdate(c echo.Context) error {
	ctx, span := telemetry.Tracer.Start(
		c.Request().Context(),
		"shimiko/server.Server.AcmeDNSUpdate",
		trace.WithAttributes(
			attribute.Bool("acmedns_user.present", HasHeader(c.Request().Header, "X-Api-User")),
			attribute.Bool("acmedns_key.present", HasHeader(c.Request().Header, "X-Api-Key")),
			attribute.String("acmedns_user.value", c.Request().Header.Get("X-Api-User")),
			attribute.String("acmedns_key.value", c.Request().Header.Get("X-Api-Key")),
		),
	)
	defer span.End()

	logger := s.RequestLogger(c)

	type bodyType struct {
		Subdomain string `json:"subdomain"`
		Txt       string `json:"txt"`
	}
	var body bodyType

	decoder := json.NewDecoder(c.Request().Body)
	err := decoder.Decode(&body)
	if err != nil {
		logger.WarnContext(ctx, "acme-dns: error parsing request body", slog.Any("error", err))
		span.SetStatus(codes.Error, err.Error())
		return c.JSON(400, map[string]any{
			"msg":   "error parsing request body",
			"error": err.Error(),
		})
	}
	span.SetAttributes(telemetry.OtelJSON("http.request.body", body))
	logger = logger.With(slog.Any("http.request.body", body))

	if body.Txt == "" {
		logger.WarnContext(ctx, "acme-dns: txt validation token not present")
		span.SetStatus(codes.Error, "txt validation token not present")
		return c.JSON(400, map[string]any{
			"status": "ERROR",
			"error":  "txt validation token not present",
		})
	}
	if body.Subdomain == "" {
		logger.WarnContext(ctx, "acme-dns: subdomain not present")
		span.SetStatus(codes.Ok, "subdomain not present")
		return c.JSON(400, map[string]any{
			"status": "ERROR",
			"error":  "subdomain not present",
		})
	}

	subdomain := strings.TrimSuffix(body.Subdomain, "."+persistence.DomainName)

	if !strings.HasPrefix(subdomain, "_acme-challenge.") {
		subdomain = "_acme-challenge." + subdomain
	}

	record := &persistence.DNSRecord{
		Type:    "TXT",
		Name:    subdomain,
		Records: []string{`"` + body.Txt + `"`},
	}
	span.SetAttributes(
		telemetry.OtelJSON("dns_record", record),
	)
	logger = logger.With(
		slog.Any("dns_record", record),
	)
	validationErr := record.Validate()
	if validationErr != nil {
		logger.ErrorContext(ctx, "acme-dns: error validating generated record", slog.Any("error", validationErr))
		span.SetStatus(codes.Error, validationErr.Error())
		return c.JSON(500, map[string]any{
			"status": "ERROR",
			"error":  validationErr.Error(),
		})
	}

	ps, err := persistence.NewSession(ctx, s.DB)
	if err != nil {
		logger.ErrorContext(
			ctx,
			"acme-dns: failed to start persistence session",
			"error", err,
		)
		err = fmt.Errorf("failed to start persistence session: %w", err)
		span.SetStatus(codes.Error, err.Error())
		return c.JSON(500, map[string]any{
			"msg":    "internal server error",
			"status": "ERROR",
			"error":  err.Error(),
		})
	}

	err = record.Upsert(ctx, ps)
	if err != nil {
		logger.ErrorContext(
			ctx,
			"acme-dns: error upserting DNSRecord",
			"error", err,
		)
		err = fmt.Errorf("error upserting DNSRecord: %w", err)
		span.SetStatus(codes.Error, err.Error())
		return c.JSON(500, map[string]any{
			"status": "ERROR",
			"error":  err.Error(),
		})
	}

	err = ps.Finish(ctx)
	if err != nil {
		logger.ErrorContext(
			ctx,
			"acme-dns: failed to finish persistence session",
			"error", err,
		)
		err = fmt.Errorf("failed to finish persistence session: %w", err)
		span.SetStatus(codes.Error, err.Error())
		return c.JSON(500, map[string]any{
			"status": "ERROR",
			"error":  err.Error(),
		})
	}

	if ps.Shallow {
		s.OnDemandReconcileAll.Store(true)
	}

	logger.InfoContext(ctx, "acme-dns: updated record")
	span.SetStatus(codes.Ok, "")
	return c.JSON(200, map[string]any{
		"txt": body.Txt,
	})
}
