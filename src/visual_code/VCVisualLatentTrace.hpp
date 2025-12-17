// File: src/visual_code/VCVisualLatentTrace.hpp
// Platform: Windows/Linux/Ubuntu, Android/iOS
// Language: C++ (sanitized, production-grade)
// Purpose:
//   Unified vector+dimension layout for visual learning, image-generation,
//   and asset-generation with deterministic "visual trace" metadata.
//
//   - Visual encoder → fixed visual embedding (for search, conditioning)
//   - Latent generator → multi-head latent codes (2D image, 3D asset, style)
//   - Trace record → end‑to‑end provenance of any generated asset
//
//   This header is framework‑agnostic: you plug in any ViT/CNN encoder and
//   any diffusion/decoder backend, but the vector shapes and IDs stay stable.
//
//   Conceptually aligned with modern image–vector pipelines and latent asset
//   generation models that operate in compact latent spaces [web:5][web:10].

#pragma once
#include stdint>
#include <string>
#include <vector>
#include <array>
#include string>
#include <stdexcept>

namespace vcvisual {

/// Core dimensional contract (tune but keep stable across the stack)
struct VCVisualDims {
    // Visual encoder output (for retrieval, conditioning)
    // Example: 1024D global embedding (CLIP/VIT/ConvNeXt style) [web:5].
    static constexpr int VISUAL_EMB_DIM = 1024;

    // Latent image code (e.g., diffusion UNet latent vector per sample)
    static constexpr int LATENT_IMAGE_DIM = 256;

    // Latent 3D asset code (for mesh/NeRF/point‑cloud decoders) [web:7][web:10].
    static constexpr int LATENT_ASSET_DIM = 384;

    // Style/appearance code (color palette, texture style, lighting)
    static constexpr int LATENT_STYLE_DIM = 64;

    // Compact “trace” summary embedding (for fast search/back‑reference)
    static constexpr int TRACE_VECTOR_DIM = 128;
};

/// Simple tensor wrapper for 1D float vectors.
struct VCFloatVec {
    std::vector<float> data;

    VCFloatVec() = default;
    explicit VCFloatVec(size_t dim) : data(dim, 0.0f) {}

    size_t dim() const { return data.size(); }

    float &operator[](size_t i) {
        if (i >= data.size()) throw std::out_of_range("VCFloatVec index");
        return data[i];
    }
    const float &operator[](size_t i) const {
        if (i >= data.size()) throw std::out_of_range("VCFloatVec index");
        return data[i];
    }

    void normalize_l2() {
        double acc = 0.0;
        for (float v : data) acc += static_cast<double>(v) * static_cast<double>(v);
        if (acc <= 0.0) return;
        float inv = 1.0f / static_cast<float>(std::sqrt(acc));
        for (auto &v : data) v *= inv;
    }
};

/// Visual encoder output: one global embedding plus optional patch tokens.
struct VCVisualEmbedding {
    VCFloatVec global;                // [VISUAL_EMB_DIM]
    std::vector<VCFloatVec> patches;  // optional per‑patch embeddings

    VCVisualEmbedding()
        : global(VCVisualDims::VISUAL_EMB_DIM) {}
};

/// Multi‑head latent bundle for generation backends.
struct VCLatentBundle {
    VCFloatVec image_latent;  // [LATENT_IMAGE_DIM]
    VCFloatVec asset_latent;  // [LATENT_ASSET_DIM]
    VCFloatVec style_latent;  // [LATENT_STYLE_DIM]

    VCLatentBundle()
        : image_latent(VCVisualDims::LATENT_IMAGE_DIM),
          asset_latent(VCVisualDims::LATENT_ASSET_DIM),
          style_latent(VCVisualDims::LATENT_STYLE_DIM) {}
};

/// Trace info for any generated visual/asset output.
/// This is the “visual trace” contract you can persist in a DB or sidecar.
struct VCVisualTrace {
    // Stable IDs for reproducibility.
    std::string request_id;        // external request UUID
    std::string parent_asset_id;   // optional: upstream asset/source
    std::string generator_model;   // e.g. "Cell-XL-UNet-v2"
    std::string encoder_model;     // e.g. "VC-ViT-Base-1024"

    // Input text prompt (sanitized prior to storage).
    std::string text_prompt;

    // Input conditioning embeddings.
    VCVisualEmbedding visual_input; // encoded from reference images

    // Latent bundle actually used by the generator.
    VCLatentBundle latents;

    // Compact trace vector for similarity search (e.g. CLIP/RAG index) [web:2][web:9].
    VCFloatVec trace_vector; // [TRACE_VECTOR_DIM]

    // Simple numeric metadata.
    int seed = 0;
    int width = 0;
    int height = 0;
    float guidance_scale = 0.0f;
    int diffusion_steps = 0;

    VCVisualTrace()
        : trace_vector(VCVisualDims::TRACE_VECTOR_DIM) {}
};

/// Encoder interface: plug any vision backbone behind this.
class IVisualEncoder {
public:
    virtual ~IVisualEncoder() = default;

