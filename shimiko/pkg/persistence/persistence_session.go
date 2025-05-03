package persistence

import (
	"context"
	"errors"

	"gorm.io/gorm"
)

type PersistenceSession struct {
	DB      *gorm.DB
	CoreDNS *CoreDNS
	Route53 *Route53
}

func NewSession(ctx context.Context, db *gorm.DB) (*PersistenceSession, error) {
	ps := &PersistenceSession{
		DB: db,
	}

	ps.CoreDNS = &CoreDNS{}
	err := ps.CoreDNS.Load(ctx)
	if err != nil {
		return ps, err
	}

	ps.Route53, err = NewRoute53(ctx)
	if err != nil {
		return ps, err
	}
	ps.Route53.StartChangeBatch()

	return ps, nil

}

func FinishSession(ctx context.Context, session *PersistenceSession) error {
	var err error
	errors.Join(err, session.CoreDNS.Save(ctx))
	_, r53err := session.Route53.FlushChangeBatch(ctx)
	err = errors.Join(err, r53err)
	return err
}

func (ps *PersistenceSession) Finish(ctx context.Context) error {
	return FinishSession(ctx, ps)
}
