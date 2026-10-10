'use strict';
/**
 * vt/data.js — Port of calculations/vt_calculations/data.py
 *
 * Input extraction and validation for the VT subsystem: the per-core VT
 * fields (with the Python defaults), the shared common-data fields, and the
 * input sanity check (returns [is_valid, error_messages] — the Python tuple —
 * with the Danish messages verbatim).
 *
 * First file of the brand-new VT package: it creates the CTVT namespace that
 * the other calc/vt/*.js sub-files extend (CTSizer had no VT engine before
 * Phase 6). `var` + `||` so load order within the folder stays forgiving.
 * Not wired into calc/index.js — calc/vt/calculator.js exposes CTVT.calculate.
 *
 * Python's dict.get(k, d) returns None for a key that is present but None;
 * the JS `??` falls back to the default instead (same convention as the other
 * distance/line_diff/transformer_diff data.js ports). Only matters for explicit-null inputs.
 */

var CTVT = CTVT || {};

CTVT.data = (() => {
  // ── extract_vt_core_data(core) ────────────────────────────────────────
  function extractVtCoreData(core = {}) {
    return {
      burden: core.burden ?? 0,
      thermal_burden: core.thermal_burden ?? 50,
      secondary_voltage: core.secondary_voltage ?? 100,
      attached_resistor: core.attached_resistor ?? 0,
      device_resistance: core.device_resistance ?? 100,
      vt_class: core.vt_class ?? '0.2',
      ratio: core.ratio ?? 4000,
      cable_resistance: core.cable_resistance ?? 0,
      transformer_id: core.transformer_id ?? 'VT',
      core_number: core.core_number ?? 1,
    };
  }

  // ── extract_common_data(common_data) ──────────────────────────────────
  function extractCommonData(commonData = {}) {
    return {
      cable_resistance: commonData.cable_resistance ?? 0,
    };
  }

  // ── validate_vt_inputs(core_data) ─────────────────────────────────────
  // Returns [is_valid, errors]. The thermal-vs-accuracy message interpolates
  // the numbers with String(), which matches Python's f-string for ints and
  // non-integral floats (a Python float like 20.0 prints "20.0", JS "20").
  function validateVtInputs(core_data = {}) {
    const errors = [];

    // Tjek påkrævede felter
    const burden = core_data.burden ?? 0;
    const thermal_burden = core_data.thermal_burden ?? 50;
    const secondary_voltage = core_data.secondary_voltage ?? 100;

    if (burden < 0) {
      errors.push('Byrde (burden) kan ikke være negativ');
    }

    if (thermal_burden < 0) {
      errors.push('Termisk byrde kan ikke være negativ');
    }

    if (thermal_burden < burden) {
      errors.push(
        `Termisk byrde (${thermal_burden} VA) skal være >= nøjagtighedsbyrde (${burden} VA)`
      );
    }

    if (secondary_voltage <= 0) {
      errors.push('Sekundær spænding skal være > 0');
    }

    // Tjek modstandsværdier
    const device_resistance = core_data.device_resistance ?? 100;
    if (device_resistance < 0) {
      errors.push('Enheds modstand kan ikke være negativ');
    }

    const cable_resistance = core_data.cable_resistance ?? 0;
    if (cable_resistance < 0) {
      errors.push('Kabel modstand kan ikke være negativ');
    }

    return [errors.length === 0, errors];
  }

  return { extractVtCoreData, extractCommonData, validateVtInputs };
})();
