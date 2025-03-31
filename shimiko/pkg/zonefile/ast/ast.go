package ast

import (
	"time"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/zonefile/token"
)

type NodeType string

const (
	NodeTypeEmpty               NodeType = "NodeTypeEmpty"
	NodeTypeOriginControlEntry  NodeType = "NodeTypeOriginControlEntry"
	NodeTypeTTLControlEntry     NodeType = "NodeTypeTTLControlEntry"
	NodeTypeIncludeControlEntry NodeType = "NodeTypeIncludeControlEntry"
	NodeTypeRREntry             NodeType = "NodeTypeRREntry"
)

type Entry any

type Node struct {
	NodeType     NodeType
	SourceTokens []token.Token
	LeadComments []string
	LineComment  string
	Entry        Entry
}

type OriginControlEntry struct {
	DomainName string
}

func IsOriginControlEntry(entry Entry) bool {
	_, ok := entry.(OriginControlEntry)
	return ok
}

func ToOriginControlEntry(entry Entry) OriginControlEntry {
	return entry.(OriginControlEntry)
}

func (n Node) IsOriginControlEntry() bool {
	return IsOriginControlEntry(n.Entry)
}

func (n Node) OriginControlEntry() OriginControlEntry {
	return ToOriginControlEntry(n.Entry)
}

type TTLControlEntry struct {
	TTL time.Duration
}

func IsTTLControlEntry(entry Entry) bool {
	_, ok := entry.(TTLControlEntry)
	return ok
}

func ToTTLControlEntry(entry Entry) TTLControlEntry {
	return entry.(TTLControlEntry)
}

func (n Node) IsTTLControlEntry() bool {
	return IsTTLControlEntry(n.Entry)
}

func (n Node) TTLControlEntry() TTLControlEntry {
	return ToTTLControlEntry(n.Entry)
}

type IncludeControlEntry struct {
	FileName   string
	DomainName string
}

func IsIncludeControlEntry(entry Entry) bool {
	_, ok := entry.(IncludeControlEntry)
	return ok
}

func ToIncludeControlEntry(entry Entry) IncludeControlEntry {
	return entry.(IncludeControlEntry)
}

func (n Node) IsIncludeControlEntry() bool {
	return IsIncludeControlEntry(n.Entry)
}

func (n Node) IncludeControlEntry() IncludeControlEntry {
	return ToIncludeControlEntry(n.Entry)
}

type RData struct {
	Value string
}

type RRecord struct {
	TTL   time.Duration
	Class string
	Type  string
	RData []RData
}

type RREntry struct {
	DomainName string
	RRecord    RRecord
}

func IsRREntry(entry Entry) bool {
	_, ok := entry.(RREntry)
	return ok
}

func ToRREntry(entry Entry) RREntry {
	return entry.(RREntry)
}

func (n Node) IsRREntry() bool {
	return IsRREntry(n.Entry)
}

func (n Node) RREntry() RREntry {
	return ToRREntry(n.Entry)
}
