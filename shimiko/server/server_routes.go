package server

import (
	"encoding/json"
	"errors"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/persistence"
)

func (s *Server) Routes() {
	e := s.Echo
	e.GET("/", s.Root)
	e.GET("/healthz", s.HealthzLiveness)
	e.GET("/healthz/liveness", s.HealthzLiveness)
	e.GET("/v1/dns-records", s.IndexDNSRecords)
	e.POST("/v1/dns-records", s.UpsertDNSRecords)
	e.PUT("/v1/dns-records", s.UpsertDNSRecords)
	e.PATCH("/v1/dns-records", s.UpsertDNSRecords)
	e.DELETE("/v1/dns-records", s.DeleteDNSRecords)
	e.GET("/v1/dns-records/:type/:name", s.ShowDNSRecord)
	e.POST("/v1/dns-records/:type/:name", s.UpsertDNSRecord)
	e.PUT("/v1/dns-records/:type/:name", s.UpsertDNSRecord)
	e.PATCH("/v1/dns-records/:type/:name", s.UpsertDNSRecord)
	e.DELETE("/v1/dns-records/:type/:name", s.DeleteDNSRecord)
}

func (s *Server) Root(c echo.Context) error {
	return c.JSON(200, map[string]any{
		"msg": "Hello, Sensei! It's Shimiko!",
	})
}

func (s *Server) HealthzLiveness(c echo.Context) error {
	return c.JSON(200, map[string]any{
		"msg": "OK",
	})
}

func (s *Server) IndexDNSRecords(c echo.Context) error {
	logger := s.RequestLogger(c)
	var records []*persistence.DNSRecord
	result := s.DB.Find(&records)
	if result.Error != nil {
		logger.ErrorContext(
			c.Request().Context(),
			"error retrieving DNSRecords",
			"error", result.Error,
		)
		return result.Error
	}
	return c.JSON(200, map[string]any{
		"records": records,
	})
}

func (s *Server) UpsertDNSRecords(c echo.Context) error {
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

	ps, err := persistence.NewSession(c.Request().Context(), s.DB)
	if err != nil {
		logger.ErrorContext(
			c.Request().Context(),
			"failed to start persistence session",
			"error", err,
		)
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
		err := record.Upsert(c.Request().Context(), ps)
		if err != nil {
			hasError = true
			logger.ErrorContext(
				c.Request().Context(),
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

	err = ps.Finish(c.Request().Context())
	if err != nil {
		logger.ErrorContext(
			c.Request().Context(),
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
	return c.JSON(statusCode, response)
}

func (s *Server) DeleteDNSRecords(c echo.Context) error {
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

	ps, err := persistence.NewSession(c.Request().Context(), s.DB)
	if err != nil {
		logger.ErrorContext(
			c.Request().Context(),
			"failed to start persistence session",
			"error", err,
		)
		return c.JSON(500, map[string]any{
			"msg":    "internal server error",
			"status": "ERROR",
			"error":  err.Error(),
		})
	}

	hasError := false
	for _, record := range body.Records {
		err := record.Delete(c.Request().Context(), ps)
		if err != nil {
			hasError = true
			logger.ErrorContext(
				c.Request().Context(),
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

	err = ps.Finish(c.Request().Context())
	if err != nil {
		logger.ErrorContext(
			c.Request().Context(),
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
	return c.JSON(statusCode, response)
}

func (s *Server) ShowDNSRecord(c echo.Context) error {
	logger := s.RequestLogger(c)

	typ := c.Param("type")
	name := c.Param("name")

	var record *persistence.DNSRecord
	tx := s.DB.Where("type = ? and name = ?", typ, name).First(&record)
	if tx.Error != nil || record == nil {
		if errors.Is(tx.Error, gorm.ErrRecordNotFound) {
			return c.JSON(404, map[string]any{
				"msg": "not found",
			})
		} else {
			logger.ErrorContext(
				c.Request().Context(),
				"error showing DNSRecord",
				"error", tx.Error,
				"dns_record", record,
			)
			return c.JSON(503, map[string]any{
				"msg":   "error looking up DNS record",
				"error": tx.Error.Error(),
			})
		}
	}
	return c.JSON(200, map[string]any{
		"record": record,
	})
}

func (s *Server) UpsertDNSRecord(c echo.Context) error {
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
		return c.JSON(400, map[string]any{
			"msg":   "error parsing request body",
			"error": err.Error(),
		})
	}

	if body.Record.Type != c.Param("type") {
		return c.JSON(400, responseResultType{
			Record: body.Record,
			Status: "ERROR",
			Error:  "record in body does not match the type specified in the URL path",
		})
	}
	if body.Record.Name != c.Param("name") {
		return c.JSON(400, responseResultType{
			Record: body.Record,
			Status: "ERROR",
			Error:  "record in body does not match the name specified in the URL path",
		})
	}

	validationErr := body.Record.Validate()
	if validationErr != nil {
		return c.JSON(400, responseResultType{
			Record:     body.Record,
			Status:     "ERROR",
			Validation: validationErr,
		})
	}

	ps, err := persistence.NewSession(c.Request().Context(), s.DB)
	if err != nil {
		logger.ErrorContext(
			c.Request().Context(),
			"failed to start persistence session",
			"error", err,
		)
		return c.JSON(500, map[string]any{
			"msg":    "internal server error",
			"status": "ERROR",
			"error":  err.Error(),
		})
	}

	err = body.Record.Upsert(c.Request().Context(), ps)
	if err != nil {
		logger.ErrorContext(
			c.Request().Context(),
			"error upserting DNSRecord",
			"error", err,
			"dns_record", body.Record,
		)
		return c.JSON(500, responseResultType{
			Record: body.Record,
			Status: "ERROR",
			Error:  err.Error(),
		})
	}

	err = ps.Finish(c.Request().Context())
	if err != nil {
		logger.ErrorContext(
			c.Request().Context(),
			"failed to finish persistence session",
			"error", err,
		)
		return c.JSON(500, responseResultType{
			Record: body.Record,
			Status: "ERROR",
			Error:  err.Error(),
		})
	}

	return c.JSON(200, responseResultType{
		Record: body.Record,
		Status: "OK",
	})
}

func (s *Server) DeleteDNSRecord(c echo.Context) error {
	logger := s.RequestLogger(c)

	type responseResultType struct {
		Record     *persistence.DNSRecord           `json:"record"`
		Status     string                           `json:"status"`
		Error      string                           `json:"error,omitempty"`
		Validation *persistence.DNSRecordValidation `json:"validation,omitempty"`
	}

	ps, err := persistence.NewSession(c.Request().Context(), s.DB)
	if err != nil {
		logger.ErrorContext(
			c.Request().Context(),
			"failed to start persistence session",
			"error", err,
		)
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

	err = record.Delete(c.Request().Context(), ps)
	if err != nil {
		logger.ErrorContext(
			c.Request().Context(),
			"error deleting DNSRecord",
			"error", err,
			"dns_record", record,
		)
		return c.JSON(500, responseResultType{
			Record: record,
			Status: "ERROR",
			Error:  err.Error(),
		})
	}

	err = ps.Finish(c.Request().Context())
	if err != nil {
		logger.ErrorContext(
			c.Request().Context(),
			"failed to finish persistence session",
			"error", err,
		)
		return c.JSON(500, responseResultType{
			Record: record,
			Status: "ERROR",
			Error:  err.Error(),
		})
	}

	return c.JSON(200, responseResultType{
		Record: record,
		Status: "OK",
	})
}
