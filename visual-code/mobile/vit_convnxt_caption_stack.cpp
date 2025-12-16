#include <cstdint>
#include <cstring>
#include <string>
#include <vector>
#include <stdexcept>
#include <iostream>
#include <cmath>

#include <opencv2/core.hpp>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>

// -----------------------------------------------------------------------------
// Section 1. Encoder choice and mobile trade-off model
// -----------------------------------------------------------------------------

enum class VCEncoderType {
  ViT,
  ConvNeXtLike  // includes ConvNeXt / RepViT / FastViT-style hybrids
};

struct VCEncoderProfile {
  VCEncoderType type;
  std::string   name;
  // Nominal parameters and metrics (for planning, NOT measured at runtime).
  float paramsMillions;
  float flopsGFLOPs224;
  // Observed / expected latency (ms) for 224x224 on mid Android SoC.
  float latencyMsCPU;
  float latencyMsNPU;
  // Relative peak activation memory for 224 and 512 square inputs.
  float peakMemMB224;
  float peakMemMB512;
};

// Approximate profiles reflecting mobile studies:
// ViTs are more memory-bound and scale worse with resolution. [web:49][web:52]
// RepViT/FastViT-like CNNs reach ~1 ms latency with good accuracy. [web:42][web:48]
static VCEncoderProfile VC_PROFILE_VIT_SMALL {
  VCEncoderType::ViT,
  "ViT-Small-224",
  21.0f,
  4.5f,
  18.0f,  // 224px CPU mid-range
  4.0f,   // 224px NPU-ish
  220.0f, // MB @ 224
  420.0f  // MB @ 512, ~+90% vs 224
};

static VCEncoderProfile VC_PROFILE_CONVNEXT_SMALL {
  VCEncoderType::ConvNeXtLike,
  "RepViT/ConvNeXt-Mobile-224",
  20.0f,
  4.0f,
  10.0f,   // faster than ViT at similar FLOPs. [web:42][web:49][web:52]
  3.0f,
  190.0f,  // MB @ 224
  290.0f   // MB @ 512, better scaling than ViT. [web:49][web:52]
};

struct VCDeviceBudget {
  float maxLatencyMs;
  float maxMemMB;
};

struct VCEncoderDecision {
  VCEncoderProfile chosen;
  bool fitsBudget;
  std::string reason;
};

// Simple selector: prefer ConvNeXt-like when tight budgets, else ViT when
// patch tokens are needed for strong VL fusion. [web:42][web:49][web:52]
VCEncoderDecision SelectEncoderForAndroid(const VCDeviceBudget& budget,
                                          bool needsPatchTokens,
                                          int inputSize) {
  const bool highRes = (inputSize > 320);

  const VCEncoderProfile& vit = VC_PROFILE_VIT_SMALL;
  const VCEncoderProfile& cnn = VC_PROFILE_CONVNEXT_SMALL;

  auto evalProfile = [&](const VCEncoderProfile& p) -> VCEncoderDecision {
    const float scaleFactor = static_cast<float>(inputSize) / 224.0f;
    const float scaledLatency = p.latencyMsCPU * scaleFactor * scaleFactor;
    const float scaledMem = highRes ? p.peakMemMB512 : p.peakMemMB224;

    VCEncoderDecision d { p, true, "" };
    if (scaledLatency > budget.maxLatencyMs || scaledMem > budget.maxMemMB) {
      d.fitsBudget = false;
    }
    d.reason = "ScaledLatency=" + std::to_string(scaledLatency) +
               "ms, ScaledMem=" + std::to_string(scaledMem) + "MB";
    return d;
  };

  VCEncoderDecision dVit = evalProfile(vit);
  VCEncoderDecision dCnn = evalProfile(cnn);

  // Prefer ConvNeXt-like if both fit budget and no strong patch token need.
  if (!needsPatchTokens && dCnn.fitsBudget) {
    return dCnn;
  }
  if (needsPatchTokens && dVit.fitsBudget) {
    return dVit;
  }

  // If only one fits the budget, pick it.
  if (dCnn.fitsBudget && !dVit.fitsBudget) return dCnn;
  if (dVit.fitsBudget && !dCnn.fitsBudget) return dVit;

  // If neither fits, pick the one with lower latency and mark as non-fitting.
  if (!dVit.fitsBudget && !dCnn.fitsBudget) {
    if (dCnn.chosen.latencyMsCPU <= dVit.chosen.latencyMsCPU) return dCnn;
    return dVit;
  }

  // Fallback: ConvNeXt-like as safer mobile default.
  return dCnn;
}