    // Encode raw RGB image data (HWC, uint8) to a visual embedding.
    // image: vector<uint8_t>, length = width * height * 3
    virtual VCVisualEmbedding encode(
        const uint8_t* image,
        int width,
        int height,
        int stride_bytes = 0) const = 0;
};

/// Latent generator interface: bridges embeddings → latent codes.
class ILatentGenerator {
public:
    virtual ~ILatentGenerator() = default;

    // Produce latent bundle given visual embedding and text condition vector.
    // text_vec: precomputed text embedding (e.g. 768–1024D CLIP/text encoder).
    virtual VCLatentBundle generate_latents(
        const VCVisualEmbedding& visual_emb,
        const VCFloatVec& text_vec,
        int seed) const = 0;
};

/// Asset decoders: image / 3D asset / style‑aware renderers.
class IImageDecoder {
public:
    virtual ~IImageDecoder() = default;

    // Decode image latent + style into RGBA buffer.
    // Out buffer is resized to width*height*4.
    virtual void decode_image(
        const VCLatentBundle& latents,
        int width,
        int height,
        std::vector<uint8_t>& out_rgba) const = 0;
};

class IAssetDecoder {
public:
    virtual ~IAssetDecoder() = default;

    // Decode asset latent into a serialized asset blob (e.g., GLB, USDZ) [web:8].
    virtual void decode_asset(
        const VCLatentBundle& latents,
        std::vector<uint8_t>& out_asset_bytes) const = 0;
};

/// Visual trace pipeline: one call from inputs → outputs + trace.
class VCVisualTracePipeline {
public:
    VCVisualTracePipeline(
        const IVisualEncoder* encoder,
        const ILatentGenerator* latent_gen,
        const IImageDecoder* img_dec,
        const IAssetDecoder* asset_dec)
        : encoder_(encoder),
          latent_gen_(latent_gen),
          img_decoder_(img_dec),
          asset_decoder_(asset_dec) {}

    /// Main entry: build image and/or asset plus full trace.
    /// - If want_image is false, image_rgba_out stays empty.
    /// - If want_asset is false, asset_bytes_out stays empty.
    VCVisualTrace run(
        const uint8_t* image_rgb,
        int img_w,
        int img_h,
        const VCFloatVec& text_vec,
        const std::string& text_prompt,
        const std::string& request_id,
        int seed,
        bool want_image,
        bool want_asset,
        int out_width,
        int out_height,
        std::vector<uint8_t>& image_rgba_out,
        std::vector<uint8_t>& asset_bytes_out) const
    {
        if (!encoder_ || !latent_gen_) {
            throw std::runtime_error("VCVisualTracePipeline: missing encoder or latent generator");
        }

        VCVisualTrace trace;
        trace.request_id = request_id;
        trace.text_prompt = text_prompt;
        trace.seed = seed;
        trace.width = out_width;
        trace.height = out_height;

        // 1) Visual encoding
        trace.visual_input = encoder_->encode(image_rgb, img_w, img_h, 0);
        trace.visual_input.global.normalize_l2();

        // 2) Latent generation
        trace.latents = latent_gen_->generate_latents(trace.visual_input, text_vec, seed);

        // 3) Optional decoding to image
        if (want_image && img_decoder_) {
            img_decoder_->decode_image(trace.latents, out_width, out_height, image_rgba_out);
        }

        // 4) Optional decoding to 3D asset
        if (want_asset && asset_decoder_) {
            asset_decoder_->decode_asset(trace.latents, asset_bytes_out);
        }

        // 5) Build trace_vector as a deterministic mixture
        _build_trace_vector(trace);

        return trace;
    }

private:
    const IVisualEncoder* encoder_;
    const ILatentGenerator* latent_gen_;
    const IImageDecoder* img_decoder_;
    const IAssetDecoder* asset_decoder_;

    static void _build_trace_vector(VCVisualTrace& trace) {
        // Simple, reproducible hash‑like mix of:
        //   visual_input.global (first N dims)
        //   image_latent + asset_latent + style_latent (projected)
        // This gives a compact fixed‑dim vector suitable for vector DBs [web:2][web:4].

        VCFloatVec& tv = trace.trace_vector;
        const size_t D = tv.dim();
        std::fill(tv.data.begin(), tv.data.end(), 0.0f);

        // Mix visual embedding
        for (size_t i = 0; i < D && i < trace.visual_input.global.dim(); ++i) {
            tv.data[i] += trace.visual_input.global.data[i];
        }

        // Mix image latent
        for (size_t i = 0; i < D && i < trace.latents.image_latent.dim(); ++i) {
            tv.data[i] += 0.5f * trace.latents.image_latent.data[i];
        }

        // Mix asset latent
        for (size_t i = 0; i < D && i < trace.latents.asset_latent.dim(); ++i) {
            tv.data[i] += 0.5f * trace.latents.asset_latent.data[i];
        }

        // Mix style latent (wrap if needed)
        for (size_t i = 0; i < trace.latents.style_latent.dim(); ++i) {
            size_t idx = i % D;
            tv.data[idx] += 0.25f * trace.latents.style_latent.data[i];
        }

        tv.normalize_l2();
    }
};

} // namespace vcvisual
