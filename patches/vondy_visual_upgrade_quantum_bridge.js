// Platform: Windows/Linux/Ubuntu, Android/iOS (Node.js 18+, Deno, Bun compatible)
// Language: Javascript (sanitized, production-grade)
// Purpose:
// - Patch and extend an older Vondy VL/IG backend to a modern Visual-Code router style.
// - Add visual-learning upgrades (sanitized prompts, quality tiers, safety).
// - Provide a "quantum-learning" compatibility bridge that wraps legacy ML calls with
//   hashed, multi-branch consensus over visual-features for robustness and auditability.
// - Designed to sit beside an existing "vondy" adapter and progressively migrate traffic.
//
// Notes:
// - No Python, fully self-contained, all structures filled.
// - Can be required as a module or imported in browser bundlers.
// - Legacy ML/LLM inference is treated as a black-box callback; we wrap it with
//   deterministic hashing, multi-branch voting and trace-IDs to emulate
//   "quantum-style" superposition/collapse semantics in a classical backend.[file:1]

"use strict";

/**
 * ---------------------------------------------------------------------------
 * Section 0. Core constants and enums
 * ---------------------------------------------------------------------------
 */

/** @typedef {"draft"|"standard"|"high"|"ultra"} VCQualityPreset */
/** @typedef {"safe"|"allow-nsfw"} VCSafetyProfile */
/** @typedef {"vision-analyze"|"image-generate"|"image-edit"} VCModeId */

const VC_QP_DRAFT = /** @type {VCQualityPreset} */ ("draft");
const VC_QP_STANDARD = /** @type {VCQualityPreset} */ ("standard");
const VC_QP_HIGH = /** @type {VCQualityPreset} */ ("high");
const VC_QP_ULTRA = /** @type {VCQualityPreset} */ ("ultra");

const VC_SP_SAFE = /** @type {VCSafetyProfile} */ ("safe");
const VC_SP_ALLOW_NSFW = /** @type {VCSafetyProfile} */ ("allow-nsfw");

/**
 * ---------------------------------------------------------------------------
 * Section 1. Core types (JSDoc)
 * ---------------------------------------------------------------------------
 */

/**
 * @typedef {Object} VCQuantumBranchConfig
 * @property {number} branchCount      // Number of parallel legacy-ML branches (2-8).
 * @property {number} minConsensus     // Fraction 0-1 required to accept a result.
 * @property {boolean} enableVisualHash // Whether to compute visual hashes for inputs.
 * @property {boolean} enableTextHash   // Whether to compute text hashes for prompts.
 */

/**
 * @typedef {Object} VCQuantumTrace
 * @property {string} traceId
 * @property {string} parentRequestId
 * @property {number} createdAtMs
 * @property {Array<string>} visualHashes
 * @property {Array<string>} promptHashes
 * @property {Array<number>} branchScores
 * @property {boolean} consensusReached
 * @property {number} consensusScore
 */

/**
 * @typedef {Object} VCQuantumBridgeConfig
 * @property {VCQuantumBranchConfig} branches
 * @property {VCSafetyProfile} safetyProfile
 * @property {VCQualityPreset} defaultQuality
 * @property {number} maxTokens
 * @property {number} maxPixels
 * @property {boolean} enableAuditTrail
 */

/**
 * @typedef {Object} VCQuantumBridgeContext
 * @property {VCQuantumBridgeConfig} config
 * @property {(payload: any)=>Promise<any>} legacyVondyCall
 * @property {(payload: any)=>Promise<any>} legacyVLCall
 */

/**
 * ---------------------------------------------------------------------------
 * Section 2. Core utilities (time, ID, hashing)
 * ---------------------------------------------------------------------------
 */

/**
 * @returns {number}
 */
function qNowMs() {
  return Date.now();
}

/**
 * Generate deterministic-ish trace Id.
 * @returns {string}
 */
function qGenerateTraceId() {
  const ts = qNowMs().toString(16);
  const rand = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
  return "QTRACE-" + ts + "-" + rand;
}

