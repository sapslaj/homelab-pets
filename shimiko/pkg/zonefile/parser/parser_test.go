package parser_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/zonefile/ast"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/zonefile/parser"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/zonefile/token"
)

func TestParseEntry(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		inputTokens []token.Token
		expected    ast.Node
		err         error
		errContains string
	}{
		"empty node": {
			inputTokens: []token.Token{
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte{},
				},
			},
			expected: ast.Node{
				NodeType: ast.NodeTypeEmpty,
			},
		},
		"empty node with comments": {
			inputTokens: []token.Token{
				{
					Type:             token.COMMENT,
					Literal:          []byte("; comment 1"),
					WhiteSpaceBefore: []byte{},
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte{},
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; comment 2"),
					WhiteSpaceBefore: []byte{},
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte{},
				},
			},
			expected: ast.Node{
				NodeType: ast.NodeTypeEmpty,
				LeadComments: []string{
					"; comment 1",
					"; comment 2",
				},
			},
		},
		"ttl control": {
			inputTokens: []token.Token{
				{
					Type:             token.CONTROL_ENTRY,
					Literal:          []byte("$TTL"),
					WhiteSpaceBefore: []byte{},
				},
				{
					Type:             token.TTL,
					Literal:          []byte("300"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte{},
				},
			},
			expected: ast.Node{
				NodeType: ast.NodeTypeTTLControlEntry,
				Entry: ast.TTLControlEntry{
					TTL: 300 * time.Second,
				},
			},
		},
		"ttl control with comment": {
			inputTokens: []token.Token{
				{
					Type:             token.CONTROL_ENTRY,
					Literal:          []byte("$TTL"),
					WhiteSpaceBefore: []byte{},
				},
				{
					Type:             token.TTL,
					Literal:          []byte("300"),
					WhiteSpaceBefore: []byte{'\t'},
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; set TTL to 300"),
					WhiteSpaceBefore: []byte{'\t'},
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte{},
				},
			},
			expected: ast.Node{
				NodeType:    ast.NodeTypeTTLControlEntry,
				LineComment: "; set TTL to 300",
				Entry: ast.TTLControlEntry{
					TTL: 300 * time.Second,
				},
			},
		},
		"origin control": {
			inputTokens: []token.Token{
				{
					Type:             token.CONTROL_ENTRY,
					Literal:          []byte("$ORIGIN"),
					WhiteSpaceBefore: []byte{},
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("sapslaj.com."),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte{},
				},
			},
			expected: ast.Node{
				NodeType: ast.NodeTypeOriginControlEntry,
				Entry: ast.OriginControlEntry{
					DomainName: "sapslaj.com.",
				},
			},
		},
		"origin control with comment": {
			inputTokens: []token.Token{
				{
					Type:             token.CONTROL_ENTRY,
					Literal:          []byte("$ORIGIN"),
					WhiteSpaceBefore: []byte{},
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("sapslaj.com."),
					WhiteSpaceBefore: []byte{'\t'},
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; this is the zone for sapslaj.com"),
					WhiteSpaceBefore: []byte{'\t'},
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte{},
				},
			},
			expected: ast.Node{
				NodeType:    ast.NodeTypeOriginControlEntry,
				LineComment: "; this is the zone for sapslaj.com",
				Entry: ast.OriginControlEntry{
					DomainName: "sapslaj.com.",
				},
			},
		},
		"include control with just file name": {
			inputTokens: []token.Token{
				{
					Type:             token.CONTROL_ENTRY,
					Literal:          []byte("$INCLUDE"),
					WhiteSpaceBefore: []byte{},
				},
				{
					Type:             token.FILE_NAME,
					Literal:          []byte("mailboxes.txt"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte{},
				},
			},
			expected: ast.Node{
				NodeType: ast.NodeTypeIncludeControlEntry,
				Entry: ast.IncludeControlEntry{
					FileName: "mailboxes.txt",
				},
			},
		},
		"include control with just file name and comment": {
			inputTokens: []token.Token{
				{
					Type:             token.CONTROL_ENTRY,
					Literal:          []byte("$INCLUDE"),
					WhiteSpaceBefore: []byte{},
				},
				{
					Type:             token.FILE_NAME,
					Literal:          []byte("mailboxes.txt"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; include mailboxes"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte{},
				},
			},
			expected: ast.Node{
				NodeType:    ast.NodeTypeIncludeControlEntry,
				LineComment: "; include mailboxes",
				Entry: ast.IncludeControlEntry{
					FileName: "mailboxes.txt",
				},
			},
		},
		"include control with file name and domain name": {
			inputTokens: []token.Token{
				{
					Type:             token.CONTROL_ENTRY,
					Literal:          []byte("$INCLUDE"),
					WhiteSpaceBefore: []byte{},
				},
				{
					Type:             token.FILE_NAME,
					Literal:          []byte("mailboxes.txt"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("mail.sapslaj.com."),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte{},
				},
			},
			expected: ast.Node{
				NodeType: ast.NodeTypeIncludeControlEntry,
				Entry: ast.IncludeControlEntry{
					FileName:   "mailboxes.txt",
					DomainName: "mail.sapslaj.com.",
				},
			},
		},
		"include control with file name and domain name and comment": {
			inputTokens: []token.Token{
				{
					Type:             token.CONTROL_ENTRY,
					Literal:          []byte("$INCLUDE"),
					WhiteSpaceBefore: []byte{},
				},
				{
					Type:             token.FILE_NAME,
					Literal:          []byte("mailboxes.txt"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("mail.sapslaj.com."),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; include mailboxes"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte{},
				},
			},
			expected: ast.Node{
				NodeType:    ast.NodeTypeIncludeControlEntry,
				LineComment: "; include mailboxes",
				Entry: ast.IncludeControlEntry{
					FileName:   "mailboxes.txt",
					DomainName: "mail.sapslaj.com.",
				},
			},
		},
		"no domain name A record": {
			inputTokens: []token.Token{
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte{'\t'},
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("198.51.100.69"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte{},
				},
			},
			expected: ast.Node{
				NodeType: ast.NodeTypeRREntry,
				Entry: ast.RREntry{
					DomainName: "",
					RRecord: ast.RRecord{
						Type: "A",
						RData: []ast.RData{
							{
								Value: "198.51.100.69",
							},
						},
					},
				},
			},
		},
		"current origin A record": {
			inputTokens: []token.Token{
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("@"),
					WhiteSpaceBefore: []byte{},
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("198.51.100.69"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte{},
				},
			},
			expected: ast.Node{
				NodeType: ast.NodeTypeRREntry,
				Entry: ast.RREntry{
					DomainName: "@",
					RRecord: ast.RRecord{
						Type: "A",
						RData: []ast.RData{
							{
								Value: "198.51.100.69",
							},
						},
					},
				},
			},
		},
		"domain name A record": {
			inputTokens: []token.Token{
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("ligma"),
					WhiteSpaceBefore: []byte{},
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("198.51.100.69"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte{},
				},
			},
			expected: ast.Node{
				NodeType: ast.NodeTypeRREntry,
				Entry: ast.RREntry{
					DomainName: "ligma",
					RRecord: ast.RRecord{
						Type: "A",
						RData: []ast.RData{
							{
								Value: "198.51.100.69",
							},
						},
					},
				},
			},
		},
		"domain name with ttl type and rdata": {
			inputTokens: []token.Token{
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("ligma"),
					WhiteSpaceBefore: []byte{},
				},
				{
					Type:             token.TTL,
					Literal:          []byte("420"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("198.51.100.69"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte{},
				},
			},
			expected: ast.Node{
				NodeType: ast.NodeTypeRREntry,
				Entry: ast.RREntry{
					DomainName: "ligma",
					RRecord: ast.RRecord{
						Type: "A",
						TTL:  420 * time.Second,
						RData: []ast.RData{
							{
								Value: "198.51.100.69",
							},
						},
					},
				},
			},
		},
		"no domain name with ttl type and rdata": {
			inputTokens: []token.Token{
				{
					Type:             token.TTL,
					Literal:          []byte("420"),
					WhiteSpaceBefore: []byte{'\t'},
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("198.51.100.69"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte{},
				},
			},
			expected: ast.Node{
				NodeType: ast.NodeTypeRREntry,
				Entry: ast.RREntry{
					DomainName: "",
					RRecord: ast.RRecord{
						Type: "A",
						TTL:  420 * time.Second,
						RData: []ast.RData{
							{
								Value: "198.51.100.69",
							},
						},
					},
				},
			},
		},
		"domain name with ttl type class and rdata": {
			inputTokens: []token.Token{
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("ligma"),
					WhiteSpaceBefore: []byte{},
				},
				{
					Type:             token.TTL,
					Literal:          []byte("420"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("198.51.100.69"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte{},
				},
			},
			expected: ast.Node{
				NodeType: ast.NodeTypeRREntry,
				Entry: ast.RREntry{
					DomainName: "ligma",
					RRecord: ast.RRecord{
						Type:  "A",
						Class: "IN",
						TTL:   420 * time.Second,
						RData: []ast.RData{
							{
								Value: "198.51.100.69",
							},
						},
					},
				},
			},
		},
		"no domain name with class ttl type and rdata": {
			inputTokens: []token.Token{
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte{'\t'},
				},
				{
					Type:             token.TTL,
					Literal:          []byte("420"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("198.51.100.69"),
					WhiteSpaceBefore: []byte{' '},
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte{},
				},
			},
			expected: ast.Node{
				NodeType: ast.NodeTypeRREntry,
				Entry: ast.RREntry{
					DomainName: "",
					RRecord: ast.RRecord{
						Type:  "A",
						Class: "IN",
						TTL:   420 * time.Second,
						RData: []ast.RData{
							{
								Value: "198.51.100.69",
							},
						},
					},
				},
			},
		},
		"SOA single line": {
			inputTokens: []token.Token{
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("sapslaj.com."),
					WhiteSpaceBefore: []byte{},
				},
				{
					Type:             token.TTL,
					Literal:          []byte("1800"),
					WhiteSpaceBefore: []byte("            "),
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte("    "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("SOA"),
					WhiteSpaceBefore: []byte("      "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("coco.ns.cloudflare.com."),
					WhiteSpaceBefore: []byte("     "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("dns.cloudflare.com."),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("2366100114"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("10000"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("2400"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("604800"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("1800"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte{'\n'},
					WhiteSpaceBefore: []byte{},
				},
			},
			expected: ast.Node{
				NodeType: ast.NodeTypeRREntry,
				Entry: ast.RREntry{
					DomainName: "sapslaj.com.",
					RRecord: ast.RRecord{
						TTL:   1800 * time.Second,
						Class: "IN",
						Type:  "SOA",
						RData: []ast.RData{
							{
								Value: "coco.ns.cloudflare.com.",
							},
							{
								Value: "dns.cloudflare.com.",
							},
							{
								Value: "2366100114",
							},
							{
								Value: "10000",
							},
							{
								Value: "2400",
							},
							{
								Value: "604800",
							},
							{
								Value: "1800",
							},
						},
					},
				},
			},
		},
		"domain name that is also a type": {
			inputTokens: []token.Token{
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte("       "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("26.3.0.103"),
					WhiteSpaceBefore: []byte("       "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte{'\n'},
					WhiteSpaceBefore: []byte{},
				},
			},
			expected: ast.Node{
				NodeType: ast.NodeTypeRREntry,
				Entry: ast.RREntry{
					DomainName: "A",
					RRecord: ast.RRecord{
						Type: "A",
						RData: []ast.RData{
							{
								Value: "26.3.0.103",
							},
						},
					},
				},
			},
		},
		"txt record with quotes": {
			inputTokens: []token.Token{
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("sapslaj.com."),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TTL,
					Literal:          []byte("300"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("TXT"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte(`"v=spf1 include:_spf.google.com include:mailgun.org -all"`),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.EOF,
					Literal:          []byte(""),
					WhiteSpaceBefore: []byte(""),
				},
			},
			expected: ast.Node{
				NodeType: ast.NodeTypeRREntry,
				Entry: ast.RREntry{
					DomainName: "sapslaj.com.",
					RRecord: ast.RRecord{
						TTL:   300 * time.Second,
						Class: "IN",
						Type:  "TXT",
						RData: []ast.RData{
							{
								Value: `"v=spf1 include:_spf.google.com include:mailgun.org -all"`,
							},
						},
					},
				},
			},
		},
	}

	for name, tc := range tests {
		tc := tc
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			got, err := parser.ParseEntry(tc.inputTokens)

			if tc.err != nil {
				assert.ErrorIs(t, err, tc.err)
			} else if tc.errContains != "" {
				assert.ErrorContains(t, err, tc.errContains)
			} else {
				assert.NoError(t, err)
			}

			// for convenience so inputTokens doesn't have to be copied to
			// SourceTokens every time.
			if tc.expected.SourceTokens == nil || len(tc.expected.SourceTokens) == 0 {
				tc.expected.SourceTokens = tc.inputTokens
			}
			if tc.expected.LeadComments == nil {
				tc.expected.LeadComments = []string{}
			}

			assert.Equal(t, tc.expected, got)
		})
	}
}

func TestParseEntries(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		inputTokens []token.Token
		expected    []ast.Node
		err         error
		errContains string
	}{
		"bwesterb ExampleLoad": {
			inputTokens: []token.Token{
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("@"),
					WhiteSpaceBefore: []byte{},
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("SOA"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("NS1.NAMESERVER.NET."),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("HOSTMASTER.MYDOMAIN.COM."),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA_OPAREN,
					Literal:          []byte("("),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("1406291485"),
					WhiteSpaceBefore: []byte("            "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte(";serial"),
					WhiteSpaceBefore: []byte("\t "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("3600"),
					WhiteSpaceBefore: []byte("            "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte(";refresh"),
					WhiteSpaceBefore: []byte("\t "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("600"),
					WhiteSpaceBefore: []byte("            "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte(";retry"),
					WhiteSpaceBefore: []byte("\t "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("604800"),
					WhiteSpaceBefore: []byte("            "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte(";expire"),
					WhiteSpaceBefore: []byte("\t "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("86400"),
					WhiteSpaceBefore: []byte("            "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte(";minimum ttl"),
					WhiteSpaceBefore: []byte("\t "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.RDATA_CPAREN,
					Literal:          []byte(")"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("@"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("NS"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("NS1.NAMESERVER.NET."),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("@"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("NS"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("NS2.NAMESERVER.NET."),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.EOF,
					Literal:          []byte(""),
					WhiteSpaceBefore: []byte(""),
				},
			},
			expected: []ast.Node{
				{
					NodeType:     ast.NodeTypeRREntry,
					LeadComments: []string{},
					LineComment:  ";minimum ttl",
					Entry: ast.RREntry{
						DomainName: "@",
						RRecord: ast.RRecord{
							Class: "IN",
							Type:  "SOA",
							RData: []ast.RData{
								{
									Value: "NS1.NAMESERVER.NET.",
								},
								{
									Value: "HOSTMASTER.MYDOMAIN.COM.",
								},
								{
									Value: "1406291485",
								},
								{
									Value: "3600",
								},
								{
									Value: "600",
								},
								{
									Value: "604800",
								},
								{
									Value: "86400",
								},
							},
						},
					},
					SourceTokens: []token.Token{
						{
							Type:             token.DOMAIN_NAME,
							Literal:          []byte("@"),
							WhiteSpaceBefore: []byte{},
						},
						{
							Type:             token.CLASS,
							Literal:          []byte("IN"),
							WhiteSpaceBefore: []byte("\t"),
						},
						{
							Type:             token.TYPE,
							Literal:          []byte("SOA"),
							WhiteSpaceBefore: []byte("\t"),
						},
						{
							Type:             token.RDATA,
							Literal:          []byte("NS1.NAMESERVER.NET."),
							WhiteSpaceBefore: []byte("\t"),
						},
						{
							Type:             token.RDATA,
							Literal:          []byte("HOSTMASTER.MYDOMAIN.COM."),
							WhiteSpaceBefore: []byte("\t"),
						},
						{
							Type:             token.RDATA_OPAREN,
							Literal:          []byte("("),
							WhiteSpaceBefore: []byte("\t"),
						},
						{
							Type:             token.NEWLINE,
							Literal:          []byte("\n"),
							WhiteSpaceBefore: []byte(""),
						},
						{
							Type:             token.RDATA,
							Literal:          []byte("1406291485"),
							WhiteSpaceBefore: []byte("            "),
						},
						{
							Type:             token.COMMENT,
							Literal:          []byte(";serial"),
							WhiteSpaceBefore: []byte("\t "),
						},
						{
							Type:             token.NEWLINE,
							Literal:          []byte("\n"),
							WhiteSpaceBefore: []byte(""),
						},
						{
							Type:             token.RDATA,
							Literal:          []byte("3600"),
							WhiteSpaceBefore: []byte("            "),
						},
						{
							Type:             token.COMMENT,
							Literal:          []byte(";refresh"),
							WhiteSpaceBefore: []byte("\t "),
						},
						{
							Type:             token.NEWLINE,
							Literal:          []byte("\n"),
							WhiteSpaceBefore: []byte(""),
						},
						{
							Type:             token.RDATA,
							Literal:          []byte("600"),
							WhiteSpaceBefore: []byte("            "),
						},
						{
							Type:             token.COMMENT,
							Literal:          []byte(";retry"),
							WhiteSpaceBefore: []byte("\t "),
						},
						{
							Type:             token.NEWLINE,
							Literal:          []byte("\n"),
							WhiteSpaceBefore: []byte(""),
						},
						{
							Type:             token.RDATA,
							Literal:          []byte("604800"),
							WhiteSpaceBefore: []byte("            "),
						},
						{
							Type:             token.COMMENT,
							Literal:          []byte(";expire"),
							WhiteSpaceBefore: []byte("\t "),
						},
						{
							Type:             token.NEWLINE,
							Literal:          []byte("\n"),
							WhiteSpaceBefore: []byte(""),
						},
						{
							Type:             token.RDATA,
							Literal:          []byte("86400"),
							WhiteSpaceBefore: []byte("            "),
						},
						{
							Type:             token.COMMENT,
							Literal:          []byte(";minimum ttl"),
							WhiteSpaceBefore: []byte("\t "),
						},
						{
							Type:             token.NEWLINE,
							Literal:          []byte("\n"),
							WhiteSpaceBefore: []byte(""),
						},
						{
							Type:             token.RDATA_CPAREN,
							Literal:          []byte(")"),
							WhiteSpaceBefore: []byte(""),
						},
						{
							Type:             token.NEWLINE,
							Literal:          []byte("\n"),
							WhiteSpaceBefore: []byte(""),
						},
					},
				},
				{
					NodeType:     ast.NodeTypeEmpty,
					LeadComments: []string{},
					SourceTokens: []token.Token{
						{
							Type:             token.NEWLINE,
							Literal:          []byte("\n"),
							WhiteSpaceBefore: []byte(""),
						},
					},
				},
				{
					NodeType:     ast.NodeTypeRREntry,
					LeadComments: []string{},
					Entry: ast.RREntry{
						DomainName: "@",
						RRecord: ast.RRecord{
							Type: "NS",
							RData: []ast.RData{
								{
									Value: "NS1.NAMESERVER.NET.",
								},
							},
						},
					},
					SourceTokens: []token.Token{
						{
							Type:             token.DOMAIN_NAME,
							Literal:          []byte("@"),
							WhiteSpaceBefore: []byte(""),
						},
						{
							Type:             token.TYPE,
							Literal:          []byte("NS"),
							WhiteSpaceBefore: []byte("\t"),
						},
						{
							Type:             token.RDATA,
							Literal:          []byte("NS1.NAMESERVER.NET."),
							WhiteSpaceBefore: []byte("\t"),
						},
						{
							Type:             token.NEWLINE,
							Literal:          []byte("\n"),
							WhiteSpaceBefore: []byte(""),
						},
					},
				},
				{
					NodeType:     ast.NodeTypeRREntry,
					LeadComments: []string{},
					Entry: ast.RREntry{
						DomainName: "@",
						RRecord: ast.RRecord{
							Type: "NS",
							RData: []ast.RData{
								{
									Value: "NS2.NAMESERVER.NET.",
								},
							},
						},
					},
					SourceTokens: []token.Token{
						{
							Type:             token.DOMAIN_NAME,
							Literal:          []byte("@"),
							WhiteSpaceBefore: []byte(""),
						},
						{
							Type:             token.TYPE,
							Literal:          []byte("NS"),
							WhiteSpaceBefore: []byte("\t"),
						},
						{
							Type:             token.RDATA,
							Literal:          []byte("NS2.NAMESERVER.NET."),
							WhiteSpaceBefore: []byte("\t"),
						},
						{
							Type:             token.NEWLINE,
							Literal:          []byte("\n"),
							WhiteSpaceBefore: []byte(""),
						},
					},
				},
				{
					NodeType:     ast.NodeTypeEmpty,
					LeadComments: []string{},
					SourceTokens: []token.Token{
						{
							Type:             token.EOF,
							Literal:          []byte(""),
							WhiteSpaceBefore: []byte(""),
						},
					},
				},
			},
		},
	}

	for name, tc := range tests {
		tc := tc
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			got, err := parser.ParseEntries(tc.inputTokens)

			if tc.err != nil {
				assert.ErrorIs(t, err, tc.err)
			} else if tc.errContains != "" {
				assert.ErrorContains(t, err, tc.errContains)
			} else {
				assert.NoError(t, err)
			}

			// for i, expected := range tc.expected {
			// 	// assert.Equal(t, expected, got[i])
			//
			// 	assert.Equal(t, expected.NodeType, got[i].NodeType)
			//
			// 	assert.Equal(t, expected.SourceTokens, got[i].SourceTokens)
			//
			// 	if expected.LeadComments == nil || len(expected.LeadComments) == 0 {
			// 		expected.LeadComments = []string{}
			// 	}
			// 	assert.Equal(t, expected.LeadComments, got[i].LeadComments)
			//
			// 	assert.Equal(t, expected.LineComment, got[i].LineComment)
			//
			// 	assert.Equal(t, expected.Entry, got[i].Entry)
			// }
			assert.Equal(t, tc.expected, got)
		})
	}
}

func TestTokenize(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		input       []ast.Node
		expected    []token.Token
		err         error
		errContains string
	}{
		"bwesterb ExampleLoad": {
			input: []ast.Node{
				{
					NodeType:     ast.NodeTypeRREntry,
					LeadComments: []string{},
					Entry: ast.RREntry{
						DomainName: "@",
						RRecord: ast.RRecord{
							Class: "IN",
							Type:  "SOA",
							RData: []ast.RData{
								{
									Value: "NS1.NAMESERVER.NET.",
								},
								{
									Value: "HOSTMASTER.MYDOMAIN.COM.",
								},
								{
									Value: "1406291485",
								},
								{
									Value: "3600",
								},
								{
									Value: "600",
								},
								{
									Value: "604800",
								},
								{
									Value: "86400",
								},
							},
						},
					},
				},
				{
					NodeType:     ast.NodeTypeEmpty,
					LeadComments: []string{},
				},
				{
					NodeType:     ast.NodeTypeRREntry,
					LeadComments: []string{},
					Entry: ast.RREntry{
						DomainName: "@",
						RRecord: ast.RRecord{
							Type: "NS",
							RData: []ast.RData{
								{
									Value: "NS1.NAMESERVER.NET.",
								},
							},
						},
					},
				},
				{
					NodeType:     ast.NodeTypeRREntry,
					LeadComments: []string{},
					Entry: ast.RREntry{
						DomainName: "@",
						RRecord: ast.RRecord{
							Type: "NS",
							RData: []ast.RData{
								{
									Value: "NS2.NAMESERVER.NET.",
								},
							},
						},
					},
				},
				{
					NodeType:     ast.NodeTypeEmpty,
					LeadComments: []string{},
				},
			},
			expected: []token.Token{
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("@"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("SOA"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("NS1.NAMESERVER.NET."),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("HOSTMASTER.MYDOMAIN.COM."),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("1406291485"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("3600"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("600"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("604800"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("86400"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("@"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("NS"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("NS1.NAMESERVER.NET."),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("@"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("NS"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("NS2.NAMESERVER.NET."),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
			},
		},
	}

	for name, tc := range tests {
		tc := tc
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			got, err := parser.Tokenize(tc.input)

			if tc.err != nil {
				assert.ErrorIs(t, err, tc.err)
			} else if tc.errContains != "" {
				assert.ErrorContains(t, err, tc.errContains)
			} else {
				assert.NoError(t, err)
			}

			// for i, tok := range tc.expected {
			// 	assert.Equal(t, tok, got[i])
			// }
			assert.Equal(t, tc.expected, got)
		})
	}
}
