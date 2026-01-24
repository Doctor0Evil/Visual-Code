// File: vc-research/agentic_rag_search_router.js
// Platform: Windows/Linux/Ubuntu, Android/iOS (Node.js, Deno, Bun, or server-side JS engine)
// Language: JavaScript (sanitized, production-grade)
// Purpose:
//   - Provide a rule-based, quantifiable search-orchestration layer for agentic/RAG systems.
//   - Implement diverse research-actions, hybrid retrieval, and link-checking with security gates.
//   - Expose a structured API that AI-chat agents can call to perform high-quality web research turns.
//
// Design goals (aligned with recent deep-research & RAG practices) [web:2][web:10][web:15][web:14]:
//   - Hybrid sparse+dense retrieval with score-fusion and reranking.
//   - Explicit, inspectable "research actions" (plan, expand, restrict, verify, contrast, etc.).
//   - Query rewriting with advanced operators (site:, filetype:, time windows). [web:14]
//   - Source restriction and domain trust tiers (authoritative vs open-web). [web:14][web:10]
//   - Malware- and phishing-aware URL vetting and content-type filters. [web:13][web:16][web:17]
//   - Rule-based link quality scoring and result de-duplication.
//   - Quantifiable metrics per turn: coverage, novelty, redundancy, trust, and security score.

// -----------------------------------------------------------------------------
// Section 1. Type literals and core enums
// -----------------------------------------------------------------------------

/**
 * @typedef {'plan'|'naive-search'|'hybrid-search'|'focused-search'|'exploratory-browse'|
 *           'fact-check'|'multi-hop'|'contrastive'|'update-check'|'source-audit'} VCResearchActionId
 */

/**
 * @typedef {'keyword'|'dense'|'hybrid'} VCRetrievalModeId
 */

/**
 * @typedef {'authoritative'|'high-trust'|'open-web'|'unknown'} VCDomainTrustTier
 */

/**
 * @typedef {'clean'|'suspicious'|'blocked'} VCUrlSecurityStatus
 */

/**
 * @typedef {'title-snippet'|'full-html'|'structured'} VCIngestionLevel
 */

// -----------------------------------------------------------------------------
// Section 2. Configuration, scoring weights, and rule tables
// -----------------------------------------------------------------------------

const VC_RS_VERSION = '1.0.0';
const VC_RS_BUILD_ID = 'VC-AGENTIC-RAG-SEARCH-20260124A';

/**
 * Unified research-router config.
 */
const VC_DEFAULT_CONFIG = {
  maxResultsPerAction: 24,
  maxPerDomain: 5,
  hybridWeights: {
    dense: 0.55,
    sparse: 0.45
  },
  rrf: {
    k: 60 // Reciprocal Rank Fusion constant. [web:8][web:10][web:15]
  },
  trustTiers: /** @type {Record<VCDomainTrustTier,string[]>} */ ({
    authoritative: [
      'wikipedia.org',
      'arxiv.org',
      'nature.com',
      'acm.org',
      'ieee.org',
      'who.int',
      'nasa.gov'
    ],
    high-trust: [
      'github.com',
      'docs.microsoft.com',
      'learn.microsoft.com',
      'elastic.co',
      'oracle.com',
      'cloud.google.com'
    ],
    open-web: [],
    unknown: []
  }),
  // MIME types allowed for ingestion.
  allowedContentTypes: [
    'text/html',
    'text/plain',
    'application/pdf',
    'application/json'
  ],
  // Regular expressions and heuristics for malware / phishing risk. [web:13][web:16][web:17]
  security: {
    blockedTLDs: [
      '.zip',
      '.mov'
    ],
    suspiciousQueryPatterns: [
      /(free-?crack|keygen|serial-?key|nulled)/i,
      /(download-?exe|setup-?crack)/i
    ],
    suspiciousPathPatterns: [
      /(\/wp-content\/plugins\/)/i,
      /(\/phpmyadmin\/)/i
    ],
    maxRedirects: 5
  },
  // Explicit scoring weights for result evaluation.
  scoringWeights: {
    relevance: 0.45,
    authority: 0.25,
    recency: 0.15,
    diversity: 0.10,
    security: 0.05
  }
};