/**
 * Deterministic, runtime-portable non-cryptographic hash over string.
 * (FNV-1a 32-bit style).
 * @param {string} input
 * @returns {string} hex string
 */
function qHashString(input) {
  if (typeof input !== "string") {
    input = String(input);
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    hash ^= c & 0xff;
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Compute a stable hash over Uint8Array content for visual inputs.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function qHashBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    return qHashString("NOVISUAL");
  }
  let hash = 0x811c9dc5;
  const len = bytes.length;
  const stride = len > 4096 ? Math.floor(len / 4096) : 1;
  for (let i = 0; i < len; i += stride) {
    hash ^= bytes[i] & 0xff;
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Clamp length of a string to maxBytes using UTF-8 approximations.
 * @param {string} s
 * @param {number} maxBytes
 * @returns {string}
 */
function qClampStringBytes(s, maxBytes) {
  if (typeof s !== "string") return "";
  if (maxBytes <= 0) return "";
  // Approximate: assume <= 3 bytes per char and clamp by char count.
  const maxChars = Math.max(1, Math.floor(maxBytes / 3));
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars);
}

/**
 * ---------------------------------------------------------------------------
 * Section 3. Sanitization and safety for legacy Vondy prompts
 * ---------------------------------------------------------------------------
 * Inspired by Visual-Code unified router prompt handling.[file:1]
 */

/**
 * @param {string} input
 * @returns {string}
 */
function qSanitizeText(input) {
  if (typeof input !== "string") return "";
  // Remove control chars
  let out = input.replace(/[\u0000-\u001f\u007f]/g, " ");
  // Collapse whitespace
  out = out.replace(/\s+/g, " ").trim();
  // Block explicit categories for SAFE profile
  const banned = [
    /porn/gi,
    /nude/gi,
    /nudity/gi,
    /sexual/gi,
    /erotic/gi,
    /gore/gi,
  ];
  for (let i = 0; i < banned.length; i++) {
    out = out.replace(banned[i], "[blocked]");
  }
  return out;
}

/**
 * Enforce resolution + pixel budget to protect older ML stacks.[file:1]
 * @param {number} width
 * @param {number} height
 * @param {number} maxPixels
 * @returns {{width:number,height:number,scale:number}}
 */
function qClampResolution(width, height, maxPixels) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 512, height: 512, scale: 1.0 };
  }
  const pixels = width * height;
  if (pixels <= maxPixels) {
    return { width: Math.floor(width), height: Math.floor(height), scale: 1.0 };
  }
  const scale = Math.sqrt(maxPixels / pixels);
  const newW = Math.max(64, Math.floor(width * scale));
  const newH = Math.max(64, Math.floor(height * scale));
  return { width: newW, height: newH, scale };
}

/**
 * ---------------------------------------------------------------------------
 * Section 4. Quantum-style multi-branch consensus wrapper
 * ---------------------------------------------------------------------------
 * This is the "quantum-learning mechanism" layer. It:
 * - forks a legacy ML/VL request into N branches (branchCount),
 * - applies lightweight variations (e.g., quality, seed, prompt suffix),
 * - collects branch scores (if available) and picks a consensus winner
 *   only if minConsensus is satisfied,
 * - records hashes and scores into a structured VCQuantumTrace for
 *   audit, debugging, and future alignment fine-tuning.[file:1]
 */

/**
 * @param {VCQuantumBridgeContext} ctx
 * @param {VCModeId} mode
 * @param {any} basePayload
 * @param {Uint8Array|null} visualBytes
 * @param {string} parentRequestId
 * @returns {Promise<{ok:boolean,chosen:any,trace:VCQuantumTrace,branches:Array<any>}>}
 */
