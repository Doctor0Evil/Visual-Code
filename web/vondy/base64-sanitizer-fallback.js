// File: web/vondy/base64-sanitizer-fallback.js
// Platform: Windows/Linux/Ubuntu, Android/iOS (modern browsers, WebView)
// Language: JavaScript (sanitized, production-grade)
//
// Purpose
// - Wrap window.atob with a hardened decoder that:
//   - Sanitizes incoming Base64 strings
//   - Catches InvalidCharacterError
//   - Emits structured debug info instead of crashing the app
// - Drop‑in defensive shim you can inject on pages like vondy.com via:
//   - Browser extensions / userscripts
//   - In-app WebView preload
//   - Your own VL/IG frontends that talk to Vondy’s APIs
//
// NOTE: This does NOT hack or modify Vondy’s backend; it only hardens decoding
// on the client so a bad token/payload does not break the whole UI. [web:1]

(function hardenAtobForVLIG() {
  "use strict";

  if (typeof window === "undefined") {
    return;
  }

  /** @typedef {"ok"|"sanitized"|"empty"|"invalid"} VcB64Status */

  /**
   * Structured result from sanitization.
   * @typedef {Object} VcB64SanitizeResult
   * @property {string} value       Final Base64 candidate string.
   * @property {VcB64Status} status Classification of the transformation.
   * @property {string[]} changes   Human-readable notes describing what changed.
   */

  /**
   * Simple ring buffer for last N decode attempts for debugging.
   * This avoids console spam while still letting devtools introspect why
   * decodes failed without crashing the app. [web:1]
   * @type {{ ts: number, original: any, sanitized: string, status: VcB64Status, ok: boolean, error: string | null }[]}
   */
  var VC_B64_DEBUG_LOG = [];
  var VC_B64_DEBUG_LIMIT = 32;

  /**
   * Append an entry to the ring buffer.
   * @param {any} original
   * @param {string} sanitized
   * @param {VcB64Status} status
   * @param {boolean} ok
   * @param {string|null} error
   */
  function vcB64DebugPush(original, sanitized, status, ok, error) {
    VC_B64_DEBUG_LOG.push({
      ts: Date.now(),
      original: original,
      sanitized: sanitized,
      status: status,
      ok: ok,
      error: error
    });
    if (VC_B64_DEBUG_LOG.length > VC_B64_DEBUG_LIMIT) {
      VC_B64_DEBUG_LOG.shift();
    }
  }

  /**
   * Expose debug log for manual inspection in devtools.
   */
  if (!window.VisualCodeBase64Debug) {
    window.VisualCodeBase64Debug = {
      getLog: function getLog() {
        return VC_B64_DEBUG_LOG.slice();
      },
      clear: function clear() {
        VC_B64_DEBUG_LOG.length = 0;
      }
    };
  }

  /**
   * Fast check whether string is composed only of canonical Base64 charset
   * plus up to two '=' padding chars at the end. [web:1][web:2]
   * @param {string} s
   * @returns {boolean}
   */
  function vcIsCleanBase64(s) {
    // Empty is not valid for real payloads.
    if (!s || typeof s !== "string") return false;
    // Strip whitespace to keep this check strict.
    var trimmed = s.replace(/[\r\n\s]/g, "");
    // Basic pattern: groups of 4, characters A–Z a–z 0–9 + /, with optional ==/=
    // at the end. This is intentionally strict. [web:1]
    return /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed);
  }

  /**
   * Sanitize input into a Base64 candidate string.
   * - Accepts values that may include:
   *   - data:<mime>;base64, prefix
   *   - Escaped JSON strings with backslashes
   *   - Line breaks every 76 chars
   * - Returns a canonical form or marks as invalid. [web:1][web:2][web:3]
   * @param {any} raw
   * @returns {VcB64SanitizeResult}
   */
  function vcSanitizeBase64Input(raw) {
    /** @type {string[]} */
    var notes = [];

    if (raw == null) {
      notes.push("input is null/undefined");
      return { value: "", status: "empty", changes: notes };
    }

    var s = String(raw);
    if (!s) {
      notes.push("input string is empty");
      return { value: "", status: "empty", changes: notes };
    }

    var v = s;

    // Remove data:...;base64, prefix if present. [web:1][web:2]
    if (/^data:[^;]+;base64,/i.test(v)) {
      v = v.replace(/^data:[^;]+;base64,/i, "");
      notes.push("stripped data:...;base64, header");
    }

    // Remove any prefix before the first comma if it looks like header. [web:1]
    if (v.indexOf(",") !== -1 && !vcIsCleanBase64(v)) {
      var parts = v.split(",");
      var last = parts[parts.length - 1];
      notes.push("removed leading comma-prefixed header");
      v = last;
    }

    // Remove whitespace and backslashes (common in JSON-escaped payloads). [web:1][web:3]
    var cleaned = v.replace(/[\r\n\t\f\v\s\\]/g, "");
    if (cleaned !== v) {
      notes.push("stripped whitespace/backslashes");
      v = cleaned;
    }

    // If we still have obvious invalid characters, mark as invalid. [web:1][web:2]
    if (!/^[A-Za-z0-9+/=]+$/.test(v)) {
      notes.push("contains non-Base64 characters after sanitization");
      return { value: v, status: "invalid", changes: notes };
    }

    // Normalize padding length: 0,1,2 '=' allowed; anything else trimmed and fixed. [web:1]
    var core = v.replace(/=+$/, "");
    var padLen = (4 - (core.length % 4)) % 4;
    if (padLen === 1) {
      // 4n+1 cannot be valid; caller will likely fail, mark invalid. [web:1]
      notes.push("length mod 4 == 1, invalid Base64 length");
      return { value: v, status: "invalid", changes: notes };
    }
    if (padLen > 0) {
      v = core + (padLen === 2 ? "==" : "=");
      notes.push("normalized padding to length " + padLen);
    }

    var status = notes.length === 0 ? "ok" : "sanitized";
    return { value: v, status: status, changes: notes };
  }

  // If atob is not present, do nothing – this shim assumes a DOM-like environment. [web:4]
  if (typeof window.atob !== "function") {
    return;
  }

  var nativeAtob = window.atob;

  /**
   * Hardened atob wrapper.
   * - Sanitizes input.
   * - Catches InvalidCharacterError.
   * - Does NOT throw by default; returns empty string on unrecoverable input to
   *   keep the UI responsive. [web:1][web:2][web:3]
   * - Records telemetry in VisualCodeBase64Debug.
   *
   * If you want strict behavior for your own app, you can call
   * window.VisualCodeSafeAtobStrict instead. [web:1][web:2]
   *
   * @param {string} input
   * @returns {string}
   */
  function vcSafeAtob(input) {
    var sanitizeResult = vcSanitizeBase64Input(input);
    var b64 = sanitizeResult.value;

    if (sanitizeResult.status === "empty") {
      vcB64DebugPush(input, b64, sanitizeResult.status, false, "empty-input");
      return "";
    }
    if (sanitizeResult.status === "invalid") {
      vcB64DebugPush(input, b64, sanitizeResult.status, false, "invalid-after-sanitize");
      return "";
    }

    try {
      var decoded = nativeAtob(b64);
      vcB64DebugPush(input, b64, sanitizeResult.status, true, null);
      return decoded;
    } catch (e) {
      // Specifically handle InvalidCharacterError but do not crash SPA. [web:1][web:2][web:3]
      var msg = (e && e.message) ? String(e.message) : "decode-failed";
      vcB64DebugPush(input, b64, sanitizeResult.status, false, msg);

      // Optional: soft-log once per session to console for developers.
      if (!window.__vcB64Warned) {
        window.__vcB64Warned = true;
        if (typeof console !== "undefined" && console.warn) {
          console.warn(
            "[Visual-Code] Base64 decode failed; UI was kept alive. " +
            "Inspect window.VisualCodeBase64Debug.getLog() for details."
          );
        }
      }
      return "";
    }
  }

  /**
   * Strict variant that throws on failure but still runs through sanitizer.
   * Use this in your own VL/IG frontends when you want explicit error handling. [web:1][web:2]
   * @param {string} input
   * @returns {string}
   */
  function vcSafeAtobStrict(input) {
    var sanitizeResult = vcSanitizeBase64Input(input);
    var b64 = sanitizeResult.value;

    if (sanitizeResult.status === "empty") {
      vcB64DebugPush(input, b64, sanitizeResult.status, false, "empty-input");
      throw new Error("vcSafeAtobStrict: empty Base64 input");
    }
    if (sanitizeResult.status === "invalid") {
      vcB64DebugPush(input, b64, sanitizeResult.status, false, "invalid-after-sanitize");
      throw new Error("vcSafeAtobStrict: invalid Base64 after sanitization");
    }

    try {
      var decoded = nativeAtob(b64);
      vcB64DebugPush(input, b64, sanitizeResult.status, true, null);
      return decoded;
    } catch (e) {
      var msg = (e && e.message) ? String(e.message) : "decode-failed";
      vcB64DebugPush(input, b64, sanitizeResult.status, false, msg);
      throw e;
    }
  }

  // Non-destructive export: keep nativeAtob as well.
  if (!window.VisualCodeSafeAtob) {
    window.VisualCodeSafeAtob = vcSafeAtob;
  }
  if (!window.VisualCodeSafeAtobStrict) {
    window.VisualCodeSafeAtobStrict = vcSafeAtobStrict;
  }

  // Optional: override global atob to make hostile/brittle code safer.
  // If you embed this in a controlled WebView (e.g., your own VL/IG shell),
  // uncomment the next line so misbehaving scripts cannot crash the UI with
  // invalid Base64. For external sites like vondy.com from a user script,
  // this override is exactly what mitigates the InvalidCharacterError. [web:1][web:2]
  //
  // window.atob = vcSafeAtob;

}());
