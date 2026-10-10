'use strict';
/**
 * line_diff/emf_calculation.js — Port of calculations/ct_line_differential/emf_calculation.py
 *
 * E.M.F. calculations for line differential protection: 3-phase/1-phase
 * internal and external (through) fault scenarios, plus the shared
 * total-resistance cap. Pure math, no steps — the Python file has no
 * step-builder of its own (the EMF step rows live in formatting.py, a later
 * Phase-4 item). Extends the CTLineDiff namespace (calc/line_diff.js, loaded
 * first); composed by calc/line_diff/main.js.
 */

CTLineDiff.emfCalculation = (() => {
  // Cap total resistance to prevent unrealistic voltage calculations (Ω).
  const MAX_TOTAL_RESISTANCE = 99;

  // ── calculate_total_resistance_3ph(rct, cable_resistance, r_relay) ─────
  function calculateTotalResistance3ph(rct, cable_resistance, r_relay) {
    return Math.min(rct + cable_resistance + r_relay, MAX_TOTAL_RESISTANCE);
  }

  // ── calculate_total_resistance_1ph(rct, cable_resistance, r_relay) ─────
  // Identical formula to the 3-phase case in the Python — the wiring factor
  // (go + return) is already baked into cable_resistance via
  // get_wiring_factor(); kept as a separate function for 1:1 fidelity with
  // the Python's two distinct call sites.
  function calculateTotalResistance1ph(rct, cable_resistance, r_relay) {
    return Math.min(rct + cable_resistance + r_relay, MAX_TOTAL_RESISTANCE);
  }

  // ── calculate_emf_3phase_internal(ik_max_3ph, secondary_current, primary_current, total_resistance) ──
  function calculateEmf3PhaseInternal(ik_max_3ph, secondary_current, primary_current, total_resistance) {
    return ik_max_3ph * (secondary_current / primary_current) * total_resistance;
  }

  // ── calculate_emf_1phase_internal(ik_max_1ph, secondary_current, primary_current, total_resistance) ──
  function calculateEmf1PhaseInternal(ik_max_1ph, secondary_current, primary_current, total_resistance) {
    return ik_max_1ph * (secondary_current / primary_current) * total_resistance;
  }

  // ── calculate_emf_3phase_external(it_max_3ph, secondary_current, primary_current, total_resistance) ──
  // Factor of 2 for stability margin during through faults.
  function calculateEmf3PhaseExternal(it_max_3ph, secondary_current, primary_current, total_resistance) {
    return 2 * it_max_3ph * (secondary_current / primary_current) * total_resistance;
  }

  // ── calculate_emf_1phase_external(it_max_1ph, secondary_current, primary_current, total_resistance) ──
  function calculateEmf1PhaseExternal(it_max_1ph, secondary_current, primary_current, total_resistance) {
    return 2 * it_max_1ph * (secondary_current / primary_current) * total_resistance;
  }

  // ── calculate_all_emf_scenarios(fault_currents, secondary_current, primary_current, rct, cable_resistance, r_relay) ──
  // `cable_resistance_1p` (CTSizer extension, PORTING_PLAN.md §9.8): the lead
  // resistance of the 1-phase scenarios, whose wiring factor can differ from
  // the 3-phase one. It defaults to `cable_resistance`, which is the Python.
  function calculateAllEmfScenarios(fault_currents, secondary_current, primary_current, rct, cable_resistance, r_relay,
    cable_resistance_1p = cable_resistance) {
    const uncapped_3p = rct + cable_resistance + r_relay;
    const uncapped_1p = rct + cable_resistance_1p + r_relay;
    const total_resistance_3p = calculateTotalResistance3ph(rct, cable_resistance, r_relay);
    const total_resistance_1p = calculateTotalResistance1ph(rct, cable_resistance_1p, r_relay);

    const warnings = [];
    if (uncapped_3p > MAX_TOTAL_RESISTANCE || uncapped_1p > MAX_TOTAL_RESISTANCE) {
      warnings.push([
        'warning_total_resistance_capped',
        Math.max(uncapped_3p, uncapped_1p),
        MAX_TOTAL_RESISTANCE,
      ]);
    }

    return {
      e_3p_in: calculateEmf3PhaseInternal(
        fault_currents.ik_max_3ph, secondary_current, primary_current, total_resistance_3p
      ),
      e_1p_in: calculateEmf1PhaseInternal(
        fault_currents.ik_max_1ph, secondary_current, primary_current, total_resistance_1p
      ),
      e_3p_ex: calculateEmf3PhaseExternal(
        fault_currents.it_max_3ph, secondary_current, primary_current, total_resistance_3p
      ),
      e_1p_ex: calculateEmf1PhaseExternal(
        fault_currents.it_max_1ph, secondary_current, primary_current, total_resistance_1p
      ),
      total_resistance_3p,
      total_resistance_1p,
      warnings,
    };
  }

  return {
    MAX_TOTAL_RESISTANCE,
    calculateTotalResistance3ph,
    calculateTotalResistance1ph,
    calculateEmf3PhaseInternal,
    calculateEmf1PhaseInternal,
    calculateEmf3PhaseExternal,
    calculateEmf1PhaseExternal,
    calculateAllEmfScenarios,
  };
})();
