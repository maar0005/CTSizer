'use strict';
/**
 * foundation/base_core.js — Port of calculations/ct_base.py (core helpers, lines 19–119)
 *
 * Shared CT utilities: ALF/Vk resolution, result template, relay resistance,
 * EALF and operating-ALF formulas. Logic is 1:1 with the Python reference;
 * input keys use CTSizer core conventions (is_px / vk / alf) and the Python
 * aliases (is_px_class / vk_voltage) are also accepted.
 */
const CTBase = (() => {

  // Security factor for fault calculations (IEC 60909)
  const SECURITY_FACTOR_C = 1.1;

  // ct_base.get_alf_or_vk — resolve ALF or knee-point Vk from a core object.
  // Returns { alf, vk, is_px }. PX class with a Vk uses Vk directly; otherwise
  // ALF (defaulting to a conservative 30 when unspecified).
  function getAlfOrVk(core) {
    const is_px = core.is_px === true || core.is_px_class === true;
    const vk = core.vk != null ? core.vk
             : (core.vk_voltage != null ? core.vk_voltage : null);
    if (is_px && vk != null) {
      return { alf: null, vk, is_px: true };
    }
    let alf = core.alf;
    if (alf == null) alf = 30; // conservative default for general protection
    return { alf, vk: null, is_px: false };
  }

  // ct_base.create_result_template. The Python modules start from it; the JS
  // modules build their result objects directly, so it has no JS caller. Kept
  // as the port and pinned by the foundation golden (PORTING_PLAN.md §10.6 F-TPL).
  function createResultTemplate(calculationType) {
    return {
      status: 'OK',
      calculations: {},
      warnings: [],
      intermediate_steps: [],
      calculation_type: calculationType,
    };
  }

  // ct_base.calculate_relay_resistance — R_relay = S_relay / I_sr²
  function calcRelayResistance(relayBurden, secondaryCurrent) {
    if (secondaryCurrent > 0) return relayBurden / (secondaryCurrent * secondaryCurrent);
    return 0;
  }

  // ct_base.calculate_ealf — E_ALF = ALF · I_sr · (R_ct + S_n/I_sr²)
  function calcEalf(alf, secondaryCurrent, rct, burdenVa) {
    const burdenResistance = burdenVa / (secondaryCurrent * secondaryCurrent);
    return alf * secondaryCurrent * (rct + burdenResistance);
  }

  // ct_base.calculate_operating_alf — IEC 61869-2 Clause 5.6.202.3
  // ALF_o = ALF · (R_ct + R_b_rated) / (R_ct + R_b_actual)
  function calcOperatingAlf(alf, rct, rBurdenRated, rBurdenActual) {
    const totalRated = rct + rBurdenRated;
    const totalActual = rct + rBurdenActual;
    if (totalActual <= 0) return alf;
    return alf * totalRated / totalActual;
  }

  return {
    SECURITY_FACTOR_C,
    getAlfOrVk,
    createResultTemplate,
    calcRelayResistance,
    calcEalf,
    calcOperatingAlf,
  };
})();
