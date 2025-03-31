package lexer

import (
	"regexp"
	"slices"
	"strings"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/zonefile/token"
)

var DNSClasses = []string{
	"IN",
	"HS",
	"CH",
}

var DNSTypes = []string{
	"A",
	"A6",
	"AAAA",
	"AFSDB",
	"APL",
	"ATMA",
	"AVC",
	"AXFR",
	"CAA",
	"CAA",
	"CDNSKEY",
	"CDS",
	"CERT",
	"CNAME",
	"CSYNC",
	"DHCID",
	"DLV",
	"DNAME",
	"DNSKEY",
	"DS",
	"EID",
	"EUI48",
	"EUI64",
	"GID",
	"GPOS",
	"HINFO",
	"HIP",
	"IPSECKEY",
	"ISDN",
	"IXFR",
	"KEY",
	"KX",
	"L32",
	"L64",
	"LOC",
	"LP",
	"MAILA",
	"MAILB",
	"MB",
	"MD",
	"MF",
	"MG",
	"MINFO",
	"MR",
	"MX",
	"NAPTR",
	"NID",
	"NIMLOC",
	"NINFO",
	"NS",
	"NSAP",
	"NSAP-PTR",
	"NSEC",
	"NSEC3",
	"NSEC3PARAM",
	"NULL",
	"NXT",
	"OPENPGPKEY",
	"OPT",
	"PTR",
	"PX",
	"RKEY",
	"RP",
	"RRSIG",
	"RT",
	"SIG",
	"SINK",
	"SMIMEA",
	"SOA",
	"SPF",
	"SRV",
	"SSHFP",
	"TA",
	"TALINK",
	"TKEY",
	"TLSA",
	"TSIG",
	"TXT",
	"UID",
	"UINFO",
	"UNSPEC",
	"URI",
	"WKS",
	"X25",
}

type LexerState struct {
	Bytes              []byte
	Position           int
	ParsedTokens       []token.Token
	InLineContinuation bool
}

func LexBytes(b []byte) *LexerState {
	return &LexerState{
		Bytes:        b,
		Position:     0,
		ParsedTokens: []token.Token{},
	}
}

func (state *LexerState) LastTokenN(n int) token.Token {
	if state.ParsedTokens == nil || len(state.ParsedTokens) == 0 {
		// Assume infinite 0-byte newlines before the start of the file.
		return token.Token{
			Type:             token.NEWLINE,
			Literal:          []byte{},
			WhiteSpaceBefore: []byte{},
		}
	}

	i := len(state.ParsedTokens) - n

	if i >= 0 {
		return state.ParsedTokens[i]
	}

	return token.Token{
		Type:             token.NEWLINE,
		Literal:          []byte{},
		WhiteSpaceBefore: []byte{},
	}
}

func (state *LexerState) LastToken() token.Token {
	return state.LastTokenN(1)
}

