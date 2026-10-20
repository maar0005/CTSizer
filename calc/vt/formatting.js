'use strict';
/**
 * vt/formatting.js — Port of calculations/vt_calculations/formatting.py
 *
 * Plain dict builders for the VT result structure, 1:1 with the Python (same keys,
 * same key order, Danish strings verbatim):
 *   createCalculationStep(name, formula, latex_formula, substitution,
 *                         latex_substitution, result, latex_result) → step dict
 *   createResultDict()                                              → empty core result
 *   formatVtResults(calculations, intermediate_steps, warnings,
 *                   status='OK', core_name, transformer_id, core_number)
 *   formatCommonCalculations(cable_resistance)                      → { cable_resistance }
 *
 * formatVtResults keeps the Python conditions: core_name and transformer_id are added
 * only when truthy (so '' and 0 are dropped), core_number whenever it is not None (so 0
 * is kept). pyTruthy follows Python's bool(): empty arrays/objects are falsy, NaN is
 * truthy.
 *
 * createCalculationStep is not called anywhere in the Python tool (the VT steps are built by
 * the per-file helpers); it is ported anyway for 1:1 coverage.
 *
 * Extends the CTVT namespace created by calc/vt/data.js. Consumed by
 * calc/vt/calculator.js; not wired into calc/index.js.
 */

var CTVT = CTVT || {};

CTVT.formatting = (() => {
  // Python bool(x) for the JSON-ish values these builders receive.
  const pyTruthy = (x) => {
    if (x === null || x === undefined) return false;
    if (typeof x === 'number') return x !== 0;
    if (typeof x === 'string' || Array.isArray(x)) return x.length > 0;
    if (typeof x === 'object') return Object.keys(x).length > 0;
    return Boolean(x);
  };

  // ── create_calculation_step(...) ────────────────────────────────────────
  function createCalculationStep(
    name,
    formula,
    latex_formula,
    substitution,
    latex_substitution,
    result,
    latex_result
  ) {
    return {
      name,
      formula,
      latex_formula,
      substitution,
      latex_substitution,
      result,
      latex_result,
    };
  }

  // ── create_result_dict() ────────────────────────────────────────────────
  function createResultDict() {
    return {
      status: 'OK',
      calculations: {},
      warnings: [],
      intermediate_steps: [],
    };
  }

  // ── format_vt_results(...) ──────────────────────────────────────────────
  function formatVtResults(
    calculations,
    intermediate_steps,
    warnings,
    status = 'OK',
    core_name = null,
    transformer_id = null,
    core_number = null
  ) {
    const result = {
      status,
      calculations,
      warnings,
      intermediate_steps,
    };

    if (pyTruthy(core_name)) result.core_name = core_name;

    if (pyTruthy(transformer_id)) result.transformer_id = transformer_id;

    if (core_number !== null && core_number !== undefined) result.core_number = core_number;

    return result;
  }

  // ── format_common_calculations(cable_resistance) ────────────────────────
  function formatCommonCalculations(cable_resistance) {
    return {
      cable_resistance: {
        value: cable_resistance,
        unit: 'Ω',
        description: 'Total kabelresistans (tur/retur)',
        formula: 'R_cable = 2 × ρ × L / A',
      },
    };
  }

  return { createCalculationStep, createResultDict, formatVtResults, formatCommonCalculations };
})();
