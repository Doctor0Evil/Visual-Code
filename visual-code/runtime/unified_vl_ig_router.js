// File: /visual-code/runtime/unified_vl_ig_router.js
// Platform: Windows/Linux/Ubuntu, Android/iOS (Node.js ≥ 18 / Deno / Bun compatible)
// Language: Javascript (sanitized, production-grade)

/*
  Visual-Code Unified VL/IG Router

  Purpose:
  - Provide a single, production-ready routing layer for Vision-Language (VL)
    and Image-Generation (IG) models for major AI platforms (Gemini, Copilot,
    Vondy, Grok, and local/open models).
  - Normalize prompts, safety, and quality controls across heterogeneous APIs.
  - Produce deterministic, debuggable request payloads for visual-learning and
    image-generation in chat environments. [web:2][web:3][web:4][web:5][web:7][web:9]

  Features:
  - Platform adapters: "gemini", "copilot", "vondy", "grok", "custom-http".
  - Modes: "vision-analyze", "vision-chat", "image-generate", "image-edit".
  - Unified safety + content filters (sanitized, SFW-only).
  - Quality presets (draft, standard, high, ultra) mapped to each provider.
  - Environment-agnostic HTTP layer with structured debug telemetry.

  NOTE:
  - This file is self-contained and ready to be wired into any chat backend.
  - No Python is used; all structures are explicit and fully filled.
*/

const VC_VERSION = "1.0.0";
const VC_BUILD_ID = "VC-VL-IG-ROUTER-20251216A";

/**
 * Strongly-typed literal sets (via JSDoc) to keep configuration clean.
 */

/**
 * @typedef {"gemini"|"copilot"|"vondy"|"grok"|"custom-http"} VCPlatformId
 */

/**
 * @typedef {"vision-analyze"|"vision-chat"|"image-generate"|"image-edit"} VCModeId
 */

/**
 * @typedef {"draft"|"standard"|"high"|"ultra"} VCQualityPreset
 */

/**
 * @typedef {"safe"|"allow-nsfw"} VCSafetyProfile
 */

/**
 * @typedef {"jpeg"|"png"|"webp"} VCImageFormat
 */

/**
 * @typedef {"16:9"|"9:16"|"1:1"|"4:3"|"3:4"|"21:9"} VCRatio
 */

/**
 * @typedef {"landscape"|"portrait"|"square"|"cinematic"|"story"} VCLayoutHint
 */

/**
 * @typedef {Object} VCUnifiedPrompt
 * @property {string} userText Main user prompt text (sanitized).
 * @property {string[]} systemDirectives Hard system instructions to prepend.
 * @property {string[]} styleHints Natural language style hints.
 * @property {string[]} negativePrompts Things to avoid visually.
 * @property {VCModeId} mode Mode type.
 * @property {string|null} inputImageUrl Optional source image URL.
 * @property {Uint8Array|null} inputImageBytes Optional raw image bytes (optional).
 * @property {Record<string, any>} extraModelHints Provider-specific hints.
 */

/**
 * @typedef {Object} VCQualityConfig
 * @property {VCQualityPreset} preset
 * @property {number} steps
 * @property {number} guidance
 * @property {number} seed
 * @property {number} width
 * @property {number} height
 * @property {VCRatio} ratio
 * @property {VCImageFormat} format
 * @property {VCLayoutHint} layout
 */

/**
 * @typedef {Object} VCSafetyConfig
 * @property {VCSafetyProfile} profile
 * @property {boolean} blockNSFW
 * @property {boolean} blockGraphicViolence
 * @property {boolean} blockHate
 * @property {boolean} blockHarassment
 * @property {boolean} blockSelfHarm
 */

/**
 * @typedef {Object} VCPlatformConfig
 * @property {VCPlatformId} id
 * @property {string} displayName
 * @property {string} endpointUrl
 * @property {string} modelVision
 * @property {string} modelImage
 * @property {Record<string,string>} headers
 * @property {boolean} supportsVisionChat
 * @property {boolean} supportsImageEdit
 * @property {string} providerFamily
 */

/**
 * @typedef {Object} VCDebugTelemetry
 * @property {string} version
 * @property {string} buildId
 * @property {VCPlatformId} platformId
 * @property {VCModeId} mode
 * @property {VCQualityPreset} qualityPreset
 * @property {VCSafetyProfile} safetyProfile
 * @property {string} requestId
 * @property {number} timestampMs
 * @property {Record<string, any>} adapterInfo
 */

