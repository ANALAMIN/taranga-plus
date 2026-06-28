package main

import (
	"net/url"
	"strings"
)

type Source struct {
	ID   string
	Tier string
	URL  string
}

var Sources = []Source{
	{ID: "iptv-org-bd",          Tier: "global", URL: "https://iptv-org.github.io/iptv/countries/bd.m3u"},
	{ID: "iptv-org-india",       Tier: "global", URL: "https://iptv-org.github.io/iptv/countries/in.m3u"},
	{ID: "iptv-org-sports",      Tier: "global", URL: "https://iptv-org.github.io/iptv/categories/sports.m3u"},
	{ID: "iptv-org-movies",      Tier: "global", URL: "https://iptv-org.github.io/iptv/categories/movies.m3u"},
	{ID: "iptv-org-documentary", Tier: "global", URL: "https://iptv-org.github.io/iptv/categories/documentary.m3u"},
	{ID: "iptv-org-music",       Tier: "global", URL: "https://iptv-org.github.io/iptv/categories/music.m3u"},
	{ID: "iptv-org-kids",        Tier: "global", URL: "https://iptv-org.github.io/iptv/categories/kids.m3u"},
	{ID: "free-tv",              Tier: "global", URL: "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist.m3u8"},
	{ID: "mrgify-bd",            Tier: "global", URL: "https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/main/playlist.m3u"},
	{ID: "imshakil-tvlink",      Tier: "global", URL: "https://raw.githubusercontent.com/imShakil/tvlink/refs/heads/main/iptv.m3u8"},
}

var globalHostPatterns = []string{
	"akamaized.net", "akamaihd.net", "cloudfront.net", "llnwi.net",
	"amagi.tv", "gpcdn.net", "pluto.tv", "google.com",
}

var bdixHostPatterns = []string{
	"digijadoo.net", "kitv.live", "jagobd.com", "colorsbd.com", "telelivebd.com",
}

var bdixIPPatters = []string{
	"103.", "45.249.", "45.126.", "45.58.", "182.48.", "202.51.", "202.134.", "202.84.", "118.179.", "123.108.",
}

func classifyHost(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "global"
	}
	host := u.Hostname()
	for _, p := range globalHostPatterns {
		if strings.HasSuffix(host, p) {
			return "global"
		}
	}
	for _, p := range bdixHostPatterns {
		if strings.HasSuffix(host, p) {
			return "bdix"
		}
	}
	for _, p := range bdixIPPatters {
		if strings.HasPrefix(host, p) {
			return "bdix"
		}
	}
	return "global"
}
