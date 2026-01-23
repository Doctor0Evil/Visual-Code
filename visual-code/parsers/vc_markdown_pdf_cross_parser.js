/**
 * @typedef {('markdown'|'pdf-text'|'plain')} VCInputMode
 */

/**
 * Unified block type describing a layout-aware chunk of text that can be
 * used by a VL/IG router as a structured prompt. [file:1]
 *
 * @typedef {Object} VCPromptBlock
 * @property {string} id                    Stable, unique block ID.
 * @property {('heading'|'paragraph'|'list-item'|'code'|'math-inline'|'math-block'|'table'|'quote')} kind
 * @property {number} level                 Heading level or list depth (0 for paragraphs).
 * @property {string} rawText               Original text slice (sanitized).
 * @property {string} normalizedText        Normalized, grammar-clean text for models.
 * @property {string} symbolSignature       Canonicalized symbol/macro representation (for %, $, math, arrows).
 * @property {string[]} tags                Tags: e.g., ["markdown","from-pdf","has-math","is-bullet"].
 * @property {Object} visualLayout          Layout hints for image generation.
 * @property {number} visualLayout.order    Document reading order index.
 * @property {number} visualLayout.indent   Indent depth in characters.
 * @property {boolean} visualLayout.isEmphasized   True if bold/italic/heading/quote.
 * @property {boolean} visualLayout.isMonospace    True if code block or code span.
 */

/**
 * Top-level parse result. [file:1]
 *
 * @typedef {Object} VCParseResult
 * @property {VCInputMode} mode
 * @property {string} sourceId
 * @property {string} languageHint
 * @property {VCPromptBlock[]} blocks
 * @property {Object} meta
 * @property {boolean} meta.hasMath
 * @property {boolean} meta.hasTables
 * @property {boolean} meta.hasLists
 * @property {boolean} meta.hasCode
 * @property {number}  meta.totalLines
 * @property {number}  meta.totalBlocks
 * @property {string[]} meta.warnings
 */

// ---------------------------------------------------------------------
//  SECTION 2: Utility – ID, Sanitization, Symbol Normalization
// ---------------------------------------------------------------------

/**
 * Basic monotonic ID generator (no crypto, deterministic per-process).
 */
class VCIdGen {
  constructor(prefix) {
    this.prefix = typeof prefix === 'string' && prefix.length > 0 ? prefix : 'vcblk';
    this.counter = 0;
  }
  next() {
    this.counter += 1;
    const ts = Date.now().toString(16);
    const n = this.counter.toString(16);
    return `${this.prefix}-${ts}-${n}`;
  }
}

/**
 * Hard SFW sanitizer, similar to Visual-Code text sanitizer but tuned for
 * mixed Markdown/PDF fragments. Removes control chars, collapses whitespace,
 * and blocks obvious NSFW markers. [file:1]
 */
function vcSanitizeForPrompt(input) {
  if (typeof input !== 'string') return '';
  let out = input.replace(/[\u0000-\u001F\u007F]/g, ' ');
  out = out.replace(/\s+/g, ' ').trim();
  const banned = [
    /\bnsfw\b/gi,
    /\bporn\b/gi,
    /\bnude\b/gi,
    /\bsexual\b/gi,
    /\berotic\b/gi
  ];
  for (let i = 0; i < banned.length; i++) {
    out = out.replace(banned[i], 'blocked');
  }
  return out;
}

/**
 * Normalize math / symbol-heavy segments so that different document types
 * (Markdown, PDF-text, plain) converge to a common representation. [file:1]
 *
 * Examples:
 *   "10% increase"       → "10 percent increase"
 *   "$R = x^2 + y^2$"    → "R = x^2 + y^2"
 *   "Price: $100"        → "Price: 100 dollars"
 */