async function qRunQuantumConsensus(ctx, mode, basePayload, visualBytes, parentRequestId) {
  const cfg = ctx.config.branches;
  const branches = [];
  const branchCount = Math.max(1, Math.min(cfg.branchCount, 8));
  const trace = /** @type {VCQuantumTrace} */ ({
    traceId: qGenerateTraceId(),
    parentRequestId,
    createdAtMs: qNowMs(),
    visualHashes: [],
    promptHashes: [],
    branchScores: [],
    consensusReached: false,
    consensusScore: 0.0,
  });

  let visualHash = "NOVISUAL";
  if (cfg.enableVisualHash && visualBytes instanceof Uint8Array) {
    visualHash = qHashBytes(visualBytes);
    trace.visualHashes.push(visualHash);
  }

  let promptHash = "NOPROMPT";
  const prompt =
    typeof basePayload.prompt === "string"
      ? basePayload.prompt
      : typeof basePayload.text === "string"
      ? basePayload.text
      : "";
  if (cfg.enableTextHash && prompt) {
    promptHash = qHashString(prompt);
    trace.promptHashes.push(promptHash);
  }

  /** @type {Array<Promise<any>>} */
  const tasks = [];
  for (let i = 0; i < branchCount; i++) {
    const branchSeed = (basePayload.seed || 0) + i * 9973;
    const branchQuality =
      i === 0
        ? ctx.config.defaultQuality
        : i % 2 === 0
        ? VC_QP_HIGH
        : VC_QP_STANDARD;

    const branchPayload = Object.assign({}, basePayload, {
      // Provide "quantum" perturbations via seeds and tags.
      seed: branchSeed,
      quality: branchQuality,
      meta: Object.assign({}, basePayload.meta || {}, {
        q_branch_index: i,
        q_trace_id: trace.traceId,
        q_visual_hash: visualHash,
        q_prompt_hash: promptHash,
      }),
    });

    let callFn =
      mode === "image-generate" || mode === "image-edit"
        ? ctx.legacyVondyCall
        : ctx.legacyVLCall;

    const task = (async () => {
      const result = await callFn(branchPayload);
      return { index: i, payload: branchPayload, result };
    })();
    tasks.push(task);
  }

  const resolved = await Promise.all(tasks);
  let bestScore = -Infinity;
  let bestBranch = null;
  const scoreList = [];

  for (let i = 0; i < resolved.length; i++) {
    const r = resolved[i];
    const res = r.result || {};
    // Legacy results MAY already contain a numeric score; if not, use 1.0.
    const score =
      typeof res.score === "number"
        ? res.score
        : typeof res.confidence === "number"
        ? res.confidence
        : 1.0;
    scoreList.push(score);
    if (score > bestScore) {
      bestScore = score;
      bestBranch = r;
    }
  }

  trace.branchScores = scoreList;
  const avgScore =
    scoreList.length === 0
      ? 0
      : scoreList.reduce((a, b) => a + b, 0) / scoreList.length;
  trace.consensusScore = avgScore;
  trace.consensusReached = avgScore >= cfg.minConsensus;

  return {
    ok: trace.consensusReached && !!bestBranch,
    chosen: bestBranch ? bestBranch.result : null,
    trace,
    branches: resolved,
  };
}

/**
 * ---------------------------------------------------------------------------
 * Section 5. Visual-learning patcher for older Vondy backends
 * ---------------------------------------------------------------------------
 * We construct a high-level "visualLearningCall" API that:
 * - normalizes and sanitizes the prompt,
 * - enforces resolution and token limits,
 * - wraps the legacy Vondy/ML call into qRunQuantumConsensus,
 * - returns extended debug information suitable for training and audits.[file:1]
 */

/**
 * @typedef {Object} VLOutput
 * @property {boolean} ok
 * @property {string|null} text
 * @property {string|null} imageUrl
 * @property {Uint8Array|null} imageBytes
 * @property {VCQuantumTrace} trace
 * @property {Array<any>} branches
 */

/**
 * @typedef {Object} VLInput
 * @property {VCModeId} mode
 * @property {string} prompt
 * @property {VCQualityPreset} quality
 * @property {VCSafetyProfile} safety
 * @property {Uint8Array|null} imageBytes
 * @property {{width:number,height:number}|null} imageSize
 * @property {Record<string,any>} extra
 */

