package token

import "fmt"

type TokenType string

type Token struct {
	Type             TokenType
	Literal          []byte
	WhiteSpaceBefore []byte
}

func (token Token) String() string {
	return fmt.Sprintf(
		`Token{Type:%s, Literal:"%s", WhiteSpaceBefore:"%s"}`,
		token.Type,
		string(token.Literal),
		string(token.WhiteSpaceBefore),
	)
}

const (
	ILLEGAL       TokenType = "ILLEGAL"
	EOF           TokenType = "EOF"
	NEWLINE       TokenType = "NEWLINE"
	COMMENT       TokenType = "COMMENT"
	CONTROL_ENTRY TokenType = "CONTROL_ENTRY"
	DOMAIN_NAME   TokenType = "DOMAIN_NAME"
	FILE_NAME     TokenType = "FILE_NAME"
	TTL           TokenType = "TTL"
	CLASS         TokenType = "CLASS"
	TYPE          TokenType = "TYPE"
	RDATA         TokenType = "RDATA"
	RDATA_OPAREN  TokenType = "RDATA_OPAREN"
	RDATA_CPAREN  TokenType = "RDATA_CPAREN"
)

func RenderTokens(toks []Token) []byte {
	result := []byte{}
	for _, tok := range toks {
		result = append(result, tok.WhiteSpaceBefore...)
		result = append(result, tok.Literal...)
	}
	return result
}
