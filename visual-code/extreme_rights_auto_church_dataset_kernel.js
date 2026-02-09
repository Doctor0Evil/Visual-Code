// Platform: Node.js 18+ / Deno / Browser (with fetch polyfill)
// Language: Javascript (sanitized, production-grade)
// Purpose:
// - Define a rights-safe, SFW-only visual-learning dataset kernel that
//   learns from Auto_Church / Tree-of-Life style logs to enhance artwork
//   expressivity around “edge / extreme” *themes* without generating
//   explicit adult content.
// - Map CHURCH/PWR/TECH/NANO-style diagnostic signals into:
//   * visual style budgets (intensity, contrast, abstraction)
//   * symbolic “boundary markers” (frame, mask, censor bar, distance)
//   * logic-aware caption scaffolds that encode consent, distance, satire.
// - Produce fully-structured dataset items consumable by Visual-Code’s
//   unified VL/IG router and any VL model backend, remaining RoH ≤ 0.3
//   and SFW-only by design.[file:1]
//
// Notes:
// - This kernel does NOT mint crypto, touch capability, or change policy.
// - It only transforms pre-sanitized text + Auto_Church diagnostics into
//   structured scene metadata and caption prompts for training or inference.
//
// ---------------------------------------------------------------------------
// SECTION 1. TYPE LITERALS AND CORE ENUMS
// ---------------------------------------------------------------------------

/**
 * @typedef {"safe-edge"|"symbolic-kink"|"power-satire"|"abstract-body"|"shadow-ritual"} VCExtremeThemeId
 * High-level “extreme” *themes* that remain SFW by construction:
 * - safe-edge: high-contrast, moody, but fully clothed, no gore.
 * - symbolic-kink: ropes, chains, masks as abstractions (no nudity, no harm).
 * - power-satire: religious / corporate power symbolism, no real persons.
 * - abstract-body: silhouettes, mannequins, statues, no anatomical detail.
 * - shadow-ritual: stained glass, candles, temples, symbolic rituals only.
 */

/**
 * @typedef {"none"|"mask-bar"|"silhouette"|"mannequin"|"distance-blur"} VCRightsBoundaryMode
 * Visual boundary enforcement modes to express rights and distance:
 * - none: neutral content, standard SFW filters still apply.
 * - mask-bar: censor bars, masks, or face-obscuring props.
 * - silhouette: backlit body shapes without features.
 * - mannequin: statues, dolls, mannequins instead of people.
 * - distance-blur: long shots, heavy depth-of-field blur.[file:1]
 */

/**
 * @typedef {"low"|"medium"|"high"} VCIntensityLevel
 */

/**
 * @typedef {"calm_stable"|"charged_but_safe"|"avoid"} VCEnvelopeMood
 */

/**
 * @typedef {"homelessness"|"ecology"|"math"|"science"|"civic"|"mediation"|"other"} VCDomain
 * Mirrors ImpactDomain from Auto_Church, but compressed for imagery.[cite:1]
 */

/**
 * @typedef {Object} VCTreeOfLifeSnapshot
 * @property {number} BLOOD 0.0–1.0 normalized energy/strain
 * @property {number} OXYGEN
 * @property {number} TIME
 * @property {number} DECAY
 * @property {number} FEAR
 * @property {number} PAIN
 * @property {number} POWER
 * @property {number} TECH
 * @property {number} NANO
 * Pure observer metrics imported from Tree-of-Life logs; never written back.[cite:1]
 */

/**
 * @typedef {Object} VCAutoChurchBalance
 * @property {number} church
 * @property {number} pwr_budget
 * @property {number} chat_budget
 * @property {number} tech_score
 * @property {number} moral_position
 * Advisory-only diagnostics from the Rust Auto_Church kernel.[cite:1]
 */

/**
 * @typedef {Object} VCDeedDescriptor
 * @property {string} subjectId
 * @property {VCDomain} domain
 * @property {string} naturalText
 * @property {boolean} remediation
 * @property {boolean} multisigValidated
 * Already-logged, non-actuating deed surface analogous to GoodDeedLog.[cite:1]
 */

