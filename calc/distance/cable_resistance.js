'use strict';
/**
 * distance/cable_resistance.js — distance's adapter onto the cable-resistance
 * toolbox (CTCableRes, PORTING_PLAN.md §9.2 / §9.6 9C).
 *
 * Replaces the port of calculations/ct_distance/cable_resistance.py
 * (R_lead = 2·R′20·(1+α(T−20))·L/1000 from a `dc_resistance_20` param). The
 * resistance now comes from CTCableRes.lead() with the PROJECT method and
 * temperature (commonData.cable_r_method / cable_temp); `core.cable_temp`
 * and the hand-edited `core.dc_resistance_20` override are ignored (§9.7 D1).
 *
 * The current case (§9.8) is the core's fault type: '3-phase' → three_phase,
 * '2-phase' → two_phase, anything else ('1-phase', the data.js default) →
 * single_phase. The wiring is the core's (CTCableRes.resolveTopology, default
 * four_wire for distance): k = 1 / √3 / 2 for the three cases; six_wire gives
 * 2 for every case (the ctvt_dim ×2).
 *
 * distance/data.js (loaded after this file) calls lead() once per core and
 * carries the result on params.cable_res for main.js.
 */

CTDistance.cableResistance = (() => {
  // The defaults distance/data.js used before the toolbox (Cu, 4 mm², 65 m).
  const CABLE_DEFAULTS = { material: 'Kobber (Cu)', cross_section_mm2: 4, length_m: 65 };

  // ── currentCase(faultType) — the case the distance calculation evaluates ──
  function currentCase(faultType) {
    switch (faultType) {
      case '3-phase': return 'three_phase';
      case '2-phase': return 'two_phase';
      default: return 'single_phase';
    }
  }

  // ── resolveParams(core, commonData) — material / cross-section / length
  //    from the core (else CABLE_DEFAULTS), temperature from the project ───
  function resolveParams(core, commonData) {
    return CTCableRes.resolveParams(core, commonData, CABLE_DEFAULTS);
  }

  // ── lead(cableParams, commonData, faultType, topology) — the one toolbox call ──
  // `topology` is the core's wiring, CTCableRes.resolveTopology(core, 'distance').
  function lead(cableParams, commonData, faultType, topology) {
    return CTCableRes.lead(CTCableRes.resolveMethod(commonData), cableParams,
      topology, currentCase(faultType));
  }

  return { CABLE_DEFAULTS, currentCase, resolveParams, lead };
})();
