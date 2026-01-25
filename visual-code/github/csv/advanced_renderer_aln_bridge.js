// File: visual-code/github/csv/advanced_renderer_aln_bridge.js
// Platform: Windows/Linux/Ubuntu, Android/iOS (via WebView/Electron/Tauri/etc.)
// Language: Javascript (sanitized, production-grade)
//
// Purpose:
// - Provide a GitHub-like CSV renderer core that is:
//   * Renderer-agnostic: React/Vanilla/Web Components compatible.
//   * Encoding-aware: UTF‑8/UTF‑16/Latin‑1 safe where platform supports it.
//   * Dialect-aware: custom delimiters, quotes, escapes, comments.
//   * Schema-aware: column typing, null representations, display hints.
//   * ALN-aware: parses embedded ALN syntax cells for qpudatashards and
//                machine-parsable ALN blocks.
//   * AI-assistive ready: hooks for captioning, semantic summaries, and
//                         “augmented-citizen” assistive overlays.
// - Designed to interoperate with existing CSV viewers/editors on GitHub-like
//   platforms and external tools (e.g. Tailwind+PapaParse viewers) by exposing
//   a clean, serialized JSON table + rich metadata layer. [web:7][web:15][web:17]
//
// Notes:
// - No framework dependency; this is a pure logic core.
// - You can plug this into:
//   * A VS Code extension WebView.
//   * A GitHub-style “Preview CSV” route.
//   * A Tailwind / DataTables / PapaParse front-end. [web:15][web:17]
// - ALN grammar here is a minimal, self-contained subset for qpudatashards,
//   implemented without external parsers, fully deterministic and documented.

"use strict";

/**
 * -----------------------------------------------------------------------------
 * Section 1. Core type definitions (JSDoc) and constants
 * -----------------------------------------------------------------------------
 */

/**
 * @typedef {'auto'|'utf8'|'utf16le'|'utf16be'|'latin1'} VCCsvEncoding
 * @typedef {'comma'|'semicolon'|'tab'|'pipe'|'custom'} VCCsvDelimiterKind
 * @typedef {'none'|'simple'|'paged'} VCPaginationMode
 * @typedef {'plain'|'markdown'|'aln'|'numeric'|'datetime'|'boolean'} VCColumnKind
 * @typedef {'left'|'center'|'right'} VCAlign
 * @typedef {'none'|'error'|'warning'|'info'} VCSeverity
 */

/**
 * @typedef {Object} VCColumnSchema
 * @property {string} name
 * @property {VCColumnKind} kind
 * @property {string} [format]          - e.g. "yyyy-MM-dd", "0.00"
 * @property {boolean} [isPrimaryKey]
 * @property {boolean} [isReadOnly]
 * @property {VCAlign} [align]
 * @property {string[]} [enumValues]
 */

/**
 * @typedef {Object} VCParsedCell
 * @property {string|null} raw            - original string (after unescape)
 * @property {any} value                  - typed value (null, number, boolean, Date ISO, string, ALN AST)
 * @property {boolean} isNull
 * @property {boolean} isError
 * @property {string[]} [tags]            - semantic tags, e.g. ["primary-key","aln-block","qpudatashard"]
 * @property {VCSeverity} severity
 * @property {string[]} messages          - validation or parse messages
 */

/**
 * @typedef {Object} VCParsedRow
 * @property {number} index
 * @property {VCParsedCell[]} cells
 */

/**
 * @typedef {Object} VCAlnNode
 * @property {string} type         - "kv_pair" | "list" | "atom" | "qpu_shard"
 * @property {string} [key]
 * @property {VCAlnNode[]} [children]
 * @property {string|number|boolean|null} [atom]
 */

/**
 * @typedef {Object} VCAlnParseResult
 * @property {boolean} ok
 * @property {VCAlnNode|null} ast
 * @property {string[]} messages
 */

/**
 * @typedef {Object} VCCsvDialect
 * @property {string} delimiter           - single character
 * @property {string} quote               - single character
 * @property {string} escape              - single character
 * @property {string|null} commentPrefix  - line-level comment prefix (e.g. "#")
 */

/**
 * @typedef {Object} VCNullPolicy
 * @property {string[]} representations   - e.g. ["", "NULL", "null", "NaN"]
 */

