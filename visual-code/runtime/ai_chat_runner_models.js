// File: /visual-code/runtime/ai_chat_runner_models.js
// Platform: Windows/Linux/Ubuntu, Android/iOS (Node ≥18 / Deno / Bun)
// Language: Javascript (sanitized, production-grade)

/*
  AI-Chat Specific Runner Functions & Models

  This module defines AI‑chat oriented “runner-functions” and small models that
  sit on top of Visual-Code’s VL/IG router to:
    - Orchestrate multimodal runs (text+image) for chat.
    - Track eco/latency budgets per request.
    - Learn per-user visual style profiles from accumulated data.
    - Provide safe negative-prompts and prompt-shaping for image replies.

  It assumes you already have:
    - unified_vl_ig_router.js → VisualCodeVLIG.vcCallVLIG etc. [file:22]
*/

"use strict";

/**
 * @typedef {import("./unified_vl_ig_router.js").VCModeId} VCModeId
 * @typedef {import("./unified_vl_ig_router.js").VCQualityPreset} VCQualityPreset
 * @typedef {import("./unified_vl_ig_router.js").VCSafetyProfile} VCSafetyProfile
 */

/**
 * AI‑chat task identifiers for runner-functions.
 * - "chat-vision": answer about an image.
 * - "chat-image-reply": generate an image as reply.
 * - "chat-explain-image": explain your own generated image.
 */
const AC_TASK_IDS = /** @type {const} */ ([
  "chat-vision",
  "chat-image-reply",
  "chat-explain-image"
]);

/**
 * @typedef {"chat-vision"|"chat-image-reply"|"chat-explain-image"} AITaskId
 */

/**
 * Per-user eco & latency budget for chat runs.
 */
class AIEcoBudget {
  /**
   * @param {string} userId
   * @param {number} maxMsPerRun
   * @param {number} maxTokensPerRun
   * @param {number} maxImagesPerDay
   */
  constructor(userId, maxMsPerRun, maxTokensPerRun, maxImagesPerDay) {
    this.userId = String(userId);
    this.maxMsPerRun = maxMsPerRun;
    this.maxTokensPerRun = maxTokensPerRun;
    this.maxImagesPerDay = maxImagesPerDay;
    this._imagesToday = 0;
    this._lastResetDate = this._todayKey();
  }

  _todayKey() {
    const d = new Date();
    return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
  }

  resetIfNewDay() {
    const key = this._todayKey();
    if (key !== this._lastResetDate) {
      this._lastResetDate = key;
      this._imagesToday = 0;
    }
  }

  /**
   * @param {number} estimatedTokens
   * @param {boolean} wantsImage
   * @returns {{allowed: boolean; reason: string|null}}
   */
  canRun(estimatedTokens, wantsImage) {
    this.resetIfNewDay();
    if (estimatedTokens > this.maxTokensPerRun) {
      return { allowed: false, reason: "token_limit_exceeded" };
    }
    if (wantsImage && this._imagesToday >= this.maxImagesPerDay) {
      return { allowed: false, reason: "image_quota_exceeded" };
    }
    return { allowed: true, reason: null };
  }

  markRunComplete(wasImage) {
    this.resetIfNewDay();
    if (wasImage) this._imagesToday += 1;
  }
}

/**
 * Sanitized, reusable negative prompts for AI-chat images.
 * These are enforced for SFW-only output across providers. [file:22]
 */
const AI_CHAT_NEGATIVE_PROMPTS = Object.freeze([
  "nudity",
  "sexual content",
  "graphic violence",
  "blood splatter",
  "gore",
  "disfigurement",
  "hate symbols",
  "harassment",
  "self harm",
  "realistic weapons focus",
  "disturbing imagery",
  "illegal content",
  "child endangerment",
  "unsafe medical advice text"
]);

/**
 * Simple per-user visual style profile learned from past prompts.
 */
class AIStyleProfile {
  /**
   * @param {string} userId
   */
  constructor(userId) {
    this.userId = String(userId);
    /** @type {string[]} */
    this.preferredStyles = [];
    /** @type {string[]} */
    this.preferredColorPalettes = [];
    /** @type {string[]} */
    this.preferredLayouts = [];
  }

  /**
   * Update profile from a successful generation log.
   * @param {{styleHints:string[]; paletteHints:string[]; layoutHint:string|null}} info
   */
  learnFromRun(info) {
    for (const s of info.styleHints || []) {
      if (s && !this.preferredStyles.includes(s)) {
        this.preferredStyles.push(s);
      }
    }
    for (const p of info.paletteHints || []) {
      if (p && !this.preferredColorPalettes.includes(p)) {
        this.preferredColorPalettes.push(p);
      }
    }
    if (info.layoutHint && !this.preferredLayouts.includes(info.layoutHint)) {
      this.preferredLayouts.push(info.layoutHint);
    }
  }

  /**
   * Inject style into a new request.
   * @param {string[]} styleHints
   * @returns {string[]}
   */
  applyTo(styleHints) {
    const merged = [...styleHints];
    for (const s of this.preferredStyles) {
      if (!merged.includes(s)) merged.push(s);
    }
    return merged;
  }
}

/**
 * Utility: estimate tokens from text for eco-budgets.
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  if (!text) return 0;
  const words = text.trim().split(/\s+/g);
  const approxTokens = Math.round(words.length * 1.3);
  return approxTokens;
}

/**
 * AI-chat runner options.
 * @typedef {Object} AIRunnerOptions
 * @property {string} userId
 * @property {AITaskId} taskId
 * @property {string} platformId
 * @property {string} userText
 * @property {string[]} systemDirectives
 * @property {string[]} styleHints
 * @property {("standard"|"high"|"ultra"|"draft")} quality
 * @property {boolean} wantsImage
 * @property {string|null} inputImageUrl
 * @property {Uint8Array|null} inputImageBytes
 */

