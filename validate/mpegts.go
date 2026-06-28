package main

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

const (
	tsPacketSize = 188
	syncByte     = 0x47
	pidPAT       = 0x0000
	pidNull      = 0x1FFF
)

type CodecInfo struct {
	VideoCodec string
	AudioCodec string
}

type ValidationResult struct {
	OK        bool
	LatencyMs int64
	Codec     *CodecInfo
	Reason    string
}

var httpClient = &http.Client{
	Timeout: 5 * time.Second,
	Transport: &http.Transport{
		DialContext: (&net.Dialer{
			Timeout:   3 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ResponseHeaderTimeout: 5 * time.Second,
		TLSHandshakeTimeout:   3 * time.Second,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
	},
}

var httpClientShort = &http.Client{
	Timeout: 5 * time.Second,
	Transport: &http.Transport{
		DialContext: (&net.Dialer{
			Timeout:   3 * time.Second,
			KeepAlive: 0,
		}).DialContext,
		ResponseHeaderTimeout: 5 * time.Second,
		TLSHandshakeTimeout:   3 * time.Second,
		DisableKeepAlives:     true,
	},
}

func validateSegment(manifestURL string) *ValidationResult {
	start := time.Now()

	data, effectiveURL, err := fetchManifest(manifestURL)
	if err != nil {
		return &ValidationResult{OK: false, LatencyMs: msSince(start), Reason: "manifest: " + err.Error()}
	}

	if isMasterPlaylist(data) {
		return tryHLSVariants(data, effectiveURL, start)
	}

	segURL := resolveSegmentURL(data, effectiveURL)
	if segURL == "" {
		return &ValidationResult{OK: false, LatencyMs: msSince(start), Reason: "no segment URL"}
	}

	return downloadAndValidate(segURL, start)
}

func tryHLSVariants(data []byte, baseURL string, start time.Time) *ValidationResult {
	variantURLs := resolveAllVariantURLs(data, baseURL)
	if len(variantURLs) == 0 {
		return &ValidationResult{OK: false, LatencyMs: msSince(start), Reason: "no variants in master"}
	}

	maxAttempts := 3
	if len(variantURLs) < maxAttempts {
		maxAttempts = len(variantURLs)
	}

	var lastErr error
	for i := 0; i < maxAttempts; i++ {
		vu := variantURLs[i]
		mediaData, _, err := fetchManifest(vu)
		if err != nil {
			lastErr = err
			continue
		}

		segURL := resolveSegmentURL(mediaData, vu)
		if segURL == "" {
			lastErr = fmt.Errorf("no segment in variant")
			continue
		}

		result := downloadAndValidate(segURL, start)
		if result != nil && result.OK {
			return result
		}
		lastErr = fmt.Errorf("variant failed")
	}

	if lastErr != nil {
		return &ValidationResult{OK: false, LatencyMs: msSince(start), Reason: "all variants: " + lastErr.Error()}
	}
	return &ValidationResult{OK: false, LatencyMs: msSince(start), Reason: "all variants failed"}
}

func downloadAndValidate(segURL string, start time.Time) *ValidationResult {
	segData, ct, err := downloadSegment(segURL)
	if err != nil {
		return &ValidationResult{OK: false, LatencyMs: msSince(start), Reason: "segment: " + err.Error()}
	}

	if !isVideoContentType(ct) {
		return &ValidationResult{OK: false, LatencyMs: msSince(start), Reason: "bad content-type: " + ct}
	}

	if len(segData) < 64 {
		return &ValidationResult{OK: false, LatencyMs: msSince(start), Reason: "segment too small"}
	}

	codec := parseMediaSegment(segData)
	if codec == nil {
		return &ValidationResult{OK: false, LatencyMs: msSince(start), Reason: "no valid media format"}
	}

	return &ValidationResult{OK: true, LatencyMs: msSince(start), Codec: codec}
}

func parseMediaSegment(data []byte) *CodecInfo {
	if len(data) >= 4 && string(data[4:8]) == "ftyp" {
		codec := &CodecInfo{VideoCodec: "fMP4"}
		for i := 8; i+4 <= len(data) && i < 64; i++ {
			if string(data[i:i+4]) == "avc1" {
				codec.VideoCodec = "H264"
			} else if string(data[i:i+4]) == "hev1" || string(data[i:i+4]) == "hvc1" {
				codec.VideoCodec = "H265"
			} else if string(data[i:i+4]) == "mp4a" {
				codec.AudioCodec = "AAC"
			}
		}
		return codec
	}
	return parseMPEGTS(data)
}

func fetchManifest(url string) ([]byte, string, error) {
	var data []byte

	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 TarangaPlus/2.0")
	req.Header.Set("Range", "bytes=0-16384")
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, url, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPartialContent {
		return nil, url, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	effectiveURL := resp.Request.URL.String()
	data, err = io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1MB max
	if err != nil {
		return nil, effectiveURL, err
	}
	return data, effectiveURL, nil
}

func downloadSegment(url string) ([]byte, string, error) {
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 TarangaPlus/2.0")
	req.Header.Set("Range", "bytes=0-131072")
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPartialContent {
		return nil, "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	ct := resp.Header.Get("Content-Type")
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1MB max
	if err != nil {
		return nil, "", err
	}
	return data, ct, err
}

func validateBDIX(rawURL string) *ValidationResult {
	start := time.Now()

	data, _, err := fetchManifest(rawURL)
	if err == nil {
		segURL := resolveSegmentURL(data, rawURL)
		if segURL != "" {
			segData, _, err := downloadSegment(segURL)
			if err == nil && len(segData) >= 64 {
				codec := parseMediaSegment(segData)
				return &ValidationResult{OK: true, LatencyMs: msSince(start), Codec: codec}
			}
		}
		return &ValidationResult{OK: true, LatencyMs: msSince(start)}
	}

	resp, err := httpClientShort.Head(rawURL)
	if err != nil {
		return &ValidationResult{OK: false, LatencyMs: msSince(start), Reason: "head: " + err.Error()}
	}
	resp.Body.Close()
	if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusPartialContent {
		return &ValidationResult{OK: true, LatencyMs: msSince(start)}
	}
	return &ValidationResult{OK: false, LatencyMs: msSince(start), Reason: fmt.Sprintf("head: HTTP %d", resp.StatusCode)}
}

var videoContentTypes = []string{
	"video/", "octet-stream", "mpegurl", "x-mpegurl", "apple", "dash", "xml",
	"mp4", "m4s",
}

func isVideoContentType(ct string) bool {
	ct = strings.ToLower(ct)
	for _, v := range videoContentTypes {
		if strings.Contains(ct, v) {
			return true
		}
	}
	return false
}

func resolveSegmentURL(data []byte, baseURL string) string {
	text := string(data)
	lines := strings.Split(text, "\n")
	for i := 0; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		if strings.HasPrefix(line, "#EXTINF") {
			for j := i + 1; j < len(lines); j++ {
				candidate := strings.TrimSpace(lines[j])
				if candidate == "" || strings.HasPrefix(candidate, "#") {
					continue
				}
				return resolveURL(candidate, baseURL)
			}
		}
	}
	return ""
}

func parseMPEGTS(data []byte) *CodecInfo {
	if len(data) < tsPacketSize || data[0] != syncByte {
		return nil
	}

	info := &CodecInfo{}
	pmtPID := uint16(0x1FFF)
	foundSync := false

	for offset := 0; offset+tsPacketSize <= len(data); offset += tsPacketSize {
		if data[offset] != syncByte {
			continue
		}
		foundSync = true
		pid := (uint16(data[offset+1]&0x1F) << 8) | uint16(data[offset+2])

		hasPayload := (data[offset+3] & 0x10) != 0
		if !hasPayload {
			continue
		}

		pusi := (data[offset+1] & 0x40) != 0
		payloadStart := offset + 4
		afc := (data[offset+3] >> 4) & 0x03
		if afc == 0x02 || afc == 0x03 {
			afLen := int(data[offset+4])
			payloadStart = offset + 5 + afLen
			if payloadStart >= offset+tsPacketSize {
				continue
			}
		}

		payload := data[payloadStart : offset+tsPacketSize]

		switch {
		case pid == pidPAT && pusi && len(payload) > 9:
			if payload[1] != 0x00 {
				continue
			}
			for pos := 9; pos+4 <= len(payload); pos += 4 {
				progNum := (uint16(payload[pos]) << 8) | uint16(payload[pos+1])
				if progNum != 0 {
					pmtPID = (uint16(payload[pos+2]&0x1F) << 8) | uint16(payload[pos+3])
				}
			}

		case pid == pmtPID && pusi && len(payload) > 4:
			pmtLen := (int(payload[2]&0x0F) << 8) | int(payload[3])
			end := 3 + pmtLen
			if end > len(payload) {
				end = len(payload)
			}
			for pos := 13; pos+4 < end; {
				streamType := payload[pos]
				esPID := (uint16(payload[pos+1]&0x1F) << 8) | uint16(payload[pos+2])
				esInfoLen := (int(payload[pos+3]&0x0F) << 8) | int(payload[pos+4])
				_ = esPID

				switch streamType {
				case 0x1B:
					info.VideoCodec = "H264"
				case 0x24:
					info.VideoCodec = "H265"
				case 0x27:
					info.VideoCodec = "AV1"
				case 0x01:
					info.VideoCodec = "MPEG1"
				case 0x02:
					info.VideoCodec = "MPEG2"
				case 0x0F:
					info.AudioCodec = "AAC"
				case 0x03, 0x04:
					info.AudioCodec = "MPEG-Audio"
				case 0x81:
					info.AudioCodec = "AC3"
				case 0x06:
					if info.VideoCodec == "" {
						info.VideoCodec = "PES-Video"
					}
				}
				pos += 5 + esInfoLen
			}
		}
	}

	if !foundSync {
		return nil
	}
	return info
}

func msSince(start time.Time) int64 {
	return time.Since(start).Milliseconds()
}