// -----------------------------------------------------------------------------
// Section 3. Utility: time, IDs, sanitization
// -----------------------------------------------------------------------------

function vcRsNowMs() {
  return Date.now();
}

function vcRsRequestId() {
  const ts = vcRsNowMs().toString(16);
  const rand = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0');
  return `VCRS-${ts}-${rand}`;
}

/**
 * Sanitize free-form user query text (remove control chars, normalize whitespace,
 * drop obviously dangerous operators). This is conservative and SFW-friendly. [file:1]
 */
function vcRsSanitizeQuery(input) {
  if (typeof input !== 'string') return '';
  let out = input.replace(/[\u0000-\u001F\u007F]/g, '');
  out = out.replace(/\s+/g, ' ').trim();
  const banned = [
    /(--eval)/gi,
    /(<script[^>]*>.*?<\/script>)/gi,
    /javascript:/gi
  ];
  for (let i = 0; i < banned.length; i++) {
    out = out.replace(banned[i], '');
  }
  return out;
}

/**
 * Basic hostname extraction from URL.
 */
function vcRsHostname(url) {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Get TLD suffix (including dot).
 */
function vcRsTld(host) {
  const parts = host.split('.');
  if (parts.length < 2) return '';
  return '.' + parts[parts.length - 1];
}

// -----------------------------------------------------------------------------
// Section 4. URL security and trust scoring
// -----------------------------------------------------------------------------

/**
 * Evaluate URL for basic malware / phishing risk using heuristic rules. [web:13][web:16][web:17]
 */
function vcRsAssessUrlSecurity(url, cfg) {
  const host = vcRsHostname(url);
  const tld = vcRsTld(host);
  const full = url.toLowerCase();

  // Blocked TLDs (e.g., .zip executable containers abused in phishing). [web:17]
  if (cfg.security.blockedTLDs.includes(tld)) {
    return { status: 'blocked', score: 0.0 };
  }

  // Suspicious patterns in query or path.
  for (const pattern of cfg.security.suspiciousQueryPatterns) {
    if (pattern.test(full)) {
      return { status: 'suspicious', score: 0.2 };
    }
  }
  for (const pattern of cfg.security.suspiciousPathPatterns) {
    if (pattern.test(full)) {
      return { status: 'suspicious', score: 0.3 };
    }
  }

  // Default clean.
  return { status: 'clean', score: 1.0 };
}

/**
 * Map hostname to trust tier. [web:14][web:10]
 */
function vcRsDomainTrustTier(host, cfg) {
  const lower = host.toLowerCase();
  for (const tier of /** @type {VCDomainTrustTier[]} */ ([
    'authoritative',
    'high-trust'
  ])) {
    const list = cfg.trustTiers[tier];
    for (let i = 0; i < list.length; i++) {
      if (lower === list[i] || lower.endsWith('.' + list[i])) {
        return tier;
      }
    }
  }
  return 'open-web';
}

/**
 * Authority score from trust tier.
 */
function vcRsAuthorityScore(tier) {
  switch (tier) {
    case 'authoritative': return 1.0;
    case 'high-trust': return 0.8;
    case 'open-web': return 0.5;
    default: return 0.3;
  }
}

// -----------------------------------------------------------------------------
// Section 5. Hybrid retrieval score fusion and ranking
// -----------------------------------------------------------------------------

/**
 * Reciprocal Rank Fusion for combining ranking lists. [web:8][web:10][web:15]
 * @param {string[]} idsDense - doc IDs ordered by dense relevance.
 * @param {string[]} idsSparse - doc IDs ordered by sparse relevance.
 * @param {number} k - constant to dampen low ranks.
 * @returns {Record<string,number>} - fused RRF scores.
 */
function vcRsRrf(idsDense, idsSparse, k) {
  /** @type {Record<string,number>} */
  const scores = {};
  const lists = [idsDense, idsSparse];
  for (let li = 0; li < lists.length; li++) {
    const list = lists[li];
    for (let i = 0; i < list.length; i++) {
      const id = list[i];
      const rank = i + 1;
      const contrib = 1.0 / (k + rank);
      scores[id] = (scores[id] || 0) + contrib;
    }
  }
  return scores;
}

/**
 * Weighted sum fusion for dense + sparse scores after normalization. [web:10][web:9]
 */
function vcRsWeightedHybridScore(denseScore, sparseScore, cfg) {
  const d = isFinite(denseScore) ? denseScore : 0.0;
  const s = isFinite(sparseScore) ? sparseScore : 0.0;
  return cfg.hybridWeights.dense * d + cfg.hybridWeights.sparse * s;
}

// -----------------------------------------------------------------------------
// Section 6. Research actions and rule-based orchestration
// -----------------------------------------------------------------------------

/**
 * @typedef {Object} VCSearchQuery
 * @property {string} userQuery
 * @property {string[]} mustKeywords
 * @property {string[]} shouldKeywords
 * @property {string[]} excludedKeywords
 * @property {string[]} siteFilters
 * @property {string|null} timeRange // e.g. 'past_year', 'past_month'
 */

/**
 * Plan a set of research actions for a user query. [web:2][web:14]
 * This is deterministic and rule-based, not generative.
 */
function vcRsPlanActions(rawQuery) {
  const query = vcRsSanitizeQuery(rawQuery);
  const lc = query.toLowerCase();

  /** @type {VCResearchActionId[]} */
  const actions = ['plan'];

  // If query suggests recency (“2025”, “latest”, “year-end review”), add update-check. [web:17]
  if (/\b(202[4-6]|latest|recent|year-end)\b/i.test(lc)) {
    actions.push('update-check');
  }

  // If it mentions "vs", "compare", or multiple entities → contrastive. [web:10][web:12]
  if (/\b(vs|versus|compare|comparison)\b/i.test(lc)) {
    actions.push('contrastive');
  }

  // Add multi-hop for complex, multi-constraint questions. [web:2][web:10]
  if (/\b(implications|impact|pipeline|architecture|multi-step|workflow)\b/i.test(lc)) {
    actions.push('multi-hop');
  }

  // Always start with hybrid-search for research workloads. [web:10][web:15]
  actions.push('hybrid-search');

  // Add focused-search when clear domains are present (e.g., "Azure Search", "Oracle Vector"). [web:4][web:6]
  if (/\b(azure|oracle|elastic|postgres|pgvector|opensearch)\b/i.test(lc)) {
    actions.push('focused-search');
  }

  // Fact-check pass for research & security topics. [web:14][web:2]
  if (/\b(fact-check|verify|source|citation|security|malware|phishing)\b/i.test(lc)) {
    actions.push('fact-check');
    actions.push('source-audit');
  }

  // Exploratory browsing to discover hidden/obscure documents. [web:2][web:16]
  actions.push('exploratory-browse');

  return actions;
}

/**
 * Build a structured search query from user query and action.
 */
function vcRsBuildSearchQuery(rawQuery, action) {
  const cleaned = vcRsSanitizeQuery(rawQuery);
  const lc = cleaned.toLowerCase();

  /** @type {VCSearchQuery} */
  const q = {
    userQuery: cleaned,
    mustKeywords: [],
    shouldKeywords: [],
    excludedKeywords: [],
    siteFilters: [],
    timeRange: null
  };

  // Generic tokenization: crude, but deterministic.
  const tokens = lc.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    if (!q.mustKeywords.includes(tok)) {
      q.mustKeywords.push(tok);
    }
  }

  // Action-specific shaping. [web:14][web:10]
  if (action === 'focused-search') {
    if (lc.includes('azure')) {
      q.siteFilters.push('learn.microsoft.com', 'azure.microsoft.com');
    }
    if (lc.includes('oracle')) {
      q.siteFilters.push('oracle.com');
    }
    if (lc.includes('elastic')) {
      q.siteFilters.push('elastic.co');
    }
  } else if (action === 'fact-check') {
    q.siteFilters.push('wikipedia.org', 'arxiv.org', 'ieee.org');
  } else if (action === 'update-check') {
    q.timeRange = 'past_year';
  } else if (action === 'exploratory-browse') {
    // Encourage broad coverage by not setting site filters; trim mustKeywords. [web:2][web:16]
    q.mustKeywords = tokens.slice(0, Math.min(tokens.length, 5));
  }

  return q;
}