/**
 * @typedef {Object} AIRunnerResult
 * @property {boolean} ok
 * @property {string|null} text
 * @property {string|null} imageUrl
 * @property {Uint8Array|null} imageBytes
 * @property {string|null} blockedReason
 * @property {number} elapsedMs
 * @property {number} estimatedTokens
 */

/**
 * Main AI‑chat runner function.
 * Wraps VisualCodeVLIG.vcCallVLIG with eco + style logic. [file:22]
 *
 * @param {AIRunnerOptions} opts
 * @param {AIEcoBudget} ecoBudget
 * @param {AIStyleProfile} styleProfile
 * @param {typeof import("./unified_vl_ig_router.js")} VisualCodeVLIG
 * @returns {Promise<AIRunnerResult>}
 */
async function aiChatRunner(opts, ecoBudget, styleProfile, VisualCodeVLIG) {
  const estTokens = estimateTokens(opts.userText);
  const can = ecoBudget.canRun(estTokens, opts.wantsImage);
  if (!can.allowed) {
    return {
      ok: false,
      text: null,
      imageUrl: null,
      imageBytes: null,
      blockedReason: can.reason,
      elapsedMs: 0,
      estimatedTokens: estTokens
    };
  }

  /** @type {VCModeId} */
  let mode = "vision-analyze";
  if (opts.taskId === "chat-vision") {
    mode = "vision-chat";
  } else if (opts.taskId === "chat-image-reply") {
    mode = "image-generate";
  } else if (opts.taskId === "chat-explain-image") {
    mode = "vision-analyze";
  }

  /** @type {VCQualityPreset} */
  const qPreset = opts.quality === "draft"
    ? "draft"
    : opts.quality === "ultra"
    ? "ultra"
    : opts.quality === "high"
    ? "high"
    : "standard";

  /** @type {VCSafetyProfile} */
  const safetyProfile = "safe";

  const sanitizedUserText = VisualCodeVLIG.vcSanitizeText(opts.userText);
  const styleApplied = styleProfile.applyTo(opts.styleHints);

  const unifiedPrompt = VisualCodeVLIG.vcBuildUnifiedPrompt({
    userText: sanitizedUserText,
    systemDirectives: opts.systemDirectives,
    styleHints: styleApplied,
    negativePrompts: AI_CHAT_NEGATIVE_PROMPTS,
    mode,
    inputImageUrl: opts.inputImageUrl || null,
    inputImageBytes: opts.inputImageBytes || null,
    extraModelHints: {}
  });

  const qCfg = VisualCodeVLIG.vcBuildQualityConfig({
    preset: qPreset,
    ratio: "1:1",
    layout: "square",
    format: "png"
  });

  const sCfg = VisualCodeVLIG.vcBuildSafetyConfig({
    profile: safetyProfile
  });

  const t0 = Date.now();
  const unifiedResponse = await VisualCodeVLIG.vcCallVLIG({
    platformId: opts.platformId,
    mode,
    unifiedPrompt,
    qualityConfig: qCfg,
    safetyConfig: sCfg,
    timeoutMs: ecoBudget.maxMsPerRun
  });
  const t1 = Date.now();

  if (unifiedResponse.ok && opts.wantsImage && unifiedResponse.imageUrl === null && unifiedResponse.imageBytes === null) {
    return {
      ok: false,
      text: unifiedResponse.textResponse || null,
      imageUrl: null,
      imageBytes: null,
      blockedReason: "no_image_returned",
      elapsedMs: t1 - t0,
      estimatedTokens: estTokens
    };
  }

  if (unifiedResponse.ok) {
    if (opts.wantsImage) {
      styleProfile.learnFromRun({
        styleHints: styleApplied,
        paletteHints: [],
        layoutHint: qCfg.layout
      });
    }
    ecoBudget.markRunComplete(opts.wantsImage);
  }

  return {
    ok: unifiedResponse.ok,
    text: unifiedResponse.textResponse,
    imageUrl: unifiedResponse.imageUrl,
    imageBytes: unifiedResponse.imageBytes,
    blockedReason: unifiedResponse.ok ? null : "provider_error",
    elapsedMs: t1 - t0,
    estimatedTokens: estTokens
  };
}

/**
 * Minimal in-memory registry for per-user runner models
 * (eco budget + style profile).
 */
class AIRunnerRegistry {
  constructor() {
    /** @type {Map<string, {eco:AIEcoBudget; style:AIStyleProfile}>} */
    this._map = new Map();
  }

  /**
   * @param {string} userId
   * @returns {{eco:AIEcoBudget; style:AIStyleProfile}}
   */
  getOrCreate(userId) {
    const key = String(userId);
    const existing = this._map.get(key);
    if (existing) return existing;
    const eco = new AIEcoBudget(key, 180000, 2048, 24);
    const style = new AIStyleProfile(key);
    const bundle = { eco, style };
    this._map.set(key, bundle);
    return bundle;
  }
}

const AIChatRunnerModels = {
  AIEcoBudget,
  AIStyleProfile,
  AIRunnerRegistry,
  aiChatRunner,
  AI_CHAT_NEGATIVE_PROMPTS,
  AC_TASK_IDS
};

// CommonJS
// eslint-disable-next-line no-undef
if (typeof module !== "undefined" && module.exports) {
  // eslint-disable-next-line no-undef
  module.exports = AIChatRunnerModels;
}

// Browser / ESM
// eslint-disable-next-line no-undef
if (typeof window !== "undefined") {
  // eslint-disable-next-line no-undef
  window.AIChatRunnerModels = AIChatRunnerModels;
}
