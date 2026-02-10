// Platform: Windows/Linux/Ubuntu, Android/iOS NDK
// Language: C++ (sanitized, production-grade)
// Purpose:
//   End-to-end, semantic‑guided VL/IG router that improves:
//   - Image-generation faithfulness to text
//   - Style/control via explicit structure hints
//   - Debuggable reasoning trace for AI‑chat assistants
//   - Cross‑platform use with Gemini/Copilot/Vondy/Grok via JSON payloads
//
//   This module is designed to sit *between* a chat LLM and any image/
//   generation backend. It parses the natural‑language prompt into a
//   structured scene plan, merges it with safety + quality profiles,
//   and emits a canonical JSON control spec that can be mapped directly
//   into model‑specific parameters in a server or plugin layer. [file:1]

#include <cstdint>
#include <cstring>
#include <string>
#include <vector>
#include <stdexcept>
#include <iostream>

namespace vc_vlig {

enum class VCPlatform {
    Gemini,
    Copilot,
    Vondy,
    Grok,
    CustomHTTP
};

enum class VCIGMode {
    TextToImage,
    ImageToImage,
    Inpaint,
    Outpaint
};

enum class VCQualityPreset {
    Draft,
    Standard,
    High,
    Ultra
};

enum class VCSafetyProfile {
    Safe,
    AllowNSFW
};

enum class VCColorTone {
    Neutral,
    Warm,
    Cool,
    HighContrast,
    Pastel
};

enum class VCLighting {
    Auto,
    Soft,
    Hard,
    Dramatic,
    Studio
};

enum class VCCameraAngle {
    EyeLevel,
    LowAngle,
    HighAngle,
    TopDown,
    Isometric,
    CloseUp,
    WideShot
};

enum class VCArtStyle {
    Unspecified,
    Photorealistic,
    DigitalPainting,
    Watercolor,
    Anime,
    LineArt,
    LowPoly,
    PixelArt,
    ConceptArt
};

enum class VCCompositionRule {
    None,
    RuleOfThirds,
    Centered,
    GoldenRatio,
    Symmetric,
    LeadingLines
};

enum class VCAspectRatio {
    Ratio_1_1,
    Ratio_16_9,
    Ratio_9_16,
    Ratio_4_3,
    Ratio_3_4,
    Ratio_21_9
};

enum class VCBrushDetail {
    Auto,
    Minimal,
    Normal,
    High,
    Hyper
};

static inline bool isAsciiPrintable(char c) {
    unsigned char u = static_cast<unsigned char>(c);
    return u >= 32 && u <= 126;
}

static std::string stripControl(const std::string &in) {
    std::string out;
    out.reserve(in.size());
    for (char c : in) {
        if (isAsciiPrintable(c) || c == '\n' || c == '\t')
            out.push_back(c);
    }
    return out;
}

static std::string collapseWhitespace(const std::string &in) {
    std::string out;
    out.reserve(in.size());
    bool space = false;
    for (char c : in) {
        if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
            if (!space) {
                out.push_back(' ');
                space = true;
            }
        } else {
            out.push_back(c);
            space = false;
        }
    }
    if (!out.empty() && out.back() == ' ')
        out.pop_back();
    return out;
}

static std::string toLowerASCII(const std::string &in) {
    std::string out;
    out.reserve(in.size());
    for (char c : in) {
        if (c >= 'A' && c <= 'Z')
            out.push_back(static_cast<char>(c - 'A' + 'a'));
        else
            out.push_back(c);
    }
    return out;
}

// Basic NSFW keyword blocking; can be extended server‑side. [file:1]
static std::string stripNSFWMarkers(const std::string &in) {
    static const char* kBlockList[] = {
        "nsfw", "nude", "nudity", "porn", "explicit", "sexual", "erotic"
    };
    std::string lower = toLowerASCII(in);
    std::string out = in;
    for (const char* token : kBlockList) {
        std::string t(token);
        std::size_t pos = 0;
        while (true) {
            pos = lower.find(t, pos);
            if (pos == std::string::npos) break;
            for (std::size_t i = 0; i < t.size() && (pos + i) < out.size(); ++i) {
                out[pos + i] = '*';
                lower[pos + i] = '*';
            }
            pos += t.size();
        }
    }
    return out;
}

