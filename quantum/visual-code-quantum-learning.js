"use strict";

/**
 * ---------------------------------------------------------------------------
 * Section 1. Agent interfaces
 * ---------------------------------------------------------------------------
 */

/**
 * @typedef {Object} QMAImageAgentInput
 * @property {Uint8Array|null} imageBytes
 * @property {string} prompt
 * @property {string} visualHash
 */

/**
 * @typedef {Object} QMAImageAgentOutput
 * @property {number} relevanceScore   // [0,1] how well image matches prompt
 * @property {Object} features         // arbitrary embedding/meta from legacy model
 */

/**
 * @typedef {Object} QMATextAgentInput
 * @property {string} prompt
 * @property {string} promptHash
 */

/**
 * @typedef {Object} QMATextAgentOutput
 * @property {number} fluencyScore     // [0,1]
 * @property {number} safetyScore      // [0,1] (1 = safest)
 * @property {Object} tokensMeta
 */

/**
 * @typedef {Object} QMACoordAgentInput
 * @property {QMAImageAgentOutput} image
 * @property {QMATextAgentOutput} text
 * @property {number} modelScore       // base model score (from legacy)
 */

/**
 * @typedef {Object} QMACoordAgentOutput
 * @property {number} finalScore       // [0,1] calibrated consensus score
 * @property {Object} weights          // diagnostic weights for image/text/base
 */

/**
 * ---------------------------------------------------------------------------
 * Section 2. Core orchestrator
 * ---------------------------------------------------------------------------
 */

/**
 * @typedef {Object} QuantumMultiAgentConfig
 * @property {number} branchCount
 * @property {number} minConsensus
 * @property {(inp: QMAImageAgentInput) => Promise<QMAImageAgentOutput>} imageAgent
 * @property {(inp: QMATextAgentInput) => Promise<QMATextAgentOutput>} textAgent
 * @property {(inp: QMACoordAgentInput) => Promise<QMACoordAgentOutput>} coordAgent
 */

/**
 * @typedef {Object} QuantumMultiAgentResult
 * @property {boolean} consensusReached
 * @property {number} averageScore
 * @property {any|null} finalOutput
 * @property {Array<{
 *   branchIndex:number,
 *   baseScore:number,
 *   imageScore:number,
 *   textFluency:number,
 *   textSafety:number,
 *   finalScore:number
 * }>} branches
 */

/**
 * Non-cryptographic string hash (reuse from earlier).[file:1]
 * @param {string} input
 * @returns {string}
 */
function qmaHashString(input) {
  if (typeof input !== "string") input = String(input || "");
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i) & 0xff;
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * @param {Uint8Array|null} bytes
 * @returns {string}
 */
function qmaHashBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) return qmaHashString("NO_BYTES");
  let h = 0x811c9dc5;
  const len = bytes.length;
  const stride = len > 4096 ? Math.floor(len / 4096) : 1;
  for (let i = 0; i < len; i += stride) {
    h ^= bytes[i] & 0xff;
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Main multi-agent, quantum-inspired VL orchestrator.
 *
 * @param {QuantumMultiAgentConfig} cfg
 * @param {Uint8Array|null} imageBytes
 * @param {string} prompt
 * @param {(payload:any)=>Promise<any>} legacyModelCall   // your Vondy / VL model
 * @returns {Promise<QuantumMultiAgentResult>}
 */
async function runMultiAgentVL(cfg, imageBytes, prompt, legacyModelCall) {
  const branchCount = Math.max(2, Math.min(cfg.branchCount, 8));
  const minConsensus = cfg.minConsensus;

  const promptHash = qmaHashString(prompt || "");
  const visualHash = qmaHashBytes(imageBytes || null);

  const branches = [];
  for (let i = 0; i < branchCount; i++) {
    const bPrompt = prompt + " [branch:" + i + "]";
    const seed = i * 13337;
    const quality = i % 2 === 0 ? "high" : "standard";

    branches.push({
      index: i,
      payload: {
        imageBytes: imageBytes,
        prompt: bPrompt,
        seed: seed,
        quality: quality,
        meta: {
          visualHash: visualHash,
          promptHash: promptHash,
          branchIndex: i,
        },
      },
    });
  }

  const tasks = branches.map((b) =>
    (async () => {
      // 1) Call legacy VL/IG model
      const base = await legacyModelCall(b.payload);
      const baseScoreRaw =
        (base && typeof base.score === "number" && base.score) ||
        (base && typeof base.confidence === "number" && base.confidence) ||
        1.0;
      const baseScore = Math.max(0, Math.min(1, Number(baseScoreRaw) || 1.0));

      // 2) Image agent
      const imgOut = await cfg.imageAgent({
        imageBytes: imageBytes,
        prompt: b.payload.prompt,
        visualHash: visualHash,
      });

      // 3) Text agent
      const txtOut = await cfg.textAgent({
        prompt: b.payload.prompt,
        promptHash: promptHash,
      });

      // 4) Coordinator agent: fuse everything into a final branch score
      const coordOut = await cfg.coordAgent({
        image: imgOut,
        text: txtOut,
        modelScore: baseScore,
      });

      const finalScore = Math.max(
        0,
        Math.min(1, Number(coordOut.finalScore) || baseScore)
      );

      return {
        branchIndex: b.index,
        baseScore: baseScore,
        imageScore: imgOut.relevanceScore,
        textFluency: txtOut.fluencyScore,
        textSafety: txtOut.safetyScore,
        finalScore: finalScore,
        raw: base,
      };
    })()
  );

  const results = await Promise.all(tasks);
  const scores = results.map((r) => r.finalScore);
  const avgScore =
    scores.length === 0
      ? 0
      : scores.reduce((a, v) => a + v, 0) / scores.length;
  const consensusReached = avgScore >= minConsensus;

  let finalOutput = null;
  if (consensusReached && results.length > 0) {
    let bestIdx = 0;
    let bestScore = results[0].finalScore;
    for (let i = 1; i < results.length; i++) {
      if (results[i].finalScore > bestScore) {
        bestScore = results[i].finalScore;
        bestIdx = i;
      }
    }
    finalOutput = results[bestIdx].raw;
  }

  return {
    consensusReached,
    averageScore: avgScore,
    finalOutput,
    branches: results,
  };
}

/**
 * ---------------------------------------------------------------------------
 * Section 3. Minimal stub agents (safe defaults)
 * ---------------------------------------------------------------------------
 * These are intentionally simple but fully runnable, so you can plug them into
 * Vondy or any VL stack immediately, then later replace them with stronger
 * CLIP/BLIP/VLM-based evaluators.[web:17][web:19]
 */

/**
 * @param {QMAImageAgentInput} inp
 * @returns {Promise<QMAImageAgentOutput>}
 */
async function defaultImageAgent(inp) {
  const len = inp.imageBytes instanceof Uint8Array ? inp.imageBytes.length : 0;
  const base = len > 0 ? 0.7 : 0.3;
  const promptBoost = inp.prompt.length > 24 ? 0.1 : 0.0;
  const relevanceScore = Math.max(0, Math.min(1, base + promptBoost));
  return {
    relevanceScore,
    features: {
      bytes: len,
      visualHash: inp.visualHash,
    },
  };
}

/**
 * @param {QMATextAgentInput} inp
 * @returns {Promise<QMATextAgentOutput>}
 */
async function defaultTextAgent(inp) {
  const length = inp.prompt.length;
  const fluencyScore = Math.max(0, Math.min(1, length > 16 ? 0.9 : 0.5));
  // crude safety: encourage shorter prompts, no raw banned tokens here
  const safetyScore = Math.max(0, Math.min(1, length > 256 ? 0.4 : 0.9));
  return {
    fluencyScore,
    safetyScore,
    tokensMeta: {
      length,
      promptHash: inp.promptHash,
    },
  };
}

/**
 * @param {QMACoordAgentInput} inp
 * @returns {Promise<QMACoordAgentOutput>}
 */
async function defaultCoordAgent(inp) {
  const wImage = 0.5;
  const wText = 0.25;
  const wBase = 0.25;
  const finalScore =
    wImage * inp.image.relevanceScore +
    wText * (0.5 * inp.text.fluencyScore + 0.5 * inp.text.safetyScore) +
    wBase * inp.modelScore;
  return {
    finalScore,
    weights: {
      wImage,
      wText,
      wBase,
    },
  };
}

/**
 * ---------------------------------------------------------------------------
 * Section 4. Factory to create a ready-to-run orchestrator config
 * ---------------------------------------------------------------------------
 */

/**
 * @param {Partial<QuantumMultiAgentConfig>} override
 * @returns {QuantumMultiAgentConfig}
 */
function createDefaultQuantumMultiAgentConfig(override) {
  const cfg = {
    branchCount: 4,
    minConsensus: 0.7,
    imageAgent: defaultImageAgent,
    textAgent: defaultTextAgent,
    coordAgent: defaultCoordAgent,
  };
  return Object.assign(cfg, override || {});
}

/**
 * ---------------------------------------------------------------------------
 * Section 5. Export
 * ---------------------------------------------------------------------------
 */

const VisualCodeQuantumMultiAgent = {
  runMultiAgentVL,
  createDefaultQuantumMultiAgentConfig,
  defaultImageAgent,
  defaultTextAgent,
  defaultCoordAgent,
};

if (typeof module !== "undefined" && module && module.exports) {
  module.exports = VisualCodeQuantumMultiAgent;
}

if (typeof window !== "undefined") {
  // eslint-disable-next-line no-undef
  window.VisualCodeQuantumMultiAgent = VisualCodeQuantumMultiAgent;
}