// -----------------------------------------------------------------------------
// Section 7. Result structures and scoring
// -----------------------------------------------------------------------------

/**
 * @typedef {Object} VCSearchResult
 * @property {string} id
 * @property {string} url
 * @property {string} title
 * @property {string} snippet
 * @property {number} sparseScore
 * @property {number} denseScore
 * @property {number} hybridScore
 * @property {VCDomainTrustTier} trustTier
 * @property {VCUrlSecurityStatus} securityStatus
 * @property {number} securityScore
 * @property {number} finalScore
 * @property {string|null} publishedDateISO
 */

/**
 * Compute a final multi-factor score for a result. [web:2][web:10]
 */
function vcRsComputeFinalScore(result, cfg, nowMs) {
  const w = cfg.scoringWeights;

  // Relevance approximated by hybrid score.
  const relevance = result.hybridScore;

  // Authority from domain trust. [web:14]
  const authority = vcRsAuthorityScore(result.trustTier);

  // Recency: simple decay over 2 years.
  let recencyScore = 0.5;
  if (result.publishedDateISO) {
    const ts = Date.parse(result.publishedDateISO);
    if (!Number.isNaN(ts)) {
      const ageDays = (nowMs - ts) / (1000 * 60 * 60 * 24);
      if (ageDays <= 30) recencyScore = 1.0;
      else if (ageDays <= 365) recencyScore = 0.8;
      else if (ageDays <= 730) recencyScore = 0.6;
      else recencyScore = 0.3;
    }
  }

  // Diversity is handled at list-level; here we treat each result equally. [web:12]
  const diversityScore = 0.5;

  // Security from URL assessment. [web:13][web:16][web:17]
  const securityScore = result.securityScore;

  return (
    w.relevance * relevance +
    w.authority * authority +
    w.recency * recencyScore +
    w.diversity * diversityScore +
    w.security * securityScore
  );
}

