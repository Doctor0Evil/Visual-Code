// File: /visual-code/schema/vc_ig_dataset_config_embed.cpp
// Language: C++ (sanitized, production-grade)
// Purpose:
//   Provide a fully filled, statically embedded JSON configuration string
//   for the "Visual-Code Unified IG/VL Dataset Schema" so native code
//   (C++ backends, Android NDK, desktop tools) can load and use it
//   without external files. This matches the requested schema structure
//   and is complete and self-contained.

#include <string>
#include <iostream>

namespace visualcode {
namespace schema {

static const char* kVcIgVlDatasetConfigJson = R"json(
{
  "$schema": "https://visual-code.ai/schemas/v1/vc_ig_dataset_config.schema.json",
  "title": "Visual-Code Unified IG/VL Dataset Schema",
  "type": "object",
  "description": "A configuration schema for high-quality, logic-aware image-generation datasets used in AI chats, combining prompt, scene, narrative, safety, and reasoning metadata to improve visual coherence and controllability.",
  "required": [
    "dataset_id",
    "version",
    "global_config",
    "splits",
    "items"
  ],
  "properties": {
    "dataset_id": {
      "type": "string",
      "pattern": "^[a-zA-Z0-9_.\\-]{3,64}$",
      "description": "Stable identifier for the dataset (e.g. vc.multimodal.logiccaption.v1)."
    },
    "version": {
      "type": "string",
      "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$",
      "description": "Semantic version of this dataset configuration."
    },
    "source_datasets": {
      "type": "array",
      "description": "Optional references to upstream datasets or corpora combined into this configuration, including licensing details.",
      "items": {
        "type": "object",
        "required": ["name", "url", "license"],
        "properties": {
          "name": { "type": "string" },
          "url": { "type": "string", "format": "uri" },
          "license": { "type": "string" },
          "note": { "type": "string" }
        }
      }
    },
    "global_config": {
      "type": "object",
      "description": "Global configuration for image-generation training and evaluation.",
      "required": [
        "modality",
        "task_types",
        "default_image_settings",
        "safety_policy",
        "quality_targets",
        "logic_targets"
      ],
      "properties": {
        "modality": {
          "type": "string",
          "enum": ["image-text", "image-text-interleaved", "image-image-text"],
          "description": "Primary modality layout (single image+text, interleaved multi-image narratives, or paired images with text)."
        },
        "task_types": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "text_to_image",
              "image_to_text",
              "multi_turn_generation",
              "style_transfer",
              "layout_to_image",
              "instruction_following"
            ]
          },
          "description": "Supported task types for this dataset configuration."
        },
        "default_image_settings": {
          "type": "object",
          "required": ["min_resolution", "max_resolution", "color_space", "aspect_ratios"],
          "properties": {
            "min_resolution": {
              "type": "array",
              "items": { "type": "integer", "minimum": 1 },
              "minItems": 2,
              "maxItems": 2,
              "description": "Minimum width and height in pixels."
            },
            "max_resolution": {
              "type": "array",
              "items": { "type": "integer", "minimum": 1 },
              "minItems": 2,
              "maxItems": 2,
              "description": "Maximum width and height in pixels."
            },
            "color_space": {
              "type": "string",
              "enum": ["sRGB", "LinearSRGB", "DisplayP3"],
              "description": "Color space for generated images."
            },
            "aspect_ratios": {
              "type": "array",
              "items": {
                "type": "string",
                "pattern": "^[0-9]+:[0-9]+$"
              },
              "description": "Allowed aspect ratios for training and sampling."
            }
          }
        },
        "safety_policy": {
          "type": "object",
          "description": "Dataset-level safety controls and filters to enforce SFW content.",
          "required": ["nsfw_allowed", "blocked_categories", "age_rating"],
          "properties": {
            "nsfw_allowed": { "type": "boolean", "const": false },
            "blocked_categories": {
              "type": "array",
              "items": {
                "type": "string",
                "enum": [
                  "nudity",
                  "sexual_content",
                  "graphic_violence",
                  "hate_symbols",
                  "self_harm",
                  "illegal_activity"
                ]
              }
            },
            "age_rating": {
              "type": "string",
              "enum": ["G", "PG", "PG13"],
              "description": "Intended content rating of images and text."
            }
          }
        },
        "quality_targets": {
          "type": "object",
          "description": "Targets for aesthetic, fidelity, and caption quality using standard metrics.",
          "required": ["metrics", "min_scores"],
          "properties": {
            "metrics": {
              "type": "array",
              "items": {
                "type": "string",
                "enum": ["FID", "IS", "CLIPScore", "BLIPScore", "BLEU", "METEOR", "ROUGE", "CIDEr"]
              }
            },
            "min_scores": {
              "type": "object",
              "additionalProperties": { "type": "number" }
            }
          }
        },
        "logic_targets": {
          "type": "object",
          "description": "Targets specifically for logical consistency and narrative coherence.",
          "required": ["max_entity_inconsistency_rate", "max_style_inconsistency_rate"],
          "properties": {
            "max_entity_inconsistency_rate": {
              "type": "number",
              "minimum": 0.0,
              "maximum": 1.0,
              "description": "Maximum allowed rate of entity inconsistency across sequences (e.g. character or object identity drift)."
            },
            "max_style_inconsistency_rate": {
              "type": "number",
              "minimum": 0.0,
              "maximum": 1.0,
              "description": "Maximum allowed rate of style/theme inconsistency across multi-image narratives."
            }
          }
        }
      }
    },
    "splits": {
      "type": "object",
      "description": "Dataset split configuration.",
      "required": ["train", "validation", "test"],
      "properties": {
        "train": { "$ref": "#/definitions/SplitConfig" },
        "validation": { "$ref": "#/definitions/SplitConfig" },
        "test": { "$ref": "#/definitions/SplitConfig" }
      }
    },
    "items": {
      "type": "array",
      "description": "List of dataset items with rich metadata for logic-aware image generation.",
      "items": { "$ref": "#/definitions/DatasetItem" }
    }
  },
  "definitions": {
    "SplitConfig": {
      "type": "object",
      "required": ["size", "shards"],
      "properties": {
        "size": {
          "type": "integer",
          "minimum": 0,
          "description": "Number of items in this split."
        },
        "shards": {
          "type": "integer",
          "minimum": 1,
          "description": "Number of storage shards for this split."
        },
        "sampling_weight": {
          "type": "number",
          "minimum": 0.0,
          "description": "Relative sampling weight for training."
        }
      }
    },
    "DatasetItem": {
      "type": "object",
      "required": [
        "item_id",
        "split",
        "media",
        "prompt",
        "scene_graph",
        "narrative",
        "safety",
        "generation_controls",
        "logic_annotations"
      ],
      "properties": {
        "item_id": {
          "type": "string",
          "pattern": "^[a-zA-Z0-9_.\\-]{3,128}$"
        },
        "split": {
          "type": "string",
          "enum": ["train", "validation", "test"]
        },
        "media": {
          "type": "object",
          "description": "References to image files or sequences with semantic roles.",
          "required": ["images"],
          "properties": {
            "images": {
              "type": "array",
              "minItems": 1,
              "items": { "$ref": "#/definitions/ImageRef" }
            },
            "primary_image_index": {
              "type": "integer",
              "minimum": 0,
              "description": "Index in `images` array for primary training image."
            }
          }
        },
        "prompt": {
          "type": "object",
          "description": "Structured prompt metadata designed for high-quality image generation.",
          "required": ["raw_text", "clean_text", "style_tags", "negative_tags", "instruction_tags"],
          "properties": {
            "raw_text": { "type": "string" },
            "clean_text": {
              "type": "string",
              "description": "Sanitized, instruction-ready prompt for training IG models."
            },
            "style_tags": {
              "type": "array",
              "description": "Controlled vocabulary for style (e.g. 'photorealistic', 'watercolor').",
              "items": { "type": "string" }
            },
            "negative_tags": {
              "type": "array",
              "description": "What should be avoided in the generated image (e.g. 'blurry', 'text artifacts').",
              "items": { "type": "string" }
            },
            "instruction_tags": {
              "type": "array",
              "description": "High-level instructions like 'keep_identity_consistent', 'match_panel_layout', etc.",
              "items": { "type": "string" }
            }
          }
        },
        "scene_graph": {
          "type": "object",
          "description": "Explicit scene representation combining objects, attributes, and relations to improve compositional reasoning.",
          "required": ["objects", "relations"],
          "properties": {
            "objects": {
              "type": "array",
              "items": { "$ref": "#/definitions/SceneObject" }
            },
            "relations": {
              "type": "array",
              "items": { "$ref": "#/definitions/SceneRelation" }
            }
          }
        },
        "narrative": {
          "type": "object",
          "description": "Narrative-level metadata for multi-image/logical sequences.",
          "required": ["sequence_role", "sequence_index", "sequence_length", "story_turns"],
          "properties": {
            "sequence_role": {
              "type": "string",
              "enum": ["single", "panel", "chapter", "scene_step"]
            },
            "sequence_index": { "type": "integer", "minimum": 0 },
            "sequence_length": { "type": "integer", "minimum": 1 },
            "story_turns": {
              "type": "array",
              "description": "Logical steps or turns that this item contributes to (e.g. 'setup', 'conflict', 'resolution').",
              "items": { "type": "string" }
            }
          }
        },
        "safety": {
          "type": "object",
          "description": "Per-item safety labels and overrides.",
          "required": ["is_safe", "flags"],
          "properties": {
            "is_safe": { "type": "boolean" },
            "flags": {
              "type": "array",
              "items": {
                "type": "string",
                "enum": [
                  "none",
                  "possible_violence",
                  "possible_alcohol",
                  "possible_sensitive_symbol"
                ]
              }
            }
          }
        },
        "generation_controls": {
          "type": "object",
          "description": "Fine-grained generation controls and hyperparameters for reproducible and logically consistent images.",
          "required": ["sampler", "steps", "cfg_scale", "seed", "resolution"],
          "properties": {
            "sampler": {
              "type": "string",
              "enum": ["ddim", "ddpm", "euler", "euler_ancestral", "heun", "dpmpp"]
            },
            "steps": {
              "type": "integer",
              "minimum": 1,
              "maximum": 4096
            },
            "cfg_scale": {
              "type": "number",
              "minimum": 0.0,
              "maximum": 50.0
            },
            "seed": {
              "type": "integer",
              "minimum": 0
            },
            "resolution": {
              "type": "array",
              "items": { "type": "integer", "minimum": 1 },
              "minItems": 2,
              "maxItems": 2
            },
            "noise_schedule": {
              "type": "string",
              "enum": ["linear", "cosine", "sigmoid", "custom"],
              "description": "Optional noise schedule type for diffusion-based models."
            },
            "consistency_controls": {
              "type": "object",
              "description": "Controls for maintaining logical/visual consistency within sequences.",
              "properties": {
                "lock_character_identity": { "type": "boolean" },
                "lock_palette": { "type": "boolean" },
                "layout_hint": {
                  "type": "string",
                  "enum": ["none", "storyboard", "grid_2x2", "grid_3x1", "manga_panel"]
                }
              }
            }
          }
        },
        "logic_annotations": {
          "type": "object",
          "description": "Explicit logical constraints and reasoning evidence for this item, designed to train models that respect logic and narrative.",
          "required": ["entity_consistency", "style_consistency", "reasoning_steps"],
          "properties": {
            "entity_consistency": {
              "type": "object",
              "description": "Entity-level consistency tags within and across images.",
              "required": ["entities"],
              "properties": {
                "entities": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "required": ["entity_id", "name", "persistent_across_sequence"],
                    "properties": {
                      "entity_id": { "type": "string" },
                      "name": { "type": "string" },
                      "persistent_across_sequence": { "type": "boolean" }
                    }
                  }
                }
              }
            },
            "style_consistency": {
              "type": "object",
              "required": ["style_family", "should_match_previous"],
              "properties": {
                "style_family": { "type": "string" },
                "should_match_previous": { "type": "boolean" }
              }
            },
            "reasoning_steps": {
              "type": "array",
              "description": "Short, factual reasoning steps describing why this prompt and scene are logically consistent, to train logic-aware generators.",
              "items": { "type": "string" }
            }
          }
        }
      }
    },
    "ImageRef": {
      "type": "object",
      "required": ["path", "role", "width", "height", "format"],
      "properties": {
        "path": {
          "type": "string",
          "description": "Filesystem or URL path to the image."
        },
        "role": {
          "type": "string",
          "enum": ["primary", "auxiliary", "reference_style", "reference_layout"],
          "description": "Role of this image in the item."
        },
        "width": { "type": "integer", "minimum": 1 },
        "height": { "type": "integer", "minimum": 1 },
        "format": {
          "type": "string",
          "enum": ["png", "jpeg", "webp"]
        },
        "checksum_sha256": {
          "type": "string",
          "pattern": "^[a-f0-9]{64}$",
          "description": "Optional checksum for integrity verification."
        }
      }
    },
    "SceneObject": {
      "type": "object",
      "required": ["object_id", "category", "attributes"],
      "properties": {
        "object_id": { "type": "string" },
        "category": { "type": "string" },
        "attributes": {
          "type": "array",
          "items": { "type": "string" }
        },
        "bounding_box": {
          "type": "array",
          "description": "[x, y, width, height] in normalized image coordinates.",
          "items": { "type": "number", "minimum": 0.0, "maximum": 1.0 },
          "minItems": 4,
          "maxItems": 4
        }
      }
    },
    "SceneRelation": {
      "type": "object",
      "required": ["subject_id", "predicate", "object_id"],
      "properties": {
        "subject_id": { "type": "string" },
        "predicate": { "type": "string" },
        "object_id": { "type": "string" }
      }
    }
  }
}
)json"
