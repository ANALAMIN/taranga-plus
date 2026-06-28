package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"
)

type ValidatedChannel struct {
	Name          string
	URL           string
	Logo          string
	Category      string
	Language      string
	Tier          string
	SourceID      string
	LatencyMs     int64
	VideoCodec    string
	AudioCodec    string
	LastValidated string
}

type DeadEntry struct {
	Name     string `json:"name"`
	URL      string `json:"url"`
	SourceID string `json:"sourceId"`
	Tier     string `json:"tier"`
	Reason   string `json:"reason"`
	LatencyMs int64 `json:"latencyMs"`
}

type ValidationStats struct {
	Raw              int
	NoURL            int
	Filtered         int
	Dead             map[string]int
	DeadLog          []DeadEntry
	BdixPassthrough  int
	BdixDead         int
	BdixAlive        int
	Alive            int
	GlobalValidated  int
	StartTime        time.Time
	mu               sync.Mutex
}

func newStats() *ValidationStats {
	return &ValidationStats{Dead: make(map[string]int), DeadLog: make([]DeadEntry, 0), StartTime: time.Now()}
}

func (s *ValidationStats) addDead(reason string) {
	s.mu.Lock()
	s.Dead[reason]++
	s.mu.Unlock()
}

func (s *ValidationStats) addDeadEntry(entry DeadEntry) {
	s.mu.Lock()
	s.Dead[entry.Reason]++
	s.DeadLog = append(s.DeadLog, entry)
	s.mu.Unlock()
}

type HostLimiter struct {
	mu       sync.Mutex
	hosts    map[string]chan struct{}
	maxHosts int
}

func newHostLimiter(maxPerHost int) *HostLimiter {
	return &HostLimiter{
		hosts:    make(map[string]chan struct{}),
		maxHosts: maxPerHost,
	}
}

func (hl *HostLimiter) Acquire(host string) {
	hl.mu.Lock()
	sem, ok := hl.hosts[host]
	if !ok {
		sem = make(chan struct{}, hl.maxHosts)
		hl.hosts[host] = sem
	}
	hl.mu.Unlock()
	sem <- struct{}{}
}

func (hl *HostLimiter) Release(host string) {
	hl.mu.Lock()
	sem := hl.hosts[host]
	hl.mu.Unlock()
	<-sem
}

func extractHost(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil || u.Hostname() == "" {
		return "unknown"
	}
	return u.Hostname()
}

var allowedLanguages = map[string]bool{
	"bn": true, "ben": true, "bengali": true,
	"hi": true, "hin": true, "hindi": true,
	"en": true, "eng": true, "english": true,
	"ur": true, "urd": true, "urdu": true,
}

func isLanguageAllowed(lang string) bool {
	if lang == "" {
		return true
	}
	return allowedLanguages[lang]
}

var secretPatterns = []string{
	"token", "api_key", "apikey", "secret", "password", "key=", "sig=", "auth=",
}

func looksLikeSecret(rawURL string) bool {
	lower := rawURL
	for _, p := range secretPatterns {
		if strings.Contains(lower, p) {
			return true
		}
	}
	return false
}

var (
	documentaryKeywords = []string{"discovery", "natgeo", "national geographic", "animal planet", "wild", "nature", "science", "docu"}
	movieKeywords       = []string{"movie", "cinema", "film"}
	musicKeywords       = []string{"music", "gaan"}
	kidsKeywords        = []string{"kid", "child", "cartoon", "duronto"}
	entertainKeywords   = []string{"entertain", "general"}
	sportsKeywords      = []string{"sport"}
)

func mapCategory(rawCategory, sourceID, name string) string {
	if sourceID == "iptv-org-sports" {
		return "sports"
	}
	n := strings.ToLower(name)
	for _, kw := range documentaryKeywords {
		if strings.Contains(n, kw) {
			return "documentary"
		}
	}
	if rawCategory == "" {
		for _, kw := range movieKeywords {
			if strings.Contains(n, kw) {
				return "movies"
			}
		}
		for _, kw := range musicKeywords {
			if strings.Contains(n, kw) {
				return "music"
			}
		}
		for _, kw := range kidsKeywords {
			if strings.Contains(n, kw) {
				return "kids"
			}
		}
		for _, kw := range entertainKeywords {
			if strings.Contains(n, kw) {
				return "entertainment"
			}
		}
		return "all"
	}
	c := strings.ToLower(rawCategory)
	for _, kw := range sportsKeywords {
		if strings.Contains(c, kw) {
			return "sports"
		}
	}
	for _, kw := range movieKeywords {
		if strings.Contains(c, kw) {
			return "movies"
		}
	}
	for _, kw := range musicKeywords {
		if strings.Contains(c, kw) {
			return "music"
		}
	}
	for _, kw := range kidsKeywords {
		if strings.Contains(c, kw) {
			return "kids"
		}
	}
	for _, kw := range entertainKeywords {
		if strings.Contains(c, kw) {
			return "entertainment"
		}
	}
	return "all"
}

