package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
	"gorm.io/gorm"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/persistence"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/telemetry"
)

func (s *Server) Routes() {
	e := s.Echo
	e.GET("/", s.Root)
	e.GET("/healthz", s.HealthzLiveness)
	e.GET("/healthz/liveness", s.HealthzLiveness)
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
}

func (s *Server) Root(c echo.Context) error {
	_, span := telemetry.Tracer.Start(c.Request().Context(), "shimiko/server.Server.Root", trace.WithAttributes())
	defer span.End()

	span.SetStatus(codes.Ok, "")
	return c.JSON(200, map[string]any{
		"msg": "Hello, Sensei! It's Shimiko!",
	})
}

func (s *Server) HealthzLiveness(c echo.Context) error {
	_, span := telemetry.Tracer.Start(c.Request().Context(), "shimiko/server.Server.HealthzLiveness", trace.WithAttributes())
	defer span.End()

	span.SetStatus(codes.Ok, "")
	return c.JSON(200, map[string]any{
		"msg": "OK",
	})
}

func (s *Server) ZonePopEndpoints(c echo.Context) error {
	ctx, span := telemetry.Tracer.Start(c.Request().Context(), "shimiko/server.Server.ZonePopEndpoints", trace.WithAttributes())
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
	ctx, span := telemetry.Tracer.Start(c.Request().Context(), "shimiko/server.Server.IndexDNSRecords", trace.WithAttributes())
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
	ctx, span := telemetry.Tracer.Start(c.Request().Context(), "shimiko/server.Server.UpsertDNSRecords", trace.WithAttributes())
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
	ctx, span := telemetry.Tracer.Start(c.Request().Context(), "shimiko/server.Server.DeleteDNSRecords", trace.WithAttributes())
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
	ctx, span := telemetry.Tracer.Start(c.Request().Context(), "shimiko/server.Server.ShowDNSRecord", trace.WithAttributes())
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
	ctx, span := telemetry.Tracer.Start(c.Request().Context(), "shimiko/server.Server.UpsertDNSRecord", trace.WithAttributes())
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

	span.SetStatus(codes.Ok, "")
	return c.JSON(200, responseResultType{
		Record: body.Record,
		Status: "OK",
	})
}

func (s *Server) DeleteDNSRecord(c echo.Context) error {
	ctx, span := telemetry.Tracer.Start(c.Request().Context(), "shimiko/server.Server.DeleteDNSRecord", trace.WithAttributes())
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

	span.SetStatus(codes.Ok, "")
	return c.JSON(200, responseResultType{
		Record: record,
		Status: "OK",
	})
}

func (s *Server) RefreshDNSRecords(c echo.Context) error {
	ctx, span := telemetry.Tracer.Start(c.Request().Context(), "shimiko/server.Server.RefreshDNSRecords", trace.WithAttributes())
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