// -----------------------------------------------------------------------------
// Section 2. Lightweight captioning configuration (< 40M params)
// -----------------------------------------------------------------------------

struct VCCaptionModelConfig {
  VCEncoderProfile encoder;
  // Decoder configuration (abstracted; actual implementation can be TFLite/ONNX).
  std::string decoderName;
  float decoderParamsMillions;
  bool useFrozenCLIPEncoder; // e.g., SMALLCAP-style. [web:53]
  bool projectionFromImageToText; // ViT→GPT-2 mapping.
  // Total parameter budget check.
  float totalParamsMillions;
  bool under40M;
};

// Example builder: AC-Lite / SMALLCAP-style configuration. [web:50][web:53]
VCCaptionModelConfig BuildLightweightCaptionerConfig(bool useFrozenClipEncoder) {
  VCCaptionModelConfig cfg {};
  // Vision backbone: ~18–20M params (RepViT/ConvNeXt-mobile). [web:42][web:50]
  cfg.encoder      = VC_PROFILE_CONVNEXT_SMALL;
  cfg.decoderName  = useFrozenClipEncoder ? "SMALLCAP-Head" : "TinyTransformerDecoder";
  cfg.decoderParamsMillions = useFrozenClipEncoder ? 4.0f : 15.0f; // only cross-attn vs full decoder. [web:50][web:53]
  cfg.useFrozenCLIPEncoder  = useFrozenClipEncoder;
  cfg.projectionFromImageToText = !useFrozenClipEncoder;
  cfg.totalParamsMillions = cfg.encoder.paramsMillions + cfg.decoderParamsMillions;
  cfg.under40M = cfg.totalParamsMillions <= 40.0f;
  return cfg;
}

// -----------------------------------------------------------------------------
// Section 3. Quantization / pruning flags and metadata
// -----------------------------------------------------------------------------

enum class VCQuantizationScheme {
  None,
  Int8PTQ,
  Int8QAT
};

struct VCSparsityPruningConfig {
  bool enabled;
  float targetSparsity; // 0.0–0.9
  bool structured;      // true = channel/filter pruning. [web:51]
};

struct VCDeploymentOptimization {
  VCQuantizationScheme quantScheme;
  VCSparsityPruningConfig pruning;
  int maxCaptionTokens;
  int inputResolution;
};

// -----------------------------------------------------------------------------
// Section 4. Sanitized image decode + resize pipeline (TFLite/ONNX ready)
// -----------------------------------------------------------------------------

struct VCResizeConfig {
  int targetWidth;
  int targetHeight;
  bool keepAspect;
  bool centerCrop;
  bool clampSmall;
  int minWidth;
  int minHeight;

  VCResizeConfig()
      : targetWidth(320),
        targetHeight(320),
        keepAspect(true),
        centerCrop(true),
        clampSmall(true),
        minWidth(64),
        minHeight(64) {}
};

struct VCDecodedImage {
  int width;
  int height;
  // 8-bit RGB, HWC layout.
  std::vector<uint8_t> data;
};

class VCDecodeResizePipeline {
 public:
  explicit VCDecodeResizePipeline(const VCResizeConfig& cfg)
      : config_(cfg) {}

