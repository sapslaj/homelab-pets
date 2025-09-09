package persistence

import (
	"context"
	"errors"

	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
	"gorm.io/gorm"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/telemetry"
)

type PersistenceSession struct {
	DB      *gorm.DB
	CoreDNS *CoreDNS
	Route53 *Route53
	Shallow bool
}

func NewSession(ctx context.Context, db *gorm.DB) (*PersistenceSession, error) {
	ctx, span := telemetry.Tracer.Start(ctx, "shimiko/pkg/persistence.NewSession", trace.WithAttributes())
	defer span.End()

	ps := &PersistenceSession{
		DB: db,
	}

	ps.CoreDNS = &CoreDNS{}
	err := ps.CoreDNS.Load(ctx)
	if err != nil {
		span.SetStatus(codes.Error, err.Error())
		return ps, err
	}

	ps.Route53, err = NewRoute53(ctx)
	if err != nil {
		span.SetStatus(codes.Error, err.Error())
		return ps, err
	}
	ps.Route53.StartChangeBatch()

	span.SetStatus(codes.Ok, "")
	return ps, nil
}

func FinishSession(ctx context.Context, session *PersistenceSession) error {
	ctx, span := telemetry.Tracer.Start(ctx, "shimiko/pkg/persistence.FinishSession", trace.WithAttributes())
	defer span.End()

	if !session.Shallow {
		coreDNSErr := session.CoreDNS.Save(ctx)
		_, r53err := session.Route53.FlushChangeBatch(ctx)

		err := errors.Join(coreDNSErr, r53err)

		if err != nil {
			span.SetStatus(codes.Error, err.Error())
			return err
		}
	}

	span.SetStatus(codes.Ok, "")
	return nil
}

func (ps *PersistenceSession) Finish(ctx context.Context) error {
	return FinishSession(ctx, ps)
}