static std::string sanitizePromptForVision(const std::string &raw) {
    if (raw.empty())
        throw std::invalid_argument("empty prompt");
    std::string step1 = stripControl(raw);
    std::string step2 = collapseWhitespace(step1);
    std::string step3 = stripNSFWMarkers(step2);
    if (step3.empty())
        throw std::runtime_error("prompt sanitized to empty");
    if (step3.size() > 8000)
        step3.resize(8000);
    return step3;
}

struct VCSubjectDescriptor {
    std::string    name;          // e.g. "girl", "spaceship"
    std::string    attributes;    // e.g. "smiling, wearing red jacket"
    std::string    positionHint;  // e.g. "left", "center", "foreground"
};

struct VCBackgroundDescriptor {
    std::string    environment;   // e.g. "dense forest", "city skyline"
    std::string    timeOfDay;     // e.g. "sunset", "night", "noon"
    std::string    weather;       // e.g. "rainy", "clear", "foggy"
};

struct VCColorLightingDescriptor {
    VCColorTone    colorTone;
    VCLighting     lighting;
    std::string    paletteHint;   // free‑form, e.g. "teal and orange"
};

struct VCCameraDescriptor {
    VCCameraAngle  angle;
    float          focalLengthMM; // approx 18–85 range
    bool           depthOfField;
};

struct VCCompositionDescriptor {
    VCCompositionRule rule;
    bool              allowCropping;
    bool              centerMainSubject;
};

struct VCArtStyleDescriptor {
    VCArtStyle   style;
    VCBrushDetail brushDetail;
    std::string  eraHint;         // e.g. "1980s sci‑fi", "renaissance"
};

struct VCNegativeConstraints {
    std::string  visualArtifacts;  // e.g. "blurry, extra limbs, text artifacts"
    std::string  contentExclusions;// e.g. "no logos, no gore"
};

struct VCScenePlan {
    std::string                corePrompt;
    VCSubjectDescriptor        primarySubject;
    std::vector<VCSubjectDescriptor> secondarySubjects;
    VCBackgroundDescriptor     background;
    VCColorLightingDescriptor  colorLighting;
    VCCameraDescriptor         camera;
    VCCompositionDescriptor    composition;
    VCArtStyleDescriptor       artStyle;
    VCNegativeConstraints      negatives;
    VCAspectRatio              aspectRatio;
    VCIGMode                   mode;
    VCSafetyProfile            safety;
    VCQualityPreset            quality;
};

static VCAspectRatio guessAspectFromText(const std::string &lower) {
    if (lower.find("vertical") != std::string::npos ||
        lower.find("portrait") != std::string::npos ||
        lower.find("9:16") != std::string::npos) {
        return VCAspectRatio::Ratio_9_16;
    }
    if (lower.find("cinematic") != std::string::npos ||
        lower.find("wide") != std::string::npos ||
        lower.find("16:9") != std::string::npos ||
        lower.find("21:9") != std::string::npos) {
        if (lower.find("21:9") != std::string::npos)
            return VCAspectRatio::Ratio_21_9;
        return VCAspectRatio::Ratio_16_9;
    }
    if (lower.find("4:3") != std::string::npos)
        return VCAspectRatio::Ratio_4_3;
    if (lower.find("3:4") != std::string::npos)
        return VCAspectRatio::Ratio_3_4;
    return VCAspectRatio::Ratio_1_1;
}

static VCArtStyle guessArtStyle(const std::string &lower) {
    if (lower.find("photo") != std::string::npos ||
        lower.find("photoreal") != std::string::npos ||
        lower.find("realistic") != std::string::npos) {
        return VCArtStyle::Photorealistic;
    }
    if (lower.find("anime") != std::string::npos ||
        lower.find("manga") != std::string::npos) {
        return VCArtStyle::Anime;
    }
    if (lower.find("watercolor") != std::string::npos) {
        return VCArtStyle::Watercolor;
    }
    if (lower.find("pixel") != std::string::npos) {
        return VCArtStyle::PixelArt;
    }
    if (lower.find("line art") != std::string::npos ||
        lower.find("sketch") != std::string::npos) {
        return VCArtStyle::LineArt;
    }
    if (lower.find("low poly") != std::string::npos ||
        lower.find("low-poly") != std::string::npos) {
        return VCArtStyle::LowPoly;
    }
    if (lower.find("concept art") != std::string::npos ||
        lower.find("key art") != std::string::npos) {
        return VCArtStyle::ConceptArt;
    }
    if (lower.find("painting") != std::string::npos ||
        lower.find("digital painting") != std::string::npos) {
        return VCArtStyle::DigitalPainting;
    }
    return VCArtStyle::Unspecified;
}

