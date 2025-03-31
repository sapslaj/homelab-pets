package lexer_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/zonefile/lexer"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/zonefile/token"
)

func TestLexerStateLastTokenN(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		state         *lexer.LexerState
		n             int
		expectedToken token.Token
	}{
		"nil tokens last 1": {
			state: &lexer.LexerState{},
			n:     1,
			expectedToken: token.Token{
				Type:             token.NEWLINE,
				Literal:          []byte{},
				WhiteSpaceBefore: []byte{},
			},
		},
		"0 tokens last 1": {
			state: &lexer.LexerState{
				ParsedTokens: []token.Token{},
			},
			n: 1,
			expectedToken: token.Token{
				Type:             token.NEWLINE,
				Literal:          []byte{},
				WhiteSpaceBefore: []byte{},
			},
		},
		"1 token last 1": {
			state: &lexer.LexerState{
				ParsedTokens: []token.Token{
					{
						Type:             token.COMMENT,
						Literal:          []byte("test"),
						WhiteSpaceBefore: []byte{},
					},
				},
			},
			n: 1,
			expectedToken: token.Token{
				Type:             token.COMMENT,
				Literal:          []byte("test"),
				WhiteSpaceBefore: []byte{},
			},
		},
		"1 token last 2": {
			state: &lexer.LexerState{
				ParsedTokens: []token.Token{
					{
						Type:             token.COMMENT,
						Literal:          []byte("test"),
						WhiteSpaceBefore: []byte{},
					},
				},
			},
			n: 2,
			expectedToken: token.Token{
				Type:             token.NEWLINE,
				Literal:          []byte{},
				WhiteSpaceBefore: []byte{},
			},
		},
	}

	for name, tc := range tests {
		tc := tc
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tc.expectedToken, tc.state.LastTokenN(tc.n))
		})
	}
}

func TestLexerStateNextToken(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		state            *lexer.LexerState
		expectedToken    token.Token
		expectedPosition int
	}{
		"single line comment with newline": {
			state: &lexer.LexerState{
				Bytes:    []byte("; comment\n"),
				Position: 0,
			},
			expectedPosition: 9,
			expectedToken: token.Token{
				Type:             token.COMMENT,
				Literal:          []byte("; comment"),
				WhiteSpaceBefore: []byte{},
			},
		},
		"single line comment without newline": {
			state: &lexer.LexerState{
				Bytes:    []byte("; comment"),
				Position: 0,
			},
			expectedPosition: 9,
			expectedToken: token.Token{
				Type:             token.COMMENT,
				Literal:          []byte("; comment"),
				WhiteSpaceBefore: []byte{},
			},
		},
		"single line comment newline": {
			state: &lexer.LexerState{
				Bytes:    []byte("; comment\n"),
				Position: 9,
			},
			expectedPosition: 10,
			expectedToken: token.Token{
				Type:             token.NEWLINE,
				Literal:          []byte("\n"),
				WhiteSpaceBefore: []byte{},
			},
		},
		"single line comment with leading whitespace": {
			state: &lexer.LexerState{
				Bytes:    []byte("\t  ; comment\n"),
				Position: 0,
			},
			expectedPosition: 12,
			expectedToken: token.Token{
				Type:             token.COMMENT,
				Literal:          []byte("; comment"),
				WhiteSpaceBefore: []byte{'\t', ' ', ' '},
			},
		},
		"end of file": {
			state: &lexer.LexerState{
				Bytes:    []byte("; comment\n"),
				Position: 10,
			},
			expectedPosition: 10,
			expectedToken: token.Token{
				Type:             token.EOF,
				Literal:          []byte{},
				WhiteSpaceBefore: []byte{},
			},
		},
	}

	for name, tc := range tests {
		tc := tc
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			got := tc.state.NextToken()

			if tc.expectedPosition != 0 {
				assert.Equal(t, tc.expectedPosition, tc.state.Position)
			}

			assert.Equal(t, tc.expectedToken, got)
		})
	}
}