function vcNormalizeSymbols(text) {
  let t = text;

  // Replace common PDF artifacts like weird spaces around % and $.
  t = t.replace(/\s*%\s*/g, '%');
  t = t.replace(/\s*\$\s*/g, '$');

  // Monetary: "$123.45" → "123.45 dollars"
  t = t.replace(/\$([0-9]+(?:\.[0-9]+)?)/g, '$1 dollars');

  // Standalone dollar signs used as math delimiters → remove delimiters but keep content.
  // Inline math delimited by $...$ or \(..\) or \[..\].
  t = t.replace(/\$(.+?)\$/g, '$1');
  t = t.replace(/\\\((.+?)\\\)/g, '$1');
  t = t.replace(/\\\[(.+?)\\\]/g, '$1');

  // Percent signs → "percent" (keeps numeric).
  t = t.replace(/([0-9]+(?:\.[0-9]+)?)%/g, '$1 percent');

  // Normalize arrows and common math symbols to ascii words for consistency.
  t = t.replace(/→|⇒|⟶/g, ' -> ');
  t = t.replace(/←|⇐|⟵/g, ' <- ');
  t = t.replace(/≥/g, ' >= ');
  t = t.replace(/≤/g, ' <= ');
  t = t.replace(/≠/g, ' != ');
  t = t.replace(/±/g, '+/-');
  t = t.replace(/∞/g, 'infinity');

  // Collapse whitespace again after replacements.
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

/**
 * Build a symbol signature, which is a concise summary of the symbols found
 * in a line or block (%, $, comparison, arrows), used for downstream
 * "vision-tracing" and prompt conditioning. [file:1]
 */
function vcBuildSymbolSignature(text) {
  const hasPercent = /%/.test(text);
  const hasDollar  = /\$/.test(text);
  const hasArrow   = /→|⇒|⟶|<-|->|↔|⇔/.test(text);
  const hasCmp     = /[<>]=?|!=/.test(text);
  const hasEq      = /=/.test(text);
  const hasSum     = /∑/.test(text);
  const hasInt     = /∫/.test(text);

  const parts = [];
  if (hasPercent) parts.push('percent');
  if (hasDollar)  parts.push('dollar');
  if (hasArrow)   parts.push('arrow');
  if (hasCmp)     parts.push('compare');
  if (hasEq)      parts.push('equals');
  if (hasSum)     parts.push('summation');
  if (hasInt)     parts.push('integral');
  return parts.length === 0 ? 'none' : parts.join('+');
}

// ---------------------------------------------------------------------
//  SECTION 3: Markdown Line-Level Parser
// ---------------------------------------------------------------------

/**
 * Parse a single logical line with Markdown heuristics into a VCPromptBlock.
 * This is intentionally conservative (no full CommonMark parser) but tuned for
 * consistent VL prompts. [file:1]
 */
function vcParseMarkdownLine(line, idGen, orderIndex) {
  const original = line;
  const trimmed  = line.replace(/\t/g, '    ');
  const sanitized = vcSanitizeForPrompt(trimmed);

  let kind = 'paragraph';
  let level = 0;
  const tags = ['markdown'];
  let indent = 0;
  let text = sanitized;

  // Heading: # .. ######
  const headingMatch = /^(#{1,6})\s+(.*)$/.exec(sanitized);
  if (headingMatch) {
    kind = 'heading';
    level = headingMatch[1].length;
    text = headingMatch[2].trim();
    tags.push('heading');
  } else {
    // List bullets: -, *, +, or numbered.
    const listMatch = /^(\s*)([-*+]|[0-9]+\.)\s+(.*)$/.exec(sanitized);
    if (listMatch) {
      kind = 'list-item';
      indent = listMatch[1].length;
      level = Math.floor(indent / 2);
      text = listMatch[3].trim();
      tags.push('list', 'bullet');
    } else {
      // Quote
      const quoteMatch = /^>\s?(.*)$/.exec(sanitized);
      if (quoteMatch) {
        kind = 'quote';
        text = quoteMatch[1].trim();
        tags.push('quote');
      }
    }
  }

  // Code fences are handled at a higher level; here only inline code spans.
  let isMonospace = false;
  if (text.indexOf('`') !== -1) {
    isMonospace = true;
    tags.push('inline-code');
  }

  // Detect inline LaTeX-ish math (very light).
  const hasInlineMath = /\$[^$]+\$|\\\(|\\\)/.test(original);
  if (hasInlineMath) {
    tags.push('has-math');
  }

  const normalized = vcNormalizeSymbols(text);
  const symbolSignature = vcBuildSymbolSignature(original);

  /** @type {VCPromptBlock} */
  const block = {
    id: idGen.next(),
    kind,
    level,
    rawText: text,
    normalizedText: normalized,
    symbolSignature,
    tags,
    visualLayout: {
      order: orderIndex,
      indent,
      isEmphasized: kind === 'heading' || kind === 'quote',
      isMonospace
    }
  };

  return block;
}

/**
 * Parse Markdown text into structured blocks with very simple code fence
 * handling and table line detection. [file:1]
 */
function vcParseMarkdownText(text, sourceId, languageHint) {
  const idGen = new VCIdGen('md');
  const lines = text.split(/\r?\n/);
  /** @type {VCPromptBlock[]} */
  const blocks = [];
  /** @type {string[]} */
  const warnings = [];
  let order = 0;

  let inCodeFence = false;
  let codeFenceLang = '';
  let codeBuffer = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];

    // Code fence start / end
    const fenceMatch = /^```(\w+)?\s*$/.exec(rawLine);
    if (fenceMatch) {
      if (!inCodeFence) {
        inCodeFence = true;
        codeFenceLang = fenceMatch[1] || 'text';
        codeBuffer = [];
      } else {
        // Close fence -> push code block.
        const codeText = vcSanitizeForPrompt(codeBuffer.join('\n'));
        const normalized = vcNormalizeSymbols(codeText);
        const block = {
          id: idGen.next(),
          kind: 'code',
          level: 0,
          rawText: codeText,
          normalizedText: normalized,
          symbolSignature: vcBuildSymbolSignature(codeText),
          tags: ['markdown', 'code', `lang:${codeFenceLang}`],
          visualLayout: {
            order,
            indent: 0,
            isEmphasized: true,
            isMonospace: true
          }
        };
        blocks.push(block);
        order += 1;
        inCodeFence = false;
        codeFenceLang = '';
        codeBuffer = [];
      }
      continue;
    }

    if (inCodeFence) {
      codeBuffer.push(rawLine);
      continue;
    }

    // Table heuristic: presence of | with some text.
    if (/\|/.test(rawLine) && /[A-Za-z0-9]/.test(rawLine)) {
      const sanitized = vcSanitizeForPrompt(rawLine);
      const normalized = vcNormalizeSymbols(sanitized);
      const block = {
        id: idGen.next(),
        kind: 'table',
        level: 0,
        rawText: sanitized,
        normalizedText: normalized,
        symbolSignature: vcBuildSymbolSignature(rawLine),
        tags: ['markdown', 'table-line'],
        visualLayout: {
          order,
          indent: 0,
          isEmphasized: false,
          isMonospace: false
        }
      };
      blocks.push(block);
      order += 1;
      continue;
    }

    if (/^\s*$/.test(rawLine)) {
      // Skip pure empty lines.
      continue;
    }

    const block = vcParseMarkdownLine(rawLine, idGen, order);
    blocks.push(block);
    order += 1;
  }

  const meta = {
    hasMath: blocks.some(b => b.tags.indexOf('has-math') !== -1 || b.kind === 'math-inline' || b.kind === 'math-block'),
    hasTables: blocks.some(b => b.kind === 'table'),
    hasLists: blocks.some(b => b.kind === 'list-item'),
    hasCode: blocks.some(b => b.kind === 'code'),
    totalLines: lines.length,
    totalBlocks: blocks.length,
    warnings
  };

  /** @type {VCParseResult} */
  const result = {
    mode: 'markdown',
    sourceId: sourceId || 'markdown-input',
    languageHint: languageHint || 'en',
    blocks,
    meta
  };

  return result;
}

// ---------------------------------------------------------------------
//  SECTION 4: PDF-Text & Plain-Text Normalization
// ---------------------------------------------------------------------

/**
 * Basic "de-wrapping" of PDF-extracted text: merges lines that likely
 * belong to the same paragraph, preserves bullet and heading cues where
 * possible.[1]
 */
function vcNormalizePdfLines(rawText) {
  const lines = rawText.split(/\r?\n/);
  const merged = [];
  let current = '';

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];

    if (/^\s*$/.test(l)) {
      if (current.trim().length > 0) {
        merged.push(current.trim());
        current = '';
      }
      continue;
    }

    // Bullet or numbered list line: start new.
    if (/^\s*([-*+]|[0-9]+\.)\s+/.test(l)) {
      if (current.trim().length > 0) {
        merged.push(current.trim());
        current = '';
      }
      merged.push(l.trim());
      continue;
    }

    // Heading-like line: short and capitalized.
    if (l.trim().length < 80 && /^[A-Z][A-Za-z0-9 ,\-:]+$/.test(l.trim())) {
      if (current.trim().length > 0) {
        merged.push(current.trim());
        current = '';
      }
      merged.push(l.trim());
      continue;
    }

    // Otherwise, join into current paragraph.
    if (current.length === 0) {
      current = l.trim();
    } else {
      // If line ends with hyphen (word-wrap hyphenation), remove.
      if (/[A-Za-z]-$/.test(current)) {
        current = current.replace(/-$/, '') + l.trim();
      } else {
        current += ' ' + l.trim();
      }
    }
  }

  if (current.trim().length > 0) {
    merged.push(current.trim());
  }
  return merged;
}

/**
 * Parse PDF-extracted text through a Markdown-like lens but using
 * vcNormalizePdfLines first, so we get readable paragraphs and bullet
 * structures for VL prompts.[1]
 */
function vcParsePdfText(text, sourceId, languageHint) {
  const idGen = new VCIdGen('pdf');
  const lines = vcNormalizePdfLines(text);
  /** @type {VCPromptBlock[]} */
  const blocks = [];
  /** @type {string[]} */
  const warnings = [];
  let order = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Attempt to reuse Markdown-style line parser for lists / headings / quotes.
    const block = vcParseMarkdownLine(line, idGen, order);
    block.tags.push('from-pdf');
    blocks.push(block);
    order += 1;
  }

  const meta = {
    hasMath: blocks.some(b => b.tags.indexOf('has-math') !== -1),
    hasTables: false,  // Could be extended with PDF table heuristics.
    hasLists: blocks.some(b => b.kind === 'list-item'),
    hasCode: blocks.some(b => b.kind === 'code'),
    totalLines: lines.length,
    totalBlocks: blocks.length,
    warnings
  };

  /** @type {VCParseResult} */
  const result = {
    mode: 'pdf-text',
    sourceId: sourceId || 'pdf-text-input',
    languageHint: languageHint || 'en',
    blocks,
    meta
  };

  return result;
}

/**
 * Plain-text parse: uses same machinery as Markdown, but marks blocks
 * as "plain" to allow downstream routing choices.[1]
 */
function vcParsePlainText(text, sourceId, languageHint) {
  const mdResult = vcParseMarkdownText(text, sourceId || 'plain-input', languageHint || 'en');
  mdResult.mode = 'plain';
  mdResult.blocks.forEach(b => {
    if (b.tags.indexOf('markdown') === -1) {
      b.tags.push('plain');
    } else {
      b.tags.push('plain');
    }
  });
  return mdResult;
}

// ---------------------------------------------------------------------
//  SECTION 5: Cross-Parsing Router & Lane-Switching
// ---------------------------------------------------------------------

/**
 * Unified cross-parser entry point with explicit lane selection.
 *
 * Usage for VL/IG pipelines:
 *   - Detect content-type or user-selected lane: "markdown" | "pdf-text" | "plain".
 *   - Call vcParseCrossDocument to produce structured blocks.
 *   - Feed blocks into Visual-Code VL/IG router as:
 *       * systemDirectives: from headings, early blocks.
 *       * userText: concatenated normalized paragraphs.
 *       * styleHints: derived from tags and symbolSignature.
 *[1]
 *
 * @param {Object} opts
 * @param {string} opts.text          Input text (Markdown, PDF-plain, or plain).
 * @param {VCInputMode} opts.mode     Desired lane: "markdown" | "pdf-text" | "plain".
 * @param {string} [opts.sourceId]    Logical document ID (for debugging).
 * @param {string} [opts.languageHint] Language code (e.g., "en").
 * @returns {VCParseResult}
 */
function vcParseCrossDocument(opts) {
  if (!opts || typeof opts.text !== 'string') {
    throw new Error('vcParseCrossDocument: opts.text must be a string');
  }
  const mode = opts.mode === 'markdown' || opts.mode === 'pdf-text' || opts.mode === 'plain'
    ? opts.mode
    : 'plain';

  if (mode === 'markdown') {
    return vcParseMarkdownText(opts.text, opts.sourceId, opts.languageHint);
  }
  if (mode === 'pdf-text') {
    return vcParsePdfText(opts.text, opts.sourceId, opts.languageHint);
  }
  return vcParsePlainText(opts.text, opts.sourceId, opts.languageHint);
}

// ---------------------------------------------------------------------
//  SECTION 6: Prompt Assembly for Visual-Learning Models
// ---------------------------------------------------------------------

/**
 * Derive a VL/IG-ready prompt object from a VCParseResult. This couples
 * cross-parsed blocks with explicit style hints and negative prompts.
 * Downstream, this can be passed into Visual-Code's vcBuildUnifiedPrompt
 * / vcCallVLIG.[1]
 *
 * @typedef {Object} VCPromptAssembly
 * @property {string} userText
 * @property {string[]} systemDirectives
 * @property {string[]} styleHints
 * @property {string[]} negativePrompts
 * @property {Object} trace
 * @property {Array<{id:string, kind:string, level:number, order:number, symbolSignature:string}>} trace.blocks
 * @property {boolean} trace.containsMath
 * @property {boolean} trace.containsTables
 * @property {boolean} trace.containsLists
 */

/**
 * Build VL prompt text plus a compact visual-trace summary.
 */
function vcAssembleVlPrompt(parseResult) {
  /** @type {string[]} */
  const systemDirectives = [];
  /** @type {string[]} */
  const paragraphs = [];
  /** @type {string[]} */
  const styleHints = [];
  /** @type {string[]} */
  const negativePrompts = [];

  /** @type {Array<{id:string, kind:string, level:number, order:number, symbolSignature:string}>} */
  const traceBlocks = [];

  const blocks = parseResult.blocks || [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const txt = b.normalizedText;

    // Build trace entry for VL frontends to visualize structure.
    traceBlocks.push({
      id: b.id,
      kind: b.kind,
      level: b.level,
      order: b.visualLayout.order,
      symbolSignature: b.symbolSignature
    });

    if (!txt || txt.length === 0) {
      continue;
    }

    if (b.kind === 'heading') {
      // Promote top-level headings to system directives describing context.
      if (b.level === 1 || b.level === 2) {
        systemDirectives.push('Context heading: ' + txt);
        styleHints.push('emphasize main topic: ' + txt);
      } else {
        styleHints.push('subtopic: ' + txt);
      }
      continue;
    }

    if (b.kind === 'list-item') {
      // Lists become descriptive bullets in the user prompt.
      paragraphs.push('- ' + txt);
      continue;
    }

    if (b.kind === 'quote') {
      styleHints.push('include captioned quote style');
      paragraphs.push('Quoted: ' + txt);
      continue;
    }

    if (b.kind === 'code') {
      // For VL image generation, code implies diagrams / architecture visuals.
      styleHints.push('technical diagram, code-inspired layout');
      paragraphs.push('Technical snippet: ' + txt);
      continue;
    }

    if (b.kind === 'table') {
      styleHints.push('tabular data layout, structured visual arrangement');
      paragraphs.push('Tabular relation: ' + txt);
      continue;
    }

    // Default: paragraphs / math-inline.
    paragraphs.push(txt);
  }

  // If math present, encourage clear formula rendering in images, but keep
  // grammar consistent.[1]
  if (parseResult.meta && parseResult.meta.hasMath) {
    styleHints.push('clean formula layout, readable symbols, math on whiteboard or document');
  }

  // Basic safety-oriented negative prompts.
  negativePrompts.push(
    'blurry text',
    'illegible formula',
    'cropped equations',
    'distorted diagrams',
    'low contrast text'
  );

  /** @type {VCPromptAssembly} */
  const assembled = {
    userText: paragraphs.join('\n'),
    systemDirectives,
    styleHints,
    negativePrompts,
    trace: {
      blocks: traceBlocks,
      containsMath: parseResult.meta ? parseResult.meta.hasMath : false,
      containsTables: parseResult.meta ? parseResult.meta.hasTables : false,
      containsLists: parseResult.meta ? parseResult.meta.hasLists : false
    }
  };

  return assembled;
}

// ---------------------------------------------------------------------
//  SECTION 7: Public Export
// ---------------------------------------------------------------------

const VCMarkdownPdfCrossParser = {
  vcParseCrossDocument,
  vcParseMarkdownText,
  vcParsePdfText,
  vcParsePlainText,
  vcAssembleVlPrompt,
  vcNormalizeSymbols,
  vcSanitizeForPrompt
};

// CommonJS export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VCMarkdownPdfCrossParser;
}

// Browser / WebView export
if (typeof window !== 'undefined') {
  window.VCMarkdownPdfCrossParser = VCMarkdownPdfCrossParser;
}
