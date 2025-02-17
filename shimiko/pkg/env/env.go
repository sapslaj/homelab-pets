package env

import (
	"os"
	"reflect"
	"strconv"
)

func Get[T any](name string) (T, error) {
	var value T
	var found bool

	raw, found := os.LookupEnv(name)
	if !found {
		return value, NewErrVarNotFound(name)
	}
	reflectValue := reflect.ValueOf(&value)
	elem := reflectValue.Elem()

	switch interface{}(value).(type) {
	case string:
		elem.SetString(raw)
	case int8:
		valueInt, err := strconv.ParseInt(raw, 10, 8)
		if err != nil {
			return value, NewErrParsingWrapped(name, err)
		}
		elem.SetInt(valueInt)
	case int16:
		valueInt, err := strconv.ParseInt(raw, 10, 16)
		if err != nil {
			return value, NewErrParsingWrapped(name, err)
		}
		elem.SetInt(valueInt)
	case int32:
		valueInt, err := strconv.ParseInt(raw, 10, 32)
		if err != nil {
			return value, NewErrParsingWrapped(name, err)
		}
		elem.SetInt(valueInt)
	case int64:
		valueInt, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			return value, NewErrParsingWrapped(name, err)
		}
		elem.SetInt(valueInt)
	case uint8:
		valueUint, err := strconv.ParseUint(raw, 10, 8)
		if err != nil {
			return value, NewErrParsingWrapped(name, err)
		}
		elem.SetUint(valueUint)
	case uint16:
		valueUint, err := strconv.ParseUint(raw, 10, 16)
		if err != nil {
			return value, NewErrParsingWrapped(name, err)
		}
		elem.SetUint(valueUint)
	case uint32:
		valueUint, err := strconv.ParseUint(raw, 10, 32)
		if err != nil {
			return value, NewErrParsingWrapped(name, err)
		}
		elem.SetUint(valueUint)
	case uint64:
		valueUint, err := strconv.ParseUint(raw, 10, 64)
		if err != nil {
			return value, NewErrParsingWrapped(name, err)
		}
		elem.SetUint(valueUint)
	case float32:
		valueFloat, err := strconv.ParseFloat(raw, 32)
		if err != nil {
			return value, NewErrParsingWrapped(name, err)
		}
		elem.SetFloat(valueFloat)
	case float64:
		valueFloat, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			return value, NewErrParsingWrapped(name, err)
		}
		elem.SetFloat(valueFloat)
	case bool:
		valueBool, err := strconv.ParseBool(raw)
		if err != nil {
			return value, NewErrParsingWrapped(name, err)
		}
		elem.SetBool(valueBool)
	default:
		return value, NewErrUnsupportedType(name)
	}
	return value, nil
}

func MustGet[T any](name string) T {
	value, err := Get[T](name)
	if err != nil {
		panic(err)
	}
	return value
}

func GetDefault[T any](name string, defaultValue T) T {
	value, err := Get[T](name)
	if err != nil {
		return defaultValue
	}
	return value
}
