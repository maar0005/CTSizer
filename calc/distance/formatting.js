'use strict';
/**
 * distance/formatting.js — Port of calculations/ct_distance/formatting.py
 *
 * String-report formatting helpers (formula/substitution/result text for a
 * legacy report style). Unlike line_diff/transformer_diff's formatting.py,
 * this file is never imported by ct_distance/main.py — dead code in the
 * Python source, ported 1:1 anyway for package-tree fidelity (mirrors the
 * checklist's "one Python file -> one JS file" rule). CTSizer's own step
 * reporting goes through CTStep instead; nothing in calc/distance/*.js
 * calls these. Extends the CTDistance namespace (calc/distance.js, loaded
 * first).
 */

CTDistance.formatting = (() => {
  // ── format_impedance_step(name, description, rs, xs, zs, voltage_level, iscc_max, frequency, tp) ──
  // Note: rs, frequency and tp are accepted but never used in the formatted
  // output — a quirk of the Python source, preserved 1:1.
  function formatImpedanceStep(name, description, rs, xs, zs, voltage_level, iscc_max, frequency, tp) {
    const c = CTBase.SECURITY_FACTOR_C;
    return {
      name,
      description,
      formula: 'Zs = c x Un x 1000 / (sqrt(3) x Iscc_max)',
      latex_formula: 'Z_s = \\frac{c \\cdot U_n \\cdot 1000}{\\sqrt{3} \\cdot I_{scc,max}}',
      substitution: `Zs = ${c} x ${voltage_level} x 1000 / (sqrt(3) x ${iscc_max})`,
      latex_substitution: `Z_s = \\frac{${c} \\cdot ${voltage_level} \\cdot 1000}{\\sqrt{3} \\cdot ${iscc_max}}`,
      result: `${zs.toFixed(4)} Ω`,
      latex_result: `Z_s = ${zs.toFixed(4)} \\, \\Omega`,
    };
  }

  // ── format_ktd_step(name, description, ktd, tp_range) ──────────────────
  function formatKtdStep(name, description, ktd, tp_range) {
    return {
      name,
      description,
      formula: `${tp_range} → Ktd = ${ktd}`,
      latex_formula: `${tp_range} \\rightarrow K_{td} = ${ktd}`,
      substitution: '',
      latex_substitution: '',
      result: `${ktd}`,
      latex_result: `K_{td} = ${ktd}`,
    };
  }

  // ── format_final_result(status, conclusion) ─────────────────────────────
  function formatFinalResult(status, conclusion) {
    return { status, conclusion };
  }

  return { formatImpedanceStep, formatKtdStep, formatFinalResult };
})();