/**
 * @typedef {Object} VCAlnPolicy
 * @property {boolean} enableAln
 * @property {string[]} columnNameHints   - columns likely to contain ALN
 * @property {string[]} cellPrefixes      - e.g. ["ALN{", "aln:"]
 * @property {boolean} qpudatashardStrict - require qpu_shard header for qpudatashards
 */

/**
 * @typedef {Object} VCAIAssistConfig
 * @property {boolean} enableSummaries
 * @property {boolean} enableCellTooltips
 * @property {boolean} enableAccessibilityHints
 * @property {number} [maxPreviewRows]
 */

/**
 * @typedef {Object} VCTableMeta
 * @property {number} totalRows
 * @property {number} totalColumns
 * @property {string[]} header
 * @property {VCColumnSchema[]} schema
 * @property {string|null} sourceFilename
 * @property {VCCsvDialect} dialect
 * @property {VCNullPolicy} nullPolicy
 * @property {VCAlnPolicy} alnPolicy
 * @property {VCAIAssistConfig} aiAssist
 * @property {VCPaginationMode} paginationMode
 */

/**
 * @typedef {Object} VCTableAIAssist
 * @property {string|null} tableSummary
 * @property {string[]} columnSummaries
 * @property {Object<string,string>} accessibilityHints
 */

/**
 * @typedef {Object} VCGitHubCsvRenderResult
 * @property {VCTableMeta} meta
 * @property {VCParsedRow[]} rows
 * @property {VCTableAIAssist} aiAssist
 */

/**
 * @typedef {Object} VCGitHubCsvRenderOptions
 * @property {VCCsvEncoding} [encoding]
 * @property {VCCsvDialect} [dialect]
 * @property {VCNullPolicy} [nullPolicy]
 * @property {VCAIAssistConfig} [aiAssist]
 * @property {VCPaginationMode} [paginationMode]
 * @property {number} [maxRows]
 * @property {string|null} [sourceFilename]
 * @property {VCColumnSchema[]} [schema]
 * @property {VCAlnPolicy} [alnPolicy]
 */

/**
 * Default dialects and policies, safe for GitHub-like CSV preview. [web:7][web:15][web:17]
 */
const VC_DEFAULT_DIALECT = /** @type {VCCsvDialect} */ ({
  delimiter: ",",
  quote: "\"",
  escape: "\"",
  commentPrefix: null
});

const VC_DEFAULT_NULL_POLICY = /** @type {VCNullPolicy} */ ({
  representations: ["", "NULL", "null", "NaN", "N/A"]
});

const VC_DEFAULT_ALN_POLICY = /** @type {VCAlnPolicy} */ ({
  enableAln: true,
  columnNameHints: ["aln", "metadata", "config", "shard", "qpudatashard"],
  cellPrefixes: ["ALN{", "aln{", "aln:", "ALN:"],
  qpudatashardStrict: false
});

const VC_DEFAULT_AI_ASSIST = /** @type {VCAIAssistConfig} */ ({
  enableSummaries: true,
  enableCellTooltips: true,
  enableAccessibilityHints: true,
  maxPreviewRows: 200
});

/**
 * -----------------------------------------------------------------------------
 * Section 2. Utility functions: encoding, sanitization, splitting
 * -----------------------------------------------------------------------------
 */

/**
 * Safely normalize line endings and strip BOM if present.
 * Works on already-decoded strings; binary decoding handled externally. [web:13]
 * @param {string} text
 * @returns {string}
 */
function vcNormalizeNewlinesAndBom(text) {
  if (!text) return "";
  let out = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (out.charCodeAt(0) === 0xfeff) {
    out = out.slice(1);
  }
  return out;
}

/**
 * Simple CSV line splitter respecting quotes and escapes.
 * Streaming-friendly and compatible with GitHub-like previewers. [web:15][web:17]
 * @param {string} line
 * @param {VCCsvDialect} dialect
 * @returns {string[]}
 */
