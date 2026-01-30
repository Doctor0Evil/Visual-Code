// Purpose:
// - Wrap window.atob so Vondy UI does not crash on malformed base64.
// - Strips common "data:*;base64," headers and ignores invalid input safely.
// Platform: Any browser (Vondy web client)

/* global window */
(function hardenAtobForVondy() {
  if (typeof window === "undefined") return;

  var originalAtob = window.atob;

  /**
   * Basic sanity check: only allow characters in base64 alphabet and '=' padding.
   * @param {string} s
   * @returns {boolean}
   */
  function looksLikeBase64(s) {
    if (typeof s !== "string" || s.length === 0) return false;
    // Remove common data URL prefix if present
    var cleaned = s.replace(/^data:[\w\/\-\+\.]+;base64,/, "");
    // Length must be multiple of 4 after cleaning
    if (cleaned.length % 4 !== 0) return false;
    // Only A–Z a–z 0–9 + / = are allowed
    return /^[A-Za-z0-9+/=]+$/.test(cleaned);
  }

  /**
   * Vondy-safe atob wrapper.
   * - Strips "data:*;base64," prefix if present.
   * - Returns empty string instead of throwing when input is invalid.
   * - Logs one concise warning for debugging malformed payloads.
   * @param {string} input
   * @returns {string}
   */
  function safeAtob(input) {
    if (typeof input !== "string") {
      console.warn("[VONDY-BASE64] atob called with non-string input, coercing.");
      input = String(input);
    }

    // Strip data URL prefix (common source of this error).[web:2]
    var cleaned = input.replace(/^data:[\w\/\-\+\.]+;base64,/, "");

    if (!looksLikeBase64(cleaned)) {
      console.warn(
        "[VONDY-BASE64] Invalid base64 passed to atob; blocking decode. length=" +
          cleaned.length
      );
      // Prevent DOMException crash; return empty string so callers can guard.
      return "";
    }

    try {
      return originalAtob(cleaned);
    } catch (e) {
      console.warn(
        "[VONDY-BASE64] atob threw DOMException; returning empty string instead.",
        e
      );
      return "";
    }
  }

  Object.defineProperty(window, "atob", {
    configurable: true,
    enumerable: true,
    get: function () {
      return safeAtob;
    },
    set: function (v) {
      console.warn("[VONDY-BASE64] Attempt to overwrite hardened atob ignored.");
    },
  });

  console.log("[VONDY-BASE64] Hardened atob shim installed for Vondy.");
})();
