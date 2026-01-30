// Platform: Windows/Linux/Ubuntu, Android/iOS (Node 18+, Deno, Bun, browser)
// Language: Javascript (sanitized, production-grade)
//
// Purpose:
// - Provide a fully filled, lab-grade implementation of a "quantum-learning" circuit
//   for visual models, based on multi-branch consensus over legacy ML calls.[file:1]
// - Wrap legacy image-generation / VL models (e.g., Vondy backends) with:
//   * visual+prompt hashing,
//   * controlled perturbations (seed / prompt tags / quality),
//   * consensus scoring and robust selection,
//   * structured audit trace for later training and compliance.[file:1]
//
// Notes:
// - Uses qHashBytes / qHashString style non-cryptographic hashes for traceability.[file:1]
// - No Python, all logic is explicit and environment-agnostic.

"use strict";

/**
 * ---------------------------------------------------------------------------
 * Section 1. Hash utilities (visual + text)
 * ---------------------------------------------------------------------------
 * FNV-1a style hashing similar to other Visual-Code helpers.[file:1]
 */

/**
 * @param {string} input
 * @returns {string} hex
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
 * @param {Uint8Array|null|undefined} bytes
 * @returns {string} hex
 */
function qHashBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    return qHashString("NO_BYTES");
  }
  let hash = 0x811c9dc5;
  const len = bytes.length;
  if (len === 0) return qHashString("EMPTY_BYTES");
  const stride = len > 4096 ? Math.floor(len / 4096) : 1;
  for (let i = 0; i < len; i += stride) {
    hash ^= bytes[i] & 0xff;
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * ---------------------------------------------------------------------------
 * Section 2. ID + time helpers
 * ---------------------------------------------------------------------------
 */

/**
 * @returns {number}
 */
function qNowMs() {
  return Date.now();
}

/**
 * @returns {string}
 */
function qGenerateCircuitId() {
  const ts = qNowMs().toString(16);
  const rand = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
  return "QLEARN-" + ts + "-" + rand;
}

/**
 * ---------------------------------------------------------------------------
 * Section 3. Core circuit implementation
 * ---------------------------------------------------------------------------
 * This is the hardened, fully-filled version of your draft quantumLearningCircuit.
 * It:
 *  - validates inputs,
 *  - builds perturbed branches,
 *  - runs legacyModelCall in parallel,
 *  - computes consensus and picks the best branch,
 *  - emits a complete audit object suitable for logging or training.[file:1]
 */

/**
 * @typedef {Object} QuantumBranchInput
 * @property {Uint8Array|null} imageBytes
 * @property {string} prompt
 * @property {number} seed
 * @property {string} quality
 * @property {Object} meta
 */

/**
 * @typedef {Object} QuantumBranchResult
 * @property {number} index
 * @property {QuantumBranchInput} input
 * @property {any} rawResult
 * @property {number} score
 */

/**
 * @typedef {Object} QuantumLearningAudit
 * @property {string} circuitId
 * @property {number} createdAtMs
 * @property {string} visualHash
 * @property {string} promptHash
 * @property {boolean} consensusReached
 * @property {number} averageScore
 * @property {number} minScore
 * @property {number} maxScore
 * @property {Array<number>} branchScores
 * @property {Array<{index:number,seed:number,quality:string}>} branchMeta
 */

/**
 * @typedef {Object} QuantumLearningOutput
 * @property {boolean} consensusReached
 * @property {number} averageScore
 * @property {any|null} finalOutput
 * @property {Array<QuantumBranchResult>} branches
 * @property {QuantumLearningAudit} audit
 */

/**
 * @param {Uint8Array|null} inputImage
 * @param {string} prompt
 * @param {(payload: QuantumBranchInput) => Promise<any>} legacyModelCall
 * @param {number} [branchCount]
 * @param {number} [minConsensus]
 * @returns {Promise<QuantumLearningOutput>}
 */
async function quantumLearningCircuit(
  inputImage,
  prompt,
  legacyModelCall,
  branchCount,
  minConsensus
) {
  const BRANCH_COUNT = Math.max(2, Math.min(branchCount || 4, 8));
  const MIN_CONSENSUS = typeof minConsensus === "number" ? minConsensus : 0.7;

  if (typeof legacyModelCall !== "function") {
    throw new Error(
      "[QuantumLearningCircuit] legacyModelCall must be a function returning a Promise."
    );
  }

  const safePrompt = typeof prompt === "string" ? prompt : String(prompt || "");
  const visualHash = qHashBytes(inputImage || null);
  const promptHash = qHashString(safePrompt);

  const circuitId = qGenerateCircuitId();
  const createdAtMs = qNowMs();

  /** @type {QuantumBranchInput[]} */
  const branches = [];
  for (let i = 0; i < BRANCH_COUNT; i++) {
    const branchPrompt = safePrompt + " [branch:" + i + "]";
    const seed = i * 12345;
    const quality = i % 2 === 0 ? "high" : "standard";

    const branchInput = {
      imageBytes: inputImage || null,
      prompt: branchPrompt,
      seed: seed,
      quality: quality,
      meta: {
        circuitId: circuitId,
        createdAtMs: createdAtMs,
        visualHash: visualHash,
        promptHash: promptHash,
        branchIndex: i,
      },
    };

    branches.push(branchInput);
  }

  /** @type {Array<Promise<QuantumBranchResult>>} */
  const tasks = branches.map((b, idx) =>
    (async () => {
      const raw = await legacyModelCall(b);
      let score = 1.0;
      if (raw && typeof raw.score === "number") {
        score = raw.score;
      } else if (raw && typeof raw.confidence === "number") {
        score = raw.confidence;
      }
      // Clamp score to [0,1] for stability.
      if (!Number.isFinite(score)) score = 1.0;
      if (score < 0) score = 0;
      if (score > 1) score = 1;
      return {
        index: idx,
        input: b,
        rawResult: raw,
        score: score,
      };
    })()
  );

  const branchResults = await Promise.all(tasks);

  const scores = branchResults.map((r) => r.score);
  const sumScore = scores.reduce((a, b) => a + b, 0);
  const avgScore = scores.length > 0 ? sumScore / scores.length : 0;
  const minScore = scores.length > 0 ? Math.min.apply(null, scores) : 0;
  const maxScore = scores.length > 0 ? Math.max.apply(null, scores) : 0;
  const consensusReached = avgScore >= MIN_CONSENSUS;

  let finalOutput = null;
  if (consensusReached && branchResults.length > 0) {
    let bestIdx = 0;
    let bestScore = branchResults[0].score;
    for (let i = 1; i < branchResults.length; i++) {
      if (branchResults[i].score > bestScore) {
        bestScore = branchResults[i].score;
        bestIdx = i;
      }
    }
    finalOutput = branchResults[bestIdx].rawResult;
  }

  /** @type {QuantumLearningAudit} */
  const audit = {
    circuitId: circuitId,
    createdAtMs: createdAtMs,
    visualHash: visualHash,
    promptHash: promptHash,
    consensusReached: consensusReached,
    averageScore: avgScore,
    minScore: minScore,
    maxScore: maxScore,
    branchScores: scores.slice(),
    branchMeta: branchResults.map((r) => ({
      index: r.index,
      seed: r.input.seed,
      quality: r.input.quality,
    })),
  };

  /** @type {QuantumLearningOutput} */
  const out = {
    consensusReached: consensusReached,
    averageScore: avgScore,
    finalOutput: finalOutput,
    branches: branchResults,
    audit: audit,
  };

  return out;
}

/**
 * ---------------------------------------------------------------------------
 * Section 4. Optional console debug helper
 * ---------------------------------------------------------------------------
 */

/**
 * @param {QuantumLearningOutput} out
 */
function printQuantumCircuitDebug(out) {
  const a = out.audit;
  const scores = (a.branchScores || []).map((s) => s.toFixed(3)).join("/");
  const branchMeta = (a.branchMeta || [])
    .map((m) => "#" + m.index + ":seed=" + m.seed + ",q=" + m.quality)
    .join(" | ");
  const line =
    "[QLEARN] id=" +
    a.circuitId +
    " consensus=" +
    (a.consensusReached ? "YES" : "NO") +
    " avg=" +
    a.averageScore.toFixed(3) +
    " min=" +
    a.minScore.toFixed(3) +
    " max=" +
    a.maxScore.toFixed(3) +
    " scores=" +
    scores +
    " branches=" +
    branchMeta;
  if (typeof console !== "undefined" && typeof console.log === "function") {
    console.log(line);
  }
}

/**
 * ---------------------------------------------------------------------------
 * Section 5. Export
 * ---------------------------------------------------------------------------
 */

const VisualCodeQuantumCircuit = {
  qHashString,
  qHashBytes,
  quantumLearningCircuit,
  printQuantumCircuitDebug,
};

// CommonJS
if (typeof module !== "undefined" && module && module.exports) {
  module.exports = VisualCodeQuantumCircuit;
}

// Browser global (Vondy / frontends)
if (typeof window !== "undefined") {
  // eslint-disable-next-line no-undef
  window.VisualCodeQuantumCircuit = VisualCodeQuantumCircuit;
}