/**
 * @typedef {Object} VCExtremeStyleBudget
 * @property {VCExtremeThemeId} theme
 * @property {VCRightsBoundaryMode} boundaryMode
 * @property {VCIntensityLevel} visualIntensity
 * @property {VCIntensityLevel} contrastLevel
 * @property {VCIntensityLevel} abstractionLevel
 * @property {VCEnvelopeMood} envelopeMood
 * @property {string[]} allowedSymbols
 * @property {string[]} forbiddenVisuals
 * @property {string[]} styleTags
 * @property {string[]} negativeTags
 * Pure visual-conditioning parameters that remain SFW-only.[file:1]
 */

/**
 * @typedef {Object} VCConsentNarrativeFlags
 * @property {boolean} emphasiseDistance
 * @property {boolean} emphasiseConsentLanguage
 * @property {boolean} emphasiseSatire
 * @property {boolean} emphasiseEcoContext
 * @property {boolean} emphasiseRecovery
 */

/**
 * @typedef {Object} VCExtremeCaptionScaffold
 * @property {string} cleanPrompt
 * @property {string[]} instructionTags
 * @property {string[]} logicAnnotations
 * @property {VCConsentNarrativeFlags} narrativeFlags
 * Structured, rights-aware caption spine used to drive VL models.[file:1]
 */

/**
 * @typedef {Object} VCExtremeDatasetItem
 * @property {string} itemId
 * @property {VCExtremeStyleBudget} styleBudget
 * @property {VCExtremeCaptionScaffold} caption
 * @property {Object} safety
 * @property {Object} diagnostics
 * One fully-structured training/inference record for SFW “extreme” art.
 */

// ---------------------------------------------------------------------------
// SECTION 2. PURE HELPERS (CLAMPING, BUCKETS, MAPPING)
// ---------------------------------------------------------------------------

/**
 * Clamp x into [min, max].
 * @param {number} x
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function vcClamp(x, min, max) {
  if (Number.isNaN(x)) return min;
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

/**
 * Map scalar s in [0,1] into a discrete level.
 * @param {number} s
 * @returns {VCIntensityLevel}
 */
function vcBucketIntensity(s) {
  const x = vcClamp(s, 0, 1);
  if (x < 0.33) return "low";
  if (x < 0.66) return "medium";
  return "high";
}

/**
 * Decide envelope mood from FEAR / PAIN / DECAY.
 * @param {VCTreeOfLifeSnapshot} t
 * @returns {VCEnvelopeMood}
 */
function vcEnvelopeMoodFromTree(t) {
  const fear = vcClamp(t.FEAR ?? 0, 0, 1);
  const pain = vcClamp(t.PAIN ?? 0, 0, 1);
  const decay = vcClamp(t.DECAY ?? 0, 0, 1);
  const stress = (fear + pain + decay) / 3;

  if (stress < 0.25) return "calm_stable";
  if (stress < 0.55) return "charged_but_safe";
  return "avoid";
}

/**
 * Map Auto_Church + Tree-of-Life into a theme choice.
 * @param {VCAutoChurchBalance} ac
 * @param {VCTreeOfLifeSnapshot} t
 * @param {VCDomain} domain
 * @returns {VCExtremeThemeId}
 */
function vcSelectExtremeTheme(ac, t, domain) {
  const moral = vcClamp(ac.moral_position ?? 0, 0, 1);
  const power = vcClamp(t.POWER ?? 0, 0, 1);
  const tech = vcClamp(t.TECH ?? 0, 0, 1);

  if (domain === "homelessness" || domain === "civic" || domain === "mediation") {
    return "power-satire";
  }
  if (domain === "ecology") {
    return "shadow-ritual";
  }
  if (tech > 0.6 && power < 0.5) {
    return "abstract-body";
  }
  if (moral > 0.7 && power > 0.4) {
    return "symbolic-kink";
  }
  return "safe-edge";
}

/**
 * Choose rights boundary mode given mood + theme.
 * @param {VCEnvelopeMood} mood
 * @param {VCExtremeThemeId} theme
 * @returns {VCRightsBoundaryMode}
 */
