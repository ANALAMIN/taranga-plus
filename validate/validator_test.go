package main

import (
	"testing"
)

func TestMapCategory(t *testing.T) {
	tests := []struct {
		rawCat  string
		srcID   string
		name    string
		want    string
	}{
		{"", "iptv-org-sports", "Any", "sports"},
		{"", "", "Discovery Channel", "documentary"},
		{"", "", "Movie Channel", "movies"},
		{"", "", "Music TV", "music"},
		{"", "", "Cartoon Network", "kids"},
		{"", "", "Entertainment Plus", "entertainment"},
		{"", "", "Generic Channel", "all"},
		{"sports", "other", "Channel", "sports"},
		{"movies", "other", "Channel", "movies"},
		{"music", "other", "Channel", "music"},
	}
	for _, tt := range tests {
		got := mapCategory(tt.rawCat, tt.srcID, tt.name)
		if got != tt.want {
			t.Errorf("mapCategory(%q, %q, %q) = %q, want %q", tt.rawCat, tt.srcID, tt.name, got, tt.want)
		}
	}
}

func TestLooksLikeSecret(t *testing.T) {
	tests := []struct {
		url  string
		want bool
	}{
		{"http://example.com/stream.m3u8", false},
		{"http://example.com/?token=abc123", true},
		{"http://example.com/?api_key=abc", true},
		{"http://example.com/?secret=xyz", true},
		{"http://example.com/?key=value", true},
	}
	for _, tt := range tests {
		got := looksLikeSecret(tt.url)
		if got != tt.want {
			t.Errorf("looksLikeSecret(%q) = %v, want %v", tt.url, got, tt.want)
		}
	}
}

func TestIsLanguageAllowed(t *testing.T) {
	tests := []struct {
		lang string
		want bool
	}{
		{"", true},
		{"bn", true},
		{"ben", true},
		{"bengali", true},
		{"hi", true},
		{"en", true},
		{"es", false},
		{"fr", false},
	}
	for _, tt := range tests {
		got := isLanguageAllowed(tt.lang)
		if got != tt.want {
			t.Errorf("isLanguageAllowed(%q) = %v, want %v", tt.lang, got, tt.want)
		}
	}
}

func TestExtractHost(t *testing.T) {
	tests := []struct {
		url  string
		want string
	}{
		{"http://example.com/stream", "example.com"},
		{"https://cdn.example.com/path", "cdn.example.com"},
		{"http://192.168.1.1:8080/stream", "192.168.1.1"},
		{"invalid", "unknown"},
	}
	for _, tt := range tests {
		got := extractHost(tt.url)
		if got != tt.want {
			t.Errorf("extractHost(%q) = %q, want %q", tt.url, got, tt.want)
		}
	}
}

func TestNewStats(t *testing.T) {
	s := newStats()
	if s == nil {
		t.Fatal("expected non-nil stats")
	}
	if s.Dead == nil {
		t.Error("expected Dead map to be initialized")
	}
	if s.DeadLog == nil {
		t.Error("expected DeadLog to be initialized")
	}
}

func TestStatsAddDead(t *testing.T) {
	s := newStats()
	s.addDead("timeout")
	if s.Dead["timeout"] != 1 {
		t.Errorf("expected Dead[timeout]=1, got %d", s.Dead["timeout"])
	}
	s.addDead("timeout")
	if s.Dead["timeout"] != 2 {
		t.Errorf("expected Dead[timeout]=2, got %d", s.Dead["timeout"])
	}
}

func TestHostLimiter(t *testing.T) {
	hl := newHostLimiter(3)
	if hl.maxHosts != 3 {
		t.Errorf("expected maxHosts=3, got %d", hl.maxHosts)
	}
	// Acquire and release should not block
	hl.Acquire("example.com")
	hl.Release("example.com")
}

func TestGenerateID(t *testing.T) {
	id1 := generateID("Test Channel")
	id2 := generateID("Test Channel")
	id3 := generateID("Other Channel")
	if id1 != id2 {
		t.Errorf("same name should produce same ID")
	}
	if id1 == id3 {
		t.Errorf("different names should produce different IDs")
	}
	if len(id1) != 16 {
		t.Errorf("expected 16-char hex ID, got %d chars", len(id1))
	}
}

func TestClassifyHost(t *testing.T) {
	if classifyHost("http://example.com") != "global" {
		t.Error("expected global for unknown host")
	}
	if classifyHost("http://103.example.com") != "bdix" {
		t.Error("expected bdix for 103.x.x.x")
	}
	if classifyHost("http://jagobd.com/stream") != "bdix" {
		t.Error("expected bdix for jagobd.com")
	}
	if classifyHost("http://cdn.cloudfront.net/stream") != "global" {
		t.Error("expected global for cloudfront.net")
	}
}