  VCDecodedImage run(const std::vector<uint8_t>& encoded) const {
    if (encoded.empty()) {
      throw std::invalid_argument("Empty input image bytes");
    }

    cv::Mat buf(1, static_cast<int>(encoded.size()), CV_8UC1);
    std::memcpy(buf.data, encoded.data(), encoded.size());

    cv::Mat decoded = cv::imdecode(buf, cv::IMREAD_COLOR);
    if (decoded.empty()) {
      throw std::runtime_error("Failed to decode image");
    }

    if ((decoded.cols < config_.minWidth ||
         decoded.rows < config_.minHeight) && config_.clampSmall) {
      decoded = upscaleToMin(decoded);
    }

    cv::Mat rgb;
    cv::cvtColor(decoded, rgb, cv::COLOR_BGR2RGB);

    cv::Mat resized = resizeWithPolicy(rgb);
    cv::Mat finalImg = centerCropIfNeeded(resized);

    VCDecodedImage out;
    out.width = finalImg.cols;
    out.height = finalImg.rows;
    out.data.resize(static_cast<size_t>(out.width * out.height * 3));

    if (finalImg.type() != CV_8UC3) {
      cv::Mat tmp;
      finalImg.convertTo(tmp, CV_8UC3);
      finalImg = tmp;
    }

    const int H = out.height;
    const int W = out.width;
    for (int y = 0; y < H; ++y) {
      const cv::Vec3b* row = finalImg.ptr<cv::Vec3b>(y);
      for (int x = 0; x < W; ++x) {
        const cv::Vec3b& pix = row[x];
        const size_t idx = static_cast<size_t>((y * W + x) * 3);
        out.data[idx + 0] = pix[0]; // R
        out.data[idx + 1] = pix[1]; // G
        out.data[idx + 2] = pix[2]; // B
      }
    }

    return out;
  }

 private:
  VCResizeConfig config_;

  cv::Mat upscaleToMin(const cv::Mat& img) const {
    int w = img.cols;
    int h = img.rows;
    if (w >= config_.minWidth && h >= config_.minHeight) {
      return img;
    }
    float scaleW = static_cast<float>(config_.minWidth) /
                   static_cast<float>(w);
    float scaleH = static_cast<float>(config_.minHeight) /
                   static_cast<float>(h);
    float scale = scaleW > scaleH ? scaleW : scaleH;
    int newW = static_cast<int>(w * scale);
    int newH = static_cast<int>(h * scale);
    cv::Mat out;
    cv::resize(img, out, cv::Size(newW, newH), 0, 0, cv::INTER_AREA);
    return out;
  }

  cv::Mat resizeWithPolicy(const cv::Mat& img) const {
    if (!config_.keepAspect) {
      cv::Mat out;
      cv::resize(
          img,
          out,
          cv::Size(config_.targetWidth, config_.targetHeight),
          0,
          0,
          cv::INTER_AREA);
      return out;
    }

    const int srcW = img.cols;
    const int srcH = img.rows;
    const float scaleW =
        static_cast<float>(config_.targetWidth) / static_cast<float>(srcW);
    const float scaleH =
        static_cast<float>(config_.targetHeight) / static_cast<float>(srcH);
    const float scale = scaleW < scaleH ? scaleW : scaleH;

    const int newW = static_cast<int>(srcW * scale);
    const int newH = static_cast<int>(srcH * scale);

    cv::Mat out;
    cv::resize(img, out, cv::Size(newW, newH), 0, 0, cv::INTER_AREA);
    return out;
  }

  cv::Mat centerCropIfNeeded(const cv::Mat& img) const {
    if (!config_.centerCrop) {
      return img;
    }
    if (img.cols == config_.targetWidth &&
        img.rows == config_.targetHeight) {
      return img;
    }

    const int x = (img.cols - config_.targetWidth) > 0
                      ? (img.cols - config_.targetWidth) / 2
                      : 0;
    const int y = (img.rows - config_.targetHeight) > 0
                      ? (img.rows - config_.targetHeight) / 2
                      : 0;
    const int w = std::min(config_.targetWidth, img.cols - x);
    const int h = std::min(config_.targetHeight, img.rows - y);

    cv::Rect roi(x, y, w, h);
    return img(roi).clone();
  }
};

// -----------------------------------------------------------------------------
// Section 5. ViT encoder + GPT-2 decoder integration hooks (Android-facing)
// -----------------------------------------------------------------------------

// Abstract interface for a ViT encoder backend (TFLite, ONNX, etc).
class IVisualEncoderBackend {
public:
  virtual ~IVisualEncoderBackend() {}
  // Input: RGB uint8 image (HWC), normalized inside or outside.
  virtual std::vector<float> Encode(const VCDecodedImage& img) = 0;
};

