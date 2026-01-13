const EcocityTechDescriptor = {
  id: "ecocity.frame.001.tech.analysis",
  frameType: "smart-city_twilight_street_view",
  // 1) Elevated bridges / walkways
  elevatedWalkways: {
    archetype: "enclosed_elevated_skywalk",
    plausibleTechStack: {
      structural: {
        spanType: "simply_supported_or_continuous_box_girder",
        materials: [
          "laminated_safety_glass_for_sidewalls_and_ceiling",
          "steel_or_composite_box_girders",
          "vibration_damping_layers_for_pedestrian_comfort"
        ],
        features: [
          "anti-slip_flooring",
          "integrated_expansion_joints",
          "acoustic_dampening_panels",
          "seismic_and_wind_bracing"
        ]
      },
      buildingIntegration: {
        role: [
          "inter-building_pedestrian_transfer",
          "micro-mobility_corridor_for_e-scooters_and_carts",
          "climate-controlled_commute_link"
        ],
        subsystems: [
          "HVAC_with_heat_recovery",
          "smart_glass_for_dynamic_tinting",
          "occupancy_sensors_and_people_counters",
          "fire_suppression_and_emergency_lighting"
        ]
      },
      safety_and_access: {
        accessControl: [
          "badge_or_phone_based_entry_at_building_ends",
          "turnstiles_or_gate_sensors",
          "video_analytics_for_overcrowding_detection"
        ],
        universalDesign: [
          "step-free_access_from_elevators",
          "wide_clear_width_for_wheelchairs",
          "handrail_height_and_load_compliant_with_codes"
        ]
      }
    }
  },

  // 2) Multi-rotor drones around and below the walkways
  urbanDrones: {
    archetype: "multi_rotor_urban_operations_drone",
    plausibleRoles: [
      "traffic_and_pedestrian_flow_monitoring",
      "infrastructure_inspection_and_maintenance_scanning",
      "environmental_sensing_air_quality_noise",
      "public_safety_overwatch_non-lethal_observation",
      "small_payload_delivery"
    ],
    airframeAndPropulsion: {
      configuration: "quad_or_hexacopter_with_folded_arms",
      materials: [
        "carbon_fiber_reinforced_plastic_for_arms",
        "lightweight_polymer_or_magnesium_for_body_shell"
      ],
      features: [
        "low-noise_propeller_design",
        "redundant_esc_and_motor_channels",
        "battery_quick_swap_bays"
      ]
    },
    navigationAndControl: {
      sensing: [
        "GNSS_multi-band_GPS_Galileo",
        "downward_vision_positioning",
        "stereo_or_lidar_for_collision_avoidance",
        "mmWave_radar_for_all-weather_detection"
      ],
      autonomyStack: [
        "geo-fencing_and_no-fly_zone_enforcement",
        "predefined_corridor_flight_paths_above_streets",
        "onboard_fail-safe_RTL_return_to_launch",
        "U-space_OR_RID_remote_identification_beacons"
      ],
      communications: [
        "encrypted_5G_or_private_LTE_link_to_control_cloud",
        "backup_sub-GHz_command_channel",
        "V2X_style_broadcast_for_collision_coordination"
      ]
    },
    payloadAndOptics: {
      typicalPayloads: [
        "gimballed_4K_camera_with_electronic_and_mechanical_stabilization",
        "thermal_infrared_module_for_heat_leak_and_person_detection",
        "multi-spectral_sensors_for_green_roof_health_monitoring",
        "air_quality_module_PM2_5_NOx_CO2"
      ],
      safetyPolicies: [
        "anonymizing_video_analytics_where_required",
        "edge_processing_for_event_detection_before_cloud_upload",
        "data_retention_controls_per_local_regulation"
      ]
    }
  },

  // 3) Head-level “RESOURCE / SALVAGE / CARBON / CREDIT” descriptors
  //    — interpreted as AR HUD or ambient spatial UI, not horror.
  headLevelHUD: {
    archetype: "mixed_reality_contextual_overlay",
    displayModels: [
      "wearable_AR_headset_glasses_or_contact_lens",
      "ambient_spatial_AR_signage_visible_through_devices"
    ],
    dataSemantics: {
      RESOURCE: {
        type: "classification_tag",
        meaning: "object_or_material_is_recoverable_as_reusable_resource",
        typicalUse: [
          "sorting_streams_for_circular_economy_loops",
          "flagging_items_for_reuse_or_refurbishment",
          "feeding_inventory_data_to_material_passports"
        ]
      },
      SALVAGE: {
        type: "classification_tag",
        meaning: "object_can_be_partially_recovered_for_components_or_material",
        typicalUse: [
          "end_of_life_asset_management",
          "disassembly_instructions_for_robotic_sorters",
          "prioritization_of_high_value_parts_boards_motors"
        ]
      },
      CARBON: {
        type: "metric_channel",
        meaning: "embedded_or_marginal_carbon_intensity_value",
        typicalUse: [
          "real-time_scope_3_estimation_for_items",
          "dynamic_low-carbon_choice_recommendations",
          "carbon_budget_feedback_for_individuals_and_fleets"
        ]
      },
      CREDIT: {
        type: "economic_channel",
        meaning: "tokenized_or_accounting_credit_for_recycling_or_low-carbon_actions",
        typicalUse: [
          "personal_carbon_wallet_or_loyalty_program",
          "city-wide_incentive_schemes_for_residents",
          "settlement_between_waste_operators_and_municipality"
        ]
      }
    },
    HUDArchitecture: {
      sensingLayer: [
        "on-body_cameras_and_depth_sensors_for_scene_understanding",
        "RFID_NFC_and_barcode_scans_for_object_ID",
        "edge_AI_models_for_material_and_object_classification"
      ],
      dataLayer: [
        "material_taxonomy_databases",
        "life_cycle_assessment_LCA_models",
        "carbon_accounting_and_credit_registries"
      ],
      visualizationLayer: {
        style: "floating_labels_with_thin_connecting_lines_to_objects",
        colorCodes: {
          resource: "green_tint_for_recoverable_materials",
          salvage: "orange_or_yellow_for_partial_recovery",
          carbon: "numeric_scale_or_icon_intensity",
          credit: "numeric_balance_or_increment_animation"
        },
        ergonomics: [
          "foveated_rendering_around_gaze_point",
          "contextual_suppression_to_avoid_HUD_clutter",
          "contrast_and_brightness_adapted_to_ambient_light"
        ]
      },
      identityAndPolicy: {
        subjectType: "augmented_worker_or_citizen",
        profiles: [
          "waste_stream_operator",
          "city_infrastructure_technician",
          "sustainability_auditor",
          "general_citizen_in_a_reward_program"
        ],
        privacyAndGovernance: [
          "opt-in_for_personal_metric_tracking",
          "clear_data_ownership_policies",
          "auditable_logs_for_carbon_credit_transactions"
        ]
      }
    }
  },

  // 4) Interpreting the “augmented citizen”
  //    (body-housing with visible recyclables) in non-horror, realistic terms.
  augmentedWorkerConcept: {
    archetype: "wearable_or_exoskeleton_based_sustainability_operator",
    realisticInterpretation: {
      // Instead of literal body-integration, use external systems:
      formFactor: [
        "torso-worn_exoskeleton_with_front_mounted_modular_bin",
        "smart_uniform_with_embedded_sensors",
        "service_robot_with_anthropomorphic_shell_for_public_acceptance"
      ],
      sensing: [
        "weight_sensors_in_collection_bin",
        "internal_camera_for_auto-sorting_and_contamination_detection",
        "IMU_for_worker_safety_posture_monitoring"
      ],
      feedbackAndHUD: [
        "visual_indicators_on_the_harness_showing_fill_level_and_material_type",
        "AR_overlay_on_glasses_showing_SORT_AS_resource_salvage_or_landfill",
        "haptic_feedback_for_wrong_bin_or_overload"
      ]
    }
  }
};

// Export for downstream VL/IG tooling
module.exports = {
  EcocityTechDescriptor
};