func TestLexerStateNextLine(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		state          *lexer.LexerState
		expectedTokens []token.Token
	}{
		"comment line 1": {
			state: &lexer.LexerState{
				Bytes: []byte("; comment 1\n; comment 2\n"),
			},
			expectedTokens: []token.Token{
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
			},
		},
		"comment line 2": {
			state: &lexer.LexerState{
				Bytes:    []byte("; comment 1\n; comment 2\n"),
				Position: 12,
			},
			expectedTokens: []token.Token{
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
		},
		"comment with leading whitespace": {
			state: &lexer.LexerState{
				Bytes: []byte("\t\t; comment 1\n;"),
			},
			expectedTokens: []token.Token{
				{
					Type:             token.COMMENT,
					Literal:          []byte("; comment 1"),
					WhiteSpaceBefore: []byte{'\t', '\t'},
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte{},
				},
			},
		},
		"comment with no leading whitespace after rdata": {
			state: &lexer.LexerState{
				Bytes: []byte("host A 1.1.1.1;test comment\n"),
			},
			expectedTokens: []token.Token{
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("host"),
					WhiteSpaceBefore: []byte{},
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("1.1.1.1"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte(";test comment"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte{},
				},
			},
		},
		"ttl control": {
			state: &lexer.LexerState{
				Bytes: []byte("$TTL 300\n"),
			},
			expectedTokens: []token.Token{
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
		},
		"ttl control with comment": {
			state: &lexer.LexerState{
				Bytes: []byte("$TTL\t300\t; set TTL to 300\n"),
			},
			expectedTokens: []token.Token{
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
		},
		"origin control": {
			state: &lexer.LexerState{
				Bytes: []byte("$ORIGIN sapslaj.com.\n"),
			},
			expectedTokens: []token.Token{
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
		},
		"origin control with comment": {
			state: &lexer.LexerState{
				Bytes: []byte("$ORIGIN\tsapslaj.com.\t; this is the zone for sapslaj.com\n"),
			},
			expectedTokens: []token.Token{
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
		},
		"include control with just file name": {
			state: &lexer.LexerState{
				Bytes: []byte("$INCLUDE mailboxes.txt\n"),
			},
			expectedTokens: []token.Token{
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
		},
		"include control with just file name and comment": {
			state: &lexer.LexerState{
				Bytes: []byte("$INCLUDE mailboxes.txt ; include mailboxes\n"),
			},
			expectedTokens: []token.Token{
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
		},
		"include control with file name and domain name": {
			state: &lexer.LexerState{
				Bytes: []byte("$INCLUDE mailboxes.txt mail.sapslaj.com.\n"),
			},
			expectedTokens: []token.Token{
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
		},
		"include control with file name and domain name and comment": {
			state: &lexer.LexerState{
				Bytes: []byte("$INCLUDE mailboxes.txt mail.sapslaj.com. ; include mailboxes\n"),
			},
			expectedTokens: []token.Token{
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
		},
		"no domain name A record": {
			state: &lexer.LexerState{
				Bytes: []byte("\tA 198.51.100.69\n"),
			},
			expectedTokens: []token.Token{
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
		},
		"current origin A record": {
			state: &lexer.LexerState{
				Bytes: []byte("@ A 198.51.100.69\n"),
			},
			expectedTokens: []token.Token{
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
		},
		"domain name A record": {
			state: &lexer.LexerState{
				Bytes: []byte("ligma A 198.51.100.69\n"),
			},
			expectedTokens: []token.Token{
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
		},
		"domain name with ttl type and rdata": {
			state: &lexer.LexerState{
				Bytes: []byte("ligma 420 A 198.51.100.69\n"),
			},
			expectedTokens: []token.Token{
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
		},
		"no domain name with ttl type and rdata": {
			state: &lexer.LexerState{
				Bytes: []byte("\t420 A 198.51.100.69\n"),
			},
			expectedTokens: []token.Token{
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
		},
		"domain name with ttl type class and rdata": {
			state: &lexer.LexerState{
				Bytes: []byte("ligma 420 IN A 198.51.100.69\n"),
			},
			expectedTokens: []token.Token{
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
		},
		"no domain name with ttl class type and rdata": {
			state: &lexer.LexerState{
				Bytes: []byte("\t420 IN A 198.51.100.69\n"),
			},
			expectedTokens: []token.Token{
				{
					Type:             token.TTL,
					Literal:          []byte("420"),
					WhiteSpaceBefore: []byte{'\t'},
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
		},
		"domain name with class type and rdata": {
			state: &lexer.LexerState{
				Bytes: []byte("ligma IN A 198.51.100.69\n"),
			},
			expectedTokens: []token.Token{
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("ligma"),
					WhiteSpaceBefore: []byte{},
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
		},
		"no domain name with class type and rdata": {
			state: &lexer.LexerState{
				Bytes: []byte("\tIN A 198.51.100.69\n"),
			},
			expectedTokens: []token.Token{
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
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
		},
		"domain name with class ttl type and rdata": {
			state: &lexer.LexerState{
				Bytes: []byte("ligma IN 420 A 198.51.100.69\n"),
			},
			expectedTokens: []token.Token{
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("ligma"),
					WhiteSpaceBefore: []byte{},
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte{' '},
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
		},
		"no domain name with class ttl type and rdata": {
			state: &lexer.LexerState{
				Bytes: []byte("\tIN 420 A 198.51.100.69\n"),
			},
			expectedTokens: []token.Token{
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
		},
		"SOA single line": {
			state: &lexer.LexerState{
				Bytes: []byte("sapslaj.com.            1800    IN      SOA     coco.ns.cloudflare.com. dns.cloudflare.com. 2366100114 10000 2400 604800 1800\n"),
			},
			expectedTokens: []token.Token{
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
		},
		"domain name that is also a type": {
			state: &lexer.LexerState{
				Bytes: []byte("A       A       26.3.0.103\n"),
			},
			expectedTokens: []token.Token{
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
		},
		"txt record with quotes": {
			state: &lexer.LexerState{
				Bytes: []byte(`sapslaj.com. 300 IN TXT "v=spf1 include:_spf.google.com include:mailgun.org -all"`),
			},
			expectedTokens: []token.Token{
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
		},
		"txt record with quotes and escaped quotes": {
			state: &lexer.LexerState{
				Bytes: []byte(`sapslaj.com. 300 IN TXT "foo bar=\"baz\""`),
			},
			expectedTokens: []token.Token{
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
					Literal:          []byte(`"foo bar=\"baz\""`),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.EOF,
					Literal:          []byte(""),
					WhiteSpaceBefore: []byte(""),
				},
			},
		},
		"txt record with quotes and escaped semicolon": {
			state: &lexer.LexerState{
				Bytes: []byte(`sapslaj.com. 300 IN TXT "v=DKIM1\; k=rsa\; p=MIGf..."`),
			},
			expectedTokens: []token.Token{
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
					Literal:          []byte(`"v=DKIM1\; k=rsa\; p=MIGf..."`),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.EOF,
					Literal:          []byte(""),
					WhiteSpaceBefore: []byte(""),
				},
			},
		},
		"ptr record with type": {
			state: &lexer.LexerState{
				Bytes: []byte("5 PTR host.example.com.\n"),
			},
			expectedTokens: []token.Token{
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("5"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("PTR"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("host.example.com."),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
			},
		},
		"ptr record with ttl and type": {
			state: &lexer.LexerState{
				Bytes: []byte("5 300 PTR host.example.com.\n"),
			},
			expectedTokens: []token.Token{
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("5"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TTL,
					Literal:          []byte("300"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("PTR"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("host.example.com."),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
			},
		},
		"ptr record with ttl class and type": {
			state: &lexer.LexerState{
				Bytes: []byte("5 300 IN PTR host.example.com.\n"),
			},
			expectedTokens: []token.Token{
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("5"),
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
					Literal:          []byte("PTR"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("host.example.com."),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
			},
		},
		"ptr record with class ttl and type": {
			state: &lexer.LexerState{
				Bytes: []byte("5 IN 300 PTR host.example.com.\n"),
			},
			expectedTokens: []token.Token{
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("5"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.TTL,
					Literal:          []byte("300"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("PTR"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("host.example.com."),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
			},
		},
		"ptr record with class and type": {
			state: &lexer.LexerState{
				Bytes: []byte("5 IN PTR host.example.com.\n"),
			},
			expectedTokens: []token.Token{
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("5"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("PTR"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("host.example.com."),
					WhiteSpaceBefore: []byte(" "),
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

			got := tc.state.NextLine()

			assert.Equal(t, tc.expectedTokens, got)
		})
	}
}

func TestLexerStateAllTokens(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		state          *lexer.LexerState
		expectedTokens []token.Token
	}{
		"bwesterb ExampleLoad": {
			state: &lexer.LexerState{
				Bytes: []byte(
					"@	IN	SOA	NS1.NAMESERVER.NET.	HOSTMASTER.MYDOMAIN.COM.	(\n" +
						"            1406291485	 ;serial\n" +
						"            3600	 ;refresh\n" +
						"            600	 ;retry\n" +
						"            604800	 ;expire\n" +
						"            86400	 ;minimum ttl\n" +
						")\n" +
						"\n" +
						"@	NS	NS1.NAMESERVER.NET.\n" +
						"@	NS	NS2.NAMESERVER.NET.\n",
				),
			},
			expectedTokens: []token.Token{
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
		},
		"bwesterb ExampleZonefile_Entries": {
			state: &lexer.LexerState{
				Bytes: []byte(`
$TTL 3600
@	IN	SOA	NS1.NAMESERVER.NET.	HOSTMASTER.MYDOMAIN.COM.	(
			1406291485	 ;serial
			3600	 ;refresh
			600	 ;retry
			604800	 ;expire
			86400	 ;minimum ttl
)

	A	1.1.1.1
@	A	127.0.0.1
www	A	127.0.0.1
mail	A	127.0.0.1
			A 1.2.3.4
tst 300 IN A 101.228.10.127;this is a comment`),
			},
			expectedTokens: []token.Token{
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.CONTROL_ENTRY,
					Literal:          []byte("$TTL"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TTL,
					Literal:          []byte("3600"),
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
					WhiteSpaceBefore: []byte("\t\t\t"),
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
					WhiteSpaceBefore: []byte("\t\t\t"),
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
					WhiteSpaceBefore: []byte("\t\t\t"),
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
					WhiteSpaceBefore: []byte("\t\t\t"),
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
					WhiteSpaceBefore: []byte("\t\t\t"),
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
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("1.1.1.1"),
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
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("127.0.0.1"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("www"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("127.0.0.1"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("mail"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("127.0.0.1"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte("\t\t\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("1.2.3.4"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("tst"),
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
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("101.228.10.127"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte(";this is a comment"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.EOF,
					Literal:          []byte(""),
					WhiteSpaceBefore: []byte(""),
				},
			},
		},
		"bwesterb TestLoadThenSave 1": {
			state: &lexer.LexerState{
				Bytes: []byte(`$ORIGIN MYDOMAIN.COM.
$TTL 3600
@	IN	SOA	NS1.NAMESERVER.NET.	HOSTMASTER.MYDOMAIN.COM.	(
			1406291485	 ;serial
			3600	 ;refresh
			600	 ;retry
			604800	 ;expire
			86400	 ;minimum ttl
)

@	NS	NS1.NAMESERVER.NET.
@	NS	NS2.NAMESERVER.NET.

@	MX	0	mail1
@	MX	10	mail2

	A	1.1.1.1
@	A	127.0.0.1
www	A	127.0.0.1
mail	A	127.0.0.1
			A 1.2.3.4
tst 300 IN A 101.228.10.127;this is a comment

@	AAAA	::1
mail	AAAA	2001:db8::1

mail1	CNAME	mail
mail2	CNAME	mail

treefrog.ca. IN TXT "v=spf1 a mx a:mail.treefrog.ca a:webmail.treefrog.ca ip4:76.75.250.33 ?all"
treemonkey.ca. IN TXT "v=DKIM1\; k=rsa\; p=MIGf..."`),
			},
			expectedTokens: []token.Token{
				{
					Type:             token.CONTROL_ENTRY,
					Literal:          []byte("$ORIGIN"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("MYDOMAIN.COM."),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.CONTROL_ENTRY,
					Literal:          []byte("$TTL"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TTL,
					Literal:          []byte("3600"),
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
					WhiteSpaceBefore: []byte("\t\t\t"),
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
					WhiteSpaceBefore: []byte("\t\t\t"),
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
					WhiteSpaceBefore: []byte("\t\t\t"),
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
					WhiteSpaceBefore: []byte("\t\t\t"),
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
					WhiteSpaceBefore: []byte("\t\t\t"),
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
					Literal:          []byte("MX"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("0"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("mail1"),
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
					Literal:          []byte("MX"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("10"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("mail2"),
					WhiteSpaceBefore: []byte("\t"),
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
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("1.1.1.1"),
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
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("127.0.0.1"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("www"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("127.0.0.1"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("mail"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("127.0.0.1"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte("\t\t\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("1.2.3.4"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("tst"),
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
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("101.228.10.127"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte(";this is a comment"),
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
					Literal:          []byte("AAAA"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("::1"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("mail"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("AAAA"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("2001:db8::1"),
					WhiteSpaceBefore: []byte("\t"),
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
					Literal:          []byte("mail1"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("CNAME"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("mail"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("mail2"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("CNAME"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("mail"),
					WhiteSpaceBefore: []byte("\t"),
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
					Literal:          []byte("treefrog.ca."),
					WhiteSpaceBefore: []byte(""),
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
					Literal:          []byte(`"v=spf1 a mx a:mail.treefrog.ca a:webmail.treefrog.ca ip4:76.75.250.33 ?all"`),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("treemonkey.ca."),
					WhiteSpaceBefore: []byte(""),
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
					Literal:          []byte(`"v=DKIM1\; k=rsa\; p=MIGf..."`),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.EOF,
					Literal:          []byte(""),
					WhiteSpaceBefore: []byte(""),
				},
			},
		},
		"bwesterb TestLoadThenSave 2": {
			state: &lexer.LexerState{
				Bytes: []byte(`$ORIGIN 0.168.192.IN-ADDR.ARPA.
$TTL 3600
@	IN	SOA	NS1.NAMESERVER.NET.	HOSTMASTER.MYDOMAIN.COM.	(
			1406291485	 ;serial
			3600	 ;refresh
			600	 ;retry
			604800	 ;expire
			86400	 ;minimum ttl
)

@	NS	NS1.NAMESERVER.NET.
@	NS	NS2.NAMESERVER.NET.

1	PTR	HOST1.MYDOMAIN.COM.
2	PTR	HOST2.MYDOMAIN.COM.

$ORIGIN 30.168.192.in-addr.arpa.
3	PTR	HOST3.MYDOMAIN.COM.
4	PTR	HOST4.MYDOMAIN.COM.
	PTR HOST5.MYDOMAIN.COM.

$ORIGIN 168.192.in-addr.arpa.
10.3	PTR	HOST3.MYDOMAIN.COM.
10.4	PTR	HOST4.MYDOMAIN.COM.`),
			},
			expectedTokens: []token.Token{
				{
					Type:             token.CONTROL_ENTRY,
					Literal:          []byte("$ORIGIN"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("0.168.192.IN-ADDR.ARPA."),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.CONTROL_ENTRY,
					Literal:          []byte("$TTL"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TTL,
					Literal:          []byte("3600"),
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
					WhiteSpaceBefore: []byte("\t\t\t"),
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
					WhiteSpaceBefore: []byte("\t\t\t"),
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
					WhiteSpaceBefore: []byte("\t\t\t"),
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
					WhiteSpaceBefore: []byte("\t\t\t"),
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
					WhiteSpaceBefore: []byte("\t\t\t"),
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
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("1"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("PTR"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("HOST1.MYDOMAIN.COM."),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("2"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("PTR"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("HOST2.MYDOMAIN.COM."),
					WhiteSpaceBefore: []byte("\t"),
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
					Type:             token.CONTROL_ENTRY,
					Literal:          []byte("$ORIGIN"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("30.168.192.in-addr.arpa."),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("3"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("PTR"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("HOST3.MYDOMAIN.COM."),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("4"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("PTR"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("HOST4.MYDOMAIN.COM."),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("PTR"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("HOST5.MYDOMAIN.COM."),
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
					Type:             token.CONTROL_ENTRY,
					Literal:          []byte("$ORIGIN"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("168.192.in-addr.arpa."),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("10.3"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("PTR"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("HOST3.MYDOMAIN.COM."),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("10.4"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("PTR"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("HOST4.MYDOMAIN.COM."),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.EOF,
					Literal:          []byte(""),
					WhiteSpaceBefore: []byte(""),
				},
			},
		},
		"bwesterb TestLoadThenSave 3": {
			state: &lexer.LexerState{
				Bytes: []byte(`$ORIGIN 0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa.
$TTL 3600
@	IN	SOA	NS1.NAMESERVER.NET.	HOSTMASTER.MYDOMAIN.COM.	(
			1406291485	 ;serial
			3600	 ;refresh
			600	 ;retry
			604800	 ;expire
			86400	 ;minimum ttl
)

@	NS	NS1.NAMESERVER.NET.
@	NS	NS2.NAMESERVER.NET.

1	PTR	HOST1.MYDOMAIN.COM.
2	PTR	HOST2.MYDOMAIN.COM.`),
			},
			expectedTokens: []token.Token{
				{
					Type:             token.CONTROL_ENTRY,
					Literal:          []byte("$ORIGIN"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa."),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.CONTROL_ENTRY,
					Literal:          []byte("$TTL"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TTL,
					Literal:          []byte("3600"),
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
					WhiteSpaceBefore: []byte("\t\t\t"),
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
					WhiteSpaceBefore: []byte("\t\t\t"),
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
					WhiteSpaceBefore: []byte("\t\t\t"),
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
					WhiteSpaceBefore: []byte("\t\t\t"),
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
					WhiteSpaceBefore: []byte("\t\t\t"),
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
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("1"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("PTR"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("HOST1.MYDOMAIN.COM."),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("2"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("PTR"),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("HOST2.MYDOMAIN.COM."),
					WhiteSpaceBefore: []byte("\t"),
				},
				{
					Type:             token.EOF,
					Literal:          []byte(""),
					WhiteSpaceBefore: []byte(""),
				},
			},
		},
		"bwesterb TestLoadThenSave 4": {
			state: &lexer.LexerState{
				Bytes: []byte(`$ORIGIN example.com.     ; designates the start of this zone file in the namespace
$TTL 1h                  ; default expiration time of all resource records without their own TTL value
example.com.  IN  SOA   ns.example.com. username.example.com. ( 2007120710 1d 2h 4w 1h )
example.com.  IN  NS    ns                    ; ns.example.com is a nameserver for example.com
example.com.  IN  NS    ns.somewhere.example. ; ns.somewhere.example is a backup nameserver for example.com
example.com.  IN  MX    10 mail.example.com.  ; mail.example.com is the mailserver for example.com
@             IN  MX    20 mail2.example.com. ; equivalent to above line, "@" represents zone origin
@             IN  MX    50 mail3              ; equivalent to above line, but using a relative host name
example.com.  IN  A     192.0.2.1             ; IPv4 address for example.com
              IN  AAAA  2001:db8:10::1        ; IPv6 address for example.com
ns            IN  A     192.0.2.2             ; IPv4 address for ns.example.com
              IN  AAAA  2001:db8:10::2        ; IPv6 address for ns.example.com
www           IN  CNAME example.com.          ; www.example.com is an alias for example.com
wwwtest       IN  CNAME www                   ; wwwtest.example.com is another alias for www.example.com
mail          IN  A     192.0.2.3             ; IPv4 address for mail.example.com
mail2         IN  A     192.0.2.4             ; IPv4 address for mail2.example.com
mail3         IN  A     192.0.2.5             ; IPv4 address for mail3.example.com`),
			},
			expectedTokens: []token.Token{
				{
					Type:             token.CONTROL_ENTRY,
					Literal:          []byte("$ORIGIN"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("example.com."),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; designates the start of this zone file in the namespace"),
					WhiteSpaceBefore: []byte("     "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.CONTROL_ENTRY,
					Literal:          []byte("$TTL"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TTL,
					Literal:          []byte("1h"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; default expiration time of all resource records without their own TTL value"),
					WhiteSpaceBefore: []byte("                  "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("example.com."),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("SOA"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("ns.example.com."),
					WhiteSpaceBefore: []byte("   "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("username.example.com."),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA_OPAREN,
					Literal:          []byte("("),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("2007120710"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("1d"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("2h"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("4w"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("1h"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.RDATA_CPAREN,
					Literal:          []byte(")"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("example.com."),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("NS"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("ns"),
					WhiteSpaceBefore: []byte("    "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; ns.example.com is a nameserver for example.com"),
					WhiteSpaceBefore: []byte("                    "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("example.com."),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("NS"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("ns.somewhere.example."),
					WhiteSpaceBefore: []byte("    "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; ns.somewhere.example is a backup nameserver for example.com"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("example.com."),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("MX"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("10"),
					WhiteSpaceBefore: []byte("    "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("mail.example.com."),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; mail.example.com is the mailserver for example.com"),
					WhiteSpaceBefore: []byte("  "),
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
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte("             "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("MX"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("20"),
					WhiteSpaceBefore: []byte("    "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("mail2.example.com."),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte(`; equivalent to above line, "@" represents zone origin`),
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
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte("             "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("MX"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("50"),
					WhiteSpaceBefore: []byte("    "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("mail3"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; equivalent to above line, but using a relative host name"),
					WhiteSpaceBefore: []byte("              "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("example.com."),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("192.0.2.1"),
					WhiteSpaceBefore: []byte("     "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; IPv4 address for example.com"),
					WhiteSpaceBefore: []byte("             "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte("              "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("AAAA"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("2001:db8:10::1"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; IPv6 address for example.com"),
					WhiteSpaceBefore: []byte("        "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("ns"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte("            "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("192.0.2.2"),
					WhiteSpaceBefore: []byte("     "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; IPv4 address for ns.example.com"),
					WhiteSpaceBefore: []byte("             "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte("              "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("AAAA"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("2001:db8:10::2"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; IPv6 address for ns.example.com"),
					WhiteSpaceBefore: []byte("        "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("www"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte("           "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("CNAME"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("example.com."),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; www.example.com is an alias for example.com"),
					WhiteSpaceBefore: []byte("          "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("wwwtest"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte("       "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("CNAME"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("www"),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; wwwtest.example.com is another alias for www.example.com"),
					WhiteSpaceBefore: []byte("                   "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("mail"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte("          "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("192.0.2.3"),
					WhiteSpaceBefore: []byte("     "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; IPv4 address for mail.example.com"),
					WhiteSpaceBefore: []byte("             "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("mail2"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte("         "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("192.0.2.4"),
					WhiteSpaceBefore: []byte("     "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; IPv4 address for mail2.example.com"),
					WhiteSpaceBefore: []byte("             "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("mail3"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte("         "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("192.0.2.5"),
					WhiteSpaceBefore: []byte("     "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; IPv4 address for mail3.example.com"),
					WhiteSpaceBefore: []byte("             "),
				},
				{
					Type:             token.EOF,
					Literal:          []byte(""),
					WhiteSpaceBefore: []byte(""),
				},
			},
		},
		"RFC1035 example": {
			state: &lexer.LexerState{
				Bytes: []byte(
					"@   IN  SOA     VENERA      Action\\.domains (\n" +
						"                                 20     ; SERIAL\n" +
						"                                 7200   ; REFRESH\n" +
						"                                 600    ; RETRY\n" +
						"                                 3600000; EXPIRE\n" +
						"                                 60)    ; MINIMUM\n" +
						"\n" +
						"        NS      A.ISI.EDU.\n" +
						"        NS      VENERA\n" +
						"        NS      VAXA\n" +
						"        MX      10      VENERA\n" +
						"        MX      20      VAXA\n" +
						"\n" +
						"A       A       26.3.0.103\n" +
						"\n" +
						"VENERA  A       10.1.0.52\n" +
						"        A       128.9.0.32\n" +
						"\n" +
						"VAXA    A       10.2.0.27\n" +
						"        A       128.9.0.33\n" +
						"\n" +
						"$INCLUDE <SUBSYS>ISI-MAILBOXES.TXT\n",
				),
			},
			expectedTokens: []token.Token{
				{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte("@"),
					WhiteSpaceBefore: []byte{},
				},
				{
					Type:             token.CLASS,
					Literal:          []byte("IN"),
					WhiteSpaceBefore: []byte("   "),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("SOA"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("VENERA"),
					WhiteSpaceBefore: []byte("     "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("Action\\.domains"),
					WhiteSpaceBefore: []byte("      "),
				},
				{
					Type:             token.RDATA_OPAREN,
					Literal:          []byte("("),
					WhiteSpaceBefore: []byte(" "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("20"),
					WhiteSpaceBefore: []byte("                                 "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; SERIAL"),
					WhiteSpaceBefore: []byte("     "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("7200"),
					WhiteSpaceBefore: []byte("                                 "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; REFRESH"),
					WhiteSpaceBefore: []byte("   "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("600"),
					WhiteSpaceBefore: []byte("                                 "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; RETRY"),
					WhiteSpaceBefore: []byte("    "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("3600000"),
					WhiteSpaceBefore: []byte("                                 "),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; EXPIRE"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("60"),
					WhiteSpaceBefore: []byte("                                 "),
				},
				{
					Type:             token.RDATA_CPAREN,
					Literal:          []byte(")"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.COMMENT,
					Literal:          []byte("; MINIMUM"),
					WhiteSpaceBefore: []byte("    "),
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
					Type:             token.TYPE,
					Literal:          []byte("NS"),
					WhiteSpaceBefore: []byte("        "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("A.ISI.EDU."),
					WhiteSpaceBefore: []byte("      "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("NS"),
					WhiteSpaceBefore: []byte("        "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("VENERA"),
					WhiteSpaceBefore: []byte("      "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("NS"),
					WhiteSpaceBefore: []byte("        "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("VAXA"),
					WhiteSpaceBefore: []byte("      "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("MX"),
					WhiteSpaceBefore: []byte("        "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("10"),
					WhiteSpaceBefore: []byte("      "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("VENERA"),
					WhiteSpaceBefore: []byte("      "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("MX"),
					WhiteSpaceBefore: []byte("        "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("20"),
					WhiteSpaceBefore: []byte("      "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("VAXA"),
					WhiteSpaceBefore: []byte("      "),
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
					Literal:          []byte("VENERA"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte("  "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("10.1.0.52"),
					WhiteSpaceBefore: []byte("       "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte("        "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("128.9.0.32"),
					WhiteSpaceBefore: []byte("       "),
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
					Literal:          []byte("VAXA"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte("    "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("10.2.0.27"),
					WhiteSpaceBefore: []byte("       "),
				},
				{
					Type:             token.NEWLINE,
					Literal:          []byte("\n"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.TYPE,
					Literal:          []byte("A"),
					WhiteSpaceBefore: []byte("        "),
				},
				{
					Type:             token.RDATA,
					Literal:          []byte("128.9.0.33"),
					WhiteSpaceBefore: []byte("       "),
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
					Type:             token.CONTROL_ENTRY,
					Literal:          []byte("$INCLUDE"),
					WhiteSpaceBefore: []byte(""),
				},
				{
					Type:             token.FILE_NAME,
					Literal:          []byte("<SUBSYS>ISI-MAILBOXES.TXT"),
					WhiteSpaceBefore: []byte(" "),
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
		},
	}

	for name, tc := range tests {
		tc := tc
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			got := tc.state.AllTokens()

			assert.Equal(t, tc.expectedTokens, got)

			assert.Equal(t, tc.state.Bytes, token.RenderTokens(got))
		})
	}
}
