'use strict';
/**
 * vt/impedance.js — Port of calculations/vt_calculations/impedance.py
 *
 * VT impedance calculations: rated secondary current (Is = Sn/Us), rated
 * burden impedance (Zn = Us/Is), parallel resistance of the connected loads,
 * and the total load impedance seen by the VT (R_cable + R_device ∥ R_attached).
 * Each function returns the Python tuple as a JS array:
 *   calculateRatedSecondaryCurrent → [current_a, step]
 *   calculateBurdenImpedance       → [impedance_ohm, step]
 *   calculateParallelResistance    → resistance_ohm (no step, as in Python)
 *   calculateTotalImpedance        → [total_impedance, load_resistance, step]
 *
 * The Python builds each step as a hand-written formula/substitution/result
 * string dict; here it is a CTSizer-native CTStep row (numeric result + unit +
 * precision) with the same key, the Python latex_formula, and the result
 * scaled/rounded as the Python result string shows it (mA, 2 decimals for the
 * current; Ω, 2 decimals for the impedances). EN/DA labels come from
 * pdf/locales/{en,da}.json (calc_<key>). Python float('inf') maps to Infinity.
 *
 * Extends the CTVT namespace created by calc/vt/data.js. Consumed by
 * calc/vt/calculator.js; not wired into calc/index.js.
 */

var CTVT = CTVT || {};

CTVT.impedance = (() => {
  // ── calculate_rated_secondary_current(burden_va, secondary_voltage) ─────
  function calculateRatedSecondaryCurrent(burden_va, secondary_voltage) {
    const current = secondary_voltage > 0 ? burden_va / secondary_voltage : 0;

    const step = CTStep.make({
      key: 'rated_secondary_current',
      label_en: 'Rated secondary current',
      label_da: 'Mærke sekundær strøm',
      latex: 'I_{s,rated} = \\frac{S_n}{U_s}',
      variables: { Sn: burden_va, Us: secondary_voltage },
      result: current * 1000, unit: 'mA', precision: 2,
    });

    return [current, step];
  }

  // ── calculate_burden_impedance(secondary_voltage, rated_current) ────────
  function calculateBurdenImpedance(secondary_voltage, rated_current) {
    const impedance = rated_current > 0 ? secondary_voltage / rated_current : Infinity;
    const burden_va = rated_current > 0 ? secondary_voltage * rated_current : 0;

    const step = CTStep.make({
      key: 'burden_impedance',
      label_en: 'Burden impedance',
      label_da: 'Byrdeimpedans',
      latex: 'Z_n = \\frac{U_s}{I_s} = \\frac{U_s^2}{S_n}',
      variables: { Us: secondary_voltage, Sn: burden_va },
      result: impedance, unit: 'Ω', precision: 2,
    });

    return [impedance, step];
  }

  // ── calculate_parallel_resistance(resistances) ──────────────────────────
  // Non-positive and infinite entries are skipped; no conductance → Infinity.
  function calculateParallelResistance(resistances) {
    let conductance = 0;
    for (const r of resistances) {
      if (r > 0 && r !== Infinity) conductance += 1 / r;
    }
    return conductance > 0 ? 1 / conductance : Infinity;
  }

  // ── calculate_total_impedance(cable_resistance, device_resistance, attached_resistor) ──
  function calculateTotalImpedance(cable_resistance, device_resistance, attached_resistor) {
    // Calculate parallel resistance of loads
    const load_resistance = calculateParallelResistance([
      device_resistance,
      attached_resistor > 0 ? attached_resistor : Infinity,
    ]);

    // Add cable resistance in series
    const total_impedance = load_resistance + cable_resistance;

    const step = CTStep.make({
      key: 'total_load_impedance',
      label_en: 'Total load impedance',
      label_da: 'Total belastningsimpedans',
      latex: 'Z_{total} = R_{cable} + (R_{device} \\parallel R_{attached})',
      variables: { R_cable: cable_resistance, R_load: load_resistance },
      result: total_impedance, unit: 'Ω', precision: 2,
    });

    return [total_impedance, load_resistance, step];
  }

  return {
    calculateRatedSecondaryCurrent,
    calculateBurdenImpedance,
    calculateParallelResistance,
    calculateTotalImpedance,
  };
})();