static VCLighting guessLighting(const std::string &lower) {
    if (lower.find("soft light") != std::string::npos ||
        lower.find("soft lighting") != std::string::npos) {
        return VCLighting::Soft;
    }
    if (lower.find("dramatic") != std::string::npos ||
        lower.find("cinematic light") != std::string::npos) {
        return VCLighting::Dramatic;
    }
    if (lower.find("studio") != std::string::npos ||
        lower.find("three-point") != std::string::npos) {
        return VCLighting::Studio;
    }
    if (lower.find("hard light") != std::string::npos) {
        return VCLighting::Hard;
    }
    return VCLighting::Auto;
}

static VCColorTone guessColorTone(const std::string &lower) {
    if (lower.find("teal and orange") != std::string::npos ||
        lower.find("warm") != std::string::npos ||
        lower.find("sunset") != std::string::npos) {
        return VCColorTone::Warm;
    }
    if (lower.find("cool") != std::string::npos ||
        lower.find("blueish") != std::string::npos) {
        return VCColorTone::Cool;
    }
    if (lower.find("pastel") != std::string::npos) {
        return VCColorTone::Pastel;
    }
    if (lower.find("high contrast") != std::string::npos ||
        lower.find("noir") != std::string::npos) {
        return VCColorTone::HighContrast;
    }
    return VCColorTone::Neutral;
}

static VCCameraAngle guessCameraAngle(const std::string &lower) {
    if (lower.find("top-down") != std::string::npos ||
        lower.find("top down") != std::string::npos ||
        lower.find("bird's-eye") != std::string::npos) {
        return VCCameraAngle::TopDown;
    }
    if (lower.find("close-up") != std::string::npos ||
        lower.find("close up") != std::string::npos ||
        lower.find("portrait shot") != std::string::npos) {
        return VCCameraAngle::CloseUp;
    }
    if (lower.find("wide shot") != std::string::npos ||
        lower.find("wide angle") != std::string::npos) {
        return VCCameraAngle::WideShot;
    }
    if (lower.find("low angle") != std::string::npos) {
        return VCCameraAngle::LowAngle;
    }
    if (lower.find("high angle") != std::string::npos) {
        return VCCameraAngle::HighAngle;
    }
    if (lower.find("isometric") != std::string::npos) {
        return VCCameraAngle::Isometric;
    }
    return VCCameraAngle::EyeLevel;
}

static VCCompositionRule guessComposition(const std::string &lower) {
    if (lower.find("rule of thirds") != std::string::npos)
        return VCCompositionRule::RuleOfThirds;
    if (lower.find("centered") != std::string::npos ||
        lower.find("symmetrical") != std::string::npos ||
        lower.find("symmetry") != std::string::npos)
        return VCCompositionRule::Centered;
    if (lower.find("golden ratio") != std::string::npos)
        return VCCompositionRule::GoldenRatio;
    if (lower.find("leading lines") != std::string::npos)
        return VCCompositionRule::LeadingLines;
    if (lower.find("symmetric") != std::string::npos)
        return VCCompositionRule::Symmetric;
    return VCCompositionRule::None;
}

// A minimal noun guesser: pick last "main" word as subject name.
static std::string guessSubjectName(const std::string &prompt) {
    std::string lower = toLowerASCII(prompt);
    // crude split on spaces
    std::vector<std::string> tokens;
    {
        std::string cur;
        for (char c : lower) {
            if (c == ' ' || c == ',' || c == '.' || c == '!' || c == '?') {
                if (!cur.empty()) {
                    tokens.push_back(cur);
                    cur.clear();
                }
            } else {
                cur.push_back(c);
            }
        }
        if (!cur.empty()) tokens.push_back(cur);
    }
    if (tokens.empty())
        return "subject";
    // Return last token that is not an article or preposition.
    static const char* stopWords[] = {"a", "an", "the", "of", "in", "on", "with", "at", "to", "for"};
    for (int i = static_cast<int>(tokens.size()) - 1; i >= 0; --i) {
        bool isStop = false;
        for (const char* s : stopWords) {
            if (tokens[i] == s) {
                isStop = true;
                break;
            }
        }
        if (!isStop)
            return tokens[i];
    }
    return tokens.back();
}

