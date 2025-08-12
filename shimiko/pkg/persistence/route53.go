package persistence

import (
	"context"
	"errors"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/route53"
	"github.com/aws/aws-sdk-go-v2/service/route53/types"
	"go.opentelemetry.io/contrib/instrumentation/github.com/aws/aws-sdk-go-v2/otelaws"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/telemetry"
)

const Route53HostedZoneId = "Z00048261CEI1B6JY63KT"

type Route53 struct {
	Client      *route53.Client
	ChangeBatch *types.ChangeBatch
}

func NewRoute53(ctx context.Context) (*Route53, error) {
	ctx, span := telemetry.Tracer.Start(ctx, "shimiko/pkg/persistence.NewRoute53", trace.WithAttributes())
	defer span.End()

	awsCfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	otelaws.AppendMiddlewares(&awsCfg.APIOptions)

	r53 := &Route53{
		Client: route53.NewFromConfig(awsCfg),
	}
	span.SetStatus(codes.Ok, "")
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
	ctx, span := telemetry.Tracer.Start(ctx, "shimiko/pkg/persistence.Route53.FlushChangeBatch", trace.WithAttributes(
		telemetry.OtelJSON("changes", r53.ChangeBatch),
		attribute.Int("changes.len", len(r53.ChangeBatch.Changes)),
	))
	defer span.End()

	if r53.ChangeBatch == nil {
		err := errors.New("no active change batch to flush")
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}

	if len(r53.ChangeBatch.Changes) == 0 {
		return nil, nil
	}

	output, err := r53.Client.ChangeResourceRecordSets(ctx, &route53.ChangeResourceRecordSetsInput{
		HostedZoneId: aws.String(Route53HostedZoneId),
		ChangeBatch:  r53.ChangeBatch,
	})
	if err != nil {
		span.SetStatus(codes.Error, err.Error())
		return output, err
	}

	r53.ChangeBatch = nil
	span.SetStatus(codes.Ok, "")
	return output, nil
}

func (r53 *Route53) UpsertRecord(ctx context.Context, record *DNSRecord, previous *DNSRecord) error {
	ctx, span := telemetry.Tracer.Start(ctx, "shimiko/pkg/persistence.Route53.UpsertRecord", trace.WithAttributes(
		telemetry.OtelJSON("record", record),
		telemetry.OtelJSON("previous", previous),
	))
	defer span.End()

	if record == nil {
		err := errors.New("DNSRecord is null")
		span.SetStatus(codes.Error, err.Error())
		return err
	}

	adhocChangeBatch := r53.ChangeBatch == nil
	if adhocChangeBatch {
		r53.StartChangeBatch()
	}

	if record.ShouldReplace(previous) {
		err := r53.DeleteRecord(ctx, previous)
		if err != nil {
			span.SetStatus(codes.Error, err.Error())
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
			span.SetStatus(codes.Error, err.Error())
			return err
		}
	}

	span.SetStatus(codes.Ok, "")
	return nil
}

func (r53 *Route53) DeleteRecord(ctx context.Context, record *DNSRecord) error {
	ctx, span := telemetry.Tracer.Start(ctx, "shimiko/pkg/persistence.Route53.DeleteRecord", trace.WithAttributes(
		telemetry.OtelJSON("record", record),
	))
	defer span.End()

	if record == nil {
		err := errors.New("DNSRecord is null")
		span.SetStatus(codes.Error, err.Error())
		return err
	}

	adhocChangeBatch := r53.ChangeBatch == nil
	if adhocChangeBatch {
		r53.StartChangeBatch()
	}

	var nextRecordIdentifier *string
	// FIXME: figure out why this is infinite looping
	for page := range 10 {
		listCtx, listSpan := telemetry.Tracer.Start(ctx, "shimiko/pkg/persistence.Route53.DeleteRecord.list", trace.WithAttributes(
			telemetry.OtelJSON("record", record),
			attribute.Int("page", page),
		))

		if nextRecordIdentifier != nil {
			listSpan.SetAttributes(attribute.String("start_record_identifier", *nextRecordIdentifier))
		}

		existingQuery, err := r53.Client.ListResourceRecordSets(listCtx, &route53.ListResourceRecordSetsInput{
			HostedZoneId:          aws.String(Route53HostedZoneId),
			StartRecordIdentifier: nextRecordIdentifier,
		})
		if err != nil {
			span.SetAttributes(telemetry.OtelJSON("change_batch", r53.ChangeBatch))
			listSpan.SetStatus(codes.Error, err.Error())
			span.SetStatus(codes.Error, err.Error())
			listSpan.End()
			return err
		}

		nextRecordIdentifier = existingQuery.NextRecordIdentifier
		if nextRecordIdentifier != nil {
			listSpan.SetAttributes(attribute.String("next_record_identifier", *nextRecordIdentifier))
		}

		listSpan.SetAttributes(attribute.Bool("is_truncated", existingQuery.IsTruncated))

		for _, rr := range existingQuery.ResourceRecordSets {
			if record.Name == *rr.Name && record.Type == string(rr.Type) {
				r53.AddToChangeBatch(types.Change{
					Action:            "DELETE",
					ResourceRecordSet: &rr,
				})
			}
		}

		listSpan.End()

		if !existingQuery.IsTruncated {
			break
		}

		_, sleepSpan := telemetry.Tracer.Start(ctx, "shimiko/pkg/persistence.Route53.DeleteRecord.sleep", trace.WithAttributes(
			telemetry.OtelJSON("record", record),
			attribute.Int("page", page),
		))
		time.Sleep(100 * time.Millisecond)
		sleepSpan.End()
	}

	if adhocChangeBatch {
		span.SetAttributes(telemetry.OtelJSON("change_batch", r53.ChangeBatch))
		_, err := r53.FlushChangeBatch(ctx)
		if err != nil {
			span.SetStatus(codes.Error, err.Error())
			return err
		}
	}

	span.SetStatus(codes.Ok, "")
	return nil
}