/**
 * @typedef {Object} VCUnifiedResponse
 * @property {boolean} ok
 * @property {string|null} textResponse
 * @property {string|null} imageUrl
 * @property {Uint8Array|null} imageBytes
 * @property {string} platformId
 * @property {string} mode
 * @property {VCDebugTelemetry} debug
 */

// ---------------------------------------------------------------------------
//  Core: deterministic ID / time utilities
// ---------------------------------------------------------------------------

/**
 * @returns {number}
 */
function vcNowMs() {
  return Date.now();
}

/**
 * Deterministic-ish request id for logging.
 * @returns {string}
 */
function vcGenerateRequestId() {
  const ts = vcNowMs().toString(16);
  const rand = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
  return `VCREQ-${ts}-${rand}`;
}

// ---------------------------------------------------------------------------
//  Sanitization + normalization
// ---------------------------------------------------------------------------

/**
 * Hard safety sanitizer for all user text.
 * - Strips control characters.
 * - Collapses whitespace.
 * - Enforces SFW visual constraints (no explicit content).
 * This matches typical safety gating used in VL models. [web:2][web:3][web:5]
 * @param {string} input
 * @returns {string}
 */
function vcSanitizeText(input) {
  if (typeof input !== "string") return "";
  let out = input.replace(/[\u0000-\u001F\u007F]/g, " ");
  out = out.replace(/\s+/g, " ").trim();

  const bannedPatterns = [
    /\bnsfw\b/gi,
    /\bnude(s)?\b/gi,
    /\bexplicit\b/gi,
    /\bsexual\b/gi,
    /\bporn\b/gi,
    /\berotic\b/gi
  ];
  for (let i = 0; i < bannedPatterns.length; i++) {
    out = out.replace(bannedPatterns[i], "[blocked]");
  }
  return out;
}

/**
 * @param {string[]} list
 * @returns {string[]}
 */
function vcSanitizeStringList(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const s = vcSanitizeText(String(list[i]));
    if (s.length > 0) out.push(s);
  }
  return out;
}

/**
 * Construct a unified prompt object for downstream adapters.
 * @param {Partial<VCUnifiedPrompt>} raw
 * @returns {VCUnifiedPrompt}
 */
function vcBuildUnifiedPrompt(raw) {
  const mode = raw.mode || "image-generate";
  return {
    userText: vcSanitizeText(raw.userText || ""),
    systemDirectives: vcSanitizeStringList(raw.systemDirectives || [
      "You must produce safe-for-work, non-violent, non-hateful content only.",
      "All outputs must be visually coherent, high-quality, and respectful."
    ]),
    styleHints: vcSanitizeStringList(
      raw.styleHints || ["photorealistic lighting", "sharp focus"]
    ),
    negativePrompts: vcSanitizeStringList(
      raw.negativePrompts || ["blurry", "distorted faces", "text artifacts"]
    ),
    mode: mode,
    inputImageUrl: raw.inputImageUrl || null,
    inputImageBytes: raw.inputImageBytes || null,
    extraModelHints: raw.extraModelHints || {}
  };
}

// ---------------------------------------------------------------------------
//  Quality + Safety configuration
// ---------------------------------------------------------------------------

/**
 * @param {VCQualityPreset} preset
 * @param {VCRatio} ratio
 * @returns {VCQualityConfig}
 */
function vcBuildQualityConfig(preset, ratio) {
  /** @type {VCQualityPreset} */
  const p = preset || "standard";
  /** @type {VCRatio} */
  const r = ratio || "16:9";

  const base = {
    draft: { steps: 12, guidance: 5.0 },
    standard: { steps: 20, guidance: 6.5 },
    high: { steps: 28, guidance: 7.5 },
    ultra: { steps: 36, guidance: 8.0 }
  };

  const dims = {
    "16:9": { w: 1280, h: 720, layout: "landscape" },
    "9:16": { w: 720, h: 1280, layout: "story" },
    "1:1": { w: 1024, h: 1024, layout: "square" },
    "4:3": { w: 1152, h: 864, layout: "landscape" },
    "3:4": { w: 864, h: 1152, layout: "portrait" },
    "21:9": { w: 1728, h: 720, layout: "cinematic" }
  };

  const baseCfg = base[p];
  const dimCfg = dims[r];

  return {
    preset: p,
    steps: baseCfg.steps,
    guidance: baseCfg.guidance,
    seed: Math.floor(Math.random() * 900000000) + 100000000,
    width: dimCfg.w,
    height: dimCfg.h,
    ratio: r,
    format: "png",
    layout: /** @type {VCLayoutHint} */ (dimCfg.layout)
  };
}

