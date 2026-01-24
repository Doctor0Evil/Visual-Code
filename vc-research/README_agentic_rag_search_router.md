# vc-research/README_agentic_rag_search_router.md

## Overview

This module is a rule-based **search-orchestration layer** for agentic / RAG systems that need higher research quality, structured research actions, and secure link ingestion in AI chat environments.[web:2][web:10][web:14]

It does not perform HTTP requests itself; instead, it sits between an AI-chat agent and concrete search backends (keyword and vector), providing:

- Planned research actions per query (plan, hybrid-search, exploratory-browse, fact-check, etc.).[web:2]  
- Hybrid dense+sparse retrieval with reciprocal-rank and weighted fusion.[web:8][web:10][web:15]  
- Domain trust tiers and URL-security assessment filters.[web:14][web:13][web:17]  
- Turn-level metrics (coverage, authority, security) for quantifiable tuning.[web:2][web:10]  
- Exploratory link-path generation to surface “hidden” but public documents (parent paths, sibling URLs).[web:16]  

## Key research actions (logic)

The router deterministically chooses actions from the user query text:[web:2][web:14]

- `plan`: Always present; indicates a planning step.  
- `hybrid-search`: Default retrieval using dense + sparse backends.  
- `focused-search`: Triggered by stack-specific keywords (Azure, Oracle, Elastic, etc.) and attaches `site:`-style filters.  
- `update-check`: Triggered by recency terms (“2025”, “latest”, “year-end”) and sets a time window.  
- `contrastive`: Triggered by “vs/compare/versus” terms to support comparative research.  
- `multi-hop`: Triggered by complex/implication-style queries to encourage multi-step retrieval.  
- `fact-check` + `source-audit`: Triggered by “fact-check/verify/security/malware” etc., and restricts to authoritative domains.  
- `exploratory-browse`: Always added to encourage follow-up link exploration and hidden-doc discovery.  

These actions can be logged and optimized with RL or preference-based learning later, while remaining fully inspectable.[web:2][web:14]

## Hybrid retrieval & scoring

The orchestrator expects two adapters:

```js
async function keywordBackend(searchQuery, limit) -> VCSearchResult[];
async function denseBackend(searchQuery, limit) -> VCSearchResult[];