// Main parser from user text into a structured scene plan. [file:1]
static VCScenePlan buildScenePlanFromPrompt(const std::string &rawPrompt,
                                            VCIGMode igMode,
                                            VCSafetyProfile safety,
                                            VCQualityPreset quality) {
    VCScenePlan plan{};
    plan.corePrompt = sanitizePromptForVision(rawPrompt);
    std::string lower = toLowerASCII(plan.corePrompt);

    plan.mode   = igMode;
    plan.safety = safety;
    plan.quality = quality;

    plan.aspectRatio = guessAspectFromText(lower);
    plan.artStyle.style = guessArtStyle(lower);
    plan.artStyle.brushDetail = VCBrushDetail::Normal;
    plan.artStyle.eraHint = "";

    plan.colorLighting.colorTone = guessColorTone(lower);
    plan.colorLighting.lighting  = guessLighting(lower);
    plan.colorLighting.paletteHint = "";

    plan.camera.angle = guessCameraAngle(lower);
    plan.camera.focalLengthMM = 35.0f;
    plan.camera.depthOfField = (plan.camera.angle == VCCameraAngle::CloseUp);

    plan.composition.rule = guessComposition(lower);
    plan.composition.allowCropping = true;
    plan.composition.centerMainSubject = true;

    plan.primarySubject.name = guessSubjectName(plan.corePrompt);
    plan.primarySubject.attributes = "";
    plan.primarySubject.positionHint = "center";

    plan.background.environment = "";
    if (lower.find("forest") != std::string::npos)
        plan.background.environment = "forest";
    else if (lower.find("city") != std::string::npos)
        plan.background.environment = "city";
    else if (lower.find("space") != std::string::npos ||
             lower.find("galaxy") != std::string::npos ||
             lower.find("nebula") != std::string::npos)
        plan.background.environment = "space";
    else if (lower.find("beach") != std::string::npos ||
             lower.find("ocean") != std::string::npos ||
             lower.find("sea") != std::string::npos)
        plan.background.environment = "seaside";

    plan.background.timeOfDay = "";
    if (lower.find("sunset") != std::string::npos)
        plan.background.timeOfDay = "sunset";
    else if (lower.find("night") != std::string::npos)
        plan.background.timeOfDay = "night";
    else if (lower.find("dawn") != std::string::npos ||
             lower.find("sunrise") != std::string::npos)
        plan.background.timeOfDay = "dawn";

    plan.background.weather = "";
    if (lower.find("rain") != std::string::npos)
        plan.background.weather = "rainy";
    else if (lower.find("fog") != std::string::npos ||
             lower.find("mist") != std::string::npos)
        plan.background.weather = "foggy";
    else if (lower.find("snow") != std::string::npos)
        plan.background.weather = "snowy";

    plan.negatives.visualArtifacts   = "blurry, extra limbs, distorted faces, text artifacts";
    plan.negatives.contentExclusions = "no gore, no real-world logos";

    return plan;
}

static std::string jsonEscape(const std::string &in) {
    std::string out;
    out.reserve(in.size() + 8);
    for (char c : in) {
        switch (c) {
            case '\"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (static_cast<unsigned char>(c) < 32) {
                    // drop other control chars
                } else {
                    out.push_back(c);
                }
        }
    }
    return out;
}

static const char* toString(VCAspectRatio r) {
    switch (r) {
        case VCAspectRatio::Ratio_1_1:  return "1:1";
        case VCAspectRatio::Ratio_16_9: return "16:9";
        case VCAspectRatio::Ratio_9_16: return "9:16";
        case VCAspectRatio::Ratio_4_3:  return "4:3";
        case VCAspectRatio::Ratio_3_4:  return "3:4";
        case VCAspectRatio::Ratio_21_9: return "21:9";
    }
    return "1:1";
}

