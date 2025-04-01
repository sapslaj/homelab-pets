package persistence

import (
	"context"

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

	var err error
	ps.CoreDNS, err = LoadCoreDNS(ctx)
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
	err := session.CoreDNS.Save(ctx)
	if err != nil {
		return err
	}
	_, err = session.Route53.FlushChangeBatch(ctx)
	if err != nil {
		return err
	}
	return nil
}

func (ps *PersistenceSession) Finish(ctx context.Context) error {
	return FinishSession(ctx, ps)
}
