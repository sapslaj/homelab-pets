package persistence

import (
	"bytes"
	"context"
	"errors"
	"fmt"

	"github.com/bramvdbogaerde/go-scp"
	"golang.org/x/crypto/ssh"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/env"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/zonefile"
)

var coreDNSHosts = []string{
	"rem.sapslaj.xyz",
	"ram.sapslaj.xyz",
}

type CoreDNS struct {
	ZF *zonefile.Zonefile
}

func (coreDNS *CoreDNS) newClient(host string) (*scp.Client, error) {
	username, err := env.Get[string]("VYOS_USERNAME")
	if err != nil {
		return nil, err
	}
	password, err := env.Get[string]("VYOS_PASSWORD")
	if err != nil {
		return nil, err
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
		return nil, err
	}
	err = client.Connect()
	if err != nil {
		return nil, err
	}
	buffer := &bytes.Buffer{}
	err = client.CopyFromRemotePassThru(ctx, buffer, "/etc/coredns/sapslaj.xyz.zone", nil)
	if err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func (coreDNS *CoreDNS) SaveCoreDNSZoneFile(ctx context.Context, data []byte) error {
	for _, host := range coreDNSHosts {
		client, err := coreDNS.newClient(host)
		if err != nil {
			return err
		}
		err = client.Connect()
		if err != nil {
			return err
		}
		reader := bytes.NewReader(data)
		err = client.CopyFile(ctx, reader, "/etc/coredns/sapslaj.xyz.zone", "0644")
		if err != nil {
			return err
		}
	}
	return nil
}

func (coreDNS *CoreDNS) Load(ctx context.Context) error {
	data, err := coreDNS.LoadZoneFileData(ctx)
	if err != nil {
		return err
	}
	zf, err := zonefile.Load(data)
	if err != nil {
		return err
	}
	coreDNS.ZF = zf
	return nil
}

func LoadCoreDNS(ctx context.Context) (*CoreDNS, error) {
	coreDNS := &CoreDNS{}
	return coreDNS, coreDNS.Load(ctx)
}

func (coreDNS *CoreDNS) Save(ctx context.Context) error {
	data := coreDNS.ZF.Save()
	if data[len(data)-1] != '\n' {
		data = append(data, '\n')
	}
	return coreDNS.SaveCoreDNSZoneFile(ctx, data)
}

func (coreDNS *CoreDNS) UpsertRecord(ctx context.Context, record *DNSRecord, previous *DNSRecord) error {
	if record == nil {
		return errors.New("DNSRecord is null")
	}

	var zfentry *zonefile.Entry
	if record.shouldReplace(previous) {
		coreDNS.DeleteRecord(ctx, previous)
	} else {
		for _, entry := range coreDNS.ZF.Entries() {
			if string(entry.Domain()) == previous.Name && string(entry.Type()) == previous.Type {
				zfentry = &entry
				break
			}
		}
	}

	var err error
	if zfentry == nil {
		zfentry = coreDNS.ZF.AddA(record.Name, "")
	}
	err = zfentry.SetDomain([]byte(record.Name))
	if err != nil {
		return err
	}
	if record.TTL != 0 {
		err = zfentry.SetTTL(record.TTL)
		if err != nil {
			return err
		}
	} else {
		err = zfentry.RemoveTTL()
		if err != nil {
			return err
		}
	}
	err = zfentry.SetClass([]byte("IN"))
	if err != nil {
		return err
	}
	err = zfentry.SetType([]byte(record.Type))
	if err != nil {
		return err
	}
	for i, val := range record.Records {
		err = zfentry.SetValue(i, []byte(val))
		if err != nil {
			return err
		}
	}
	return nil
}

func (coreDNS *CoreDNS) DeleteRecord(ctx context.Context, record *DNSRecord) error {
	for _, entry := range coreDNS.ZF.Entries() {
		if string(entry.Domain()) == record.Name && string(entry.Type()) == record.Type {
			coreDNS.ZF.RemoveEntry(entry)
		}
	}
	return nil
}