/**
 * Build default bridge config for older Vondy systems.
 * @returns {VCQuantumBridgeConfig}
 */
function buildDefaultQuantumConfig() {
  return /** @type {VCQuantumBridgeConfig} */ ({
    branches: {
      branchCount: 3,
      minConsensus: 0.7,
      enableVisualHash: true,
      enableTextHash: true,
    },
    safetyProfile: VC_SP_SAFE,
    defaultQuality: VC_QP_STANDARD,
    maxTokens: 512,
    maxPixels: 1024 * 1024 * 2, // 2 MPix
    enableAuditTrail: true,
  });
}

/**
 * Visual-learning, quantum-enhanced call.
 * @param {VCQuantumBridgeContext} ctx
 * @param {VLInput} input
 * @returns {Promise<VLOutput>}
 */
async function visualLearningCall(ctx, input) {
  const reqId = qGenerateTraceId();
  const cfg = ctx.config;
  const safePrompt = qSanitizeText(
    qClampStringBytes(input.prompt || "", cfg.maxTokens * 4)
  );

  let w = 512;
  let h = 512;
  if (input.imageSize && Number.isFinite(input.imageSize.width)) {
    w = input.imageSize.width;
    h = input.imageSize.height;
  }
  const clamped = qClampResolution(w, h, cfg.maxPixels);

  const basePayload = {
    // This payload schema is intentionally generic so it can call:
    // - older Vondy image APIs (image-generate / edit),
    // - legacy ML caption/vision APIs (vision-analyze).[file:1]
    mode: input.mode,
    prompt: safePrompt,
    width: clamped.width,
    height: clamped.height,
    quality: input.quality || cfg.defaultQuality,
    safety: input.safety || cfg.safetyProfile,
    seed: 0,
    meta: {
      vcq_bridge_version: "1.0.0",
      parent_request_id: reqId,
      pixel_scale: clamped.scale,
      safety_profile: input.safety || cfg.safetyProfile,
      quality_preset: input.quality || cfg.defaultQuality,
      visual_learning_patch: true,
      quantum_consensus: true,
      legacy_backend: "vondy-legacy-ml",
    },
    extra: input.extra || {},
  };

  const qc = await qRunQuantumConsensus(
    ctx,
    input.mode,
    basePayload,
    input.imageBytes || null,
    reqId
  );

  /** @type {VLOutput} */
  const out = {
    ok: qc.ok,
    text: null,
    imageUrl: null,
    imageBytes: null,
    trace: qc.trace,
    branches: qc.branches,
  };

  const chosen = qc.chosen || {};
  if (typeof chosen.text === "string") {
    out.text = chosen.text;
  } else if (typeof chosen.caption === "string") {
    out.text = chosen.caption;
  }

  if (typeof chosen.imageUrl === "string") {
    out.imageUrl = chosen.imageUrl;
  } else if (typeof chosen.url === "string") {
    out.imageUrl = chosen.url;
  }

  if (chosen.imageBytes instanceof Uint8Array) {
    out.imageBytes = chosen.imageBytes;
  } else {
    out.imageBytes = null;
  }

  return out;
}

/**
 * ---------------------------------------------------------------------------
 * Section 6. Patch wiring for legacy "Vondy" backend
 * ---------------------------------------------------------------------------
 * We expose a helper that accepts raw legacy functions and returns an upgraded
 * interface exposing:
 *   - callImageGenerateQuantum(...)
 *   - callVisionAnalyzeQuantum(...)
 *   - direct access to cfg/consensus for debugging and tuning.[file:1]
 */

/**
 * @typedef {Object} VondyLegacyAdapters
 * @property {(payload:any)=>Promise<any>} callLegacyVondyImage
 * @property {(payload:any)=>Promise<any>} callLegacyVisionAnalyze
 */

