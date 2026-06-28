package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const (
	outputPath     = "data/channels.json"
	deadLogPath    = "data/dead_channels.json"
	workerCount    = 50
)

func main() {
	fmt.Println("═══════════════════════════════════════")
	fmt.Println("  Taranga+ Tier-1 Validation (Go)")
	fmt.Println("═══════════════════════════════════════")

	stats := newStats()
	client := &http.Client{Timeout: 10 * time.Second}

	fmt.Println("📡 Fetching sources...")
	type fetchResult struct {
		source  Source
		entries []ChannelEntry
		err     error
	}
	ch := make(chan fetchResult, len(Sources))

	for _, src := range Sources {
		go func(src Source) {
			fmt.Printf("  Fetching: %s ...\n", src.ID)
			resp, err := client.Get(src.URL)
			if err != nil {
				ch <- fetchResult{source: src, err: fmt.Errorf("fetch error: %w", err)}
				return
			}
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				ch <- fetchResult{source: src, err: fmt.Errorf("HTTP %d", resp.StatusCode)}
				return
			}
			data, err := io.ReadAll(resp.Body)
			if err != nil {
				ch <- fetchResult{source: src, err: fmt.Errorf("read error: %w", err)}
				return
			}

			entries := parseM3U(data, src.ID)
			ch <- fetchResult{source: src, entries: entries}
		}(src)
	}

	var allEntries []ChannelEntry
	for range Sources {
		result := <-ch
		if result.err != nil {
			fmt.Printf("  ✗ %s failed: %v\n", result.source.ID, result.err)
			continue
		}
		fmt.Printf("  ✓ %s: %d channels parsed\n", result.source.ID, len(result.entries))
		allEntries = append(allEntries, result.entries...)
	}
	stats.Raw = len(allEntries)

	fmt.Printf("\n  Total raw: %d channels\n", stats.Raw)

	var candidates []ChannelEntry
	for _, entry := range allEntries {
		if looksLikeSecret(entry.URL) {
			stats.Filtered++
			continue
		}
		if entry.Name == "" || entry.URL == "" {
			stats.Filtered++
			continue
		}
		candidates = append(candidates, entry)
	}

	fmt.Printf("  After filter: %d candidates\n\n", len(candidates))

	fmt.Println("🔍 Validating (segment-level, MPEG-TS parse)...")

	validated := validateAll(candidates, stats, workerCount)

	fmt.Println("\n🧹 Deduplicating (multi-URL, by latency)...")
	final := pickBestRoutes(validated)

	buildReport(stats, len(final))

	rootDir := findRootDir()

	outPath := filepath.Join(rootDir, outputPath)
	os.MkdirAll(filepath.Dir(outPath), 0755)

	jsonData, err := json.MarshalIndent(final, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error marshaling JSON: %v\n", err)
		os.Exit(1)
	}

	if err := os.WriteFile(outPath, jsonData, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "Error writing file: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("\n✅ Saved %d channels to %s\n", len(final), outPath)

	// Write dead log
	if len(stats.DeadLog) > 0 {
		deadPath := filepath.Join(rootDir, deadLogPath)
		deadData, _ := json.MarshalIndent(stats.DeadLog, "", "  ")
		os.WriteFile(deadPath, deadData, 0644)
		fmt.Printf("   Dead log: %d entries to %s\n", len(stats.DeadLog), deadPath)
	}

	catCount := make(map[string]int)
	for _, ch := range final {
		catCount[ch.Category]++
	}
	fmt.Println("\nCategory breakdown:")
	order := []string{"sports", "all", "entertainment", "movies", "music", "kids", "documentary"}
	for _, cat := range order {
		if count, ok := catCount[cat]; ok {
			fmt.Printf("  %s: %d\n", cat, count)
		}
	}

	fmt.Println("═══════════════════════════════════════")
}

func findRootDir() string {
	wd, _ := os.Getwd()
	for i := 0; i < 5; i++ {
		if _, err := os.Stat(filepath.Join(wd, "data")); err == nil {
			return wd
		}
		parent := filepath.Dir(wd)
		if parent == wd {
			break
		}
		wd = parent
	}
	wd, _ = os.Getwd()
	return wd
}