// Abstract interface for GPT-2 decoder backend.
class ITextDecoderBackend {
public:
  virtual ~ITextDecoderBackend() {}
  // Given image prefix embedding + current token sequence, produce next-token logits.
  virtual std::vector<float> NextTokenLogits(const std::vector<float>& imagePrefix,
                                             const std::vector<int32_t>& tokens) = 0;
};

// Captioner bridge: orchestrates ViT→GPT-2 decoding loop on Android.
class VTViTGPT2Captioner {
public:
  VTViTGPT2Captioner(IVisualEncoderBackend* encoderBackend,
                     ITextDecoderBackend* decoderBackend,
                     const VCDeploymentOptimization& optim,
                     int eosTokenId,
                     int bosTokenId)
      : encoderBackend_(encoderBackend),
        decoderBackend_(decoderBackend),
        optim_(optim),
        eosTokenId_(eosTokenId),
        bosTokenId_(bosTokenId) {
    if (!encoderBackend_ || !decoderBackend_) {
      throw std::invalid_argument("Null backend in captioner");
    }
  }

  std::vector<int32_t> GenerateCaptionTokens(const VCDecodedImage& img) {
    // 1. Encode image to prefix embedding. [web:33][web:36]
    std::vector<float> imgPrefix = encoderBackend_->Encode(img);

    // 2. Iterative decoding using GPT-2 backend. [web:36][web:39]
    std::vector<int32_t> tokens;
    tokens.reserve(optim_.maxCaptionTokens);
    tokens.push_back(bosTokenId_);

    for (int step = 0; step < optim_.maxCaptionTokens; ++step) {
      std::vector<float> logits =
          decoderBackend_->NextTokenLogits(imgPrefix, tokens);

      int32_t nextId = ArgMaxToken(logits);
      tokens.push_back(nextId);
      if (nextId == eosTokenId_) {
        break;
      }
    }
    return tokens;
  }

private:
  IVisualEncoderBackend* encoderBackend_;
  ITextDecoderBackend*   decoderBackend_;
  VCDeploymentOptimization optim_;
  int eosTokenId_;
  int bosTokenId_;

  static int32_t ArgMaxToken(const std::vector<float>& logits) {
    if (logits.empty()) return 0;
    size_t bestIdx = 0;
    float bestVal = logits[0];
    for (size_t i = 1; i < logits.size(); ++i) {
      if (logits[i] > bestVal) {
        bestVal = logits[i];
        bestIdx = i;
      }
    }
    return static_cast<int32_t>(bestIdx);
  }
};

// -----------------------------------------------------------------------------
// Section 6. Example configuration wiring (to be called from Android/JNI)
// -----------------------------------------------------------------------------

// Example: build an Android-ready captioner configuration and print the
// encoder decision for debugging. This can run on desktop during development
// and the same config can be used on Android. [web:49][web:52]
void ExampleConfigureMobileCaptioner() {
  VCDeviceBudget budget {};
  budget.maxLatencyMs = 40.0f; // 40 ms budget for vision tower.
  budget.maxMemMB     = 350.0f;

  bool needsPatchTokens = true; // for ViT→GPT-2 fusion.
  int inputSize = 320;

  VCEncoderDecision decision = SelectEncoderForAndroid(budget, needsPatchTokens, inputSize);
  VCCaptionModelConfig cfg = BuildLightweightCaptionerConfig(false);

  VCDeploymentOptimization optim {};
  optim.quantScheme = VCQuantizationScheme::Int8PTQ; // PTQ for mobile. [web:54]
  optim.pruning.enabled = true;
  optim.pruning.structured = true;
  optim.pruning.targetSparsity = 0.4f; // 40% structured pruning. [web:51]
  optim.maxCaptionTokens = 24;
  optim.inputResolution  = inputSize;

  std::cout << "Chosen encoder: " << decision.chosen.name
            << " | FitsBudget=" << (decision.fitsBudget ? "true" : "false")
            << " | Reason=" << decision.reason << "\n";
  std::cout << "Total params (M): " << cfg.totalParamsMillions
            << " | under40M=" << (cfg.under40M ? "true" : "false") << "\n";
}

// Entry point for non-Android build testing.
int main() {
  try {
    ExampleConfigureMobileCaptioner();
  } catch (const std::exception& ex) {
    std::cerr << "Error: " << ex.what() << "\n";
  }
  return 0;
}
