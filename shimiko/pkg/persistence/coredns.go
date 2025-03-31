package persistence

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"time"

	"github.com/bramvdbogaerde/go-scp"
	"golang.org/x/crypto/ssh"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/env"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/zonefile/ast"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/zonefile/lexer"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/zonefile/parser"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/zonefile/token"
)

var coreDNSHosts = []string{
	"rem.sapslaj.xyz",
	"ram.sapslaj.xyz",
}

type CoreDNS struct {
	Entries []ast.Node
}

func (coreDNS *CoreDNS) newClient(host string) (*scp.Client, error) {
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
	client, err := coreDNS.newClient(coreDNSHosts[0])
	if err != nil {
		return nil, fmt.Errorf("error creating new scp client for CoreDNS: %w", err)
	}
	err = client.Connect()
	if err != nil {
		return nil, fmt.Errorf("error connecting scp client for CoreDNS: %w", err)
	}
	buffer := &bytes.Buffer{}
	err = client.CopyFromRemotePassThru(ctx, buffer, "/etc/coredns/sapslaj.xyz.zone", nil)
	if err != nil {
		return nil, fmt.Errorf("error copying file from remote '%s' for CoreDNS: %w", coreDNSHosts[0], err)
	}
	return buffer.Bytes(), nil
}

func (coreDNS *CoreDNS) SaveCoreDNSZoneFile(ctx context.Context, data []byte) error {
	for _, host := range coreDNSHosts {
		client, err := coreDNS.newClient(host)
		if err != nil {
			return fmt.Errorf("error creating new scp client for CoreDNS: %w", err)
		}
		err = client.Connect()
		if err != nil {
			return fmt.Errorf("error connecting scp client for CoreDNS: %w", err)
		}
		reader := bytes.NewReader(data)
		err = client.CopyFile(ctx, reader, "/etc/coredns/sapslaj.xyz.zone", "0644")
		if err != nil {
			return fmt.Errorf("error copying file to remote '%s' for CoreDNS: %w", host, err)
		}
	}
	return nil
}

func (coreDNS *CoreDNS) LoadData(ctx context.Context, data []byte) error {
	tokens := lexer.LexBytes(data).AllTokens()
	entries, err := parser.ParseEntries(tokens)
	if err != nil {
		return fmt.Errorf("error parsing CoreDNS entries: %w", err)
	}
	coreDNS.Entries = entries
	return nil
}

func (coreDNS *CoreDNS) Load(ctx context.Context) error {
	data, err := coreDNS.LoadZoneFileData(ctx)
	if err != nil {
		return fmt.Errorf("error loading zone file data for CoreDNS: %w", err)
	}
	return coreDNS.LoadData(ctx, data)
}

func LoadCoreDNS(ctx context.Context) (*CoreDNS, error) {
	coreDNS := &CoreDNS{}
	return coreDNS, coreDNS.Load(ctx)
}

func (coreDNS *CoreDNS) ToBytes(ctx context.Context) ([]byte, error) {
	tokens, err := parser.Tokenize(coreDNS.Entries)
	if err != nil {
		return nil, fmt.Errorf("error tokenizing CoreDNS zone file: %w", err)
	}
	return token.RenderTokens(tokens), nil
}

func (coreDNS *CoreDNS) Save(ctx context.Context) error {
	err := coreDNS.bumpSOASerial()
	if err != nil {
		return fmt.Errorf("error bumping CoreDNS zone file SOA serial: %w", err)
	}
	data, err := coreDNS.ToBytes(ctx)
	if err != nil {
		return fmt.Errorf("error rendering CoreDNS zone file: %w", err)
	}
	return coreDNS.SaveCoreDNSZoneFile(ctx, data)
}

func (coreDNS *CoreDNS) UpsertRecord(ctx context.Context, record *DNSRecord, previous *DNSRecord) error {
	if record == nil {
		return errors.New("DNSRecord is null")
	}

	if record.shouldReplace(previous) {
		err := coreDNS.DeleteRecord(ctx, previous)
		if err != nil {
			return fmt.Errorf("error deleting previous record: %w", err)
		}
	}

	// TODO: make this algo less shit
	err := coreDNS.DeleteRecord(ctx, record)
	if err != nil {
		return fmt.Errorf("error deleting record: %w", err)
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
	return nil
}

func (coreDNS *CoreDNS) DeleteRecord(ctx context.Context, record *DNSRecord) error {
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
	return nil
}

func (coreDNS *CoreDNS) bumpSOASerial() error {
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