function vcSplitCsvLine(line, dialect) {
  const delim = dialect.delimiter;
  const quote = dialect.quote;
  const escape = dialect.escape;

  /** @type {string[]} */
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === escape && line[i + 1] === quote) {
        cur += quote;
        i++;
      } else if (ch === quote) {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === delim) {
        out.push(cur);
        cur = "";
      } else if (ch === quote) {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

/**
 * Heuristic schema/column kind inference (numbers, booleans, datetime, ALN). [web:17]
 * @param {string[][]} rows
 * @param {VCNullPolicy} nullPolicy
 * @param {VCAlnPolicy} alnPolicy
 * @returns {VCColumnSchema[]}
 */
function vcInferSchema(rows, nullPolicy, alnPolicy) {
  const header = rows.length > 0 ? rows[0] : [];
  const body = rows.slice(1);
  /** @type {VCColumnSchema[]} */
  const schema = [];
  const maxSample = Math.min(body.length, 100);

  for (let colIdx = 0; colIdx < header.length; colIdx++) {
    const name = header[colIdx] || `col_${colIdx}`;
    let kind = /** @type {VCColumnKind} */ ("plain");
    let numericScore = 0;
    let boolScore = 0;
    let datetimeScore = 0;
    let alnScore = 0;

    const nameLower = String(name).toLowerCase();
    const alnNameHint = alnPolicy.columnNameHints.some(h => nameLower.includes(h.toLowerCase()));

    for (let r = 0; r < maxSample; r++) {
      const row = body[r];
      if (!row || colIdx >= row.length) continue;
      const raw = row[colIdx];
      if (vcIsNullLike(raw, nullPolicy)) continue;

      if (vcLooksLikeNumber(raw)) numericScore++;
      if (vcLooksLikeBool(raw)) boolScore++;
      if (vcLooksLikeDate(raw)) datetimeScore++;
      if (alnPolicy.enableAln && vcLooksLikeAln(raw, alnPolicy)) alnScore++;
    }

    if (alnPolicy.enableAln && (alnScore > 0 || alnNameHint)) {
      kind = "aln";
    } else if (numericScore >= boolScore && numericScore >= datetimeScore && numericScore > 0) {
      kind = "numeric";
    } else if (boolScore > numericScore && boolScore >= datetimeScore && boolScore > 0) {
      kind = "boolean";
    } else if (datetimeScore > numericScore && datetimeScore > boolScore && datetimeScore > 0) {
      kind = "datetime";
    }

    /** @type {VCAlign} */
    let align = "left";
    if (kind === "numeric") align = "right";
    if (kind === "datetime") align = "center";

    schema.push({
      name,
      kind,
      format: kind === "datetime" ? "iso" : undefined,
      isPrimaryKey: colIdx === 0,
      isReadOnly: true,
      align,
      enumValues: undefined
    });
  }

  return schema;
}

/**
 * Null-like detection (empty, "NULL", etc.) [web:17]
 * @param {string} v
 * @param {VCNullPolicy} nullPolicy
 * @returns {boolean}
 */
function vcIsNullLike(v, nullPolicy) {
  const t = String(v).trim();
  for (let i = 0; i < nullPolicy.representations.length; i++) {
    if (t === nullPolicy.representations[i]) return true;
  }
  return false;
}

function vcLooksLikeNumber(v) {
  const t = String(v).trim();
  if (!t) return false;
  if (/^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t)) return true;
  return false;
}

function vcLooksLikeBool(v) {
  const t = String(v).trim().toLowerCase();
  return t === "true" || t === "false" || t === "yes" || t === "no";
}

function vcLooksLikeDate(v) {
  const t = String(v).trim();
  if (!t) return false;
  if (/^\d{4}-\d{2}-\d{2}(?:[ tT]\d{2}:\d{2}(:\d{2})?)?$/.test(t)) return true;
  return false;
}

/**
 * Heuristic ALN cell detection: prefix match or recognized delimiters. [file:1]
 * @param {string} v
 * @param {VCAlnPolicy} alnPolicy
 * @returns {boolean}
 */
function vcLooksLikeAln(v, alnPolicy) {
  const t = String(v).trim();
  if (!t) return false;
  for (let i = 0; i < alnPolicy.cellPrefixes.length; i++) {
    if (t.startsWith(alnPolicy.cellPrefixes[i])) return true;
  }
  if (t.startsWith("{") && t.endsWith("}")) return true;
  if (t.startsWith("[") && t.endsWith("]")) return true;
  if (t.includes("=") && t.includes(";")) return true;
  return false;
}

