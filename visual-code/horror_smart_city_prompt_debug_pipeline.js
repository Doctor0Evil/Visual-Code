const VC_HORROR_DEBUG_VERSION = "1.0.0";
const VC_HORROR_DEBUG_BUILD   = "VC-HORROR-SMART-CITY-20260112A";

/**
 * Strongly typed literal sets (conceptual) for debugging.
 * These match the style used in Visual-Code VL/IG router configs. [file:1]
 */
const VCDebugCameraType  = Object.freeze(["perspective"]);
const VCDebugLightingTag = Object.freeze(["twilight", "clinical-led", "neon"]);
const VCDebugMoodTag     = Object.freeze(["dystopian", "eco-utopia-failed", "clinical-horror"]);
const VCDebugLayerId     = Object.freeze([
  "background",
  "midground",
  "foreground",
  "atmosphere",
  "ui_overlays"
]);
const VCDebugObjectType  = Object.freeze([
  "building",
  "street",
  "person",
  "hybrid_body_machine",
  "vehicle",
  "drone",
  "billboard",
  "light_source",
  "eco_tower",
  "ui_marker"
]);

/**
 * Unified prompt descriptor:
 * This is a structured representation of the horror eco-city scene.
 * It surfaces every key element that the text described. [file:1]
 */
const HorrorSmartCityPromptDescriptor = {
  id: "vc.horror.eco_smart_city.v1",
  version: VC_HORROR_DEBUG_VERSION,
  build: VC_HORROR_DEBUG_BUILD,
  aspectRatio: "16:9",
  layoutHint: "cinematic",
  safetyProfile: "safe", // still SFW, no gore, no explicit violence
  globalMood: {
    tags: ["dystopian", "eco-utopia-failed", "clinical", "oppressive", "existential-dread"],
    description: "Hyper-detailed dystopian smart-city at twilight where humans are clinically integrated into eco-infrastructure."
  },
  camera: {
    type: "perspective",
    fovDegrees: 55,
    position: { x: 0.0, y: 1.8, z: 7.5 },
    lookAt:   { x: 0.0, y: 1.6, z: 0.0 },
    rollDeg:  0.0
  },
  lighting: {
    timeOfDay: "twilight",
    keySources: [
      {
        id: "sky_ambient",
        type: "environment",
        color: { r: 0.2, g: 0.3, b: 0.5 },
        intensity: 0.6,
        notes: "Cool, hazy twilight ambience."
      },
      {
        id: "street_led_strips",
        type: "area-linear",
        color: { r: 0.5, g: 0.9, b: 0.7 },
        intensity: 1.3,
        notes: "Sickly green/cyan LED strips along streets, casting elongated shadows."
      },
      {
        id: "billboard_neons",
        type: "local-emissive",
        color: { r: 0.3, g: 0.9, b: 0.7 },
        intensity: 1.1,
        notes: "Eco-slogan billboards providing localized teal/leaf green accent light."
      }
    ],
    environmentEffects: [
      {
        id: "wet_pavement_gloss",
        type: "specular-reflection",
        intensity: 0.85,
        notes: "Recent gentle rain, high gloss reflections of LEDs and billboards."
      },
      {
        id: "digital_smog_overlay",
        type: "screen-space-overlay",
        pattern: "subtle grid and drone path lines",
        opacity: 0.25,
        notes: "Suggests AR grid and drone traffic lanes in the sky."
      }
    ]
  },
  colorPalette: {
    primaryNeons: ["cyan", "magenta", "sickly-green"],
    baseNeutrals: ["concrete-gray", "desaturated-blue-gray"],
    organicAccents: ["muted-earth-brown", "dark-green-rooftop-gardens"],
    uiColors: ["teal", "leaf-green", "soft-white"]
  },
  // Scene graph: background → midground → foreground
  layers: {
    background: {
      description: "Distant eco towers, dense skyline, AR-smog sky.",
      objects: [
        {
          id: "bg_smart_city_skyline",
          type: "building",
          materialProfile: "glass_steel_vertical_farms",
          countEstimate: 30,
          visualNotes: [
            "Packed glass towers with vertical greenery bands.",
            "Neon sustainability billboards attached to facades.",
            "Hovering drones between towers."
          ]
        },
        {
          id: "bg_eco_towers",
          type: "eco_tower",
          countEstimate: 3,
          facadeStyle: "elegant_eco_corporate",
          facadeGraphics: ["animated_forests", "animated_oceans"],
          hiddenFunction: "vertical_processing_plants",
          subtleHorrorDetails: [
            "Faint silhouettes of human forms in vertical transparent shafts.",
            "Slow upward motion implying repurposing pipeline."
          ]
        },
        {
          id: "bg_unconverted_humans",
          type: "person",
          countEstimate: 8,
          placement: "far_background_sidewalks_and_balconies",
          visibility: "small_silhouettes",
          notes: [
            "Marked by drone scanning beams when selected.",
            "Used by UI overlay layer for 'PENDING INTEGRATION'."
          ]
        }
      ]
    },
    midground: {
      description: "Main smart street, integrated citizens in infrastructure roles.",
      objects: [
        {
          id: "mg_main_street",
          type: "street",
          cleanliness: "unnaturally_pristine",
          trafficDensity: "very_low",
          pavementState: "wet_high_reflection",
          notes: [
            "Almost no litter.",
            "Long shadows from LED strips."
          ]
        },
        {
          id: "mg_row_integrated_citizens",
          type: "hybrid_body_machine",
          archetypes: [
            {
              id: "recycling_kiosk_hybrids",
              role: "autonomous_recycling_kiosk",
              integrationStyle: "ribcage_as_intake_grille",
              countEstimate: 6,
              poseNotes: [
                "Standing or fixed near pavement edges.",
                "Upper torsos partially visible or implied under panels."
              ],
              biomech: {
                skinToShellTransition: "vein_like_circuit_patterns",
                visibleBlood: false,
                seams: "smooth_closed"
              },
              expression: "blank_conscious",
              eyeOverlay: "faint_HUD_recycling_icons"
            },
            {
              id: "wall_dishwasher_hybrids",
              role: "building_wall_dishwasher_or_laundry_unit",
              integrationStyle: "torso_flattened_into_appliance_front",
              countEstimate: 4,
              poseNotes: [
                "Arms merged into dishwasher door panel.",
                "Door opens/closes rhythmically like breathing."
              ],
              biomech: {
                skinToShellTransition: "organic_to_matte_white_composite",
                seams: "precise_closed_medical"
              }
            },
            {
              id: "compact_car_hybrids",
              role: "compact_self_driving_car_or_delivery_pod",
              integrationStyle: "body_contorted_into_vehicle_chassis",
              countEstimate: 5,
              silhouetteHints: [
                "Subtle cheek and jaw curve along front bumper.",
                "Slight nose bridge implied in hood contour."
              ],
              biomech: {
                visibleFaces: "barely_discernible",
                transitionPattern: "curved_metal_over_skin"
              }
            }
          ]
        },
        {
          id: "mg_human_tram_seats",
          type: "hybrid_body_machine",
          role: "tram_seats",
          integrationStyle: "spine_as_seat_curve",
          countEstimate: 12,
          notes: [
            "Seat backs subtly show shoulder contours.",
            "Seat padding aligned with ribcage arcs."
          ],
          biomech: {
            skinMaterialBlend: "sallow_skin_to_textured_synthetic",
            seams: "smooth_hidden_under_fabric"
          }
        },
        {
          id: "mg_building_vent_panels",
          type: "hybrid_body_machine",
          role: "living_ventilation_panels",
          integrationStyle: "torsos_flattened_in_facade",
          behavior: "open_close_like_gills",
          countEstimate: 10,
          notes: [
            "Panel slats correspond to rib segments.",
            "Slow rhythmic motion synced with city ventilation cycles."
          ]
        },
        {
          id: "mg_smart_streetlights_heads",
          type: "hybrid_body_machine",
          role: "smart_streetlight_heads",
          integrationStyle: "human_heads_as_lamp_heads",
          countEstimate: 10,
          gazeDirection: "downwards_to_pavement",
          irisFunction: "sensor_and_light_emitter",
          beamStyle: "tight_cold_spotlight",
          expression: "blank",
          notes: [
            "Eyes function as optical sensors.",
            "Light beams track residual human motion."
          ]
        },
        {
          id: "mg_autonomous_cars_line",
          type: "vehicle",
          subtype: "compact_autonomous_cars",
          countEstimate: 7,
          motion: "slow_glide",
          soundProfile: "almost_silent",
          humanContourDetail: [
            "Front bumper and hood show faint human face in profile.",
            "Rear contour hints at heel and calf shapes."
          ]
        },
        {
          id: "mg_window_appliance_fusions",
          type: "hybrid_body_machine",
          role: "home_appliance_fusions",
          countEstimate: 12,
          placement: "high_rise_windows",
          visibility: "silhouette_through_glass",
          specificMotifs: [
            "Person standing motionless with arms forming dishwasher front.",
            "Periodic opening/closing as breathing metaphor."
          ]
        }
      ]
    },
    foreground: {
      description: "Central horror focus: half-human waste-sorting machine.",
      objects: [
        {
          id: "fg_central_recycling_human",
          type: "hybrid_body_machine",
          role: "waste_sorting_unit",
          framing: "dominant_central_subject",
          physicalDescription: {
            visibleHumanSide: "one_half_body",
            visibleParts: ["head", "neck", "one_shoulder", "partial_upper_torso"],
            skinTone: "sallow_pale_under_cold_light",
            ageRange: "middle_aged",
            genderExpression: "intentionally_ambiguous"
          },
          machineDescription: {
            housingStyle: "glossy_futuristic_vending_unit",
            sizeRelativeToHuman: "slightly_taller_and_wider",
            material: ["glossy_plastic", "brushed_metal", "transparent_compartment"],
            conveyor: {
              visible: true,
              items: ["compressed_plastic_bricks", "metal_cubes"],
              motionSpeed: "slow_continuous"
            },
            breathingVents: {
              position: "rib_area",
              motion: "subtle_expand_contract",
              sync: "human_like_breathing_rhythm"
            }
          },
          biomech: {
            goreFree: true,
            integrationStyle: "smooth_surgical_transition",
            seamPattern: "organic_vein_like_circuits",
            torsoBlend: "skin_to_translucent_compartment_wall",
            visibleBlood: false
          },
          expression: {
            base: "exhausted_resignation",
            overlay: "faint_horror",
            mouth: "slightly_open",
            eyeGlow: "soft_emerald",
            tearTraces: "subtle_dried_streaks"
          },
          uiProjections: {
            eyeReflections: ["RESOURCE", "SALVAGE", "CARBON CREDIT"],
            hologramPositions: ["air_near_conveyor_output", "adjacent_trash_bins"],
            fontStyle: "sleek_corporate_sans_serif",
            colorScheme: ["teal", "leaf_green", "soft_white"]
          },
          neuralCabling: {
            origin: "back_of_skull",
            style: "fiber_optic_halo",
            color: "faint_pulsing_green",
            routing: "into_overhead_city_data_cables"
          }
        },
        {
          id: "fg_side_integrated_units_left",
          type: "hybrid_body_machine",
          role: "supporting_integrated_citizens_left",
          countEstimate: 4,
          diverseRoles: [
            "living_trash_bin_interface",
            "wall_mounted_status_panel",
            "small_delivery_pod_shell"
          ]
        },
        {
          id: "fg_side_integrated_units_right",
          type: "hybrid_body_machine",
          role: "supporting_integrated_citizens_right",
          countEstimate: 4,
          diverseRoles: [
            "bench_seat_segment",
            "charging_station_front_panel"
          ]
        }
      ]
    },
    atmosphere: {
      description: "Environmental overlays, AR smog, drone traffic.",
      objects: [
        {
          id: "atm_drone_patrols",
          type: "drone",
          countEstimate: 10,
          markings: "friendly_smart_city_logo",
          pathing: "looping_grid_patrols",
          lights: {
            downwardScanningBeams: "soft_blue",
            beamWidth: "narrow_cones",
            behavior: "sweep_over_streets_and_figures"
          }
        },
        {
          id: "atm_sky_grid_overlay",
          type: "ui_marker",
          role: "AR_sky_grid",
          opacity: 0.25,
          pattern: "thin_grid_lines_and_waypoints",
          notes: [
            "Suggests that airspace is fully instrumented interface.",
            "Subtle to avoid overpowering main composition."
          ]
        }
      ]
    },
    ui_overlays: {
      description: "Billboards, slogans, integration markers.",
      objects: [
        {
          id: "ui_billboard_1",
          type: "billboard",
          slogan: "HUMAN FOOTPRINT: FULLY OPTIMIZED",
          font: "sleek_corporate_sans",
          colorScheme: ["teal", "leaf_green", "soft_white"],
          moodEffect: "clashes_with_horror_scene",
          placement: "upper_left_skyline"
        },
        {
          id: "ui_billboard_2",
          type: "billboard",
          slogan: "YOU ARE THE SOLUTION",
          font: "sleek_corporate_sans",
          colorScheme: ["teal", "leaf_green", "soft_white"],
          placement: "center_background"
        },
        {
          id: "ui_billboard_3",
          type: "billboard",
          slogan: "ZERO-WASTE CIVILIZATION",
          font: "sleek_corporate_sans",
          colorScheme: ["teal", "leaf_green", "soft_white"],
          placement: "right_skyline"
        },
        {
          id: "ui_pending_integration_markers",
          type: "ui_marker",
          label: "PENDING INTEGRATION",
          trigger: "drone_beam_over_unconverted_humans",
          style: {
            font: "minimal_ui",
            color: "soft_blue",
            border: "thin_rectangle",
            animation: "subtle_pulse"
          }
        }
      ]
    }
  }
};

