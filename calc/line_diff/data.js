'use strict';
/**
 * line_diff/data.js — Port of calculations/ct_line_differential/data.py
 *
 * Input extraction/normalization for the full-fidelity
 * line differential package. Builds the same plain param dicts the Python's
 * `main.py` passes straight through to `emf_calculation`/`knee_point` — this
 * file has no shared `params` shape to assemble (unlike ct_distance/data.py),
 * just four independent extractors keyed off `core_data`/`common_data`.
 * Extends the CTLineDiff namespace (calc/line_diff.js, loaded first); composed by calc/line_diff/main.js.
 */

CTLineDiff.data = (() => {
  // The defaults ct_line_differential/data.py uses (Cu, 4 mm², 65 m).
  const CABLE_DEFAULTS = { material: 'Kobber (Cu)', cross_section_mm2: 4, length_m: 65 };

  // ── extract_ct_inputs(core_data) ──────────────────────────────────────
  function extractCtInputs(core) {
    return {
      rct: core.rct ?? 4,
      burden_va: core.burden ?? 30,
      secondary_current: core.Is ?? 1,
      primary_current: core.Ip ?? 2000,
      relay_burden: core.relay_burden ?? 0.02,
    };
  }

  // ── extract_cable_data(core_data) — onto CTCableRes (PORTING_PLAN.md §9.6 9C) ──
  // Material / cross-section / length from the core (else CABLE_DEFAULTS),
  // temperature and method from the PROJECT (commonData.cable_temp /
  // cable_r_method); core.cable_temp and the hand-edited core.dc_resistance_20
  // override are ignored (§9.7 D1). Keeps the Python shape, with
  // dc_resistance_20 = the toolbox R′20 of the project method, plus
  // `cable_res`: the one CTCableRes.lead() call per core, with the core's
  // wiring, for the 3-phase scenarios (main.js applies the 1-phase case to the
  // same result).
  function extractCableData(core, commonData = {}) {
    const params = CTCableRes.resolveParams(core, commonData, CABLE_DEFAULTS);
    const cable_res = CTCableRes.lead(CTCableRes.resolveMethod(commonData), params,
      CTCableRes.resolveTopology(core, 'line_diff'), 'three_phase');

    return {
      cable_length: params.length_m,
      cable_cross_section: params.cross_section_mm2,
      cable_temp: params.temp_c,
      cable_material: cable_res.material,
      dc_resistance_20: cable_res.r20_per_km,
      cable_res,
    };
  }

  // ── extract_fault_currents(common_data, core_data) ─────────────────────
  function extractFaultCurrents(commonData, core) {
    const primary_current = core.Ip ?? 2000;

    // Cap at 1000x primary rating for extreme cases — prevents unrealistic
    // voltage calculations.
    const max_reasonable_fault_current = primary_current * 1000;

    // Through fault: use station data if not specified. The 1-phase cases
    // take the project's Ik1 max (isc_1ph), the 3-phase ones its Ik3 max;
    // a project without Ik1 (the golden tests) uses Ik3 for both.
    const station_sc_ka = (commonData.isc_sys ?? 63) * 1000;
    const station_sc_1ph = commonData.isc_1ph != null ? commonData.isc_1ph * 1000 : station_sc_ka;

    const ik_max_3ph = Math.min(core.ik_max_3ph ?? station_sc_ka, max_reasonable_fault_current);
    const ik_max_1ph = Math.min(core.ik_max_1ph ?? station_sc_1ph, max_reasonable_fault_current);
    const it_max_3ph = Math.min(core.it_max_3ph ?? station_sc_ka, max_reasonable_fault_current);
    const it_max_1ph = Math.min(core.it_max_1ph ?? station_sc_1ph, max_reasonable_fault_current);

    return { ik_max_3ph, ik_max_1ph, it_max_3ph, it_max_1ph };
  }

  // ── extract_auto_reclosure_params(core_data) ────────────────────────────
  function extractAutoReclosureParams(core) {
    if (!core.auto_reclose_enabled) return null;

    return {
      t_prime: parseFloat(core.ar_t_prime ?? 0.1),
      t_al: parseFloat(core.ar_t_al ?? 0.2),
      tfr: parseFloat(core.ar_tfr ?? 0.4),
      t_double_al: parseFloat(core.ar_t_double_al ?? core.ar_t_prime ?? 0.1),
      ts: parseFloat(core.ar_ts ?? 0.05),
      time_constant_class: core.ar_time_constant_class ?? 'low',
      preset_name: core.ar_ktf_preset ?? null,
    };
  }

  return { CABLE_DEFAULTS, extractCtInputs, extractCableData, extractFaultCurrents, extractAutoReclosureParams };
})();
