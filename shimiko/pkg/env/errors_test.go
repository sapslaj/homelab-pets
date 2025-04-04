package env_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/env"
)

func TestIsErrVarNotFound(t *testing.T) {
	t.Parallel()

	assert.False(t, env.IsErrParsing(errors.New("other error")))

	assert.True(t, env.IsErrVarNotFound(env.NewErrVarNotFound("TEST")))
}

func TestIsErrParsing(t *testing.T) {
	t.Parallel()

	assert.False(t, env.IsErrParsing(errors.New("other error")))

	assert.True(t, env.IsErrParsing(env.NewErrParsing("TEST")))
}

func TestIsErrUnsupportedType(t *testing.T) {
	t.Parallel()

	assert.False(t, env.IsErrParsing(errors.New("other error")))

	assert.True(t, env.IsErrUnsupportedType(env.NewErrUnsupportedType("TEST")))
}
