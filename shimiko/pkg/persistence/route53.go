package persistence

import (
	"context"
	"errors"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/route53"
	"github.com/aws/aws-sdk-go-v2/service/route53/types"
)

const Route53HostedZoneId = "Z00048261CEI1B6JY63KT"

type Route53 struct {
	Client      *route53.Client
	ChangeBatch *types.ChangeBatch
}

func NewRoute53(ctx context.Context) (*Route53, error) {
	awsCfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, err
	}
	r53 := &Route53{
		Client: route53.NewFromConfig(awsCfg),
	}
	return r53, nil
}

func (r53 *Route53) StartChangeBatch() {
	if r53.ChangeBatch == nil {
		r53.ChangeBatch = &types.ChangeBatch{
			Changes: []types.Change{},
		}
	}
}

func (r53 *Route53) AddToChangeBatch(change types.Change) {
	r53.ChangeBatch.Changes = append(r53.ChangeBatch.Changes, change)
}

func (r53 *Route53) FlushChangeBatch(ctx context.Context) (*route53.ChangeResourceRecordSetsOutput, error) {
	if r53.ChangeBatch == nil {
		return nil, errors.New("no active change batch to flush")
	}
	if len(r53.ChangeBatch.Changes) == 0 {
		return nil, nil
	}
	output, err := r53.Client.ChangeResourceRecordSets(ctx, &route53.ChangeResourceRecordSetsInput{
		HostedZoneId: aws.String(Route53HostedZoneId),
		ChangeBatch:  r53.ChangeBatch,
	})
	if err == nil {
		r53.ChangeBatch = nil
	}
	return output, err
}

func (r53 *Route53) UpsertRecord(ctx context.Context, record *DNSRecord, previous *DNSRecord) error {
	if record == nil {
		return errors.New("DNSRecord is null")
	}

	adhocChangeBatch := r53.ChangeBatch == nil
	if adhocChangeBatch {
		r53.StartChangeBatch()
	}

	if record.ShouldReplace(previous) {
		err := r53.DeleteRecord(ctx, previous)
		if err != nil {
			return err
		}
	}

	ttl := 300
	if record.TTL != 0 {
		ttl = record.TTL
	}

	resourceRecords := []types.ResourceRecord{}
	for _, res := range record.Records {
		resourceRecords = append(resourceRecords, types.ResourceRecord{
			Value: aws.String(res),
		})
	}

	r53.AddToChangeBatch(types.Change{
		Action: "UPSERT",
		ResourceRecordSet: &types.ResourceRecordSet{
			Name:            aws.String(record.FullHostname()),
			Type:            types.RRType(record.Type),
			TTL:             aws.Int64(int64(ttl)),
			ResourceRecords: resourceRecords,
		},
	})

	if adhocChangeBatch {
		_, err := r53.FlushChangeBatch(ctx)
		if err != nil {
			return err
		}
	}
	return nil
}

func (r53 *Route53) DeleteRecord(ctx context.Context, record *DNSRecord) error {
	if record == nil {
		return errors.New("DNSRecord is null")
	}

	adhocChangeBatch := r53.ChangeBatch == nil
	if adhocChangeBatch {
		r53.StartChangeBatch()
	}

	var nextRecordIdentifier *string
	// FIXME: figure out why this is infinite looping
	for i := 0; i < 1000; i++ {
		existingQuery, err := r53.Client.ListResourceRecordSets(ctx, &route53.ListResourceRecordSetsInput{
			HostedZoneId:          aws.String(Route53HostedZoneId),
			StartRecordIdentifier: nextRecordIdentifier,
		})
		if err != nil {
			return err
		}
		nextRecordIdentifier = existingQuery.NextRecordIdentifier
		for _, rr := range existingQuery.ResourceRecordSets {
			if record.Name == *rr.Name && record.Type == string(rr.Type) {
				r53.AddToChangeBatch(types.Change{
					Action:            "DELETE",
					ResourceRecordSet: &rr,
				})
			}
		}
		if !existingQuery.IsTruncated {
			break
		}
	}

	if adhocChangeBatch {
		_, err := r53.FlushChangeBatch(ctx)
		if err != nil {
			return err
		}
	}
	return nil
}
