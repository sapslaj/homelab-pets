package main

import (
	"github.com/labstack/echo/v4"
)

type HTTPError struct {
	Inner error
	Code  int
}

var HTTPOK = HTTPError{
	Inner: nil,
	Code:  200,
}

func (httpError HTTPError) Error() string {
	return httpError.Inner.Error()
}

func (httpError HTTPError) Unwrap() error {
	return httpError.Inner
}

func (httpError HTTPError) AsResponse(c echo.Context) error {
	if httpError.Code == 0 {
		if httpError.Inner == nil {
			httpError.Code = 200
		} else {
			httpError.Code = 500
		}
	}

	body := map[string]any{}

	if httpError.Inner == nil {
		body["status"] = "ok"
	} else {
		body["status"] = "error"
		body["error"] = httpError.Inner.Error()
	}

	return c.JSON(httpError.Code, body)
}
