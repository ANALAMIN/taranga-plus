package main

import (
	"testing"
)

func TestParseM3U(t *testing.T) {
	data := []byte(`#EXTM3U
#EXTINF:-1 tvg-id="test" tvg-name="Test Channel" group-title="movies",Test Channel HD
http://example.com/stream.m3u8
#EXTINF:-1,Another Channel
http://example.com/another.m3u8
#EXTINF:-1,
http://example.com/no-name.m3u8
`)
	entries := parseM3U(data, "test-source")
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}
	if entries[0].Name != "Test Channel HD" {
		t.Errorf("expected 'Test Channel HD', got '%s'", entries[0].Name)
	}
	if entries[0].URL != "http://example.com/stream.m3u8" {
		t.Errorf("wrong URL: %s", entries[0].URL)
	}
	if entries[0].Category != "movies" {
		t.Errorf("expected category 'movies', got '%s'", entries[0].Category)
	}
	if entries[0].SourceID != "test-source" {
		t.Errorf("wrong sourceID: %s", entries[0].SourceID)
	}
	if entries[1].Name != "Another Channel" {
		t.Errorf("expected 'Another Channel', got '%s'", entries[1].Name)
	}
}

func TestParseM3UNoURL(t *testing.T) {
	data := []byte("#EXTINF:-1,No URL Channel\n#EXTINF:-1,Also No URL\n")
	entries := parseM3U(data, "test")
	if len(entries) != 0 {
		t.Errorf("expected 0 entries, got %d", len(entries))
	}
}

func TestParseM3UNonHTTP(t *testing.T) {
	data := []byte("#EXTINF:-1,Bad\nrtmp://example.com/stream\n")
	entries := parseM3U(data, "test")
	if len(entries) != 0 {
		t.Errorf("expected 0 entries for non-HTTP URL, got %d", len(entries))
	}
}

func TestIsMasterPlaylist(t *testing.T) {
	tests := []struct {
		data string
		want bool
	}{
		{"#EXTM3U\n#EXTINF:-1,Test", false},
		{"#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500000\nhttp://example.com", true},
		{"", false},
	}
	for _, tt := range tests {
		got := isMasterPlaylist([]byte(tt.data))
		if got != tt.want {
			t.Errorf("isMasterPlaylist(%q) = %v, want %v", tt.data, got, tt.want)
		}
	}
}

func TestResolveURL(t *testing.T) {
	tests := []struct {
		ref  string
		base string
		want string
	}{
		{"http://example.com/stream.m3u8", "http://other.com/play.m3u8", "http://example.com/stream.m3u8"},
		{"stream.m3u8", "http://example.com/play.m3u8", "http://example.com/stream.m3u8"},
		{"sub/stream.m3u8", "http://example.com/dir/play.m3u8", "http://example.com/dir/sub/stream.m3u8"},
		{"/abs/stream.m3u8", "http://example.com/dir/play.m3u8", "http://example.com/abs/stream.m3u8"},
	}
	for _, tt := range tests {
		got := resolveURL(tt.ref, tt.base)
		if got != tt.want {
			t.Errorf("resolveURL(%q, %q) = %q, want %q", tt.ref, tt.base, got, tt.want)
		}
	}
}

func TestCleanName(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"Test Channel HD", "Test Channel HD"},
		{"Test (HD) Channel", "Test Channel"},
		{"Channel [4K]", "Channel"},
		{"\U0001F600 Smiley Channel", "Smiley Channel"},
		{"Test\u200BZeroWidth", "TestZeroWidth"},
		{"Just Name", "Just Name"},
		{"Test  Double  Space", "Test Double Space"},
	}
	for _, tt := range tests {
		got := cleanName(tt.input)
		if got != tt.want {
			t.Errorf("cleanName(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestResolveAllVariants(t *testing.T) {
	data := []byte(`#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=500000
http://example.com/low.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1000000
http://example.com/med.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000000
http://example.com/high.m3u8
`)
	variants := resolveAllVariants(data, "http://example.com/master.m3u8")
	if len(variants) != 3 {
		t.Fatalf("expected 3 variants, got %d", len(variants))
	}
	// Should be sorted by bandwidth ascending
	if variants[0].bandwidth != 500000 {
		t.Errorf("expected first variant bw=500000, got %d", variants[0].bandwidth)
	}
	if variants[0].url != "http://example.com/low.m3u8" {
		t.Errorf("wrong URL for first variant: %s", variants[0].url)
	}
	if variants[2].bandwidth != 2000000 {
		t.Errorf("expected last variant bw=2000000, got %d", variants[2].bandwidth)
	}
}

func TestIsValidURL(t *testing.T) {
	if !isValidURL("http://example.com/stream") {
		t.Error("expected http URL to be valid")
	}
	if !isValidURL("https://example.com/stream") {
		t.Error("expected https URL to be valid")
	}
	if isValidURL("rtmp://example.com/stream") {
		t.Error("expected rtmp URL to be invalid")
	}
	if isValidURL("") {
		t.Error("expected empty URL to be invalid")
	}
}

func TestExtractEXTINFName(t *testing.T) {
	tests := []struct {
		line string
		want string
	}{
		{"#EXTINF:-1,Test Channel", "Test Channel"},
		{"#EXTINF:-1 tvg-id=\"123\",Another", "Another"},
		{"#EXTINF:-1,", ""},
		{"no comma", ""},
	}
	for _, tt := range tests {
		got := extractEXTINFName(tt.line)
		if got != tt.want {
			t.Errorf("extractEXTINFName(%q) = %q, want %q", tt.line, got, tt.want)
		}
	}
}
