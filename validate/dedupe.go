package main

import (
	"sort"
	"strings"
	"unicode"
)

type ChannelFinal struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	LogoURL       string   `json:"logoUrl"`
	StreamURL     string   `json:"streamUrl"`
	Category      string   `json:"category"`
	LatencyMs     int64    `json:"latencyMs,omitempty"`
	Language      string   `json:"language,omitempty"`
	Tier          string   `json:"tier,omitempty"`
	Sources       []string `json:"sources,omitempty"`
	LastValidated string   `json:"lastValidated,omitempty"`
	VideoCodec    string   `json:"videoCodec,omitempty"`
	AudioCodec    string   `json:"audioCodec,omitempty"`
}

func normalizeName(name string) string {
	cleaned := strings.ToLower(name)
	cleaned = strings.NewReplacer(
		"(hd)", "", "(fhd)", "", "(4k)", "", "(tv)", "",
		"[hd]", "", "[fhd]", "", "[4k]", "", "[tv]", "",
	).Replace(cleaned)

	var b strings.Builder
	for _, r := range cleaned {
		if isEmoji(r) || isZeroWidth(r) {
			continue
		}
		if unicode.IsLetter(r) || unicode.IsNumber(r) || r == ' ' || r == '-' {
			b.WriteRune(r)
		}
	}
	cleaned = b.String()
	cleaned = strings.Join(strings.Fields(cleaned), " ")
	return strings.TrimSpace(cleaned)
}

func pickBestRoutes(validated []ValidatedChannel) []ChannelFinal {
	groups := make(map[string][]ValidatedChannel)

	for _, ch := range validated {
		norm := normalizeName(ch.Name)
		if norm == "" {
			continue
		}
		groups[norm] = append(groups[norm], ch)
	}

	var result []ChannelFinal
	for _, group := range groups {
		sort.Slice(group, func(i, j int) bool {
			return group[i].LatencyMs < group[j].LatencyMs
		})

		norm := normalizeName(group[0].Name)

		seen := make(map[string]bool)
		var sources []string
		for _, ch := range group {
			if !seen[ch.URL] {
				seen[ch.URL] = true
				sources = append(sources, ch.URL)
			}
		}

		primary := group[0]
		id := generateID(norm)
		logo := normalizeLogoURL(primary.Logo)

		result = append(result, ChannelFinal{
			ID:            id,
			Name:          primary.Name,
			LogoURL:       logo,
			StreamURL:     primary.URL,
			Category:      primary.Category,
			LatencyMs:     primary.LatencyMs,
			Language:      primary.Language,
			Tier:          primary.Tier,
			Sources:       sources,
			LastValidated: primary.LastValidated,
			VideoCodec:    primary.VideoCodec,
		})
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})

	return result
}

func normalizeLogoURL(logo string) string {
	logo = strings.TrimSpace(logo)
	if logo == "" {
		return ""
	}
	if strings.Contains(logo, "imgur.com/") && !strings.HasPrefix(logo, "https://i.imgur.com/") {
		parts := strings.Split(logo, "imgur.com/")
		if len(parts) == 2 {
			return "https://i.imgur.com/" + parts[1]
		}
	}
	return logo
}
