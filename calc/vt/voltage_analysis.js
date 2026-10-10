'use strict';
/**
 * vt/voltage_analysis.js — Port of calculations/vt_calculations/voltage_analysis.py
 *
 * VT secondary-cable voltage-drop analysis: the drop across the cable
 * (ΔU = R_cable · Is_actual, also as % of Us), the maximum allowed drop per
 * VT accuracy class (CTVT.presets.VOLTAGE_DROP_LIMITS, 0.5 % for unknown
 * classes) and the limit check. The Python tuples become JS arrays:
 *   calculateVoltageDrop    → [voltage_drop_v, voltage_drop_percent, step]
 *   getMaxVoltageDrop       → max drop in %
 *   checkVoltageDropLimits  → [is_ok, warnings]
 *
 * As in calc/vt/impedance.js, the Python's hand-built formula/substitution/result
 * string dict becomes a CTSizer-native CTStep row with the same key, the Python
 * latex_formula and EN/DA labels from pdf/locales/{en,da}.json (calc_<key>). The
 * Python result string "{ΔU:.4f} V ({ΔU%:.3f}%)" carries two numbers, so the row
 * holds ΔU in V (precision 4) as `result`, plus `percent` / `percent_precision` (3).
 *
 * The warning keeps the Python Danish text. `{max_drop}` is a Python float there,
 * so it is printed the way Python prints a float ("1.0", not "1").
 *
 * Extends the CTVT namespace created by calc/vt/data.js. Consumed by
 * calc/vt/calculator.js; not wired into calc/index.js.
 */

var CTVT = CTVT || {};

CTVT.voltageAnalysis = (() => {
  // Python str() of a float: integral values keep a ".0".
  const pyFloat = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));

  // ── calculate_voltage_drop(cable_resistance, actual_current, secondary_voltage) ──
  // Us <= 0 → 0 %.
  function calculateVoltageDrop(cable_resistance, actual_current, secondary_voltage) {
    const voltage_drop = cable_resistance * actual_current;
    const voltage_drop_percent = secondary_voltage > 0
      ? (voltage_drop / secondary_voltage) * 100
      : 0;

    const step = CTStep.make({
      key: 'voltage_drop_in_cable',
      label_en: 'Voltage drop in cable',
      label_da: 'Spændingsfald i kabel',
      latex: '\\Delta U = R_{cable} \\cdot I_{s,actual}',
      variables: { R_cable: cable_resistance, Is_actual: actual_current, Us: secondary_voltage },
      result: voltage_drop, unit: 'V', precision: 4,
      percent: voltage_drop_percent, percent_precision: 3,
    });

    return [voltage_drop, voltage_drop_percent, step];
  }

  // ── get_max_voltage_drop(vt_class) ──────────────────────────────────────
  function getMaxVoltageDrop(vt_class) {
    const limits = CTVT.presets.VOLTAGE_DROP_LIMITS;
    return Object.prototype.hasOwnProperty.call(limits, vt_class) ? limits[vt_class] : 0.5;
  }

  // ── check_voltage_drop_limits(voltage_drop_percent, vt_class) ───────────
  // Strictly greater than the limit fails; equal passes.
  function checkVoltageDropLimits(voltage_drop_percent, vt_class) {
    const warnings = [];
    const max_drop = getMaxVoltageDrop(vt_class);

    if (voltage_drop_percent > max_drop) {
      warnings.push(
        `Spændingsfald overskridelse: ${voltage_drop_percent.toFixed(3)}% > ${pyFloat(max_drop)}% (klasse ${vt_class})`
      );
      return [false, warnings];
    }

    return [true, warnings];
  }

  return { calculateVoltageDrop, getMaxVoltageDrop, checkVoltageDropLimits };
})();