/**
 * @param {VCSafetyProfile} profile
 * @returns {VCSafetyConfig}
 */
function vcBuildSafetyConfig(profile) {
  const p = profile || "safe";
  if (p === "safe") {
    return {
      profile: "safe",
      blockNSFW: true,
      blockGraphicViolence: true,
      blockHate: true,
      blockHarassment: true,
      blockSelfHarm: true
    };
  }

  // Even "allow-nsfw" still blocks illegal / extreme content categories.
  return {
    profile: "allow-nsfw",
    blockNSFW: false,
    blockGraphicViolence: true,
    blockHate: true,
    blockHarassment: true,
    blockSelfHarm: true
  };
}

// ---------------------------------------------------------------------------
//  Platform registry
// ---------------------------------------------------------------------------

/** @type {Record<VCPlatformId, VCPlatformConfig>} */
const VC_PLATFORM_REGISTRY = {
  gemini: {
    id: "gemini",
    displayName: "Google Gemini",
    endpointUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    modelVision: "gemini-2.0-flash",
    modelImage: "imagen-3.0-generate-001",
    headers: {
      "Content-Type": "application/json"
    },
    supportsVisionChat: true,
    supportsImageEdit: true,
    providerFamily: "google"
  },
  copilot: {
    id: "copilot",
    displayName: "Microsoft Copilot",
    endpointUrl: "https://api.githubcopilot.com/v1/openai/chat/completions",
    modelVision: "gpt-4.1-mini",
    modelImage: "gpt-image-1",
    headers: {
      "Content-Type": "application/json"
    },
    supportsVisionChat: true,
    supportsImageEdit: true,
    providerFamily: "openai-compatible"
  },
  vondy: {
    id: "vondy",
    displayName: "Vondy",
    endpointUrl: "https://api.vondy.com/v1/image/generate",
    modelVision: "vondy-vision-latest",
    modelImage: "vondy-image-ultra",
    headers: {
      "Content-Type": "application/json"
    },
    supportsVisionChat: false,
    supportsImageEdit: true,
    providerFamily: "vondy"
  },
  grok: {
    id: "grok",
    displayName: "Grok by xAI",
    endpointUrl: "https://api.x.ai/v1/chat/completions",
    modelVision: "grok-2-vision-latest",
    modelImage: "grok-2-image-latest",
    headers: {
      "Content-Type": "application/json"
    },
    supportsVisionChat: true,
    supportsImageEdit: true,
    providerFamily: "openai-compatible"
  },
  "custom-http": {
    id: "custom-http",
    displayName: "Custom HTTP Model",
    endpointUrl: "https://your.custom.vl-ig-endpoint/v1/infer",
    modelVision: "custom-vision",
    modelImage: "custom-image",
    headers: {
      "Content-Type": "application/json"
    },
    supportsVisionChat: true,
    supportsImageEdit: true,
    providerFamily: "generic-json"
  }
};

// ---------------------------------------------------------------------------
//  HTTP helper (runtime-agnostic)
// ---------------------------------------------------------------------------

/**
 * Minimal isomorphic fetch wrapper:
 * - Uses global fetch when available (Node ≥18, modern browsers, Bun, Deno).
 * - Throws descriptive errors.
 * @param {string} url
 * @param {RequestInit} init
 * @returns {Promise<Response>}
 */
async function vcHttpFetch(url, init) {
  if (typeof fetch !== "function") {
    throw new Error(
      "Global fetch is not available in this runtime. Install a fetch polyfill or use Node ≥18."
    );
  }
  return await fetch(url, init);
}

// ---------------------------------------------------------------------------
//  Adapter payload builders
// ---------------------------------------------------------------------------

/**
 * Build OpenAI-compatible messages array for multimodal chat. [web:4][web:7][web:9]
 * @param {VCUnifiedPrompt} up
 * @returns {any[]}
 */
