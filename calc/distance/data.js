'use strict';
/**
 * distance/data.js — Port of calculations/ct_distance/data.py
 *
 * Input extraction/normalization for the full-fidelity distance protection
 * package. Builds the Python-shaped `params` dict that the rest of the
 * ct_distance/* sub-modules key off of (`rct`, `burden_va`, `tp`,
 * `iscc_max`, `r_line`/`x_line`, `klim`, `cable_material`, …) from CTSizer's
 * `core`/`commonData` objects. Extends the CTDistance namespace
 * (calc/distance.js, loaded first).
 *
 * Cable fields come from the cable-resistance toolbox (PORTING_PLAN.md §9):
 * material / cross-section / length from the core, temperature from the
 * project (commonData.cable_temp; core.cable_temp is ignored). The one
 * CTCableRes.lead() call per core happens here, as the Python computes
 * dc_resistance_20 here too: params.cable_res carries it to main.js and
 * params.dc_resistance_20 is its R′20 (project method). The hand-edited
 * core.dc_resistance_20 override is gone (§9.7 D1).
 */

CTDistance.data = (() => {
  // Line data the core may leave unset (R'L, X'L in Ω/km primary, lL in km,
  // Klim): the panel's line data fields, saved on the core. An unset field
  // falls back to these (the Python tool's defaults, the DistanceApplication.pdf
  // line), and the panel and the report warn about it (issue #86).
  const LINE_DEFAULTS = { r_per_km: 0.0423, x_per_km: 0.203, line_length: 6.4, zone1_setting: 0.85 };
  const REMOTE_END_KEY = { r_per_km: 'R_L_per_km', x_per_km: 'X_L_per_km', line_length: 'lL' };

  // The line data keys whose value is the default (set neither on the core
  // nor in commonData.remote_end), in LINE_DEFAULTS order.
  function lineDataDefaulted(core = {}, commonData = {}) {
    const remote_end = commonData.remote_end || {};
    return Object.keys(LINE_DEFAULTS).filter((k) =>
      (REMOTE_END_KEY[k] == null || remote_end[REMOTE_END_KEY[k]] == null) && core[k] == null);
  }

  // ── extract_distance_inputs(common_data, core_data) ──────────────────
  function extractDistanceInputs(core, commonData = {}) {
    const fault_type = core.fault_type ?? '1-phase';
    const cableParams = CTDistance.cableResistance.resolveParams(core, commonData);
    const cable_res = CTDistance.cableResistance.lead(cableParams, commonData, fault_type,
      CTCableRes.resolveTopology(core, 'distance'));

    const freqRaw = commonData.freq;
    const frequency = freqRaw != null ? (parseFloat(freqRaw) || 50) : 50;

    const remote_end = commonData.remote_end || {};

    const params = {
      // CT Core parameters
      rct: core.rct ?? 4,
      burden_va: core.burden ?? 30,
      secondary_current: core.Is ?? 1,
      primary_current: core.Ip ?? 2000,
      relay_burden: core.relay_burden ?? 0.05,

      // Fault current parameters
      tp: core.tp ?? commonData.tp ?? 100,
      // The larger of Ik3 max and Ik1 max (CTFaultLevel): the lead is the
      // 1-phase one unless the core's fault type is 3-phase
      iscc_max: CTFaultLevel.governingKa(commonData.isc_sys ?? 40, commonData.isc_1ph) * 1000,
      fault_type,
      ik_alternative: core.ik_alternative ?? null,

      // Line parameters — PRIMARY impedance values (not transposed to
      // secondary). Prefer commonData.remote_end (Line Data tab, mirroring
      // the Python source); fall back to the core-level fields CTSizer's
      // existing (simplified) distance.js currently reads.
      r_line: remote_end.R_L_per_km ?? core.r_per_km ?? LINE_DEFAULTS.r_per_km,
      x_line: remote_end.X_L_per_km ?? core.x_per_km ?? LINE_DEFAULTS.x_per_km,
      line_length: remote_end.lL ?? core.line_length ?? LINE_DEFAULTS.line_length,
      klim: core.zone1_setting ?? LINE_DEFAULTS.zone1_setting,

      // Cable parameters (temperature: the project's)
      cable_length: cableParams.length_m,
      cable_cross_section: cableParams.cross_section_mm2,
      cable_temp: cableParams.temp_c,
      cable_material: cable_res.material,
      dc_resistance_20: cable_res.r20_per_km,
      cable_res,

      // System parameters
      voltage_level: commonData.voltage ?? 420,
      frequency,
    };

    return params;
  }

  // ── extract_fault_current_data(params) ────────────────────────────────
  function extractFaultCurrentData(params) {
    return {
      tp: params.tp,
      iscc_max: params.iscc_max,
      voltage_level: params.voltage_level,
      frequency: params.frequency,
    };
  }

  // ── validate_input_ranges(params) ─────────────────────────────────────
  function validateInputRanges(params) {
    const warnings = [];

    if (params.tp <= 0 || params.tp > 200) {
      warnings.push(`Primary time constant Tp (${params.tp} ms) outside typical range (0-200 ms)`);
    }

    if (params.klim <= 0 || params.klim > 1.0) {
      warnings.push(`Zone-1 setting Klim (${params.klim}) should be between 0 and 1.0`);
    }

    if (params.cable_temp < -40 || params.cable_temp > 90) {
      warnings.push(`Cable temperature (${params.cable_temp} °C) outside typical range (-40 to 90 °C)`);
    }

    if (params.iscc_max <= 0 || params.iscc_max > 200000) {
      warnings.push(`Short circuit current I_k,max (${(params.iscc_max / 1000).toFixed(1)} kA) outside typical range (0-200 kA)`);
    }

    return warnings;
  }

  return { LINE_DEFAULTS, lineDataDefaulted, extractDistanceInputs, extractFaultCurrentData, validateInputRanges };
})();