/**
 * -----------------------------------------------------------------------------
 * Section 3. Minimal ALN parser for qpudatashards
 * -----------------------------------------------------------------------------
 *
 * ALN subset grammar:
 *   ALN      := BLOCK
 *   BLOCK    := '{' PAIRS '}'
 *   PAIRS    := PAIR (';' PAIR)*
 *   PAIR     := KEY '=' VALUE
 *   KEY      := /[a-zA-Z_][a-zA-Z0-9_]*/
 *   VALUE    := LIST | ATOM
 *   LIST     := '[' ITEMS ']'
 *   ITEMS    := VALUE (',' VALUE)*
 *   ATOM     := NUMBER | BOOLEAN | STRING
 *   STRING   := '"' <no quote> '"' | unquoted token
 *
 * qpudatashard specialisation:
 *   - Key "qpu_shard" or "qpudatashard" identifies a QPU data shard metadata block.
 *   - When qpudatashardStrict=true, ALN must include that key to be treated as
 *     qpudatashard; otherwise it is generic ALN metadata. [file:1]
 */

/**
 * Tokenizer for ALN subset.
 * @param {string} src
 * @returns {string[]}
 */
function vcAlnTokenize(src) {
  const s = src.trim();
  const tokens = [];
  let cur = "";
  let inString = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (ch === "\"") {
        cur += ch;
        tokens.push(cur);
        cur = "";
        inString = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === "\"") {
        if (cur.trim().length > 0) {
          tokens.push(cur.trim());
        }
        cur = "\"";
        inString = true;
      } else if ("{}[]=;, ".indexOf(ch) >= 0) {
        if (cur.trim().length > 0) {
          tokens.push(cur.trim());
          cur = "";
        }
        if (ch !== " " && ch !== "\t" && ch !== "\n" && ch !== "\r") {
          tokens.push(ch);
        }
      } else {
        cur += ch;
      }
    }
  }
  if (cur.trim().length > 0) {
    tokens.push(cur.trim());
  }
  return tokens;
}

/**
 * Recursive descent parser for ALN subset.
 * @param {string} src
 * @param {VCAlnPolicy} alnPolicy
 * @returns {VCAlnParseResult}
 */
function vcParseAln(src, alnPolicy) {
  const tokens = vcAlnTokenize(src);
  let idx = 0;
  const messages = [];

  function peek() {
    return tokens[idx];
  }

  function consume(expected) {
    const t = tokens[idx];
    if (expected && t !== expected) {
      messages.push(`Expected '${expected}' but found '${t || "<eof>"}'`);
      return null;
    }
    idx++;
    return t;
  }

  function parseBlock() {
    const start = consume("{");
    if (!start) return null;
    /** @type {VCAlnNode} */
    const node = { type: "list", children: [] };
    while (idx < tokens.length && peek() !== "}") {
      const pair = parsePair();
      if (!pair) break;
      node.children.push(pair);
      if (peek() === ";") consume(";");
    }
    if (peek() === "}") consume("}");
    return node;
  }

  function parsePair() {
    const keyTok = peek();
    if (!keyTok) {
      messages.push("Unexpected end of ALN while expecting key");
      return null;
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(keyTok)) {
      messages.push(`Invalid key token '${keyTok}'`);
      return null;
    }
    consume(); // key
    if (!consume("=")) return null;
    const valueNode = parseValue();
    if (!valueNode) return null;
    /** @type {VCAlnNode} */
    const node = {
      type: "kv_pair",
      key: keyTok,
      children: [valueNode]
    };
    return node;
  }

  function parseValue() {
    const t = peek();
    if (!t) {
      messages.push("Unexpected end of ALN while expecting value");
      return null;
    }
    if (t === "[") {
      return parseList();
    }
    if (t === "{") {
      return parseBlock();
    }
    return parseAtom();
  }

  function parseList() {
    consume("[");
    /** @type {VCAlnNode} */
    const node = { type: "list", children: [] };
    while (idx < tokens.length && peek() !== "]") {
      const vNode = parseValue();
      if (!vNode) break;
      node.children.push(vNode);
      if (peek() === ",") consume(",");
    }
    if (peek() === "]") consume("]");
    return node;
  }

  function parseAtom() {
    const t = peek();
    if (!t) return null;
    consume();

    let atomVal = null;
    if (t[0] === "\"" && t[t.length - 1] === "\"") {
      atomVal = t.slice(1, -1);
    } else if (/^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t)) {
      atomVal = Number(t);
    } else if (/^(true|false)$/i.test(t)) {
      atomVal = /^true$/i.test(t);
    } else if (/^null$/i.test(t)) {
      atomVal = null;
    } else {
      atomVal = t;
    }

    /** @type {VCAlnNode} */
    const node = { type: "atom", atom: atomVal };
    return node;
  }

  const root = parseBlock();
  const ok = !!root && messages.length === 0;

  let finalRoot = root;
  if (ok && alnPolicy.qpudatashardStrict && root) {
    const hasShard = vcAlnHasShard(root, ["qpu_shard", "qpudatashard"]);
    if (!hasShard) {
      messages.push("ALN parsed but does not contain qpu_shard/qpudatashard");
    } else {
      finalRoot = { type: "qpu_shard", children: [root] };
    }
  } else if (ok && root && vcAlnHasShard(root, ["qpu_shard", "qpudatashard"])) {
    finalRoot = { type: "qpu_shard", children: [root] };
  }

  return {
    ok: ok && messages.length === 0,
    ast: messages.length === 0 ? finalRoot : root,
    messages
  };
}