function vcBuildOpenAIStyleMessages(up) {
  const sys = up.systemDirectives.map((t) => ({
    role: "system",
    content: t
  }));

  /** @type {any[]} */
  const userContent = [];

  if (up.userText && up.userText.length > 0) {
    userContent.push({ type: "text", text: up.userText });
  }

  if (up.inputImageUrl) {
    userContent.push({
      type: "image_url",
      image_url: {
        url: up.inputImageUrl,
        detail: "high"
      }
    });
  }

  const user = {
    role: "user",
    content: userContent
  };

  return [...sys, user];
}

/**
 * Build Gemini text+image style request payload. [web:2][web:4][web:7]
 * @param {VCUnifiedPrompt} up
 * @returns {any}
 */
function vcBuildGeminiPrompt(up) {
  const parts = [];

  for (let i = 0; i < up.systemDirectives.length; i++) {
    parts.push({ text: up.systemDirectives[i] });
  }
  if (up.userText.length > 0) {
    parts.push({ text: up.userText });
  }

  if (up.inputImageUrl) {
    parts.push({
      fileData: {
        mimeType: "image/png",
        fileUri: up.inputImageUrl
      }
    });
  }

  return {
    contents: [
      {
        role: "user",
        parts: parts
      }
    ]
  };
}

/**
 * Build generic image-generation payload used for Vondy / Custom HTTP / OpenAI-image-like.
 * @param {VCUnifiedPrompt} up
 * @param {VCQualityConfig} qc
 * @param {VCSafetyConfig} sc
 * @returns {any}
 */
function vcBuildGenericImagePayload(up, qc, sc) {
  return {
    prompt: up.userText,
    system_directives: up.systemDirectives,
    style_hints: up.styleHints,
    negative_prompts: up.negativePrompts,
    width: qc.width,
    height: qc.height,
    steps: qc.steps,
    guidance: qc.guidance,
    seed: qc.seed,
    format: qc.format,
    ratio: qc.ratio,
    layout: qc.layout,
    safety: {
      profile: sc.profile,
      block_nsfw: sc.blockNSFW,
      block_graphic_violence: sc.blockGraphicViolence,
      block_hate: sc.blockHate,
      block_harassment: sc.blockHarassment,
      block_self_harm: sc.blockSelfHarm
    },
    source_image_url: up.inputImageUrl || null,
    mode: up.mode,
    extra: up.extraModelHints || {}
  };
}

// ---------------------------------------------------------------------------
//  Main router
// ---------------------------------------------------------------------------

/**
 * Unified VL/IG call.
 *
 * @param {Object} opts
 * @param {VCPlatformId} opts.platformId
 * @param {VCModeId} opts.mode
 * @param {string} opts.prompt
 * @param {string[]} [opts.systemDirectives]
 * @param {string[]} [opts.styleHints]
 * @param {string[]} [opts.negativePrompts]
 * @param {VCQualityPreset} [opts.qualityPreset]
 * @param {VCRatio} [opts.ratio]
 * @param {VCSafetyProfile} [opts.safetyProfile]
 * @param {string|null} [opts.inputImageUrl]
 * @param {Uint8Array|null} [opts.inputImageBytes]
 * @param {Record<string, any>} [opts.extraModelHints]
 * @param {Record<string, string>} [opts.apiKeys] - { google, copilot, vondy, grok, custom }
 * @returns {Promise<VCUnifiedResponse>}
 */
