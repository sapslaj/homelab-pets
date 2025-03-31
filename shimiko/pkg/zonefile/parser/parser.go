package parser

import (
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/zonefile/ast"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/zonefile/lexer"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/zonefile/token"
)

var (
	ErrParseError    = errors.New("parse error")
	ErrTokenizeError = errors.New("tokenize error")
)

func SplitTokensLines(toks []token.Token) [][]token.Token {
	lines := [][]token.Token{}

	inLineContinuation := false
	line := []token.Token{}

	for _, tok := range toks {
		line = append(line, tok)

		if inLineContinuation {
			if tok.Type == token.RDATA_CPAREN {
				inLineContinuation = false
			}

			continue
		}

		if tok.Type == token.RDATA_OPAREN {
			inLineContinuation = true
		}

		if tok.Type == token.NEWLINE || tok.Type == token.EOF {
			lines = append(lines, line)
			line = []token.Token{}
		}
	}

	return lines
}

func ParseEntry(toks []token.Token) (ast.Node, error) {
	node := ast.Node{
		NodeType:     ast.NodeTypeEmpty,
		SourceTokens: []token.Token{},
		LeadComments: []string{},
		LineComment:  "",
	}
	previous := token.Token{
		Type: token.NEWLINE,
	}

	getOriginControlEntry := func(tok token.Token) (ast.OriginControlEntry, error) {
		if !node.IsOriginControlEntry() {
			return ast.OriginControlEntry{}, fmt.Errorf(
				"%w: NodeType is OriginControlEntry but the entry data is invalid: entry=%#v, tok=%v",
				ErrParseError,
				node.Entry,
				tok,
			)
		}
		return node.OriginControlEntry(), nil
	}

	getIncludeControlEntry := func(tok token.Token) (ast.IncludeControlEntry, error) {
		if !node.IsIncludeControlEntry() {
			return ast.IncludeControlEntry{}, fmt.Errorf(
				"%w: NodeType is IncludeControlEntry but the entry data is invalid: entry=%#v, tok=%v",
				ErrParseError,
				node.Entry,
				tok,
			)
		}
		return node.IncludeControlEntry(), nil
	}

	getTTLControlEntry := func(tok token.Token) (ast.TTLControlEntry, error) {
		if !node.IsTTLControlEntry() {
			return ast.TTLControlEntry{}, fmt.Errorf(
				"%w: NodeType is TTLControlEntry but the entry data is invalid: entry=%#v, tok=%v",
				ErrParseError,
				node.Entry,
				tok,
			)
		}
		return node.TTLControlEntry(), nil
	}

	getRREntry := func(tok token.Token) (ast.RREntry, error) {
		if node.Entry == nil {
			node.Entry = ast.RREntry{
				RRecord: ast.RRecord{
					RData: []ast.RData{},
				},
			}
		}
		if !node.IsRREntry() {
			return ast.RREntry{}, fmt.Errorf(
				"%w: NodeType is RREntry but the entry data is invalid: entry=%#v, tok=%v",
				ErrParseError,
				node.Entry,
				tok,
			)
		}
		return node.RREntry(), nil
	}

	for _, tok := range toks {
		if len(node.SourceTokens) > 0 {
			previous = node.SourceTokens[len(node.SourceTokens)-1]
		}
		node.SourceTokens = append(node.SourceTokens, tok)

		switch tok.Type {
		case token.ILLEGAL:
			return node, fmt.Errorf("%w: encountered ILLEGAL token: %v", ErrParseError, tok)

		case token.EOF:
			continue

		case token.NEWLINE:
			continue

		case token.COMMENT:
			if previous.Type == token.NEWLINE {
				node.LeadComments = append(node.LeadComments, string(tok.Literal))
			} else {
				node.LineComment = string(tok.Literal)
			}

		case token.CONTROL_ENTRY:
			controlEntry := string(tok.Literal)
			switch controlEntry {
			case "$INCLUDE":
				node.NodeType = ast.NodeTypeIncludeControlEntry
				node.Entry = ast.IncludeControlEntry{}
			case "$ORIGIN":
				node.NodeType = ast.NodeTypeOriginControlEntry
				node.Entry = ast.OriginControlEntry{}
			case "$TTL":
				node.NodeType = ast.NodeTypeTTLControlEntry
				node.Entry = ast.TTLControlEntry{}
			default:
				return node, fmt.Errorf("%w: unknown control entry '%s': %v", ErrParseError, controlEntry, tok)
			}

		case token.DOMAIN_NAME:
			switch node.NodeType {
			case ast.NodeTypeOriginControlEntry:
				entry, err := getOriginControlEntry(tok)
				if err != nil {
					return node, err
				}
				entry.DomainName = string(tok.Literal)
				node.Entry = entry
			case ast.NodeTypeIncludeControlEntry:
				entry, err := getIncludeControlEntry(tok)
				if err != nil {
					return node, err
				}
				entry.DomainName = string(tok.Literal)
				node.Entry = entry
			case ast.NodeTypeEmpty:
				node.NodeType = ast.NodeTypeRREntry
				entry, err := getRREntry(tok)
				if err != nil {
					return node, err
				}
				entry.DomainName = string(tok.Literal)
				node.Entry = entry
			default:
				return node, fmt.Errorf("%w: unexpected DOMAIN_NAME for NodeType %s: %v", ErrParseError, node.NodeType, tok)
			}

		case token.FILE_NAME:
			if node.NodeType != ast.NodeTypeIncludeControlEntry {
				return node, fmt.Errorf("%w: unexpected FILE_NAME for NodeType %s: %v", ErrParseError, node.NodeType, tok)
			}
			entry, err := getIncludeControlEntry(tok)
			if err != nil {
				return node, err
			}
			entry.FileName = string(tok.Literal)
			node.Entry = entry

		case token.TTL:
			literal := string(tok.Literal)
			if lexer.IsDigit(tok.Literal) {
				literal += "s"
			}
			duration, err := time.ParseDuration(literal)
			if err != nil {
				return node, errors.Join(ErrParseError, fmt.Errorf("could not parse TTL: %w", err))
			}

			if node.NodeType == ast.NodeTypeTTLControlEntry {
				entry, err := getTTLControlEntry(tok)
				if err != nil {
					return node, err
				}
				entry.TTL = duration
				node.Entry = entry
				continue
			}

			if node.NodeType == ast.NodeTypeEmpty {
				node.NodeType = ast.NodeTypeRREntry
			}
			if node.NodeType != ast.NodeTypeRREntry {
				return node, fmt.Errorf("%w: unexpected TTL for NodeType %s: %v", ErrParseError, node.NodeType, tok)
			}
			entry, err := getRREntry(tok)
			if err != nil {
				return node, err
			}
			entry.RRecord.TTL = duration
			node.Entry = entry

		case token.CLASS:
			if node.NodeType == ast.NodeTypeEmpty {
				node.NodeType = ast.NodeTypeRREntry
			}
			if node.NodeType != ast.NodeTypeRREntry {
				return node, fmt.Errorf("%w: unexpected CLASS for NodeType %s: %v", ErrParseError, node.NodeType, tok)
			}
			entry, err := getRREntry(tok)
			if err != nil {
				return node, err
			}
			entry.RRecord.Class = string(tok.Literal)
			node.Entry = entry

		case token.TYPE:
			if node.NodeType == ast.NodeTypeEmpty {
				node.NodeType = ast.NodeTypeRREntry
			}
			if node.NodeType != ast.NodeTypeRREntry {
				return node, fmt.Errorf("%w: unexpected TYPE for NodeType %s: %v", ErrParseError, node.NodeType, tok)
			}
			entry, err := getRREntry(tok)
			if err != nil {
				return node, err
			}
			entry.RRecord.Type = string(tok.Literal)
			node.Entry = entry

		case token.RDATA:
			if node.NodeType != ast.NodeTypeRREntry {
				return node, fmt.Errorf("%w: unexpected RDATA for NodeType %s: %v", ErrParseError, node.NodeType, tok)
			}
			entry, err := getRREntry(tok)
			if err != nil {
				return node, err
			}
			entry.RRecord.RData = append(entry.RRecord.RData, ast.RData{
				Value: string(tok.Literal),
			})
			node.Entry = entry

		case token.RDATA_OPAREN:
			if node.NodeType != ast.NodeTypeRREntry {
				return node, fmt.Errorf("%w: unexpected RDATA_OPAREN for NodeType %s: %v", ErrParseError, node.NodeType, tok)
			}
			// TODO: do something with RDATA_OPAREN

		case token.RDATA_CPAREN:
			if node.NodeType != ast.NodeTypeRREntry {
				return node, fmt.Errorf("%w: unexpected RDATA_CPAREN for NodeType %s: %v", ErrParseError, node.NodeType, tok)
			}
			// TODO: do something with RDATA_CPAREN

		default:
			return node, fmt.Errorf("%w: unexpected TokenType %s for token: %v", ErrParseError, tok.Type, tok)
		}
	}
	return node, nil
}

