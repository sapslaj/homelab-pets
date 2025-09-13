package persistence

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
	"gorm.io/gorm"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/telemetry"
)

var HostnameRegex = regexp.MustCompile(`^[a-z0-9_][a-z0-9\.\-]+[a-z0-9]$`)

var SupportedRecordTypes = []string{
	"A",
	"AAAA",
	"CAA",
	"CNAME",
	"DS",
	"HTTPS",
	"MX",
	"NAPTR",
	"NS",
	"PTR",
	"SRV",
	"SSHFP",
	"SVCB",
	"TLSA",
	"TXT",
}

type DNSRecord struct {
	ID        uint           `json:"_id,omitempty" gorm:"primaryKey"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"deleted_at,omitempty" gorm:"index"`
	Name      string         `json:"name" gorm:"uniqueIndex:dns_records_name_type"`
	Type      string         `json:"type" gorm:"uniqueIndex:dns_records_name_type"`
	TTL       int            `json:"ttl,omitempty"`
	Records   []string       `json:"records" gorm:"serializer:json"`
}

type DNSRecordValidation struct {
	Messages []string `json:"messages"`
}

func (validation *DNSRecordValidation) Error() string {
	return fmt.Sprintf("validation failure for DNS record: %v", validation.Messages)
}

func (record *DNSRecord) FullHostname() string {
	if record.Name == "@" {
		return DomainName
	}
	return record.Name + "." + DomainName
}

func (record *DNSRecord) Validate() *DNSRecordValidation {
	messages := []string{}

	if strings.HasSuffix(record.Name, DomainName) || strings.HasSuffix(record.Name, DomainName+".") {
		messages = append(messages, fmt.Sprintf("The name '%s' should not end with the zone name.", record.Name))
	}

	if strings.HasSuffix(record.Name, ".") && !strings.HasSuffix(record.Name, DomainName+".") {
		messages = append(messages, fmt.Sprintf("The name '%s' should not end with a dot ('.').", record.Name))
	}

	if len(record.FullHostname()) > 253 {
		messages = append(messages, fmt.Sprintf(
			"The full hostname '%s' for the record '%s' exceeds the length limit (%d > 253).",
			record.FullHostname(),
			record.Name,
			len(record.FullHostname())))
	}

	if !HostnameRegex.MatchString(record.Name) {
		messages = append(messages, fmt.Sprintf("The name '%s' is not a valid RFC 1123 hostname.", record.Name))
	}

	if !slices.Contains(SupportedRecordTypes, record.Type) {
		messages = append(messages, fmt.Sprintf("Record type '%s' is not supported.", record.Type))
	}

	if len(messages) > 0 {
		return &DNSRecordValidation{
			Messages: messages,
		}
	}
	return nil
}

func (record *DNSRecord) ShouldReplace(other *DNSRecord) bool {
	if other != nil {
		if other.Name == "" && other.Type == "" {
			// FIXME: why
			return false
		}
		if record.Name != other.Name || record.Type != other.Type {
			return true
		}
	}
	return false
}

func (record *DNSRecord) ExistsInDB(ctx context.Context, ps *PersistenceSession) bool {
	ctx, span := telemetry.Tracer.Start(ctx, "shimiko/pkg/persistence.DNSRecord.ExistsInDB", trace.WithAttributes(
		telemetry.OtelJSON("record", record),
	))
	defer span.End()

	var existing *DNSRecord
	if record.ID == 0 {
		if record.Name == "" || record.Type == "" {
			return false
		}
		ps.DB.WithContext(ctx).Unscoped().Where("name = ? AND type = ?", record.Name, record.Type).First(&existing)
	} else {
		ps.DB.WithContext(ctx).Where("id = ?", record.ID).First(&existing)
	}

	return existing != nil
}

func (record *DNSRecord) Upsert(ctx context.Context, ps *PersistenceSession) error {
	ctx, span := telemetry.Tracer.Start(ctx, "shimiko/pkg/persistence.DNSRecord.Upsert", trace.WithAttributes(
		telemetry.OtelJSON("record", record),
	))
	defer span.End()

	var existing *DNSRecord
	if record.ID == 0 {
		if record.Name == "" || record.Type == "" {
			return errors.New("DNS record must have name and type set")
		}
		ps.DB.WithContext(ctx).Unscoped().Where("name = ? AND type = ?", record.Name, record.Type).First(&existing)
	} else {
		ps.DB.WithContext(ctx).Where("id = ?", record.ID).First(&existing)
	}

	if existing != nil {
		span.SetAttributes(
			telemetry.OtelJSON("existing", existing),
			attribute.Bool("existing.exists", true),
		)
		if record.ID == 0 {
			record.ID = existing.ID
		}
		if record.CreatedAt.IsZero() {
			record.CreatedAt = existing.CreatedAt
		}
		if record.UpdatedAt.IsZero() {
			record.UpdatedAt = existing.UpdatedAt
		}
		record.DeletedAt = gorm.DeletedAt{}
		if record.Name == "" {
			record.Name = existing.Name
		}
		if record.Type == "" {
			record.Type = existing.Type
		}
		if record.TTL == 0 {
			record.TTL = existing.TTL
		}
	} else {
		span.SetAttributes(
			attribute.Bool("existing.exists", true),
		)
	}

	result := ps.DB.WithContext(ctx).Save(&record)
	if result.Error != nil {
		span.SetStatus(codes.Error, result.Error.Error())
		return result.Error
	}

	if !ps.Shallow {
		err := ps.CoreDNS.UpsertRecord(ctx, record, existing)
		if err != nil {
			span.SetStatus(codes.Error, err.Error())
			return err
		}

		err = ps.Route53.UpsertRecord(ctx, record, existing)
		if err != nil {
			span.SetStatus(codes.Error, err.Error())
			return err
		}
	}

	span.SetStatus(codes.Ok, "")
	return nil
}

func (record *DNSRecord) Delete(ctx context.Context, ps *PersistenceSession) error {
	ctx, span := telemetry.Tracer.Start(ctx, "shimiko/pkg/persistence.DNSRecord.Upsert", trace.WithAttributes(
		telemetry.OtelJSON("record", record),
	))
	defer span.End()

	var existing *DNSRecord
	if record.ID == 0 {
		if record.Name == "" || record.Type == "" {
			return errors.New("DNS record must have name and type set")
		}
		ps.DB.WithContext(ctx).Where("name = ? AND type = ?", record.Name, record.Type).First(&existing)
	} else {
		ps.DB.WithContext(ctx).Where("id = ?", record.ID).First(&existing)
	}

	if existing != nil && existing.ID != 0 {
		span.SetAttributes(
			telemetry.OtelJSON("existing", existing),
			attribute.Bool("existing.exists", true),
		)
		tx := ps.DB.WithContext(ctx).Delete(&existing)
		if tx.Error != nil {
			return tx.Error
		}
	} else {
		span.SetAttributes(
			attribute.Bool("existing.exists", false),
		)
	}

	if !ps.Shallow {
		err := ps.CoreDNS.DeleteRecord(ctx, record)
		if err != nil {
			return err
		}

		err = ps.Route53.DeleteRecord(ctx, record)
		if err != nil {
			return err
		}
	}

	span.SetStatus(codes.Ok, "")
	return nil
}