async function vcCallVLIG(opts) {
  const platformCfg = VC_PLATFORM_REGISTRY[opts.platformId];
  if (!platformCfg) {
    throw new Error(`Unknown platformId: ${opts.platformId}`);
  }

  const up = vcBuildUnifiedPrompt({
    userText: opts.prompt,
    systemDirectives: opts.systemDirectives,
    styleHints: opts.styleHints,
    negativePrompts: opts.negativePrompts,
    mode: opts.mode,
    inputImageUrl: opts.inputImageUrl || null,
    inputImageBytes: opts.inputImageBytes || null,
    extraModelHints: opts.extraModelHints || {}
  });

  const qc = vcBuildQualityConfig(opts.qualityPreset || "standard", opts.ratio || "1:1");
  const sc = vcBuildSafetyConfig(opts.safetyProfile || "safe");
  const requestId = vcGenerateRequestId();
  const ts = vcNowMs();

  /** @type {VCDebugTelemetry} */
  const debugBase = {
    version: VC_VERSION,
    buildId: VC_BUILD_ID,
    platformId: platformCfg.id,
    mode: opts.mode,
    qualityPreset: qc.preset,
    safetyProfile: sc.profile,
    requestId: requestId,
    timestampMs: ts,
    adapterInfo: {
      endpointUrl: platformCfg.endpointUrl,
      modelVision: platformCfg.modelVision,
      modelImage: platformCfg.modelImage,
      providerFamily: platformCfg.providerFamily
    }
  };

  /** @type {Record<string,string>} */
  const headers = Object.assign({}, platformCfg.headers);

  // Attach API key based on platform (not logging values for safety).
  if (opts.platformId === "gemini" && opts.apiKeys && opts.apiKeys.google) {
    // Gemini uses ?key= query parameter, not header; handled later.
  } else if (opts.platformId === "copilot" && opts.apiKeys && opts.apiKeys.copilot) {
    headers["Authorization"] = `Bearer ${opts.apiKeys.copilot}`;
  } else if (opts.platformId === "vondy" && opts.apiKeys && opts.apiKeys.vondy) {
    headers["Authorization"] = `Bearer ${opts.apiKeys.vondy}`;
  } else if (opts.platformId === "grok" && opts.apiKeys && opts.apiKeys.grok) {
    headers["Authorization"] = `Bearer ${opts.apiKeys.grok}`;
  } else if (opts.platformId === "custom-http" && opts.apiKeys && opts.apiKeys.custom) {
    headers["Authorization"] = `Bearer ${opts.apiKeys.custom}`;
  }

  let url = platformCfg.endpointUrl;
  /** @type {any} */
  let payload = null;

  if (opts.platformId === "gemini") {
    if (opts.mode === "vision-analyze" || opts.mode === "vision-chat") {
      payload = vcBuildGeminiPrompt(up);
      const modelName = platformCfg.modelVision;
      url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        modelName
      )}:generateContent?key=${encodeURIComponent(opts.apiKeys?.google || "")}`;
    } else {
      payload = vcBuildGenericImagePayload(up, qc, sc);
      const modelName = platformCfg.modelImage;
      url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        modelName
      )}:generateContent?key=${encodeURIComponent(opts.apiKeys?.google || "")}`;
    }
  } else if (platformCfg.providerFamily === "openai-compatible" && opts.mode !== "image-generate") {
    payload = {
      model: platformCfg.modelVision,
      messages: vcBuildOpenAIStyleMessages(up),
      temperature: 0.4,
      max_tokens: 512,
      seed: qc.seed,
      metadata: {
        visual_code_request_id: requestId
      }
    };
  } else if (platformCfg.providerFamily === "openai-compatible" && opts.mode === "image-generate") {
    payload = vcBuildGenericImagePayload(up, qc, sc);
  } else if (platformCfg.providerFamily === "vondy") {
    payload = vcBuildGenericImagePayload(up, qc, sc);
  } else {
    // generic-json / custom-http
    payload = {
      request_id: requestId,
      mode: up.mode,
      text: up.userText,
      system_directives: up.systemDirectives,
      style_hints: up.styleHints,
      negative_prompts: up.negativePrompts,
      quality: qc,
      safety: sc,
      input_image_url: up.inputImageUrl,
      extra: up.extraModelHints || {}
    };
  }

  const res = await vcHttpFetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  const textBody = await res.text();
  let json = null;
  try {
    json = textBody.length > 0 ? JSON.parse(textBody) : {};
  } catch (e) {
    json = { parse_error: String(e), raw: textBody };
  }

  /** @type {VCUnifiedResponse} */
  const response = {
    ok: res.ok,
    textResponse: null,
    imageUrl: null,
    imageBytes: null,
    platformId: platformCfg.id,
    mode: opts.mode,
    debug: Object.assign({}, debugBase, {
      adapterInfo: Object.assign({}, debugBase.adapterInfo, {
        httpStatus: res.status,
        responseSnippet:
          typeof textBody === "string"
            ? textBody.slice(0, 512)
            : "[non-string response body]"
      })
    })
  };

  // Provider-specific response normalization.
  if (!res.ok) {
    response.textResponse = `Provider error (${res.status}): ${textBody}`;
    return response;
  }

  if (opts.mode === "vision-analyze" || opts.mode === "vision-chat") {
    // Gemini content
    if (opts.platformId === "gemini" && json && Array.isArray(json.candidates)) {
      const first = json.candidates[0];
      if (first && first.content && Array.isArray(first.content.parts)) {
        const texts = [];
        for (let i = 0; i < first.content.parts.length; i++) {
          const part = first.content.parts[i];
          if (typeof part.text === "string") texts.push(part.text);
        }
        response.textResponse = texts.join("\n").trim();
      }
    }
    // OpenAI-style (Copilot/Grok)
    else if (
      (opts.platformId === "copilot" || opts.platformId === "grok") &&
      json &&
      Array.isArray(json.choices)
    ) {
      const first = json.choices[0];
      if (first && first.message && typeof first.message.content === "string") {
        response.textResponse = first.message.content.trim();
      }
    }
    // Custom generic
    else if (opts.platformId === "custom-http") {
      if (typeof json.text === "string") {
        response.textResponse = json.text.trim();
      } else if (typeof json.output === "string") {
        response.textResponse = json.output.trim();
      }
    }
  } else {
    // Image generation / edit
    if (opts.platformId === "gemini") {
      if (json && Array.isArray(json.candidates)) {
        const first = json.candidates[0];
        if (first && first.content && Array.isArray(first.content.parts)) {
          for (let i = 0; i < first.content.parts.length; i++) {
            const part = first.content.parts[i];
            if (part.inlineData && part.inlineData.data) {
              const b64 = part.inlineData.data;
              response.imageBytes = vcBase64ToUint8Array(b64);
              break;
            }
          }
        }
      }
    } else if (platformCfg.providerFamily === "openai-compatible") {
      if (json && Array.isArray(json.data)) {
        const first = json.data[0];
        if (first && typeof first.url === "string") {
          response.imageUrl = first.url;
        } else if (first && typeof first.b64_json === "string") {
          response.imageBytes = vcBase64ToUint8Array(first.b64_json);
        }
      }
    } else if (platformCfg.providerFamily === "vondy") {
      if (json && typeof json.image_url === "string") {
        response.imageUrl = json.image_url;
      } else if (json && json.data && typeof json.data.image === "string") {
        response.imageBytes = vcBase64ToUint8Array(json.data.image);
      }
    } else if (platformCfg.providerFamily === "generic-json") {
      if (json && typeof json.image_url === "string") {
        response.imageUrl = json.image_url;
      }
    }
  }

  return response;
}