func ParseEntries(toks []token.Token) ([]ast.Node, error) {
	lines := SplitTokensLines(toks)

	entries := []ast.Node{}

	for i, line := range lines {
		entry, err := ParseEntry(line)
		if err != nil {
			return entries, fmt.Errorf("error while parsing entry %d: %w", i, err)
		}
		entries = append(entries, entry)
	}

	return entries, nil
}

func Tokenize(entries []ast.Node) ([]token.Token, error) {
	toks := []token.Token{}

	emit := func(tok token.Token) {
		if tok.Type == "" {
			tok.Type = token.ILLEGAL
		}
		if tok.Literal == nil {
			tok.Literal = []byte{}
		}
		if tok.WhiteSpaceBefore == nil {
			tok.WhiteSpaceBefore = []byte{}
		}
		toks = append(toks, tok)
	}

	for _, node := range entries {
		for _, comment := range node.LeadComments {
			emit(token.Token{
				Type:    token.COMMENT,
				Literal: []byte(comment),
			})
			emit(token.Token{
				Type:    token.COMMENT,
				Literal: []byte(comment),
			})
			emit(token.Token{
				Type:    token.NEWLINE,
				Literal: []byte("\n"),
			})
		}

		switch node.NodeType {
		case ast.NodeTypeOriginControlEntry:
			if !node.IsOriginControlEntry() {
				return toks, fmt.Errorf(
					"%w: NodeType is OriginControlEntry but the entry data is invalid: %#v",
					ErrParseError,
					node,
				)
			}
			entry := node.OriginControlEntry()
			emit(token.Token{
				Type:    token.CONTROL_ENTRY,
				Literal: []byte("$ORIGIN"),
			})
			emit(token.Token{
				Type:             token.DOMAIN_NAME,
				Literal:          []byte(entry.DomainName),
				WhiteSpaceBefore: []byte(" "),
			})
		case ast.NodeTypeTTLControlEntry:
			if !node.IsTTLControlEntry() {
				return toks, fmt.Errorf(
					"%w: NodeType is TTLControlEntry but the entry data is invalid: %#v",
					ErrParseError,
					node,
				)
			}
			entry := node.TTLControlEntry()
			emit(token.Token{
				Type:             token.CONTROL_ENTRY,
				Literal:          []byte("$TTL"),
				WhiteSpaceBefore: []byte(" "),
			})
			emit(token.Token{
				Type:             token.TTL,
				Literal:          []byte(DurationToSeconds(entry.TTL)),
				WhiteSpaceBefore: []byte(" "),
			})
		case ast.NodeTypeIncludeControlEntry:
			if !node.IsIncludeControlEntry() {
				return toks, fmt.Errorf(
					"%w: NodeType is IncludeControlEntry but the entry data is invalid: %#v",
					ErrParseError,
					node,
				)
			}
			entry := node.IncludeControlEntry()
			emit(token.Token{
				Type:    token.CONTROL_ENTRY,
				Literal: []byte("$INCLUDE"),
			})
			emit(token.Token{
				Type:             token.FILE_NAME,
				Literal:          []byte(entry.FileName),
				WhiteSpaceBefore: []byte(" "),
			})
			if entry.DomainName != "" {
				emit(token.Token{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte(entry.DomainName),
					WhiteSpaceBefore: []byte(" "),
				})
			}
		case ast.NodeTypeRREntry:
			if !node.IsRREntry() {
				return toks, fmt.Errorf(
					"%w: NodeType is RREntry but the entry data is invalid: %#v",
					ErrParseError,
					node,
				)
			}
			entry := node.RREntry()
			if entry.DomainName != "" {
				emit(token.Token{
					Type:             token.DOMAIN_NAME,
					Literal:          []byte(entry.DomainName),
					WhiteSpaceBefore: []byte(""),
				})
			}
			if entry.RRecord.Class != "" {
				emit(token.Token{
					Type:             token.CLASS,
					Literal:          []byte(entry.RRecord.Class),
					WhiteSpaceBefore: []byte(" "),
				})
			}
			if entry.RRecord.TTL.Nanoseconds() != 0 {
				emit(token.Token{
					Type:             token.TTL,
					Literal:          []byte(DurationToSeconds(entry.RRecord.TTL)),
					WhiteSpaceBefore: []byte(" "),
				})
			}
			emit(token.Token{
				Type:             token.TYPE,
				Literal:          []byte(entry.RRecord.Type),
				WhiteSpaceBefore: []byte(" "),
			})
			for _, rdata := range entry.RRecord.RData {
				emit(token.Token{
					Type:             token.RDATA,
					Literal:          []byte(rdata.Value),
					WhiteSpaceBefore: []byte(" "),
				})
			}
		}

		if node.LineComment != "" {
			emit(token.Token{
				Type:             token.COMMENT,
				Literal:          []byte(node.LineComment),
				WhiteSpaceBefore: []byte(" "),
			})
		}

		emit(token.Token{
			Type:    token.NEWLINE,
			Literal: []byte("\n"),
		})
	}

	return toks, nil
}

func DurationToSeconds(d time.Duration) string {
	return strconv.FormatFloat(d.Round(time.Second).Seconds(), 'f', 0, 64)
}
