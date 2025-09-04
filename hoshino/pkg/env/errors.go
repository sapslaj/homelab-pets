package env

import (
	"fmt"
	"reflect"
)

type ErrVarNotFound struct {
	Name string
}

func (err *ErrVarNotFound) Error() string {
	return fmt.Sprintf("environment variable not found: %s", err.Name)
}

func NewErrVarNotFound(name string) *ErrVarNotFound {
	return &ErrVarNotFound{
		Name: name,
	}
}

func IsErrVarNotFound(err error) bool {
	_, ok := err.(*ErrVarNotFound)
	return ok
}

type ErrParsing struct {
	Name       string
	InnerError error
}

func (err *ErrParsing) Error() string {
	if err.InnerError == nil {
		return fmt.Sprintf("error parsing environment variable %s", err.Name)
	} else {
		return fmt.Sprintf("error parsing environment variable %s: %s", err.Name, err.InnerError.Error())
	}
}

func (err *ErrParsing) Unwrap() error {
	return err.InnerError
}

func (err *ErrParsing) Wrap(wrapped error) *ErrParsing {
	return &ErrParsing{
		Name:       err.Name,
		InnerError: wrapped,
	}
}

func NewErrParsing(name string) *ErrParsing {
	return &ErrParsing{
		Name: name,
	}
}

func NewErrParsingWrapped(name string, wrapped error) *ErrParsing {
	return &ErrParsing{
		Name:       name,
		InnerError: wrapped,
	}
}

func IsErrParsing(err error) bool {
	_, ok := err.(*ErrParsing)
	return ok
}

type ErrUnsupportedType struct {
	Name  string
	Value any
}

func (err *ErrUnsupportedType) Error() string {
	return fmt.Sprintf("unsupported type: %s", reflect.TypeOf(err.Value))
}

func NewErrUnsupportedType(name string) *ErrUnsupportedType {
	return &ErrUnsupportedType{
		Name: name,
	}
}

func IsErrUnsupportedType(err error) bool {
	_, ok := err.(*ErrUnsupportedType)
	return ok
}