// ---------------------------------------------------------------------------
//  Base64 → Uint8Array helper
// ---------------------------------------------------------------------------

/**
 * Convert base64 string to Uint8Array without using Buffer directly,
 * to remain portable across runtimes.
 * @param {string} b64
 * @returns {Uint8Array}
 */
function vcBase64ToUint8Array(b64) {
  if (typeof atob === "function") {
    const binary = atob(b64);
    const len = binary.length;
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      out[i] = binary.charCodeAt(i) & 0xff;
    }
    return out;
  }
  // Node.js fallback:
  // eslint-disable-next-line no-undef
  const buf = Buffer.from(b64, "base64");
  const out = new Uint8Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i];
  }
  return out;
}

// ---------------------------------------------------------------------------
//  Public export
// ---------------------------------------------------------------------------

/**
 * Visual-Code: exported API
 * - vcCallVLIG: main router function.
 * - VC_PLATFORM_REGISTRY: platform metadata.
 * - Utility builders for advanced users.
 */
const VisualCodeVLIG = {
  vcCallVLIG,
  vcBuildUnifiedPrompt,
  vcBuildQualityConfig,
  vcBuildSafetyConfig,
  vcSanitizeText,
  VC_PLATFORM_REGISTRY,
  VC_VERSION,
  VC_BUILD_ID
};

// Node.js / CommonJS
// eslint-disable-next-line no-undef
if (typeof module !== "undefined" && module.exports) {
  // eslint-disable-next-line no-undef
  module.exports = VisualCodeVLIG;
}

// Browser / ESM
// eslint-disable-next-line no-undef
if (typeof window !== "undefined") {
  // eslint-disable-next-line no-undef
  window.VisualCodeVLIG = VisualCodeVLIG;
}