func (state *LexerState) NextToken() token.Token {
	if state.Position >= len(state.Bytes) {
		// No more tokens to return; at the end of buffer
		return token.Token{
			Type:             token.EOF,
			Literal:          []byte{},
			WhiteSpaceBefore: []byte{},
		}
	}

	tok := token.Token{
		Type:             token.ILLEGAL,
		Literal:          []byte{},
		WhiteSpaceBefore: []byte{},
	}

	// are we gathering `WhiteSpaceBefore`?
	parsingWhitespace := true

	// if we're currently in a quoted value
	inQuote := false

	for ; state.Position < len(state.Bytes); state.Position++ {
		// current character
		ch := state.Bytes[state.Position]

		// next character or NUL if there isn't one
		nextCh := byte('\x00')
		if state.Position+1 < len(state.Bytes) {
			nextCh = state.Bytes[state.Position+1]
		}

		// handle quotes
		if inQuote {
			if ch == '\\' && nextCh == '"' {
				// escaped quote
				tok.Literal = append(tok.Literal, ch)
				tok.Literal = append(tok.Literal, nextCh)
				state.Position++
				continue
			}
			if ch == '"' {
				// end quote
				inQuote = false
				tok.Literal = append(tok.Literal, ch)
				continue
			}
		} else {
			if ch == '"' {
				// start quote
				inQuote = true
				tok.Literal = append(tok.Literal, ch)
				continue
			}
		}

		if tok.Type == token.ILLEGAL && ch == '\r' {
			// kinda deal with CR
			tok.Type = token.NEWLINE
			tok.Literal = append(tok.Literal, ch)
			continue
		}

		if (tok.Type == token.ILLEGAL || tok.Type == token.NEWLINE) && ch == '\n' {
			// handle LF (and possibly leading CR)
			state.Position += 1
			tok.Type = token.NEWLINE
			tok.Literal = append(tok.Literal, ch)
			state.ParsedTokens = append(state.ParsedTokens, tok)
			return tok
		}

		if parsingWhitespace {
			if IsSpace(ch) {
				// append whitespace to `WhiteSpaceBefore`
				tok.WhiteSpaceBefore = append(tok.WhiteSpaceBefore, ch)
				continue
			} else {
				// current character isn't whitespace, now we're onto literal parsing
				parsingWhitespace = false
			}
		}

		// If not in a quote or comment and we've hit a whitespace character
		if !inQuote && tok.Type != token.COMMENT && IsSpaceOrNewline(ch) {
			// Finish up and return token
			state.ParsedTokens = append(state.ParsedTokens, tok)
			return tok
		}

		// If in a comment and we've hit a newline
		if tok.Type == token.COMMENT && IsNewline(ch) {
			// Finish up and return token
			state.ParsedTokens = append(state.ParsedTokens, tok)
			return tok
		}

		previous := state.LastToken()

		tok.Literal = append(tok.Literal, ch)

		// detect RDATA_OPAREN and flush token early
		if ch == '(' &&
			!state.InLineContinuation &&
			slices.Contains([]token.TokenType{token.RDATA, token.TYPE}, previous.Type) {
			tok.Type = token.RDATA_OPAREN
			state.InLineContinuation = true
			state.Position += 1
			state.ParsedTokens = append(state.ParsedTokens, tok)
			return tok
		}

		// if we're about to hit a comment, flush because comments don't need any
		// whitespace before them.
		if tok.Type != token.COMMENT && ch != '\\' && nextCh == ';' {
			state.Position++
			state.ParsedTokens = append(state.ParsedTokens, tok)
			return tok
		}

		// If we're in a comment, skip any token parsing until end of line.
		if tok.Literal[0] == ';' {
			tok.Type = token.COMMENT
			parsingWhitespace = false
			continue
		}

		// If we're in a line continuation, assume RDATA until we hit RDATA_CPAREN
		if state.InLineContinuation {
			if ch == ')' {
				tok.Type = token.RDATA_CPAREN
				state.InLineContinuation = false
				state.Position += 1
				state.ParsedTokens = append(state.ParsedTokens, tok)
				return tok
			} else if nextCh == ')' {
				state.Position += 1
				state.ParsedTokens = append(state.ParsedTokens, tok)
				return tok
			}
			tok.Type = token.RDATA
			continue
		}

		// TTL and class can be swapped and might not have a domain name in front
		// of it, so try to figure out which it is based on the previous token.
		if slices.Contains([]token.TokenType{token.CLASS, token.DOMAIN_NAME, token.NEWLINE}, previous.Type) &&
			slices.Contains([]token.TokenType{token.ILLEGAL, token.TTL}, tok.Type) {
			if IsDigit(tok.Literal) {
				tok.Type = token.TTL
			} else {
				tok.Type = token.DOMAIN_NAME
			}
		}

		// Main token assignment logic (except for TTL and domain name, handled above)
		switch {
		case previous.Type == token.CONTROL_ENTRY && string(previous.Literal) == "$TTL":
			tok.Type = token.TTL

		case previous.Type == token.CONTROL_ENTRY && string(previous.Literal) == "$ORIGIN":
			tok.Type = token.DOMAIN_NAME

		case previous.Type == token.CONTROL_ENTRY && string(previous.Literal) == "$INCLUDE":
			tok.Type = token.FILE_NAME

		case previous.Type == token.FILE_NAME:
			tok.Type = token.DOMAIN_NAME

		case previous.Type == token.NEWLINE && tok.Literal[0] == '$':
			tok.Type = token.CONTROL_ENTRY

		case previous.Type == token.TYPE || previous.Type == token.RDATA:
			tok.Type = token.RDATA

		case slices.Contains(DNSTypes, string(tok.Literal)):
			tok.Type = token.TYPE

		case slices.Contains(DNSClasses, string(tok.Literal)):
			tok.Type = token.CLASS

		}

		// "Fix" the first field in a line because sometimes a TTL or type might
		// actually be a domain name. This should only execute once the full
		// literal is parsed in.
		if previous.Type == token.NEWLINE &&
			slices.Contains([]token.TokenType{token.TYPE, token.TTL}, tok.Type) &&
			IsSpace(nextCh) {

			// we have to look into the future and try to figure out of this token
			// makes sense without doing too much expensive parsing.
			foundNextLiteral := false
			restOfLine := []byte{}
			for i := state.Position + 1; i < len(state.Bytes); i++ {
				if foundNextLiteral && IsNewline(state.Bytes[i]) {
					break
				}
				if !foundNextLiteral && IsSpace(state.Bytes[i]) {
					continue
				}
				foundNextLiteral = true
				restOfLine = append(restOfLine, state.Bytes[i])
			}
			restOfFields := strings.Fields(string(restOfLine))

			if len(restOfFields) > 0 {
				// If a future field is a type but we already think the current token
				// is a type, it probably is actually a domain name.
				if tok.Type == token.TYPE && slices.Contains(DNSTypes, restOfFields[0]) {
					tok.Type = token.DOMAIN_NAME
				}

				// If we think this record is a PTR then this token is more likely to
				// be a domain name than a TTL.
				if tok.Type == token.TTL && slices.Contains(restOfFields, "PTR") {
					tok.Type = token.DOMAIN_NAME
				}

				// If the next field is a number it is probably a TTL and so this token
				// is actually a domain name.
				if tok.Type == token.TTL && IsDigit([]byte(restOfFields[0])) {
					tok.Type = token.DOMAIN_NAME
				}
			}
		}
	}

	state.ParsedTokens = append(state.ParsedTokens, tok)
	return tok
}

func (state *LexerState) NextLine() []token.Token {
	toks := []token.Token{}

	for len(toks) == 0 || !slices.Contains([]token.TokenType{token.EOF, token.NEWLINE}, toks[len(toks)-1].Type) {
		toks = append(toks, state.NextToken())
	}

	return toks
}

func (state *LexerState) AllTokens() []token.Token {
	toks := []token.Token{}

	for len(toks) == 0 || toks[len(toks)-1].Type != token.EOF {
		toks = append(toks, state.NextToken())
	}

	return toks
}

func IsDigit(b []byte) bool {
	isDigit, _ := regexp.Match("^\\d+$", b)
	return isDigit
}

func IsSpace(b byte) bool {
	return b == '\t' || b == ' '
}

func IsNewline(b byte) bool {
	return b == '\r' || b == '\n'
}

func IsSpaceOrNewline(b byte) bool {
	return IsSpace(b) || IsNewline(b)
}