/**
 * Detect presence of qpudatashard keys. [file:1]
 * @param {VCAlnNode} node
 * @param {string[]} keys
 * @returns {boolean}
 */
function vcAlnHasShard(node, keys) {
  if (!node) return false;
  if (node.type === "kv_pair" && node.key) {
    const kLower = node.key.toLowerCase();
    for (let i = 0; i < keys.length; i++) {
      if (kLower === keys[i].toLowerCase()) return true;
    }
  }
  if (node.children) {
    for (let i = 0; i < node.children.length; i++) {
      if (vcAlnHasShard(node.children[i], keys)) return true;
    }
  }
  return false;
}

/**
 * -----------------------------------------------------------------------------
 * Section 4. Cell parsing and typing (numeric, bool, datetime, ALN)
 * -----------------------------------------------------------------------------
 */

/**
 * Parse a single cell using inferred or provided column schema. [web:17]
 * @param {string} raw
 * @param {VCColumnSchema} col
 * @param {VCNullPolicy} nullPolicy
 * @param {VCAlnPolicy} alnPolicy
 * @returns {VCParsedCell}
 */
function vcParseCell(raw, col, nullPolicy, alnPolicy) {
  const trimmed = String(raw);
  const isNull = vcIsNullLike(trimmed, nullPolicy);
  /** @type {string[]} */
  const messages = [];
  /** @type {string[]} */
  const tags = [];
  /** @type {VCSeverity} */
  let severity = "none";

  if (isNull) {
    return {
      raw: null,
      value: null,
      isNull: true,
      isError: false,
      tags,
      severity,
      messages
    };
  }

  let value = trimmed;
  let isError = false;

  switch (col.kind) {
    case "numeric": {
      const ok = vcLooksLikeNumber(trimmed);
      if (!ok) {
        isError = true;
        severity = "warning";
        messages.push("Expected numeric value");
      } else {
        value = Number(trimmed);
      }
      break;
    }
    case "boolean": {
      const t = trimmed.toLowerCase();
      if (t === "true" || t === "yes") {
        value = true;
      } else if (t === "false" || t === "no") {
        value = false;
      } else {
        isError = true;
        severity = "warning";
        messages.push("Expected boolean value");
      }
      break;
    }
    case "datetime": {
      if (vcLooksLikeDate(trimmed)) {
        const d = new Date(trimmed);
        if (!isNaN(d.getTime())) {
          value = d.toISOString();
        } else {
          isError = true;
          severity = "warning";
          messages.push("Invalid datetime");
        }
      } else {
        isError = true;
        severity = "warning";
        messages.push("Expected ISO date/time");
      }
      break;
    }
    case "aln": {
      if (alnPolicy.enableAln && vcLooksLikeAln(trimmed, alnPolicy)) {
        const alnRes = vcParseAln(trimmed.replace(/^ALN[:{]/i, "{"), alnPolicy);
        if (alnRes.ok && alnRes.ast) {
          value = alnRes.ast;
          tags.push("aln-block");
          if (alnRes.ast.type === "qpu_shard") {
            tags.push("qpudatashard");
          }
        } else {
          isError = true;
          severity = "error";
          messages.push(...alnRes.messages);
        }
      } else {
        tags.push("aln-plain-text");
      }
      break;
    }
    case "markdown": {
      tags.push("markdown");
      value = trimmed;
      break;
    }
    case "plain":
    default: {
      value = trimmed;
      break;
    }
  }

  if (col.isPrimaryKey) {
    tags.push("primary-key");
  }

  return {
    raw: trimmed,
    value,
    isNull: false,
    isError,
    tags,
    severity,
    messages
  };
}

/**
 * -----------------------------------------------------------------------------
 * Section 5. AI-assistive summarization hooks (renderer-agnostic)
 * -----------------------------------------------------------------------------
 *
 * These are lightweight heuristics intended to power:
 * - screen-reader summaries,
 * - “augmented-citizen” overlays,
 * - automatic caption text for images/screenshots of CSV tables. [web:17]
 */

/**
 * Quick table-level summary.
 * @param {VCTableMeta} meta
 * @returns {string}
 */
function vcSummarizeTable(meta) {
  const cols = meta.totalColumns;
  const rows = meta.totalRows;
  const file = meta.sourceFilename || "this CSV table";
  return `${file} has ${rows} data rows and ${cols} columns; primary key is '${meta.schema[0]?.name || "first column"}'.`;
}

/**
 * Column summaries for assistive overlays.
 * @param {VCTableMeta} meta
 * @returns {string[]}
 */
function vcSummarizeColumns(meta) {
  return meta.schema.map((col, idx) => {
    const role = col.isPrimaryKey ? "primary key" : "data";
    const kind = col.kind;
    return `Column ${idx + 1} '${col.name}' is a ${kind} ${role} column.`;
  });
}

/**
 * Accessibility hints for screen-readers.
 * @param {VCTableMeta} meta
 * @returns {Object<string,string>}
 */
function vcBuildAccessibilityHints(meta) {
  /** @type {Object<string,string>} */
  const hints = {};
  for (let i = 0; i < meta.schema.length; i++) {
    const col = meta.schema[i];
    const key = `col:${col.name}`;
    let desc = `Column '${col.name}' displays ${col.kind} values.`;
    if (col.kind === "aln") {
      desc += " Values contain ALN configuration or qpudatashard metadata.";
    }
    if (col.isPrimaryKey) {
      desc += " This column acts as a primary key identifier.";
    }
    hints[key] = desc;
  }
  return hints;
}

/**
 * -----------------------------------------------------------------------------
 * Section 6. Main entry: GitHub-like CSV renderer core with ALN integration
 * -----------------------------------------------------------------------------
 */

/**
 * Parse and normalize CSV text into a typed table structure ready for any renderer.
 *
 * This function is intentionally framework-agnostic so it can back:
 * - GitHub-style CSV preview in a browser.
 * - VS Code / JetBrains plugins.
 * - Tailwind + DataTables viewers. [web:17]
 *
 * @param {string} csvText               - already decoded text
 * @param {VCGitHubCsvRenderOptions} [options]
 * @returns {VCGitHubCsvRenderResult}
 */
function vcRenderGitHubCsv(csvText, options) {
  const opts = options || {};
  const dialect = opts.dialect || VC_DEFAULT_DIALECT;
  const nullPolicy = opts.nullPolicy || VC_DEFAULT_NULL_POLICY;
  const alnPolicy = opts.alnPolicy || VC_DEFAULT_ALN_POLICY;
  const aiAssistCfg = opts.aiAssist || VC_DEFAULT_AI_ASSIST;
  const paginationMode = opts.paginationMode || "simple";
  const maxRows = typeof opts.maxRows === "number" && opts.maxRows > 0 ? opts.maxRows : 5000;

  const normalized = vcNormalizeNewlinesAndBom(csvText);
  const lines = normalized.split("\n");

  /** @type {string[][]} */
  const rawRows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line && i === lines.length - 1) continue;
    if (dialect.commentPrefix && line.startsWith(dialect.commentPrefix)) continue;
    rawRows.push(vcSplitCsvLine(line, dialect));
    if (rawRows.length > maxRows + 1) break;
  }

  const header = rawRows.length > 0 ? rawRows[0] : [];
  const body = rawRows.slice(1);

  const schema = (opts.schema && opts.schema.length === header.length)
    ? opts.schema
    : vcInferSchema(rawRows, nullPolicy, alnPolicy);

  /** @type {VCParsedRow[]} */
  const rows = [];

  for (let rIdx = 0; rIdx < body.length && rIdx < maxRows; rIdx++) {
    const row = body[rIdx];
    /** @type {VCParsedCell[]} */
    const cells = [];
    for (let cIdx = 0; cIdx < schema.length; cIdx++) {
      const col = schema[cIdx];
      const raw = cIdx < row.length ? row[cIdx] : "";
      cells.push(vcParseCell(raw, col, nullPolicy, alnPolicy));
    }
    rows.push({ index: rIdx, cells });
  }

  /** @type {VCTableMeta} */
  const meta = {
    totalRows: body.length,
    totalColumns: header.length,
    header,
    schema,
    sourceFilename: opts.sourceFilename || null,
    dialect,
    nullPolicy,
    alnPolicy,
    aiAssist: aiAssistCfg,
    paginationMode
  };

  /** @type {VCTableAIAssist} */
  const aiAssist = {
    tableSummary: aiAssistCfg.enableSummaries ? vcSummarizeTable(meta) : null,
    columnSummaries: aiAssistCfg.enableSummaries ? vcSummarizeColumns(meta) : [],
    accessibilityHints: aiAssistCfg.enableAccessibilityHints ? vcBuildAccessibilityHints(meta) : {}
  };

  return {
    meta,
    rows,
    aiAssist
  };
}