func validateAll(entries []ChannelEntry, stats *ValidationStats, workers int) []ValidatedChannel {
	var globalCandidates []ChannelEntry
	var bdixCandidates []ChannelEntry

	for _, ch := range entries {
		if looksLikeSecret(ch.URL) {
			continue
		}
		tier := classifyHost(ch.URL)
		if tier == "bdix" {
			bdixCandidates = append(bdixCandidates, ch)
			continue
		}
		globalCandidates = append(globalCandidates, ch)
	}

	stats.GlobalValidated = len(globalCandidates)

	var (
		mu          sync.Mutex
		valid       []ValidatedChannel
		wg          sync.WaitGroup
		sem         = make(chan struct{}, workers)
		hostLimiter = newHostLimiter(10)
	)

	for i, ch := range globalCandidates {
		wg.Add(1)
		sem <- struct{}{}
		go func(ch ChannelEntry, idx int) {
			defer wg.Done()
			defer func() { <-sem }()

			if idx%50 == 0 {
				fmt.Printf("  Validating %d/%d\n", idx+1, len(globalCandidates))
			}

			host := extractHost(ch.URL)
			hostLimiter.Acquire(host)
			defer hostLimiter.Release(host)
			result := validateSegment(ch.URL)

			if result == nil || !result.OK {
				reason := "unknown"
				if result != nil {
					reason = result.Reason
				}
				stats.addDeadEntry(DeadEntry{
					Name:     ch.Name,
					URL:      ch.URL,
					SourceID: ch.SourceID,
					Tier:     "global",
					Reason:   reason,
					LatencyMs: func() int64 {
						if result != nil { return result.LatencyMs }
						return 0
					}(),
				})
				return
			}

			codecStr := ""
			if result.Codec != nil {
				if result.Codec.VideoCodec != "" {
					codecStr = result.Codec.VideoCodec
				}
				if result.Codec.AudioCodec != "" {
					if codecStr != "" {
						codecStr += "+"
					}
					codecStr += result.Codec.AudioCodec
				}
			}

			vc := ValidatedChannel{
				Name:          ch.Name,
				URL:           ch.URL,
				Logo:          ch.Logo,
				Category:      mapCategory(ch.Category, ch.SourceID, ch.Name),
				Language:      ch.Language,
				Tier:          "global",
				SourceID:      ch.SourceID,
				LatencyMs:     result.LatencyMs,
				VideoCodec:    codecStr,
				LastValidated: time.Now().UTC().Format(time.RFC3339),
			}

			mu.Lock()
			valid = append(valid, vc)
			mu.Unlock()
		}(ch, i)
	}
	wg.Wait()

	for _, ch := range bdixCandidates {
		result := validateBDIX(ch.URL)
		if result == nil || !result.OK {
			reason := "unknown"
			if result != nil {
				reason = result.Reason
			}
			stats.BdixDead++
			stats.addDeadEntry(DeadEntry{
				Name:     ch.Name,
				URL:      ch.URL,
				SourceID: ch.SourceID,
				Tier:     "bdix",
				Reason:   reason,
				LatencyMs: func() int64 {
					if result != nil {
						return result.LatencyMs
					}
					return 0
				}(),
			})
			continue
		}
		stats.BdixAlive++

		codecStr := ""
		if result.Codec != nil {
			if result.Codec.VideoCodec != "" {
				codecStr = result.Codec.VideoCodec
			}
			if result.Codec.AudioCodec != "" {
				if codecStr != "" {
					codecStr += "+"
				}
				codecStr += result.Codec.AudioCodec
			}
		}

		valid = append(valid, ValidatedChannel{
			Name:          ch.Name,
			URL:           ch.URL,
			Logo:          ch.Logo,
			Category:      mapCategory(ch.Category, ch.SourceID, ch.Name),
			Language:      ch.Language,
			Tier:          "bdix",
			SourceID:      ch.SourceID,
			LatencyMs:     result.LatencyMs,
			VideoCodec:    codecStr,
			LastValidated: time.Now().UTC().Format(time.RFC3339),
		})
	}

	stats.BdixPassthrough = len(bdixCandidates)
	mu.Lock()
	stats.Alive = len(valid)
	mu.Unlock()

	return valid
}

func sha256Hex16(input string) string {
	h := sha256.Sum256([]byte(input))
	return hex.EncodeToString(h[:])[:16]
}

func generateID(name string) string {
	return sha256Hex16(strings.ToLower(name))
}
