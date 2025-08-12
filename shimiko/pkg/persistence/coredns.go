package persistence

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/bramvdbogaerde/go-scp"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
	"golang.org/x/crypto/ssh"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/env"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/telemetry"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/zonefile/ast"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/zonefile/lexer"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/zonefile/parser"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/zonefile/token"
)

var CoreDNSHosts = []string{
	// using IP addresses in the event we have a chicken-and-egg problem
	"172.24.4.2", // rem.sapslaj.xyz
	"172.24.4.3", // ram.sapslaj.xyz
}

type CoreDNS struct {
	Entries []ast.Node
}

func (coreDNS *CoreDNS) MakeScpClient(host string) (*scp.Client, error) {
	username, err := env.Get[string]("VYOS_USERNAME")
	if err != nil {
		return nil, fmt.Errorf("error getting VYOS_USERNAME: %w", err)
	}
	password, err := env.Get[string]("VYOS_PASSWORD")
	if err != nil {
		return nil, fmt.Errorf("error getting VYOS_PASSWORD: %w", err)
	}
	client := scp.NewClient(fmt.Sprintf("%s:22", host), &ssh.ClientConfig{
		User: username,
		Auth: []ssh.AuthMethod{
			ssh.Password(password),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
	})
	return &client, nil
}

func (coreDNS *CoreDNS) LoadZoneFileData(ctx context.Context) ([]byte, error) {
	ctx, span := telemetry.Tracer.Start(ctx, "shimiko/pkg/persistence.CoreDNS.LoadZoneFileData", trace.WithAttributes(
		attribute.String("host", CoreDNSHosts[0]),
	))
	defer span.End()

	client, err := coreDNS.MakeScpClient(CoreDNSHosts[0])
	defer client.Close()
	if err != nil {
		err = fmt.Errorf("error creating new scp client for CoreDNS: %w", err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	err = client.Connect()
	if err != nil {
		err = fmt.Errorf("error connecting scp client for CoreDNS: %w", err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	buffer := &bytes.Buffer{}
	err = client.CopyFromRemotePassThru(ctx, buffer, "/etc/coredns/sapslaj.xyz.zone", nil)
	if err != nil {
		err = fmt.Errorf("error copying file from remote '%s' for CoreDNS: %w", CoreDNSHosts[0], err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}

	span.SetStatus(codes.Ok, "")
	return buffer.Bytes(), nil
}

func (coreDNS *CoreDNS) SaveCoreDNSZoneFile(ctx context.Context, data []byte) error {
	ctx, span := telemetry.Tracer.Start(ctx, "shimiko/pkg/persistence.CoreDNS.SaveCoreDNSZoneFile", trace.WithAttributes(
		telemetry.OtelJSON("data", data),
	))
	defer span.End()

	for _, host := range CoreDNSHosts {
		err := func(host string) error {
			subCtx, subSpan := telemetry.Tracer.Start(ctx, "shimiko/pkg/persistence.CoreDNS.SaveCoreDNSZoneFile.host", trace.WithAttributes(
				telemetry.OtelJSON("host", host),
			))
			defer subSpan.End()

			client, err := coreDNS.MakeScpClient(host)
			if err != nil {
				err = fmt.Errorf("error creating new scp client for CoreDNS: %w", err)
				subSpan.SetStatus(codes.Error, err.Error())
				return err
			}
			defer client.Close()

			err = client.Connect()
			if err != nil {
				err = fmt.Errorf("error connecting scp client for CoreDNS: %w", err)
				subSpan.SetStatus(codes.Error, err.Error())
				return err
			}

			reader := bytes.NewReader(data)
			err = client.CopyFile(subCtx, reader, "/etc/coredns/sapslaj.xyz.zone", "0644")
			if err != nil {
				err = fmt.Errorf("error copying file to remote '%s' for CoreDNS: %w", host, err)
				subSpan.SetStatus(codes.Error, err.Error())
				return err
			}

			subSpan.SetStatus(codes.Ok, "")
			return nil
		}(host)
		if err != nil {
			span.SetStatus(codes.Error, err.Error())
			return err
		}
	}

	span.SetStatus(codes.Ok, "")
	return nil
}

func (coreDNS *CoreDNS) LoadData(ctx context.Context, data []byte) error {
	ctx, span := telemetry.Tracer.Start(ctx, "shimiko/pkg/persistence.CoreDNS.LoadData", trace.WithAttributes(
		telemetry.OtelJSON("data", data),
	))
	defer span.End()

	tokens := lexer.LexBytes(data).AllTokens()
	entries, err := parser.ParseEntries(tokens)
	if err != nil {
		err = fmt.Errorf("error parsing CoreDNS entries: %w", err)
		span.SetStatus(codes.Error, err.Error())
		return err
	}

	coreDNS.Entries = entries

	span.SetStatus(codes.Ok, "")
	return nil
}

func (coreDNS *CoreDNS) Load(ctx context.Context) error {
	ctx, span := telemetry.Tracer.Start(ctx, "shimiko/pkg/persistence.CoreDNS.Load", trace.WithAttributes())
	defer span.End()

	data, err := coreDNS.LoadZoneFileData(ctx)
	if err != nil {
		err = fmt.Errorf("error loading zone file data for CoreDNS: %w", err)
		span.SetStatus(codes.Error, err.Error())
		return err
	}

	span.SetStatus(codes.Ok, "")
	return coreDNS.LoadData(ctx, data)
}

func (coreDNS *CoreDNS) ToBytes(ctx context.Context) ([]byte, error) {
	ctx, span := telemetry.Tracer.Start(ctx, "shimiko/pkg/persistence.CoreDNS.ToBytes", trace.WithAttributes())
	defer span.End()

	tokens, err := parser.Tokenize(coreDNS.Entries)
	if err != nil {
		err = fmt.Errorf("error tokenizing CoreDNS zone file: %w", err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}

	span.SetStatus(codes.Ok, "")
	return token.RenderTokens(tokens), nil
}

func (coreDNS *CoreDNS) Save(ctx context.Context) error {
	ctx, span := telemetry.Tracer.Start(ctx, "shimiko/pkg/persistence.CoreDNS.Save", trace.WithAttributes())
	defer span.End()

	err := coreDNS.FormatEntries()
	if err != nil {
		err = fmt.Errorf("error formatting CoreDNS entries: %w", err)
		span.SetStatus(codes.Error, err.Error())
		return err
	}
	err = coreDNS.BumpSOASerial()
	if err != nil {
		err = fmt.Errorf("error bumping CoreDNS zone file SOA serial: %w", err)
		span.SetStatus(codes.Error, err.Error())
		return err
	}
	data, err := coreDNS.ToBytes(ctx)
	if err != nil {
		err = fmt.Errorf("error rendering CoreDNS zone file: %w", err)
		span.SetStatus(codes.Error, err.Error())
		return err
	}

	err = coreDNS.SaveCoreDNSZoneFile(ctx, data)
	if err != nil {
		span.SetStatus(codes.Error, err.Error())
		return err
	}

	span.SetStatus(codes.Ok, "")
	return nil
}

func (coreDNS *CoreDNS) UpsertRecord(ctx context.Context, record *DNSRecord, previous *DNSRecord) error {
	ctx, span := telemetry.Tracer.Start(ctx, "shimiko/pkg/persistence.CoreDNS.UpsertRecord", trace.WithAttributes(
		telemetry.OtelJSON("record", record),
		telemetry.OtelJSON("previous", previous),
	))
	defer span.End()

	if record == nil {
		err := errors.New("DNSRecord is null")
		span.SetStatus(codes.Error, err.Error())
		return err
	}

	if record.ShouldReplace(previous) {
		err := coreDNS.DeleteRecord(ctx, previous)
		if err != nil {
			err = fmt.Errorf("error deleting previous record: %w", err)
			span.SetStatus(codes.Error, err.Error())
			return err
		}
	}

	// TODO: make this algo less shit
	err := coreDNS.DeleteRecord(ctx, record)
	if err != nil {
		err = fmt.Errorf("error deleting record: %w", err)
		span.SetStatus(codes.Error, err.Error())
		return err
	}
	for _, value := range record.Records {
		rrecord := ast.RRecord{
			Class: "IN",
			Type:  record.Type,
			RData: []ast.RData{
				{
					Value: value,
				},
			},
		}
		if record.TTL != 0 {
			rrecord.TTL = time.Duration(record.TTL) * time.Second
		}
		coreDNS.Entries = append(coreDNS.Entries, ast.Node{
			NodeType: ast.NodeTypeRREntry,
			Entry: ast.RREntry{
				DomainName: record.Name,
				RRecord:    rrecord,
			},
		})
	}

	span.SetStatus(codes.Ok, "")
	return nil
}

func (coreDNS *CoreDNS) DeleteRecord(ctx context.Context, record *DNSRecord) error {
	ctx, span := telemetry.Tracer.Start(ctx, "shimiko/pkg/persistence.CoreDNS.DeleteRecord", trace.WithAttributes(
		telemetry.OtelJSON("record", record),
	))
	defer span.End()

	if record == nil {
		err := errors.New("DNSRecord is null")
		span.SetStatus(codes.Error, err.Error())
		return err
	}

	coreDNS.Entries = slices.DeleteFunc(coreDNS.Entries, func(node ast.Node) bool {
		if !node.IsRREntry() {
			return false
		}
		entry := node.RREntry()
		if entry.RRecord.Type != record.Type {
			return false
		}
		if entry.DomainName == record.Name {
			return true
		}
		if entry.DomainName == record.FullHostname()+"." {
			return true
		}
		return false
	})

	span.SetStatus(codes.Ok, "")
	return nil
}

func (coreDNS *CoreDNS) BumpSOASerial() error {
	for i := range coreDNS.Entries {
		if !coreDNS.Entries[i].IsRREntry() {
			continue
		}
		entry := coreDNS.Entries[i].RREntry()
		if entry.RRecord.Type != "SOA" {
			continue
		}
		if len(entry.RRecord.RData) != 7 {
			return errors.New("invalid SOA entry")
		}
		serial, err := strconv.Atoi(entry.RRecord.RData[2].Value)
		if err != nil {
			return fmt.Errorf("could not parse serial: %w", err)
		}
		entry.RRecord.RData[2].Value = strconv.Itoa(serial + 1)
		coreDNS.Entries[i].Entry = entry
		return nil
	}

	return errors.New("could not find SOA entry")
}

func (coreDNS *CoreDNS) FormatEntries() error {
	sortedEntries := []ast.Node{}

	for _, entry := range coreDNS.Entries {
		if !entry.IsOriginControlEntry() {
			continue
		}
		sortedEntries = append(sortedEntries, entry)
		break
	}
	for _, entry := range coreDNS.Entries {
		if !entry.IsTTLControlEntry() {
			continue
		}
		sortedEntries = append(sortedEntries, entry)
		break
	}
	if len(sortedEntries) > 0 {
		sortedEntries = append(sortedEntries, ast.Node{
			NodeType: ast.NodeTypeEmpty,
		})
	}

	for _, node := range coreDNS.Entries {
		if !node.IsRREntry() {
			continue
		}
		entry := node.RREntry()
		if entry.RRecord.Type != "SOA" {
			continue
		}
		if entry.DomainName != DomainName+"." {
			continue
		}
		sortedEntries = append(sortedEntries, node)
	}
	for _, node := range coreDNS.Entries {
		if !node.IsRREntry() {
			continue
		}
		entry := node.RREntry()
		if entry.RRecord.Type != "NS" {
			continue
		}
		if entry.DomainName != DomainName+"." {
			continue
		}
		sortedEntries = append(sortedEntries, node)
	}

	recordGroup := []ast.Node{}
	flushRecordGroup := func() {
		if len(recordGroup) == 0 {
			return
		}
		sortedEntries = append(sortedEntries, ast.Node{
			NodeType: ast.NodeTypeEmpty,
		})
		slices.SortFunc(recordGroup, func(a ast.Node, b ast.Node) int {
			if a.NodeType != b.NodeType {
				return 0
			}
			if !a.IsRREntry() || !b.IsRREntry() {
				return 0
			}
			aEntry := a.RREntry()
			bEntry := b.RREntry()
			n := strings.Compare(aEntry.DomainName, bEntry.DomainName)
			if n != 0 {
				return n
			}
			n = strings.Compare(aEntry.RRecord.Class, bEntry.RRecord.Class)
			if n != 0 {
				return n
			}
			n = strings.Compare(aEntry.RRecord.Type, bEntry.RRecord.Type)
			if n != 0 {
				return n
			}
			return 0
		})
		if len(sortedEntries) > 0 && sortedEntries[len(sortedEntries)-1].NodeType != ast.NodeTypeEmpty {
			sortedEntries = append(sortedEntries, ast.Node{
				NodeType: ast.NodeTypeEmpty,
			})
		}
		sortedEntries = append(sortedEntries, recordGroup...)
		recordGroup = []ast.Node{}
	}

	for _, node := range coreDNS.Entries {
		if node.IsIncludeControlEntry() {
			flushRecordGroup()
			if len(sortedEntries) > 0 && sortedEntries[len(sortedEntries)-1].NodeType != ast.NodeTypeEmpty {
				sortedEntries = append(sortedEntries, ast.Node{
					NodeType: ast.NodeTypeEmpty,
				})
			}
			sortedEntries = append(sortedEntries, node)
		}
		if node.IsRREntry() {
			entry := node.RREntry()
			if entry.RRecord.Type == "SOA" && entry.DomainName == DomainName+"." {
				continue
			}
			if entry.RRecord.Type == "NS" && entry.DomainName == DomainName+"." {
				continue
			}
			recordGroup = append(recordGroup, node)
		}
	}
	flushRecordGroup()

	coreDNS.Entries = sortedEntries

	return nil
}