/**
 * Stepwise “debug trace” of operations required for a VL/IG system
 * to reliably render this scene.
 *
 * This does NOT call any external APIs; it defines what a router like
 * Visual-Code would log as conceptual steps. [file:1]
 */
function buildHorrorSmartCityDebugTrace() {
  /** @type {Array<Object>} */
  const trace = [];

  // 1. Input acquisition & sanitization
  trace.push({
    step: 1,
    name: "sanitize_user_prompt",
    description: "Normalize raw horror eco-city text into SFW, whitespace-collapsed canonical form.",
    actions: [
      "strip_control_characters",
      "collapse_whitespace",
      "enforce_no_gore_no_nsfw_language",
      "preserve_horror_via_context_and_expression_only"
    ],
    inputs: {
      rawPromptId: HorrorSmartCityPromptDescriptor.id
    },
    outputs: {
      sanitizedPromptKey: "sanitized.horror.eco_smart_city"
    }
  });

  // 2. Semantic parsing into scene graph
  trace.push({
    step: 2,
    name: "parse_scene_semantics",
    description: "Convert sanitized text into structured scene graph layers and typed objects.",
    actions: [
      "extract_global_mood_tags",
      "detect_layers_background_midground_foreground",
      "identify_human_machine_roles",
      "assign_building_and_vehicle_clusters",
      "pull_ui_slogans_into_billboard_nodes"
    ],
    inputs: {
      sanitizedPromptKey: "sanitized.horror.eco_smart_city"
    },
    outputs: {
      sceneGraph: HorrorSmartCityPromptDescriptor.layers
    }
  });

  // 3. Camera and composition planning
  trace.push({
    step: 3,
    name: "plan_camera_composition",
    description: "Set 16:9 cinematic camera framing and ensure central recycling-human unit is focal point.",
    actions: [
      "set_aspect_ratio_16_9",
      "place_camera_in_street_look_toward_eco_towers",
      "enforce_rule_of_thirds_for_central_subject",
      "distribute_integrated_citizens_along_perspective_corridor",
      "ensure_depth_layers_visible_background_to_foreground"
    ],
    inputs: {
      cameraTemplate: HorrorSmartCityPromptDescriptor.camera,
      sceneGraph: HorrorSmartCityPromptDescriptor.layers
    },
    outputs: {
      cameraSolutionId: "cam.eco_horror_01",
      compositionHints: [
        "central_subject_foreground",
        "street_perspective_to_eco_towers",
        "balanced_side_subjects"
      ]
    }
  });

  // 4. Lighting and palette synthesis
  trace.push({
    step: 4,
    name: "synthesize_lighting_palette",
    description: "Apply twilight + clinical LED palette and reflections on wet pavement.",
    actions: [
      "tag_time_of_day_twilight",
      "add_sickly_green_cyan_led_bands",
      "add_neon_billboard_emission",
      "enable_wet_pavement_specular_pass",
      "overlay_subtle_digital_smog_grid"
    ],
    inputs: {
      lightingBase: HorrorSmartCityPromptDescriptor.lighting,
      palette: HorrorSmartCityPromptDescriptor.colorPalette
    },
    outputs: {
      lightingRigId: "light.eco_clinical_twilight",
      paletteProfileId: "palette.horror_eco_01"
    }
  });

  // 5. Biomechanical integration rules (no gore)
  trace.push({
    step: 5,
    name: "apply_biomechanical_integration_rules",
    description: "Configure flesh-to-machine transitions as surgical and seamless, avoiding gore.",
    actions: [
      "set_skin_to_metal_transitions_smooth",
      "remove_any_open_wounds_text_tokens",
      "apply_vein_like_circuit_seams",
      "set_breathing_motion_via_surface_panels",
      "encode_expression_states_as_conscious_but_subdued"
    ],
    inputs: {
      hybridArchetypes: HorrorSmartCityPromptDescriptor.layers.midground.objects.concat(
        HorrorSmartCityPromptDescriptor.layers.foreground.objects
      )
    },
    outputs: {
      biomechRuleSetId: "biomech.surgical_closed_eco_horror"
    }
  });

  // 6. UI overlay & typography configuration
  trace.push({
    step: 6,
    name: "configure_ui_overlays",
    description: "Map eco-slogans and integration markers into structured UI overlay primitives.",
    actions: [
      "create_billboard_meshes",
      "assign_slogans_and_fonts",
      "assign_color_schemes_teal_leaf_green_soft_white",
      "bind_pending_integration_tags_to_drone_beams",
      "route_resource_salvage_carbon_credit_labels_to_foreground_holograms"
    ],
    inputs: {
      uiLayer: HorrorSmartCityPromptDescriptor.layers.ui_overlays,
      foregroundSubject: "fg_central_recycling_human"
    },
    outputs: {
      uiConfigId: "ui.eco_horror_overlays",
      billboardCount: HorrorSmartCityPromptDescriptor.layers.ui_overlays.objects.length
    }
  });

  // 7. Drone logic and background human tagging
  trace.push({
    step: 7,
    name: "bind_drone_scans_to_unconverted_humans",
    description: "Tie drone beams to far-background human silhouettes to display 'PENDING INTEGRATION' markers.",
    actions: [
      "instantiate_drone_patrol_paths",
      "compute_intersection_of_beams_with_unconverted_human_positions",
      "spawn_pending_integration_ui_markers_on_intersection",
      "ensure_threat_is_implied_not_explicit"
    ],
    inputs: {
      drones: HorrorSmartCityPromptDescriptor.layers.atmosphere.objects,
      unconvertedHumansNode: "bg_unconverted_humans"
    },
    outputs: {
      droneLogicId: "drone.eco_integration_scanner",
      uiMarkerBindingId: "ui.binding.pending_integration"
    }
  });

  // 8. Foreground subject emotional tuning
  trace.push({
    step: 8,
    name: "tune_foreground_subject_emotion",
    description: "Emphasize exhaustion and faint horror in the central figure without overt gore.",
    actions: [
      "set_eye_glow_emerald",
      "apply_subtle_dried_tear_streaks",
      "relax_muscles_to_resigned_posture",
      "limit_mouth_opening_to_soft_silent_scream",
      "sync_breathing_vents_to_eye_glow_pulses"
    ],
    inputs: {
      foregroundSubjectId: "fg_central_recycling_human"
    },
    outputs: {
      emotionRigId: "emotion.eco_resigned_horror"
    }
  });

  // 9. Distant eco-tower horror details
  trace.push({
    step: 9,
    name: "embed_subtle_horror_in_eco_towers",
    description: "Add faint silhouettes in vertical shafts of eco towers for long-range dread.",
    actions: [
      "add_transparent_shafts_to_eco_towers",
      "spawn_slow_moving_human_silhouettes",
      "reduce_opacity_to_low_visibility",
      "align_vertical_motion_with_city_processing_motif"
    ],
    inputs: {
      ecoTowerNode: "bg_eco_towers"
    },
    outputs: {
      ecoTowerHorrorId: "eco_tower.subtle_repurposing"
    }
  });

  // 10. Final VL/IG-ready scene package
  trace.push({
    step: 10,
    name: "package_vl_ig_scene_descriptor",
    description: "Bundle camera, lighting, biomech rules, UI, and scene graph into a single IG-ready config.",
    actions: [
      "combine_scene_graph_layers",
      "attach_camera_and_lighting_profiles",
      "attach_biomech_ruleset",
      "attach_ui_and_drone_logic",
      "tag_package_for_horror_ecoutopia_category"
    ],
    inputs: {
      descriptor: HorrorSmartCityPromptDescriptor
    },
    outputs: {
      packageId: "pkg.vc.horror.eco_smart_city.16_9",
      recommendedQualityPreset: "high",
      safetyProfile: "safe"
    }
  });

  return trace;
}

/**
 * Export object for integration into a larger Visual-Code style system. [file:1]
 */
const HorrorSmartCityDebugPackage = {
  meta: {
    version: VC_HORROR_DEBUG_VERSION,
    build: VC_HORROR_DEBUG_BUILD,
    category: "horror_ecoutopia",
    aspectRatio: "16:9",
    layout: "cinematic"
  },
  promptDescriptor: HorrorSmartCityPromptDescriptor,
  debugTrace: buildHorrorSmartCityDebugTrace()
};

// Optional: console output for inspection in a dev shell.
if (typeof require !== "undefined" && require.main === module) {
  console.log("=== HORROR ECO-SMART-CITY PROMPT DEBUG TRACE ===");
  console.log(JSON.stringify(HorrorSmartCityDebugPackage, null, 2));
}

module.exports = {
  HorrorSmartCityDebugPackage
};
