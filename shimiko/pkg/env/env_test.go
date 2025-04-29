package env_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/env"
)

func TestGet(t *testing.T) {
	// string
	t.Setenv("TEST_STRING", "foo")
	vString, err := env.Get[string]("TEST_STRING")
	assert.NoError(t, err)
	assert.Equal(t, "foo", vString)

	// int
	t.Setenv("TEST_INT", "123456")
	vInt, err := env.Get[int]("TEST_INT")
	assert.NoError(t, err)
	assert.Equal(t, 123456, vInt)

	// int8
	t.Setenv("TEST_INT8", "1")
	vInt8, err := env.Get[int8]("TEST_INT8")
	assert.NoError(t, err)
	assert.Equal(t, int8(1), vInt8)

	// int16
	t.Setenv("TEST_INT16", "12345")
	vInt16, err := env.Get[int16]("TEST_INT16")
	assert.NoError(t, err)
	assert.Equal(t, int16(12345), vInt16)

	// int32
	t.Setenv("TEST_INT32", "1234567890")
	vInt32, err := env.Get[int32]("TEST_INT32")
	assert.NoError(t, err)
	assert.Equal(t, int32(1234567890), vInt32)

	// int64
	t.Setenv("TEST_INT64", "9223372036854775807")
	vInt64, err := env.Get[int64]("TEST_INT64")
	assert.NoError(t, err)
	assert.Equal(t, int64(9223372036854775807), vInt64)

	// uint8
	t.Setenv("TEST_UINT8", "255")
	vUint8, err := env.Get[uint8]("TEST_UINT8")
	assert.NoError(t, err)
	assert.Equal(t, uint8(255), vUint8)

	// uint16
	t.Setenv("TEST_UINT16", "65535")
	vUint16, err := env.Get[uint16]("TEST_UINT16")
	assert.NoError(t, err)
	assert.Equal(t, uint16(65535), vUint16)

	// uint32
	t.Setenv("TEST_UINT32", "4294967295")
	vUint32, err := env.Get[uint32]("TEST_UINT32")
	assert.NoError(t, err)
	assert.Equal(t, uint32(4294967295), vUint32)

	// uint64
	t.Setenv("TEST_UINT64", "18446744073709551615")
	vUint64, err := env.Get[uint64]("TEST_UINT64")
	assert.NoError(t, err)
	assert.Equal(t, uint64(18446744073709551615), vUint64)

	// uint
	t.Setenv("TEST_UINT", "4000000000")
	vUint, err := env.Get[uint]("TEST_UINT")
	assert.NoError(t, err)
	assert.Equal(t, uint(4000000000), vUint)

	// float32
	t.Setenv("TEST_FLOAT32", "3.14159")
	vFloat32, err := env.Get[float32]("TEST_FLOAT32")
	assert.NoError(t, err)
	assert.Equal(t, float32(3.14159), vFloat32)

	// float64
	t.Setenv("TEST_FLOAT64", "3.141592653589793")
	vFloat64, err := env.Get[float64]("TEST_FLOAT64")
	assert.NoError(t, err)
	assert.Equal(t, float64(3.141592653589793), vFloat64)

	// bool
	t.Setenv("TEST_BOOL_TRUE", "true")
	vBoolTrue, err := env.Get[bool]("TEST_BOOL_TRUE")
	assert.NoError(t, err)
	assert.Equal(t, true, vBoolTrue)

	t.Setenv("TEST_BOOL_FALSE", "false")
	vBoolFalse, err := env.Get[bool]("TEST_BOOL_FALSE")
	assert.NoError(t, err)
	assert.Equal(t, false, vBoolFalse)

	t.Setenv("TEST_DURATION", "5s")
	vDuration, err := env.Get[time.Duration]("TEST_DURATION")
	assert.NoError(t, err)
	assert.Equal(t, 5 * time.Second, vDuration)

	// Error cases

	// Variable not found
	_, err = env.Get[string]("NONEXISTENT_VAR")
	assert.Error(t, err)
	assert.True(t, env.IsErrVarNotFound(err))

	// Parsing error
	t.Setenv("TEST_PARSE_ERROR_INT", "not_an_int")
	_, err = env.Get[int]("TEST_PARSE_ERROR_INT")
	assert.Error(t, err)

	// Unsupported type
	type CustomType struct{}
	_, err = env.Get[CustomType]("TEST_STRING")
	assert.Error(t, err)
}

