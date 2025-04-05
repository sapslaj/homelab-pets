package server

import (
	"fmt"
	"log/slog"

	"github.com/go-acme/lego/v4/log"
)

func RegisterLegoLogger(logger *slog.Logger) {
	log.Logger = LegoLoggerAdapter{
		Logger: logger,
	}
}

type LegoLoggerAdapter struct {
	Logger *slog.Logger
}

func (adapter LegoLoggerAdapter) Fatal(args ...interface{}) {
	// don't actually exit...
	adapter.Logger.Error(fmt.Sprint(args...))
}

func (adapter LegoLoggerAdapter) Fatalln(args ...interface{}) {
	// don't actually exit...
	adapter.Logger.Error(fmt.Sprint(args...))
}

func (adapter LegoLoggerAdapter) Fatalf(format string, args ...interface{}) {
	// don't actually exit...
	adapter.Logger.Error(fmt.Sprintf(format, args...))
}

func (adapter LegoLoggerAdapter) Print(args ...interface{}) {
	adapter.Logger.Info(fmt.Sprint(args...))
}

func (adapter LegoLoggerAdapter) Println(args ...interface{}) {
	adapter.Logger.Info(fmt.Sprint(args...))
}

func (adapter LegoLoggerAdapter) Printf(format string, args ...interface{}) {
	adapter.Logger.Info(fmt.Sprintf(format, args...))
}

func (adapter LegoLoggerAdapter) Warnf(format string, args ...interface{}) {
	adapter.Logger.Warn(fmt.Sprintf(format, args...))
}

func (adapter LegoLoggerAdapter) Infof(format string, args ...interface{}) {
	adapter.Logger.Info(fmt.Sprintf(format, args...))
}
