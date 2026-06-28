package main

import (
	"testing"
)

func makeTSPacket(pid uint16, pusi bool, payload []byte) []byte {
	pkt := make([]byte, 188)
	pkt[0] = syncByte
	pkt[1] = byte(pid >> 8) & 0x1F
	if pusi {
		pkt[1] |= 0x40
	}
	pkt[2] = byte(pid & 0xFF)
	pkt[3] = 0x10 // no adaptation, payload present
	copy(pkt[4:], payload)
	return pkt
}

func makePATSection(programNum uint16, pmtPID uint16) []byte {
	// Standard PAT section (without pointer_field - it's added by TS header)
	// Section starts after pointer_field in payload
	sec := []byte{
		0x00,                    // pointer_field
		0x00,                    // table_id = PAT
		0xB0, 0x0D,              // section_syntax_indicator=1 + section_length=13
		0x00, 0x01,              // transport_stream_id=1
		0xC1,                    // version=0, current_next=1
		0x00,                    // section_number
		0x00,                    // last_section_number
		byte(programNum >> 8), byte(programNum & 0xFF), // program_number
		byte(0xE0 | (pmtPID>>8)&0x0F), byte(pmtPID & 0xFF), // reserved(3) + PMT PID(13)
		// CRC (4 bytes, not validated by parser)
		0x00, 0x00, 0x00, 0x00,
	}
	return sec
}

func makePMTSection(programNum uint16, streamType byte, esPID uint16) []byte {
	// Standard PMT section (section_length = 15 for program_info + ES info + CRC)
	sec := []byte{
		0x00,                    // pointer_field
		0x02,                    // table_id = PMT
		0xB0, 0x0F,              // section_length = 15 (5 ES + 4 CRC = 9, with 6 header = 15)
		byte(programNum >> 8), byte(programNum & 0xFF),
		0xC1,                    // version=0, current_next=1
		0x00,                    // section_number
		0x00,                    // last_section_number
		0xE0, 0x00,              // PCR_PID = 0 (reserved=111, PID=00000000000)
		0xF0, 0x00,              // program_info_length = 0
		streamType,              // stream_type
		byte(0xE0 | (esPID>>8)&0x0F), byte(esPID & 0xFF), // reserved(7) + ES PID(13)
		0xF0, 0x00,              // ES_info_length = 0
		// CRC (not validated)
		0x00, 0x00, 0x00, 0x00,
	}
	return sec
}

func TestParseMPEGTS_TooShort(t *testing.T) {
	result := parseMPEGTS([]byte{0x47, 0x00, 0x00})
	if result != nil {
		t.Error("expected nil for data < 188 bytes")
	}
}

func TestParseMPEGTS_NoSync(t *testing.T) {
	data := make([]byte, 188)
	data[0] = 0x00
	result := parseMPEGTS(data)
	if result != nil {
		t.Error("expected nil for no sync byte")
	}
}

func TestParseMPEGTS_SyncOnly(t *testing.T) {
	data := makeTSPacket(0x1FFF, false, make([]byte, 184))
	result := parseMPEGTS(data)
	if result == nil {
		t.Fatal("expected non-nil result for sync-only packet")
	}
}

func TestParseMPEGTS_H264(t *testing.T) {
	pmtPID := uint16(0x0100)
	patPayload := makePATSection(1, pmtPID)
	patPkt := makeTSPacket(pidPAT, true, patPayload)

	pmtPayload := makePMTSection(1, 0x1B, 0x0101)
	pmtPkt := makeTSPacket(pmtPID, true, pmtPayload)

	data := append(patPkt, pmtPkt...)
	result := parseMPEGTS(data)
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.VideoCodec != "H264" {
		t.Errorf("expected VideoCodec=H264, got %s", result.VideoCodec)
	}
}

func TestParseMPEGTS_AAC(t *testing.T) {
	pmtPID := uint16(0x0100)
	patPayload := makePATSection(1, pmtPID)
	patPkt := makeTSPacket(pidPAT, true, patPayload)

	pmtPayload := makePMTSection(1, 0x0F, 0x0101)
	pmtPkt := makeTSPacket(pmtPID, true, pmtPayload)

	data := append(patPkt, pmtPkt...)
	result := parseMPEGTS(data)
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.AudioCodec != "AAC" {
		t.Errorf("expected AudioCodec=AAC, got %s", result.AudioCodec)
	}
}

func TestParseMPEGTS_H265(t *testing.T) {
	pmtPID := uint16(0x0100)
	patPayload := makePATSection(1, pmtPID)
	patPkt := makeTSPacket(pidPAT, true, patPayload)

	pmtPayload := makePMTSection(1, 0x24, 0x0101)
	pmtPkt := makeTSPacket(pmtPID, true, pmtPayload)

	data := append(patPkt, pmtPkt...)
	result := parseMPEGTS(data)
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.VideoCodec != "H265" {
		t.Errorf("expected VideoCodec=H265, got %s", result.VideoCodec)
	}
}

func TestIsVideoContentType(t *testing.T) {
	tests := []struct {
		ct   string
		want bool
	}{
		{"video/mp2t", true},
		{"video/mpeg", true},
		{"application/octet-stream", true},
		{"application/x-mpegurl", true},
		{"text/html", false},
		{"text/plain", false},
		{"", false},
	}
	for _, tt := range tests {
		got := isVideoContentType(tt.ct)
		if got != tt.want {
			t.Errorf("isVideoContentType(%q) = %v, want %v", tt.ct, got, tt.want)
		}
	}
}

func TestResolveSegmentURL(t *testing.T) {
	data := []byte("#EXTM3U\n#EXTINF:-1,Test\nhttp://example.com/seg.ts\n")
	url := resolveSegmentURL(data, "http://example.com/play.m3u8")
	if url != "http://example.com/seg.ts" {
		t.Errorf("expected segment URL, got %q", url)
	}
}

func TestResolveSegmentURL_Relative(t *testing.T) {
	data := []byte("#EXTM3U\n#EXTINF:-1,Test\nseg.ts\n")
	url := resolveSegmentURL(data, "http://example.com/dir/play.m3u8")
	if url != "http://example.com/dir/seg.ts" {
		t.Errorf("expected resolved relative URL, got %q", url)
	}
}

func TestResolveSegmentURL_NoMatch(t *testing.T) {
	data := []byte("#EXTM3U\n#EXT-X-ENDLIST\n")
	url := resolveSegmentURL(data, "http://example.com/play.m3u8")
	if url != "" {
		t.Errorf("expected empty for no segment, got %q", url)
	}
}
