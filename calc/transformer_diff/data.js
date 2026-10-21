'use strict';
/**
 * transformer_diff/data.js — Port of
 * calculations/ct_transformer_differential/data.py
 *
 * Input extraction for the full-fidelity transformer differential package:
 * CT/cable inputs from the core, and transformer ratings + fault currents
 * either from the modern Field Data structure (commonData.remote_end.
 * transformer_data, per-winding) — the path of every CTSizer core since the
 * bay data (#133, calc/bay.js) — or the backwards-compatible per-core fields
 * (direct calls, golden cases). Deviation from data.py (product change #133):
 * a winding with no Ir gets Ir and It,max from mva / voltage / z_percent
 * (the per-core path's expressions) instead of 0 and 10000 A (#134: It,max is null when it cannot be derived), and main.js
 * shows the Transformer Data step only for windings that carry Ir.
 * The two transformer extractors return the same 8-element tuple (array) the
 * Python returns, in the same order, so main.js can destructure it 1:1.
 * Extends the CTTransformerDiff namespace (calc/transformer_diff.js, loaded
 * first); composed by calc/transformer_diff/main.js.
 */

CTTransformerDiff.data = (() => {
  // The defaults ct_transformer_differential/data.py uses (Cu, 4 mm², 150 m).
  const CABLE_DEFAULTS = { material: 'Kobber (Cu)', cross_section_mm2: 4, length_m: 150 };

  // ── extract_ct_inputs(core_data) — cable onto CTCableRes (PORTING_PLAN.md §9.6 9C) ──
  // Material / cross-section / length from the core (else CABLE_DEFAULTS),
  // temperature and method from the PROJECT (commonData.cable_temp /
  // cable_r_method); core.cable_temp is ignored. Keeps the Python shape, plus
  // `cable_res`: the one CTCableRes.lead() call per core, with the core's
  // wiring, for the worst current case (single_phase, §9.8: k = 2 with either
  // wiring). main.js feeds its r_loop to both the E.m.f.
  // method and the cable burden.
  function extractCtInputs(core, commonData = {}) {
    const params = CTCableRes.resolveParams(core, commonData, CABLE_DEFAULTS);
    const cable_res = CTCableRes.lead(CTCableRes.resolveMethod(commonData), params,
      CTCableRes.resolveTopology(core, 'transformer_diff'), 'single_phase');

    return {
      rct: core.rct ?? 4,
      burden_va: core.burden ?? 30,
      secondary_current: core.Is ?? 1,
      primary_current: core.Ip ?? 2000,
      relay_burden: core.relay_burden ?? 0.1,
      linked_winding: core.linked_winding ?? 'HV',
      cable_length: params.length_m,
      cable_cross_section: params.cross_section_mm2,
      cable_temp: params.temp_c,
      cable_material: cable_res.material,
      cable_res,
    };
  }

  // ── project_internal_fault_current(common_data) ──────────────────────
  // Project Ik max (commonData.isc_sys, kA — Python common_data
  // ["short_circuit_ka"]; its Ik1 max isc_1ph when that is larger) as the
  // default internal (in-zone) fault current, in A. null when the project
  // has no short-circuit level (missing or ≤ 0): the calculation then cannot
  // run (issue #85).
  function projectInternalFaultCurrent(commonData = {}) {
    const isc_ka = commonData.isc_sys;
    if (isc_ka == null || !(isc_ka > 0)) return null;
    return CTFaultLevel.governingKa(isc_ka, commonData.isc_1ph) * 1000;
  }

  // Where the compat path's internal fault current comes from (the panel and
  // the report, issue #85; not in data.py): 'core' (the core's Isc,max,int
  // override), 'project' (the project Ik max) or null (neither: no calculation).
  function internalFaultCurrentSource(core = {}, commonData = {}) {
    if (core.trafo_ik_max != null && core.trafo_ik_max > 0) return 'core';
    return projectInternalFaultCurrent(commonData) != null ? 'project' : null;
  }

  // Winding rated current (kA) and the through-fault current it gives with
  // the transformer impedance alone (A): the expressions of the per-core path
  // (applyBackwardsCompatibility), shared so both paths give the same floats.
  const windingRatedCurrent = (mva, kv) => mva / (Math.sqrt(3) * kv);       // kA
  const throughFaultCurrent = (iRatedKa, z) => (iRatedKa * 1000) / (z / 100);  // A

  // ── parse_transformer_windings(transformer_data, linked_winding, common_data) ──
  // Returns [voltage (kV), i_rated (kA), trafo_it_max (A), trafo_ik_max (A)].
  // The internal fault current is the winding's isc_int, else the project Ik
  // max (null when neither is set).
  // CTSizer's bay data (#133/#134, calc/bay.js) passes isc_ext but no Ir: Ir
  // (and It,max when isc_ext is absent) is derived here from mva, the winding
  // voltage and z_percent, as the per-core path does, so a project moved from
  // the cores to the bay keeps its results.
  // The Python tool's Field Data (Ir / isc_ext stored) is read as before.
  function parseTransformerWindings(transformer_data, linked_winding, commonData = {}) {
    const windings = transformer_data.windings || {};
    const winding_data = windings[linked_winding] || {};

    const trafo_primary_voltage = winding_data.voltage ?? commonData.voltage ?? 150;  // kV
    const derive = winding_data.Ir == null && transformer_data.mva > 0 && winding_data.voltage > 0;
    const i_rated = derive
      ? windingRatedCurrent(transformer_data.mva, winding_data.voltage)
      : (winding_data.Ir ?? 0) / 1000;  // A → kA

    // Isc,max,ext: the winding's (Field Data, or CTSizer's bay data, #134),
    // else Ir/(Z%/100) from the transformer data; null when neither is
    // possible — no hidden default (#134: the former `?? 10000` is gone)
    const trafo_it_max = winding_data.isc_ext
      ?? (derive && transformer_data.z_percent > 0 ? throughFaultCurrent(i_rated, transformer_data.z_percent) : null);  // A — external/through fault
    let trafo_ik_max = winding_data.isc_int ?? null;  // A — internal fault
    if (trafo_ik_max == null || trafo_ik_max <= 0) {
      trafo_ik_max = projectInternalFaultCurrent(commonData);  // A, or null
    }

    return [trafo_primary_voltage, i_rated, trafo_it_max, trafo_ik_max];
  }

  // ── extract_transformer_data(common_data, core_data) ───────────────────
  // Returns [voltage, rated_power, z_percent, inrush_factor, i_rated,
  //          trafo_it_max, trafo_ik_max, linked_winding].
  function extractTransformerData(commonData = {}, core = {}) {
    const remote_end = commonData.remote_end || {};
    const transformer_data = remote_end.transformer_data ?? null;
    const linked_winding = core.linked_winding ?? 'HV';

    if (transformer_data != null) {
      // Modern data structure
      const trafo_rated_power = transformer_data.mva ?? 160;  // MVA
      const z_percent = transformer_data.z_percent ?? 14;
      const inrush_factor = transformer_data.inrush_factor ?? 8;

      const [trafo_primary_voltage, i_rated, trafo_it_max, trafo_ik_max] =
        parseTransformerWindings(transformer_data, linked_winding, commonData);

      return [
        trafo_primary_voltage, trafo_rated_power, z_percent, inrush_factor,
        i_rated, trafo_it_max, trafo_ik_max, linked_winding,
      ];
    }
    // Backwards compatibility — old data structure from core_data
    return applyBackwardsCompatibility(commonData, core, linked_winding);
  }

  // ── apply_backwards_compatibility(common_data, core_data, linked_winding) ──
  // Python reads the voltage from common_data["voltage_level"]; CTSizer's
  // transformer core carries its own per-winding `trafo_voltage_kv` field
  // (the UI's "Transformer voltage" input), which is preferred when set, with
  // commonData.voltage as the Python-equivalent fallback. Likewise the
  // Python keys `trafo_rated_power`/`trafo_uk_percent` are honoured first,
  // falling back to the CTSizer-native `trafo_power_mva`/`trafo_z_percent`.
  function applyBackwardsCompatibility(commonData = {}, core = {}, linked_winding = 'HV') {
    const trafo_primary_voltage = core.trafo_voltage_kv ?? commonData.voltage ?? 150;  // kV
    const trafo_rated_power = core.trafo_rated_power ?? core.trafo_power_mva ?? 160;  // MVA
    const inrush_factor = core.inrush_factor ?? 8;
    const z_percent = core.trafo_uk_percent ?? core.trafo_z_percent ?? 14;

    // Rated current in kA (same unit as parseTransformerWindings):
    // S[MVA] / (√3 · U[kV]) = I[kA]
    const i_rated = windingRatedCurrent(trafo_rated_power, trafo_primary_voltage);  // kA

    // Use old manual values or calculate from z_percent
    let trafo_it_max = core.trafo_it_max ?? null;
    // Internal fault current: the core's own Isc,max,int override (A; the
    // panel's kA field), else the project Ik max; null when neither is set
    // (no hidden default, issue #85)
    let trafo_ik_max = core.trafo_ik_max ?? null;
    if (trafo_ik_max == null || trafo_ik_max <= 0) {
      trafo_ik_max = projectInternalFaultCurrent(commonData);  // A, or null
    }

    if (trafo_it_max == null && z_percent && z_percent > 0) {
      trafo_it_max = throughFaultCurrent(i_rated, z_percent);  // A
    } else if (trafo_it_max == null) {
      trafo_it_max = 10000;  // Default
    }

    return [
      trafo_primary_voltage, trafo_rated_power, z_percent, inrush_factor,
      i_rated, trafo_it_max, trafo_ik_max, linked_winding,
    ];
  }

  return {
    windingRatedCurrent,
    throughFaultCurrent,
    projectInternalFaultCurrent,
    internalFaultCurrentSource,
    extractCtInputs,
    parseTransformerWindings,
    extractTransformerData,
    applyBackwardsCompatibility,
  };
})();
