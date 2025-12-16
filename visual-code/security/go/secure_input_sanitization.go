// File: /visual-code/security/go/secure_input_sanitization.go
// Platform: Windows/Linux/Ubuntu, Android/iOS (Go ≥ 1.20)
// Language: Go (sanitized, production-grade)

package security

import (
	"errors"
	"html"
	"regexp"
	"strings"
	"unicode"
)

// Hard size caps for user-controlled strings.
const (
	MaxPromptBytes  = 8000
	MaxFilenameBytes = 256
	MaxURLBytes      = 2048
)

// stripControl removes all ASCII control characters.
func stripControl(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if r == '\n' || r == '\r' || r == '\t' {
			b.WriteRune(' ')
			continue
		}
		if r < 0x20 || r == 0x7f {
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

var htmlTagPattern = regexp.MustCompile(`(?is)<(script|style|iframe|object|embed|meta|link)[^>]*>.*?</\s*(script|style|iframe|object|embed)\s*>`)
var angleTagPattern = regexp.MustCompile(`(?is)<[^>]{1,256}>`)

// SanitizePromptForVision normalizes user text for VL/IG prompts:
// - Enforces length.
// - Removes dangerous HTML/script content.
// - Collapses whitespace.
// - Blocks common NSFW tokens.
func SanitizePromptForVision(in string) (string, error) {
	raw := strings.TrimSpace(in)
	if len(raw) == 0 {
		return "", errors.New("empty prompt")
	}
	if len(raw) > MaxPromptBytes {
		raw = raw[:MaxPromptBytes]
	}

	step1 := stripControl(raw)
	step2 := html.UnescapeString(step1)
	step3 := htmlTagPattern.ReplaceAllString(step2, " ")
	step4 := angleTagPattern.ReplaceAllString(step3, " ")
	step5 := collapseWhitespace(step4)

	// Block NSFW markers.
	blockPatterns := []string{
		"nsfw", "nude", "nudity", "porn", "explicit", "sexual", "erotic",
	}
	safe := step5
	lower := strings.ToLower(safe)
	for _, token := range blockPatterns {
		if strings.Contains(lower, token) {
			safe = strings.ReplaceAll(safe, token, "[blocked]")
			safe = strings.ReplaceAll(safe, strings.ToUpper(token), "[blocked]")
		}
	}

	safe = collapseWhitespace(safe)
	if len(safe) == 0 {
		return "", errors.New("prompt sanitized to empty")
	}
	return safe, nil
}

// collapseWhitespace reduces any run of whitespace to a single space.
func collapseWhitespace(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	space := false
	for _, r := range s {
		if unicode.IsSpace(r) {
			if !space {
				b.WriteRune(' ')
				space = true
			}
			continue
		}
		space = false
		b.WriteRune(r)
	}
	return strings.TrimSpace(b.String())
}

// SanitizeFilename enforces a safe ASCII filename without path separators.
func SanitizeFilename(name string) (string, error) {
	raw := strings.TrimSpace(name)
	if len(raw) == 0 {
		return "", errors.New("empty filename")
	}
	if len(raw) > MaxFilenameBytes {
		raw = raw[:MaxFilenameBytes]
	}
	// Remove path separators and non-printable characters.
	var b strings.Builder
	b.Grow(len(raw))
	for _, r := range raw {
		if r == '/' || r == '\\' || r == ':' {
			continue
		}
		if r < 0x20 || r > 0x7E {
			continue
		}
		if r == '"' || r == '\'' || r == '`' {
			continue
		}
		b.WriteRune(r)
	}
	out := strings.TrimSpace(b.String())
	if len(out) == 0 {
		return "", errors.New("filename sanitized to empty")
	}
	return out, nil
}

// SanitizeImageURL enforces a safe HTTP(S) URL with a max length.
func SanitizeImageURL(u string) (string, error) {
	raw := strings.TrimSpace(u)
	if len(raw) == 0 {
		return "", errors.New("empty url")
	}
	if len(raw) > MaxURLBytes {
		return "", errors.New("url too long")
	}
	raw = stripControl(raw)
	raw = collapseWhitespace(raw)
	lower := strings.ToLower(raw)
	if !strings.HasPrefix(lower, "https://") && !strings.HasPrefix(lower, "http://") {
		return "", errors.New("unsupported url scheme")
	}
	// Basic allowlist of characters.
	for _, r := range raw {
		if r < 0x20 || r == 0x7F {
			return "", errors.New("invalid url character")
		}
	}
	return raw, nil
}