static const char* toString(VCIGMode m) {
    switch (m) {
        case VCIGMode::TextToImage: return "text-to-image";
        case VCIGMode::ImageToImage: return "image-to-image";
        case VCIGMode::Inpaint: return "inpaint";
        case VCIGMode::Outpaint: return "outpaint";
    }
    return "text-to-image";
}

static const char* toString(VCSafetyProfile s) {
    switch (s) {
        case VCSafetyProfile::Safe:      return "safe";
        case VCSafetyProfile::AllowNSFW: return "allow-nsfw";
    }
    return "safe";
}

static const char* toString(VCQualityPreset q) {
    switch (q) {
        case VCQualityPreset::Draft:    return "draft";
        case VCQualityPreset::Standard: return "standard";
        case VCQualityPreset::High:     return "high";
        case VCQualityPreset::Ultra:    return "ultra";
    }
    return "standard";
}

static const char* toString(VCColorTone t) {
    switch (t) {
        case VCColorTone::Neutral:      return "neutral";
        case VCColorTone::Warm:         return "warm";
        case VCColorTone::Cool:         return "cool";
        case VCColorTone::HighContrast: return "high-contrast";
        case VCColorTone::Pastel:       return "pastel";
    }
    return "neutral";
}

static const char* toString(VCLighting l) {
    switch (l) {
        case VCLighting::Auto:     return "auto";
        case VCLighting::Soft:     return "soft";
        case VCLighting::Hard:     return "hard";
        case VCLighting::Dramatic: return "dramatic";
        case VCLighting::Studio:   return "studio";
    }
    return "auto";
}

static const char* toString(VCCameraAngle a) {
    switch (a) {
        case VCCameraAngle::EyeLevel:  return "eye-level";
        case VCCameraAngle::LowAngle:  return "low-angle";
        case VCCameraAngle::HighAngle: return "high-angle";
        case VCCameraAngle::TopDown:   return "top-down";
        case VCCameraAngle::Isometric: return "isometric";
        case VCCameraAngle::CloseUp:   return "close-up";
        case VCCameraAngle::WideShot:  return "wide-shot";
    }
    return "eye-level";
}

static const char* toString(VCCompositionRule r) {
    switch (r) {
        case VCCompositionRule::None:         return "none";
        case VCCompositionRule::RuleOfThirds: return "rule-of-thirds";
        case VCCompositionRule::Centered:     return "centered";
        case VCCompositionRule::GoldenRatio:  return "golden-ratio";
        case VCCompositionRule::Symmetric:    return "symmetric";
        case VCCompositionRule::LeadingLines: return "leading-lines";
    }
    return "none";
}

static const char* toString(VCArtStyle s) {
    switch (s) {
        case VCArtStyle::Unspecified:     return "unspecified";
        case VCArtStyle::Photorealistic:  return "photorealistic";
        case VCArtStyle::DigitalPainting: return "digital-painting";
        case VCArtStyle::Watercolor:      return "watercolor";
        case VCArtStyle::Anime:           return "anime";
        case VCArtStyle::LineArt:         return "line-art";
        case VCArtStyle::LowPoly:         return "low-poly";
        case VCArtStyle::PixelArt:        return "pixel-art";
        case VCArtStyle::ConceptArt:      return "concept-art";
    }
    return "unspecified";
}

static const char* toString(VCBrushDetail d) {
    switch (d) {
        case VCBrushDetail::Auto:   return "auto";
        case VCBrushDetail::Minimal:return "minimal";
        case VCBrushDetail::Normal: return "normal";
        case VCBrushDetail::High:   return "high";
        case VCBrushDetail::Hyper:  return "hyper";
    }
    return "normal";
}