function vcSelectBoundaryMode(mood, theme) {
  if (mood === "avoid") {
    // Hard push to strongest abstraction when Tree-of-Life flags risk.[cite:1]
    return "mannequin";
  }
  if (theme === "abstract-body") return "silhouette";
  if (theme === "symbolic-kink") return "mask-bar";
  if (theme === "shadow-ritual") return "distance-blur";
  return "none";
}

/**
 * Derive intensity / abstraction / contrast levels from diagnostics.
 * @param {VCAutoChurchBalance} ac
 * @param {VCTreeOfLifeSnapshot} t
 * @returns {{visualIntensity: VCIntensityLevel, abstractionLevel: VCIntensityLevel, contrastLevel: VCIntensityLevel}}
 */
function vcDeriveIntensityTriplet(ac, t) {
  const church = vcClamp(ac.church ?? 0, 0, 9999);
  const moral = vcClamp(ac.moral_position ?? 0, 0, 1);
  const nano = vcClamp(t.NANO ?? 0, 0, 1);
  const power = vcClamp(t.POWER ?? 0, 0, 1);

  const normChurch = Math.min(church / 30.0, 1.0); // soft scale from Rust half-life regime.[cite:1]
  const visualIntensity = vcBucketIntensity(normChurch * 0.7 + power * 0.3);
  const abstractionLevel = vcBucketIntensity(nano * 0.5 + (1 - moral) * 0.5);
  const contrastLevel = vcBucketIntensity(power * 0.6 + nano * 0.4);

  return { visualIntensity, abstractionLevel, contrastLevel };
}

/**
 * Build allowed / forbidden visual symbol sets given boundary + theme.
 * @param {VCRightsBoundaryMode} boundary
 * @param {VCExtremeThemeId} theme
 * @returns {{allowedSymbols: string[], forbiddenVisuals: string[], styleTags: string[], negativeTags: string[]}}
 */
function vcBuildSymbolPolicy(boundary, theme) {
  const allowed = new Set([
    "stained_glass",
    "chains_as_pattern",
    "candles",
    "robes_fully_clothed",
    "masks",
    "neon_lights",
    "industrial_pipes",
    "gothic_arch",
    "ritual_circle_symbolic",
    "smoke_fog",
    "shadows",
    "mannequin_figures",
    "statues",
    "abstract_geometric_body",
    "corporate_logo_parody",
    "scale_of_justice",
    "city_skyline_night",
  ]);

  const forbidden = new Set([
    "nudity_any",
    "explicit_anatomy",
    "gore",
    "blood_spatter",
    "torture",
    "self_harm",
    "hate_symbols",
    "childlike_body",
    "real_person_celebrity",
    "sexual_act",
  ]);

  const styleTags = [];
  const negativeTags = ["gore", "nudity", "explicit", "realistic_genitals"];

  switch (theme) {
    case "safe-edge":
      styleTags.push("moody_lighting", "high_contrast", "urban_noir");
      break;
    case "symbolic-kink":
      styleTags.push("dramatic_shadows", "symbolic_restraints", "high_contrast");
      break;
    case "power-satire":
      styleTags.push("satirical", "symbolic_power", "graphic_poster_style");
      allowed.add("oversized_throne");
      allowed.add("surreal_crown");
      break;
    case "abstract-body":
      styleTags.push("silhouette", "backlit", "high_abstraction");
      break;
    case "shadow-ritual":
      styleTags.push("cathedral_light", "ritual_candles", "sacred_geometry");
      break;
  }

  if (boundary === "mask-bar") {
    allowed.add("censor_bar");
    allowed.add("full_mask");
    styleTags.push("face_obscured");
  } else if (boundary === "silhouette") {
    styleTags.push("silhouette_only");
  } else if (boundary === "mannequin") {
    styleTags.push("mannequin_figures");
  } else if (boundary === "distance-blur") {
    styleTags.push("telephoto_distance", "strong_depth_of_field");
  }

  return {
    allowedSymbols: Array.from(allowed),
    forbiddenVisuals: Array.from(forbidden),
    styleTags,
    negativeTags,
  };
}

// ---------------------------------------------------------------------------
// SECTION 3. CONSENT / NARRATIVE SCAFFOLDING
// ---------------------------------------------------------------------------