/**
 * @typedef {Object} VondyQuantumPatchedAPI
 * @property {VCQuantumBridgeConfig} config
 * @property {(input:VLInput)=>Promise<VLOutput>} callImageGenerateQuantum
 * @property {(input:VLInput)=>Promise<VLOutput>} callVisionAnalyzeQuantum
 */

/**
 * Create a quantum-learning, visual-learning patched API for Vondy.
 * @param {VondyLegacyAdapters} adapters
 * @param {Partial<VCQuantumBridgeConfig>=} overrideConfig
 * @returns {VondyQuantumPatchedAPI}
 */
function createVondyQuantumPatchedAPI(adapters, overrideConfig) {
  const baseCfg = buildDefaultQuantumConfig();
  const mergedCfg = Object.assign({}, baseCfg, overrideConfig || {});
  mergedCfg.branches = Object.assign({}, baseCfg.branches, (overrideConfig && overrideConfig.branches) || {});

  /** @type {VCQuantumBridgeContext} */
  const ctx = {
    config: mergedCfg,
    legacyVondyCall: adapters.callLegacyVondyImage,
    legacyVLCall: adapters.callLegacyVisionAnalyze,
  };

  return {
    config: mergedCfg,
    /**
     * Quantum-enhanced image-generate / edit on legacy Vondy.
     * @param {VLInput} input
     * @returns {Promise<VLOutput>}
     */
    async callImageGenerateQuantum(input) {
      const normalized = Object.assign({}, input, {
        mode: input.mode || "image-generate",
        quality: input.quality || mergedCfg.defaultQuality,
        safety: input.safety || mergedCfg.safetyProfile,
      });
      return visualLearningCall(ctx, normalized);
    },
    /**
     * Quantum-enhanced visual-analysis (caption, tags) on legacy ML.
     * @param {VLInput} input
     * @returns {Promise<VLOutput>}
     */
    async callVisionAnalyzeQuantum(input) {
      const normalized = Object.assign({}, input, {
        mode: "vision-analyze",
        quality: input.quality || mergedCfg.defaultQuality,
        safety: input.safety || mergedCfg.safetyProfile,
      });
      return visualLearningCall(ctx, normalized);
    },
  };
}

/**
 * ---------------------------------------------------------------------------
 * Section 7. Debug console helper (optional)
 * ---------------------------------------------------------------------------
 * This prints a concise, lab-grade summary of the quantum branches,
 * suitable for legacy log files or audit dashboards.[file:1]
 */

/**
 * @param {VLOutput} out
 */
function printQuantumDebugSummary(out) {
  const tr = out.trace;
  const line =
    "[VONDY-QUANTUM] trace=" +
    tr.traceId +
    " parent=" +
    tr.parentRequestId +
    " visualHashes=" +
    (tr.visualHashes || []).join(",") +
    " promptHashes=" +
    (tr.promptHashes || []).join(",") +
    " scores=" +
    (tr.branchScores || []).map((s) => s.toFixed(3)).join("/") +
    " consensus=" +
    (tr.consensusReached ? "YES" : "NO") +
    " avgScore=" +
    tr.consensusScore.toFixed(3);
  if (typeof console !== "undefined" && typeof console.log === "function") {
    console.log(line);
  }
}

/**
 * ---------------------------------------------------------------------------
 * Section 8. Public exports
 * ---------------------------------------------------------------------------
 */

const VondyQuantumPatch = {
  VC_QP_DRAFT,
  VC_QP_STANDARD,
  VC_QP_HIGH,
  VC_QP_ULTRA,
  VC_SP_SAFE,
  VC_SP_ALLOW_NSFW,
  buildDefaultQuantumConfig,
  createVondyQuantumPatchedAPI,
  printQuantumDebugSummary,
};

// CommonJS
if (typeof module !== "undefined" && module && module.exports) {
  module.exports = VondyQuantumPatch;
}

// Browser / ESM global attach (optional)
if (typeof window !== "undefined") {
  // @ts-ignore
  window.VondyQuantumPatch = VondyQuantumPatch;
}
