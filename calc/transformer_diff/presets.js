'use strict';
/**
 * transformer_diff/presets.js — Port of
 * calculations/ct_transformer_differential/presets.py
 *
 * Default/tuning constants for the full-fidelity
 * transformer differential package. Pure data — no functions in the Python
 * source besides the module-level dict literals.
 * MATERIAL_RESISTIVITY is not ported: ρ20 lives only in calc/materials.js
 * (PORTING_PLAN.md §9.7 Q-TD1). Extends the CTTransformerDiff
 * namespace (calc/transformer_diff.js, loaded first); composed by calc/transformer_diff/main.js.
 */

CTTransformerDiff.presets = (() => {
  // Python's MATERIAL_RESISTIVITY is not ported: no calculation reads it, and
  // ρ20 lives only in calc/materials.js, used through CTCableRes
  // (PORTING_PLAN.md §9.7 Q-TD1).

  // Temperature coefficients (1/°C)
  const TEMPERATURE_COEFFICIENTS = {
    'Kobber (Cu)': CTMaterials.COPPER_TEMP_COEFFICIENT,
    'Aluminium (Al)': CTMaterials.ALUMINUM_TEMP_COEFFICIENT,
  };

  // Default values
  const DEFAULT_VALUES = {
    cable_length: 150,           // m
    cable_cross_section: 4,      // mm²
    cable_temp: 75,               // °C
    cable_material: 'Kobber (Cu)',
    rct: 4,                       // Ω
    burden_va: 30,                // VA
    secondary_current: 1,         // A
    primary_current: 2000,        // A
    relay_burden: 0.1,            // VA
    trafo_rated_power: 160,       // MVA
    z_percent: 14,                // %
    inrush_factor: 8,
    voltage_level: 150,           // kV
    trafo_it_max: 10000,          // A
    trafo_ik_max: null,           // A — none: the core's override, else the project Ik max
    linked_winding: 'HV',
  };

  // IEC 61869 constants
  const IEC_CONSTANTS = {
    k_wire: 2,             // Factor for return wire
    min_alf: 12.5,          // Minimum ALF requirement
    min_fadap: 0.05,        // Minimum adaptation factor
    max_fadap: 20,          // Maximum adaptation factor
    ext_fault_factor: 1.5,  // External fault security factor
    int_fault_factor: 0.4,  // Internal fault minimum requirement
  };

  // "G. Ziegler" method constants. The factors are the Siemens 7UT8 CT
  // requirements (SIP5 manual C53000-G5040-C016, Requirements 1–3), the same
  // as IEC_CONSTANTS. The internal fault factor was 0.5; no G. Ziegler source
  // for 0.5 was found, so it is the 7UT8 Requirement 2 value 0.4 (issue #87).
  const ZIEGLER_CONSTANTS = {
    min_alf: 12.5,          // Minimum ALF requirement (Requirement 3)
    int_fault_factor: 0.4,  // Internal fault (Requirement 2): ALF_O ≥ 0.4 × Isc,max,int / Ipr
    ext_fault_factor: 1.5,  // External/through fault security factor (Requirement 1)
  };

  // E.M.F. method constants
  const EMF_CONSTANTS = {
    through_fault_factor: 2,  // Factor for through fault
  };

  // Transformer Z% validation range
  const Z_PERCENT_RANGE = {
    min: 4,   // Minimum typical Z%
    max: 20,  // Maximum typical Z%
  };

  return {
    TEMPERATURE_COEFFICIENTS,
    DEFAULT_VALUES,
    IEC_CONSTANTS,
    ZIEGLER_CONSTANTS,
    EMF_CONSTANTS,
    Z_PERCENT_RANGE,
  };
})();