/**
 * Build narrative flags from deed and Auto_Church diagnostics.
 * @param {VCDeedDescriptor} deed
 * @param {VCAutoChurchBalance} ac
 * @returns {VCConsentNarrativeFlags}
 */
function vcBuildNarrativeFlags(deed, ac) {
  const moral = vcClamp(ac.moral_position ?? 0, 0, 1);
  const forgiveness = deed.remediation === true;

  return {
    emphasiseDistance: true,
    emphasiseConsentLanguage: moral > 0.4,
    emphasiseSatire: deed.domain === "civic" || deed.domain === "homelessness",
    emphasiseEcoContext: deed.domain === "ecology",
    emphasiseRecovery: forgiveness,
  };
}

/**
 * Convert a deed into a clean caption scaffold.
 * This is SFW, emphasises rights, distance, consent and symbolic depiction.
 * @param {VCDeedDescriptor} deed
 * @param {VCExtremeThemeId} theme
 * @param {VCRightsBoundaryMode} boundary
 * @param {VCEnvelopeMood} mood
 * @returns {VCExtremeCaptionScaffold}
 */
function vcBuildCaptionScaffold(deed, theme, boundary, mood) {
  const flags = vcBuildNarrativeFlags(deed, { moral_position: 0.8 });

  const clauses = [];
  // Base human-readable description, but abstracted into symbolic scene.
  if (deed.domain === "homelessness") {
    clauses.push("symbolic city alley, distant silhouettes, warm shelter light in the background");
  } else if (deed.domain === "ecology") {
    clauses.push("forest edge at night, glowing symbols of restored nature, no people in detail");
  } else if (deed.domain === "math") {
    clauses.push("geometric cathedral interior, equations as stained glass patterns");
  } else if (deed.domain === "science") {
    clauses.push("laboratory chapel, instruments and graphs replacing religious icons");
  } else if (deed.domain === "civic") {
    clauses.push("satirical throne room, oversized chair, anonymous suited silhouettes at a distance");
  } else if (deed.domain === "mediation") {
    clauses.push("large table under soft light, faceless figures in balanced posture");
  } else {
    clauses.push("abstract chamber filled with symbolic patterns and light");
  }

  if (theme === "symbolic-kink") {
    clauses.push("ropes and chains only as decorative patterns on walls and floor, no bodies bound");
  } else if (theme === "abstract-body") {
    clauses.push("backlit silhouettes with no anatomical detail, bodies implied not shown");
  } else if (theme === "shadow-ritual") {
    clauses.push("candles, smoke, and sacred geometry, no explicit rituals");
  }

  if (boundary === "mask-bar") {
    clauses.push("faces obscured by masks or soft light, no identifiable persons");
  } else if (boundary === "silhouette" || boundary === "mannequin") {
    clauses.push("figures rendered as silhouettes or mannequins, no skin texture");
  } else if (boundary === "distance-blur") {
    clauses.push("camera far away, strong depth of field, people reduced to small shapes");
  }

  if (mood === "calm_stable") {
    clauses.push("overall feeling calm, respectful, and safe");
  } else if (mood === "charged_but_safe") {
    clauses.push("atmosphere intense but clearly non-violent and consensual");
  }

  const cleanPrompt = clauses.join(", ");

  /** @type {string[]} */
  const instructionTags = [
    "safe_for_work",
    "no_nudity",
    "no_gore",
    "no_real_person",
    "respect_neurorights",
    "express_extreme_theme_symbolically_only",
  ];

  /** @type {string[]} */
  const logicAnnotations = [
    "logic: all explicit acts are replaced by symbols or distance",
    "logic: individuals cannot be identified",
    "logic: power is depicted as architecture or objects, not suffering bodies",
  ];

  return {
    cleanPrompt,
    instructionTags,
    logicAnnotations,
    narrativeFlags: flags,
  };
}

// ---------------------------------------------------------------------------
// SECTION 4. MAIN KERNEL: FROM LOGS TO DATASET ITEM
// ---------------------------------------------------------------------------

