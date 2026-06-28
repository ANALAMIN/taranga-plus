package main

import (
	"fmt"
	"time"
)

func buildReport(stats *ValidationStats, finalCount int) {
	elapsed := time.Since(stats.StartTime).Seconds()

	fmt.Println("\n═══════════════════════════════════════")
	fmt.Println("  Validation Report")
	fmt.Println("═══════════════════════════════════════")

	fmt.Printf("  Total entries:     %d\n", stats.Raw)
	fmt.Printf("  Filtered out:      %d\n", stats.Filtered)
	fmt.Printf("  Global validated:  %d\n", stats.GlobalValidated)
	fmt.Printf("  BDIX passthrough:  %d\n", stats.BdixPassthrough)

	fmt.Printf("\n  Alive (after segment test): %d\n", stats.Alive)
	if len(stats.Dead) > 0 {
		fmt.Println("\n  Dead breakdown:")
		// Sort by count descending
		type kv struct{ k string; v int }
		var sorted []kv
		for k, v := range stats.Dead {
			sorted = append(sorted, kv{k, v})
		}
		// Simple bubble sort
		for i := 0; i < len(sorted); i++ {
			for j := i + 1; j < len(sorted); j++ {
				if sorted[j].v > sorted[i].v {
					sorted[i], sorted[j] = sorted[j], sorted[i]
				}
			}
		}
		for _, kv := range sorted {
			fmt.Printf("    %-40s %4d\n", kv.k, kv.v)
		}
	}

	fmt.Printf("\n  Final channels:    %d\n", finalCount)
	fmt.Printf("  Duration:          %.1fs\n", elapsed)
	fmt.Println("═══════════════════════════════════════")
}