/**
 * -----------------------------------------------------------------------------
 * Section 7. Integration helpers for other renderers and AI systems
 * -----------------------------------------------------------------------------
 */

/**
 * Convert parsed table into a renderer-neutral JSON payload.
 * This can be sent to React/Vue/Svelte or native apps. [web:17]
 *
 * @param {VCGitHubCsvRenderResult} result
 * @returns {any}
 */
function vcToRendererPayload(result) {
  return {
    meta: result.meta,
    rows: result.rows.map(r => ({
      index: r.index,
      cells: r.cells.map(c => ({
        raw: c.raw,
        value: c.value,
        isNull: c.isNull,
        isError: c.isError,
        tags: c.tags,
        severity: c.severity,
        messages: c.messages
      }))
    })),
    aiAssist: result.aiAssist
  };
}

/**
 * Build a compact AI prompt context for describing the table or for
 * multimodal agents assisting “augmented-citizens” directly. [web:6][web:7]
 *
 * @param {VCGitHubCsvRenderResult} result
 * @returns {string}
 */
function vcBuildAIAssistPrompt(result) {
  const meta = result.meta;
  const header = meta.header.join(", ");
  let sampleRows = "";
  const maxLines = Math.min(result.rows.length, 5);
  for (let i = 0; i < maxLines; i++) {
    const r = result.rows[i];
    const line = r.cells.map(c => (c.isNull ? "NULL" : String(c.raw))).join(", ");
    sampleRows += `Row ${i + 1}: ${line}\n`;
  }
  return [
    `You are assisting a user with a CSV table named '${meta.sourceFilename || "table"}'.`,
    `Columns: ${header}.`,
    `Primary key: ${meta.schema[0]?.name || "first column"}.`,
    `The table may contain ALN metadata and qpudatashards in 'aln' columns.`,
    `Here are a few rows:\n${sampleRows}`
  ].join("\n");
}

/**
 * -----------------------------------------------------------------------------
 * Section 8. Public export for Node, browser, and bundlers
 * -----------------------------------------------------------------------------
 */

const VisualCodeGitHubCsvRenderer = {
  vcRenderGitHubCsv,
  vcToRendererPayload,
  vcBuildAIAssistPrompt,
  vcParseAln,
  vcAlnTokenize,
  vcInferSchema,
  VC_DEFAULT_DIALECT,
  VC_DEFAULT_NULL_POLICY,
  VC_DEFAULT_ALN_POLICY,
  VC_DEFAULT_AI_ASSIST
};

// CommonJS
if (typeof module !== "undefined" && module.exports) {
  module.exports = VisualCodeGitHubCsvRenderer;
}

// Browser global
if (typeof window !== "undefined") {
  // @ts-ignore
  window.VisualCodeGitHubCsvRenderer = VisualCodeGitHubCsvRenderer;
}
