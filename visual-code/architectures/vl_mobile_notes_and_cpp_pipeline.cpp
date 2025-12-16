#include <iostream>

struct VCResizeConfig {
  int targetWidth;
  int targetHeight;
  bool keepAspect;
  bool centerCrop;
  bool clampSmall;
  int minWidth;
  int minHeight;

  VCResizeConfig()
      : targetWidth(384),
        targetHeight(384),
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