static std::string serializeScenePlanToJSON(const VCScenePlan &p) {
    std::string j;
    j.reserve(4096);
    j += "{";

    j += "\"core_prompt\":\"" + jsonEscape(p.corePrompt) + "\",";
    j += "\"mode\":\""; j += toString(p.mode); j += "\",";
    j += "\"safety_profile\":\""; j += toString(p.safety); j += "\",";
    j += "\"quality_preset\":\""; j += toString(p.quality); j += "\",";
    j += "\"aspect_ratio\":\""; j += toString(p.aspectRatio); j += "\",";

    // Primary subject
    j += "\"primary_subject\":{";
    j += "\"name\":\"" + jsonEscape(p.primarySubject.name) + "\",";
    j += "\"attributes\":\"" + jsonEscape(p.primarySubject.attributes) + "\",";
    j += "\"position_hint\":\"" + jsonEscape(p.primarySubject.positionHint) + "\"";
    j += "},";

    // Secondary subjects
    j += "\"secondary_subjects\":[";
    for (std::size_t i = 0; i < p.secondarySubjects.size(); ++i) {
        const auto &s = p.secondarySubjects[i];
        j += "{";
        j += "\"name\":\"" + jsonEscape(s.name) + "\",";
        j += "\"attributes\":\"" + jsonEscape(s.attributes) + "\",";
        j += "\"position_hint\":\"" + jsonEscape(s.positionHint) + "\"";
        j += "}";
        if (i + 1 < p.secondarySubjects.size())
            j += ",";
    }
    j += "],";

    // Background
    j += "\"background\":{";
    j += "\"environment\":\"" + jsonEscape(p.background.environment) + "\",";
    j += "\"time_of_day\":\"" + jsonEscape(p.background.timeOfDay) + "\",";
    j += "\"weather\":\"" + jsonEscape(p.background.weather) + "\"";
    j += "},";

    // Color + lighting
    j += "\"color_lighting\":{";
    j += "\"color_tone\":\""; j += toString(p.colorLighting.colorTone); j += "\",";
    j += "\"lighting\":\""; j += toString(p.colorLighting.lighting); j += "\",";
    j += "\"palette_hint\":\"" + jsonEscape(p.colorLighting.paletteHint) + "\"";
    j += "},";

    // Camera
    j += "\"camera\":{";
    j += "\"angle\":\""; j += toString(p.camera.angle); j += "\",";
    j += "\"focal_length_mm\":"; j += std::to_string(p.camera.focalLengthMM); j += ",";
    j += "\"depth_of_field\":"; j += (p.camera.depthOfField ? "true" : "false");
    j += "},";

    // Composition
    j += "\"composition\":{";
    j += "\"rule\":\""; j += toString(p.composition.rule); j += "\",";
    j += "\"allow_cropping\":"; j += (p.composition.allowCropping ? "true" : "false"); j += ",";
    j += "\"center_main_subject\":"; j += (p.composition.centerMainSubject ? "true" : "false");
    j += "},";

    // Art style
    j += "\"art_style\":{";
    j += "\"style\":\""; j += toString(p.artStyle.style); j += "\",";
    j += "\"brush_detail\":\""; j += toString(p.artStyle.brushDetail); j += "\",";
    j += "\"era_hint\":\"" + jsonEscape(p.artStyle.eraHint) + "\"";
    j += "},";

    // Negatives
    j += "\"negative_constraints\":{";
    j += "\"visual_artifacts\":\"" + jsonEscape(p.negatives.visualArtifacts) + "\",";
    j += "\"content_exclusions\":\"" + jsonEscape(p.negatives.contentExclusions) + "\"";
    j += "}";

    j += "}";
    return j;
}

struct VCSemanticIGResult {
    VCScenePlan scene;
    std::string jsonControl;      // Canonical JSON for downstream adapters
};

// High-level entry point.
static VCSemanticIGResult BuildSemanticIGSpec(const std::string &userPrompt,
                                              VCIGMode mode,
                                              VCSafetyProfile safety,
                                              VCQualityPreset quality) {
    VCSemanticIGResult result;
    result.scene = buildScenePlanFromPrompt(userPrompt, mode, safety, quality);
    result.jsonControl = serializeScenePlanToJSON(result.scene);
    return result;
}

#ifdef VC_VLIG_SEMANTIC_ROUTER_DEMO
int main() {
    std::string prompt =
        "Ultra‑detailed cinematic portrait of a lone astronaut standing in a "
        "foggy forest at sunset, teal and orange color grade, soft lighting, "
        "shot on a 50mm lens, rule of thirds composition, 16:9.";

    VCSemanticIGResult res = BuildSemanticIGSpec(
        prompt,
        VCIGMode::TextToImage,
        VCSafetyProfile::Safe,
        VCQualityPreset::High
    );

    std::cout << "Sanitized core prompt:\n" << res.scene.corePrompt << "\n\n";
    std::cout << "Semantic control JSON:\n" << res.jsonControl << "\n";
    return 0;
}
#endif

} // namespace vc_vlig