/**
 * De-duplicate results by URL and title.
 */
function vcRsDeduplicate(results) {
  const seen = new Set();
  const out = [];
  for (const r of results) {
    const key = r.url + '|' + r.title;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

/**
 * Enforce per-domain caps for diversity. [web:12]
 */
function vcRsCapPerDomain(results, cfg) {
  const perDomainCounts = {};
  const out = [];
  for (const r of results) {
    const host = vcRsHostname(r.url);
    const current = perDomainCounts[host] || 0;
    if (current >= cfg.maxPerDomain) continue;
    perDomainCounts[host] = current + 1;
    out.push(r);
  }
  return out;
}

// -----------------------------------------------------------------------------
// Section 8. Ingestion-level decisions & hidden document pathways
// -----------------------------------------------------------------------------

/**
 * Decide ingestion level based on URL and trust tier.
 */
function vcRsDecideIngestionLevel(result) {
  const tier = result.trustTier;
  if (tier === 'authoritative') return 'structured';
  if (tier === 'high-trust') return 'full-html';
  return 'title-snippet';
}

/**
 * Generate exploratory link-follow actions to uncover hidden or obscure docs:
 *   - "Sibling" path variants.
 *   - Query-expansion for alternate naming. [web:2][web:16]
 */
function vcRsGenerateExploratoryPaths(seedResult) {
  const url = seedResult.url;
  const u = new URL(url);
  const paths = [];

  const segments = u.pathname.split('/').filter(Boolean);
  if (segments.length > 1) {
    // Parent path.
    const parent = '/' + segments.slice(0, segments.length - 1).join('/') + '/';
    paths.push(new URL(parent, u.origin).toString());
  }

  // Simple sibling pattern: replace numeric suffixes.
  const last = segments[segments.length - 1] || '';
  const m = last.match(/^(.*?)(\d+)(\.[^.]*)?$/);
  if (m) {
    const base = m[1];
    const ext = m[3] || '';
    const n1 = Number(m[2]);
    for (let delta = -1; delta <= 1; delta++) {
      const candidate = n1 + delta;
      if (candidate <= 0 || candidate === n1) continue;
      const sibName = base + candidate.toString() + ext;
      const sibPath = '/' + segments.slice(0, segments.length - 1).concat(sibName).join('/');
      paths.push(new URL(sibPath, u.origin).toString());
    }
  }

  return paths;
}

// -----------------------------------------------------------------------------
// Section 9. Public orchestrator API
// -----------------------------------------------------------------------------

/**
 * @typedef {Object} VCResearchTurnMetric
 * @property {number} coverageScore      // fraction of unique domains hit.
 * @property {number} redundancyScore    // 1 - duplicateRate.
 * @property {number} avgAuthorityScore
 * @property {number} avgSecurityScore
 * @property {number} resultCount
 */

/**
 * @typedef {Object} VCResearchTurnOutput
 * @property {string} requestId
 * @property {string} query
 * @property {VCResearchActionId[]} actionsPlanned
 * @property {VCSearchResult[]} results
 * @property {VCResearchTurnMetric} metrics
 */

/**
 * Core orchestrator. It expects two injected backends:
 *   - keywordBackend: function(searchQuery, limit) -> Promise<VCSearchResult[]>
 *   - denseBackend: function(searchQuery, limit) -> Promise<VCSearchResult[]>
 *
 * These are platform-specific adapters around actual web search / vector DB backends. [web:10][web:9]
 *
 * NOTE: This router does not perform network requests itself; it is a policy + scoring layer.
 */
async function vcResearchTurn(rawQuery, keywordBackend, denseBackend, userConfig) {
  const cfg = Object.assign({}, VC_DEFAULT_CONFIG, userConfig || {});
  const requestId = vcRsRequestId();
  const nowMs = vcRsNowMs();

  const actions = vcRsPlanActions(rawQuery);
  const mainAction =
    actions.includes('hybrid-search')
      ? 'hybrid-search'
      : actions[actions.length - 1];

  const structuredQuery = vcRsBuildSearchQuery(rawQuery, mainAction);

  // 1) Call sparse and dense retrievers in parallel. [web:10][web:15]
  const limit = cfg.maxResultsPerAction;
  const [sparseResults, denseResults] = await Promise.all([
    keywordBackend(structuredQuery, limit),
    denseBackend(structuredQuery, limit)
  ]);

  // 2) Normalize into map by URL ID.
  /** @type {Record<string,VCSearchResult>} */
  const merged = {};

  function ingest(list, isDense) {
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const id = r.id || r.url;
      if (!merged[id]) {
        merged[id] = {
          id,
          url: r.url,
          title: r.title || '',
          snippet: r.snippet || '',
          sparseScore: 0.0,
          denseScore: 0.0,
          hybridScore: 0.0,
          trustTier: 'unknown',
          securityStatus: 'clean',
          securityScore: 1.0,
          finalScore: 0.0,
          publishedDateISO: r.publishedDateISO || null
        };
      }
      if (isDense) {
        merged[id].denseScore = r.denseScore;
      } else {
        merged[id].sparseScore = r.sparseScore;
      }
    }
  }

  ingest(sparseResults, false);
  ingest(denseResults, true);

  const idsDense = denseResults.map(r => r.id || r.url);
  const idsSparse = sparseResults.map(r => r.id || r.url);
  const rrfScores = vcRsRrf(idsDense, idsSparse, cfg.rrf.k);

  // 3) Compute hybrid and final scores, trust, security. [web:8][web:10][web:13][web:16][web:17]
  const allResults = Object.values(merged);
  for (const r of allResults) {
    const h = vcRsWeightedHybridScore(r.denseScore, r.sparseScore, cfg);
    r.hybridScore = h + (rrfScores[r.id] || 0.0);

    const host = vcRsHostname(r.url);
    r.trustTier = vcRsDomainTrustTier(host, cfg);

    const sec = vcRsAssessUrlSecurity(r.url, cfg);
    r.securityStatus = sec.status;
    r.securityScore = sec.score;

    r.finalScore = vcRsComputeFinalScore(r, cfg, nowMs);
  }

  // 4) Drop blocked URLs and deduplicate. [web:17]
  let filtered = allResults.filter(r => r.securityStatus !== 'blocked');
  filtered = vcRsDeduplicate(filtered);
  filtered = vcRsCapPerDomain(filtered, cfg);

  // 5) Sort by finalScore descending.
  filtered.sort((a, b) => b.finalScore - a.finalScore);

  // 6) Compute metrics for this turn. [web:2][web:10]
  const domains = new Set();
  let authSum = 0;
  let secSum = 0;
  for (const r of filtered) {
    domains.add(vcRsHostname(r.url));
    authSum += vcRsAuthorityScore(r.trustTier);
    secSum += r.securityScore;
  }
  const resultCount = filtered.length;
  const avgAuthorityScore = resultCount ? authSum / resultCount : 0;
  const avgSecurityScore = resultCount ? secSum / resultCount : 0;
  const coverageScore = domains.size / Math.max(1, resultCount);
  const redundancyScore = 1.0; // Already deduplicated; can be refined if original counts are tracked.

  /** @type {VCResearchTurnOutput} */
  const out = {
    requestId,
    query: vcRsSanitizeQuery(rawQuery),
    actionsPlanned: actions,
    results: filtered,
    metrics: {
      coverageScore,
      redundancyScore,
      avgAuthorityScore,
      avgSecurityScore,
      resultCount
    }
  };

  return out;
}

// -----------------------------------------------------------------------------
// Section 10. Example adapter contracts (stubs, fill with platform backends)
// -----------------------------------------------------------------------------

/**
 * Example keyword (sparse) backend adapter signature. [web:9][web:10][web:4]
 * Implement this against:
 *   - Search engine APIs (Bing, Google Custom Search, etc.).
 *   - Local BM25 / pgvector+BM25 hybrid indices.
 */
async function exampleKeywordBackend(searchQuery, limit) {
  // This is a stub to show the shape. Replace with real implementation.
  // IMPORTANT: All numeric scores must be finite; apply normalization upstream.
  const dummy = /** @type {VCSearchResult[]} */ ([]);
  void searchQuery;
  void limit;
  return dummy;
}

/**
 * Example dense (vector) backend adapter signature using embeddings. [web:10][web:15]
 */
async function exampleDenseBackend(searchQuery, limit) {
  const dummy = /** @type {VCSearchResult[]} */ ([]);
  void searchQuery;
  void limit;
  return dummy;
}

// -----------------------------------------------------------------------------
// Section 11. Exports
// -----------------------------------------------------------------------------

const VisualCodeResearchSearch = {
  VC_RS_VERSION,
  VC_RS_BUILD_ID,
  VC_DEFAULT_CONFIG,
  vcResearchTurn,
  vcRsPlanActions,
  vcRsBuildSearchQuery,
  vcRsDecideIngestionLevel,
  vcRsGenerateExploratoryPaths
};

// CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VisualCodeResearchSearch;
}

// Browser / ESM global
if (typeof window !== 'undefined') {
  window.VisualCodeResearchSearch = VisualCodeResearchSearch;
}
