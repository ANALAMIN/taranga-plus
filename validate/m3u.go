package main

import (
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type ChannelEntry struct {
	Name     string
	URL      string
	Logo     string
	Category string
	Language string
	Country  string
	SourceID string
}

var (
	reEXTINF     = regexp.MustCompile(`#EXTINF:-?\d+(?:\.\d+)?\s*(.*)`)
	reTVGName    = regexp.MustCompile(`tvg-name="([^"]*)"`)
	reTVGID      = regexp.MustCompile(`tvg-id="([^"]*)"`)
	reTVGChan    = regexp.MustCompile(`tvg-channel="([^"]*)"`)
	reTVGLogo    = regexp.MustCompile(`tvg-logo="([^"]*)"`)
	reGroupTitle = regexp.MustCompile(`group-title="([^"]*)"`)
	reTVGLang    = regexp.MustCompile(`tvg-language="([^"]*)"`)
	reTVGCountry = regexp.MustCompile(`tvg-country="([^"]*)"`)
	reStreamInf  = regexp.MustCompile(`#EXT-X-STREAM-INF`)
	reBandwidth  = regexp.MustCompile(`BANDWIDTH=(\d+)`)
	nameCleaner  = regexp.MustCompile(`(?i)[(\[](hd|fhd|4k|tv)[)\]]`)
)

func parseM3U(data []byte, sourceID string) []ChannelEntry {
	lines := strings.Split(string(data), "\n")
	var entries []ChannelEntry

	for i := 0; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		if !reEXTINF.MatchString(line) {
			continue
		}

		name := extractEXTINFName(line)
		if name == "" {
			continue
		}
		cleanedName := cleanName(name)
		if cleanedName == "" {
			continue
		}

		chURL := ""
		for j := i + 1; j < len(lines); j++ {
			candidate := strings.TrimSpace(lines[j])
			if candidate == "" || strings.HasPrefix(candidate, "#") {
				continue
			}
			chURL = candidate
			break
		}
		if chURL == "" || !isValidURL(chURL) {
			continue
		}

		entries = append(entries, ChannelEntry{
			Name:     cleanedName,
			URL:      chURL,
			Logo:     extractTag(line, reTVGLogo),
			Category: extractTag(line, reGroupTitle),
			Language: extractTag(line, reTVGLang),
			Country:  extractTag(line, reTVGCountry),
			SourceID: sourceID,
		})
	}
	return entries
}

func isMasterPlaylist(data []byte) bool {
	return reStreamInf.Match(data)
}

type variant struct {
	bandwidth int
	url       string
}

func resolveAllVariants(data []byte, baseURL string) []variant {
	lines := strings.Split(string(data), "\n")
	var variants []variant

	for i := 0; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		if !strings.HasPrefix(line, "#EXT-X-STREAM-INF:") {
			continue
		}
		bw := 0
		m := reBandwidth.FindStringSubmatch(line)
		if len(m) > 1 {
			bw, _ = strconv.Atoi(m[1])
		}
		for j := i + 1; j < len(lines); j++ {
			v := strings.TrimSpace(lines[j])
			if v == "" || strings.HasPrefix(v, "#") {
				continue
			}
			variants = append(variants, variant{bandwidth: bw, url: resolveURL(v, baseURL)})
			break
		}
	}

	sort.Slice(variants, func(i, j int) bool {
		return variants[i].bandwidth < variants[j].bandwidth
	})
	return variants
}

func resolveAllVariantURLs(data []byte, baseURL string) []string {
	variants := resolveAllVariants(data, baseURL)
	urls := make([]string, len(variants))
	for i, v := range variants {
		urls[i] = v.url
	}
	return urls
}

func resolveURL(ref, base string) string {
	u, err := url.Parse(ref)
	if err != nil {
		return ref
	}
	if u.IsAbs() {
		return ref
	}
	b, err := url.Parse(base)
	if err != nil {
		return ref
	}
	return b.ResolveReference(u).String()
}

func extractEXTINFName(line string) string {
	idx := strings.Index(line, ",")
	if idx == -1 {
		return ""
	}
	return strings.TrimSpace(line[idx+1:])
}

func extractTag(line string, re *regexp.Regexp) string {
	m := re.FindStringSubmatch(line)
	if len(m) > 1 {
		return m[1]
	}
	return ""
}

func cleanName(name string) string {
	s := nameCleaner.ReplaceAllString(name, "")
	s = strings.NewReplacer("(", "", ")", "", "[", "", "]", "").Replace(s)

	var b strings.Builder
	for _, r := range s {
		if isEmoji(r) || isZeroWidth(r) {
			continue
		}
		b.WriteRune(r)
	}
	s = strings.TrimSpace(b.String())
	return strings.Join(strings.Fields(s), " ")
}

func isEmoji(r rune) bool {
	return (r >= 0x1F600 && r <= 0x1F64F) ||
		(r >= 0x1F300 && r <= 0x1F5FF) ||
		(r >= 0x1F680 && r <= 0x1F6FF) ||
		(r >= 0x2600 && r <= 0x27BF) ||
		(r >= 0xFE00 && r <= 0xFE0F) ||
		(r >= 0x1F900 && r <= 0x1F9FF) ||
		(r >= 0x1FA00 && r <= 0x1FA6F) ||
		(r >= 0x1FA70 && r <= 0x1FAFF) ||
		(r >= 0x200D && r <= 0x200D)
}

func isZeroWidth(r rune) bool {
	return r == '\u200B' || r == '\u200C' || r == '\u200D' || r == '\uFE0F' ||
		r == '\u200E' || r == '\u200F' || r == '\u2060' || r == '\u2061'
}

func isValidURL(raw string) bool {
	_, err := url.Parse(raw)
	return err == nil && strings.HasPrefix(raw, "http")
}
