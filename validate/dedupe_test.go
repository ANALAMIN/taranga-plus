package main

import (
	"testing"
)

func TestNormalizeName(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"Test Channel", "test channel"},
		{"Test (HD) Channel", "test channel"},
		{"Channel [4K] TV", "channel tv"},
		{"Duplicate Name", "duplicate name"},
		{"\U0001F600 Emoji Channel", "emoji channel"},
		{"Test\u200BZero\u200DWidth", "testzerowidth"},
		{"  Spaces  Around  ", "spaces around"},
	}
	for _, tt := range tests {
		got := normalizeName(tt.input)
		if got != tt.want {
			t.Errorf("normalizeName(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestPickBestRoutes(t *testing.T) {
	validated := []ValidatedChannel{
		{Name: "Channel A", URL: "http://example.com/slow", LatencyMs: 500},
		{Name: "Channel A", URL: "http://example.com/fast", LatencyMs: 50},
		{Name: "Channel B", URL: "http://example.com/b", LatencyMs: 100},
	}
	result := pickBestRoutes(validated)
	if len(result) != 2 {
		t.Fatalf("expected 2 channels, got %d", len(result))
	}
	// Channel A should use the fastest URL
	var chA *ChannelFinal
	for i := range result {
		if result[i].Name == "Channel A" {
			chA = &result[i]
			break
		}
	}
	if chA == nil {
		t.Fatal("Channel A not found")
	}
	if chA.StreamURL != "http://example.com/fast" {
		t.Errorf("expected fast URL, got %s", chA.StreamURL)
	}
	if len(chA.Sources) != 2 {
		t.Errorf("expected 2 sources, got %d", len(chA.Sources))
	}
}

func TestPickBestRoutes_Empty(t *testing.T) {
	result := pickBestRoutes(nil)
	if len(result) != 0 {
		t.Errorf("expected 0 results for nil input, got %d", len(result))
	}
}

func TestNormalizeLogoURL(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"https://example.com/logo.png", "https://example.com/logo.png"},
		{"https://imgur.com/abc123", "https://i.imgur.com/abc123"},
		{"https://i.imgur.com/abc123", "https://i.imgur.com/abc123"},
		{"", ""},
	}
	for _, tt := range tests {
		got := normalizeLogoURL(tt.input)
		if got != tt.want {
			t.Errorf("normalizeLogoURL(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}
