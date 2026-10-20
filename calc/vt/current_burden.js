'use strict';
/**
 * vt/current_burden.js — Port of calculations/vt_calculations/current_burden.py
 *
 * VT current and burden calculations: actual secondary current through the
 * connected load (Is_actual = Us / Z_total), actual burden
 * (S_actual = Us · Is_actual), burden utilization against the rated burden
 * (S_actual / Sn · 100 %) and reserve capacity (Sn − S_actual).
 * Each function returns the Python tuple as a JS array:
 *   calculateActualCurrent     → [current_a, step]
 *   calculateActualBurden      → [burden_va, step]
 *   calculateBurdenUtilization → [utilization_percent, step]
 *   calculateReserveCapacity   → [reserve_va, step]
 *
 * As in calc/vt/impedance.js, the Python's hand-built formula/substitution/result
 * string dict becomes a CTSizer-native CTStep row with the same key, the Python
 * latex_formula, and the result scaled/rounded as the Python result string shows
 * it (mA with 2 decimals; VA with 2 decimals; % with 1 decimal). EN/DA labels
 * come from pdf/locales/{en,da}.json (calc_<key>).
 *
 * Extends the CTVT namespace created by calc/vt/data.js. Consumed by
 * calc/vt/calculator.js; not wired into calc/index.js.
 */

var CTVT = CTVT || {};

CTVT.currentBurden = (() => {
  // ── calculate_actual_current(secondary_voltage, total_impedance) ────────
  // Z_total = Infinity (no load) gives 0 A, as in Python; Z_total <= 0 → 0.
  function calculateActualCurrent(secondary_voltage, total_impedance) {
    const current = total_impedance > 0 ? secondary_voltage / total_impedance : 0;

    const step = CTStep.make({
      key: 'actual_secondary_current',
      label_en: 'Actual secondary current',
      label_da: 'Aktuel sekundær strøm',
      latex: 'I_{s,actual} = \\frac{U_s}{Z_{total}}',
      variables: { Us: secondary_voltage, Z_total: total_impedance },
      result: current * 1000, unit: 'mA', precision: 2,
    });

    return [current, step];
  }

  // ── calculate_actual_burden(secondary_voltage, actual_current) ──────────
  function calculateActualBurden(secondary_voltage, actual_current) {
    const burden = secondary_voltage * actual_current;

    const step = CTStep.make({
      key: 'actual_burden',
      label_en: 'Actual burden',
      label_da: 'Aktuel byrde',
      latex: 'S_{actual} = U_s \\cdot I_{s,actual}',
      variables: { Us: secondary_voltage, Is_actual: actual_current },
      result: burden, unit: 'VA', precision: 2,
    });

    return [burden, step];
  }

  // ── calculate_burden_utilization(actual_burden, rated_burden) ───────────
  function calculateBurdenUtilization(actual_burden, rated_burden) {
    const utilization = rated_burden > 0 ? (actual_burden / rated_burden) * 100 : 0;

    const step = CTStep.make({
      key: 'burden_utilization',
      label_en: 'Burden utilization',
      label_da: 'Byrde udnyttelse',
      latex: 'Utilization = \\frac{S_{actual}}{S_n} \\cdot 100\\%',
      variables: { S_actual: actual_burden, Sn: rated_burden },
      result: utilization, unit: '%', precision: 1,
    });

    return [utilization, step];
  }

  // ── calculate_reserve_capacity(rated_burden, actual_burden) ─────────────
  // Negative when the VT is overloaded (S_actual > Sn).
  function calculateReserveCapacity(rated_burden, actual_burden) {
    const reserve = rated_burden - actual_burden;

    const step = CTStep.make({
      key: 'reserve_capacity',
      label_en: 'Reserve capacity',
      label_da: 'Reserve kapacitet',
      latex: 'Reserve = S_n - S_{actual}',
      variables: { Sn: rated_burden, S_actual: actual_burden },
      result: reserve, unit: 'VA', precision: 2,
    });

    return [reserve, step];
  }

  return {
    calculateActualCurrent,
    calculateActualBurden,
    calculateBurdenUtilization,
    calculateReserveCapacity,
  };
})();
