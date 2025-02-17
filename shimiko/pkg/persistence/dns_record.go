package persistence

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"

	"gorm.io/gorm"
)

var hostnameRegex = regexp.MustCompile(`^[a-z0-9][a-z0-9\.\-]+[a-z0-9]$`)

var SupportedRecordTypes = []string{
	"A",
	"AAAA",
	"CNAME",
	"NS",
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

	if !hostnameRegex.MatchString(record.Name) {
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

func (record *DNSRecord) shouldReplace(other *DNSRecord) bool {
	if other != nil {
		if record.Name != other.Name || record.Type != other.Type {
			return true
		}
	}
	return false
}

func (record *DNSRecord) Upsert(ctx context.Context, p *Persistence) error {
	var existing *DNSRecord
	if record.ID == 0 {
		if record.Name == "" || record.Type == "" {
			return errors.New("DNS record must have name and type set")
		}
		p.DB.Where("name = ? AND type = ?", record.Name, record.Type).First(&existing)
	} else {
		p.DB.Where("id = ?", record.ID).First(&existing)
	}
	if existing != nil {
		if record.ID == 0 {
			record.ID = existing.ID
		}
		if record.CreatedAt.IsZero() {
			record.CreatedAt = existing.CreatedAt
		}
		if record.UpdatedAt.IsZero() {
			record.UpdatedAt = existing.UpdatedAt
		}
		if record.DeletedAt.Time.IsZero() {
			record.DeletedAt = existing.DeletedAt
		}
		if record.Name == "" {
			record.Name = existing.Name
		}
		if record.Type == "" {
			record.Type = existing.Type
		}
		if record.TTL == 0 {
			record.TTL = existing.TTL
		}
	}
	result := p.DB.Save(&record)
	if result.Error != nil {
		return result.Error
	}

	coreDNS, err := LoadCoreDNS(ctx)
	if err != nil {
		return err
	}
	err = coreDNS.UpsertRecord(ctx, record, existing)
	if err != nil {
		return err
	}
	err = coreDNS.Save(ctx)
	if err != nil {
		return err
	}

	r53, err := NewRoute53(ctx)
	if err != nil {
		return err
	}
	err = r53.UpsertRecord(ctx, record, existing)
	if err != nil {
		return err
	}

	return nil
}

func (record *DNSRecord) Delete(ctx context.Context, p *Persistence) error {
	var existing *DNSRecord
	if record.ID == 0 {
		if record.Name == "" || record.Type == "" {
			return errors.New("DNS record must have name and type set")
		}
		p.DB.Where("name = ? AND type = ?", record.Name, record.Type).First(&existing)
	} else {
		p.DB.Where("id = ?", record.ID).First(&existing)
	}
	if existing != nil && existing.ID != 0 {
		tx := p.DB.Delete(&existing)
		if tx.Error != nil {
			return tx.Error
		}
	}

	coreDNS, err := LoadCoreDNS(ctx)
	if err != nil {
		return err
	}
	err = coreDNS.DeleteRecord(ctx, record)
	if err != nil {
		return err
	}
	err = coreDNS.Save(ctx)
	if err != nil {
		return err
	}

	r53, err := NewRoute53(ctx)
	if err != nil {
		return err
	}
	err = r53.DeleteRecord(ctx, record)
	if err != nil {
		return err
	}

	return nil
}