func TestMustGet(t *testing.T) {
	// Successful retrieval
	t.Setenv("TEST_MUST_GET_STRING", "success")
	value := env.MustGet[string]("TEST_MUST_GET_STRING")
	assert.Equal(t, "success", value)

	// Should panic when variable not found
	assert.Panics(t, func() {
		env.MustGet[string]("NONEXISTENT_VAR_MUST_GET")
	})

	// Should panic when parsing fails
	t.Setenv("TEST_MUST_GET_PARSE_ERROR", "not_an_int")
	assert.Panics(t, func() {
		env.MustGet[int]("TEST_MUST_GET_PARSE_ERROR")
	})
}

func TestGetDefault(t *testing.T) {
	// Variable exists - should return the value
	t.Setenv("TEST_GET_DEFAULT_EXISTS", "existing_value")
	value, err := env.GetDefault[string]("TEST_GET_DEFAULT_EXISTS", "default_value")
	assert.NoError(t, err)
	assert.Equal(t, "existing_value", value)

	// Variable doesn't exist - should return the default value
	value, err = env.GetDefault[string]("NONEXISTENT_VAR_GET_DEFAULT", "default_value")
	assert.NoError(t, err)
	assert.Equal(t, "default_value", value)

	// Parsing error - should return an error, not the default value
	t.Setenv("TEST_GET_DEFAULT_PARSE_ERROR", "not_an_int")
	_, err = env.GetDefault[int]("TEST_GET_DEFAULT_PARSE_ERROR", 42)
	assert.Error(t, err)

	// Test with various types
	t.Setenv("TEST_GET_DEFAULT_INT", "123")
	intVal, err := env.GetDefault[int]("TEST_GET_DEFAULT_INT", 0)
	assert.NoError(t, err)
	assert.Equal(t, 123, intVal)

	t.Setenv("TEST_GET_DEFAULT_BOOL", "true")
	boolVal, err := env.GetDefault[bool]("TEST_GET_DEFAULT_BOOL", false)
	assert.NoError(t, err)
	assert.Equal(t, true, boolVal)
}

func TestMustGetDefault(t *testing.T) {
	// Variable exists - should return the value
	t.Setenv("TEST_MUST_GET_DEFAULT_EXISTS", "existing_value")
	value := env.MustGetDefault[string]("TEST_MUST_GET_DEFAULT_EXISTS", "default_value")
	assert.Equal(t, "existing_value", value)

	// Variable doesn't exist - should return the default value
	value = env.MustGetDefault[string]("NONEXISTENT_VAR_MUST_GET_DEFAULT", "default_value")
	assert.Equal(t, "default_value", value)

	// Parsing error - should return the default value
	t.Setenv("TEST_MUST_GET_DEFAULT_PARSE_ERROR", "not_an_int")
	intValue := env.MustGetDefault[int]("TEST_MUST_GET_DEFAULT_PARSE_ERROR", 42)
	assert.Equal(t, 42, intValue)

	// Test with various types
	t.Setenv("TEST_MUST_GET_DEFAULT_FLOAT", "3.14")
	floatVal := env.MustGetDefault[float64]("TEST_MUST_GET_DEFAULT_FLOAT", 0.0)
	assert.Equal(t, 3.14, floatVal)

	t.Setenv("TEST_MUST_GET_DEFAULT_UINT", "255")
	uintVal := env.MustGetDefault[uint8]("TEST_MUST_GET_DEFAULT_UINT", uint8(0))
	assert.Equal(t, uint8(255), uintVal)
}