/**
 * Generate one SFW “extreme rights” dataset item from diagnostics.
 * @param {string} itemId
 * @param {VCDeedDescriptor} deed
 * @param {VCAutoChurchBalance} ac
 * @param {VCTreeOfLifeSnapshot} tree
 * @returns {VCExtremeDatasetItem}
 */
function vcBuildExtremeDatasetItem(itemId, deed, ac, tree) {
  const envelopeMood = vcEnvelopeMoodFromTree(tree);
  const theme = vcSelectExtremeTheme(ac, tree, deed.domain);
  const boundaryMode = vcSelectBoundaryMode(envelopeMood, theme);
  const intensities = vcDeriveIntensityTriplet(ac, tree);
  const symbolPolicy = vcBuildSymbolPolicy(boundaryMode, theme);
  const caption = vcBuildCaptionScaffold(deed, theme, boundaryMode, envelopeMood);

  /** @type {VCExtremeStyleBudget} */
  const styleBudget = {
    theme,
    boundaryMode,
    visualIntensity: intensities.visualIntensity,
    contrastLevel: intensities.contrastLevel,
    abstractionLevel: intensities.abstractionLevel,
    envelopeMood,
    allowedSymbols: symbolPolicy.allowedSymbols,
    forbiddenVisuals: symbolPolicy.forbiddenVisuals,
    styleTags: symbolPolicy.styleTags,
    negativeTags: symbolPolicy.negativeTags,
  };

  const safety = {
    nsfwAllowed: false,
    blockedCategories: [
      "nudity",
      "sexual_content",
      "graphic_violence",
      "hate_symbols",
      "self_harm",
      "illegal_activity",
    ],
    ageRating: "PG13",
  };

  const diagnostics = {
    sourceSubjectId: deed.subjectId,
    sourceDomain: deed.domain,
    autoChurchSnapshot: ac,
    treeOfLifeSnapshot: tree,
    envelopeMood,
  };

  return {
    itemId,
    styleBudget,
    caption,
    safety,
    diagnostics,
  };
}

// ---------------------------------------------------------------------------
// SECTION 5. BATCH BUILDER AND DEBUGGING HOOKS
// ---------------------------------------------------------------------------

/**
 * Build a batch of dataset items for a pool of subjects.
 * Caller provides precomputed Auto_Church balances and Tree-of-Life snapshots.[cite:1]
 *
 * @param {VCDeedDescriptor[]} deeds
 * @param {Record<string, VCAutoChurchBalance>} balancesBySubject
 * @param {Record<string, VCTreeOfLifeSnapshot>} treeBySubject
 * @returns {VCExtremeDatasetItem[]}
 */
function vcBuildExtremeDatasetBatch(deeds, balancesBySubject, treeBySubject) {
  const out = [];
  for (let i = 0; i < deeds.length; i++) {
    const deed = deeds[i];
    const ac = balancesBySubject[deed.subjectId];
    const tree = treeBySubject[deed.subjectId];
    if (!ac || !tree) continue;

    const id = `extreme-${deed.subjectId}-${i}`;
    const item = vcBuildExtremeDatasetItem(id, deed, ac, tree);
    out.push(item);
  }
  return out;
}

/**
 * Debug-print a single item as console output for review.
 * Does NOT leak sensitive content; only structured JSON.
 * @param {VCExtremeDatasetItem} item
 */
function vcDebugPrintExtremeItem(item) {
  // This “debug” fulfills the requirement to expose all values/flags for review.[file:1]
  // It can be piped into logs or JSON viewers safely.
  // eslint-disable-next-line no-console
  console.log("VC_EXTREME_DATASET_ITEM_DEBUG", JSON.stringify(item, null, 2));
}

// ---------------------------------------------------------------------------
// SECTION 6. EXPORTS
// ---------------------------------------------------------------------------

const VisualCodeExtremeRightsKernel = {
  vcBuildExtremeDatasetItem,
  vcBuildExtremeDatasetBatch,
  vcDebugPrintExtremeItem,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = VisualCodeExtremeRightsKernel;
}
// Browser global
if (typeof window !== "undefined") {
  window.VisualCodeExtremeRightsKernel = VisualCodeExtremeRightsKernel;
}
