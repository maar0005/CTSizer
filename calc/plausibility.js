'use strict';
/**
 * plausibility.js — CTPlausibility: two physical sanity checks on a CT core
 * (CTSizer-only, no counterpart in the Python tool; issue #154 follow-up).
 *
 * 1. Secondary voltage limit (fails the core). The secondary circuit (wiring,
 *    terminal blocks, test switches, relay inputs) is not rated for more than
 *    about 3 kV peak ≈ 2 kV rms (IEC 60255-27 tests relay inputs at 2 kV rms;
 *    IEC 61869-1 tests the CT secondary terminals at 3 kV rms). A core whose
 *    required knee point voltage (Vk,req, or Esat,req on overcurrent) or
 *    offered e.m.f. (EALF = ALF · Isr · (Rct + Sn / Isr²), or the Vk of a Vk
 *    class) is above SECONDARY_VOLTAGE_LIMIT_V cannot be built or would
 *    stress the secondary circuit: the core is NOT_OK, whatever the knee
 *    point comparison says. A high requirement is lowered with a 1 A
 *    secondary, a higher ratio or a lower lead / relay burden; a high
 *    offered e.m.f. points at an unrealistic ALF, Sn or Rct.
 *    Checked on the calc types that size a protection core against a
 *    voltage or ALF (VOLTAGE_TYPES), not on metering (FS-limited) or VT cores.
 *
 * 2. Rct plausibility (a warning only). A typed Rct is compared with the
 *    rule-of-thumb table (calc/rct_estimate.js) with one primary turn:
 *    Rct / N, N = Ipr / Isr, above RCT_WARN_FACTOR × the table's maximum
 *    mΩ per turn is warned (3 × 5.0 = 15 mΩ/turn at 1 A clears the known
 *    14.4 mΩ/turn outlier; 3 × 2.8 = 8.4 at 5 A). A high Rct raises EALF on
 *    paper and with a lead burden above Sn can turn a FAIL into a pass, so a
 *    mistyped or unrealistic Rct must not go unnoticed. Not for an estimated
 *    Rct (it is the table) or without Ipr, Isr 1 / 5 A and a station voltage.
 */

const CTPlausibility = (() => {
  // About 3 kV peak (see the header)
  const SECONDARY_VOLTAGE_LIMIT_V = 2000;
  // × the table's maximum mΩ per turn (see the header)
  const RCT_WARN_FACTOR = 3;

  const VOLTAGE_TYPES = ['overcurrent', 'busbar', 'generic', 'distance', 'transformer_diff', 'line_diff'];
  // The calc types with an Rct and an Ipr: CTCalc.RCT_ESTIMATE_TYPES (calc/index.js
  // loads after this file, so the list is repeated here)
  const RCT_TYPES = ['overcurrent', 'metering', 'busbar', 'distance', 'transformer_diff', 'line_diff'];

  const VOLTAGE_KEYS = ['warning_vk_required_above_limit', 'warning_offered_emf_above_limit'];
  const RCT_KEY = 'warning_rct_implausible';
  const KEYS = [...VOLTAGE_KEYS, RCT_KEY];

  const finite = (v) => typeof v === 'number' && Number.isFinite(v);

  // The offered e.m.f. of a core: Vk of a Vk class with a Vk, else EALF from
  // ALF, Sn and Rct (CTKnee.calcProposedVk, as the knee point modules); null
  // when the inputs are missing
  function offeredEmf(core) {
    const Is = Number(core?.Is), rct = Number(core?.rct), burden = Number(core?.burden);
    const { alf, vk, is_px } = CTBase.getAlfOrVk(core);
    if (is_px && vk != null) return { label: 'Vk', value: Number(vk) };
    if (!(Is > 0) || !finite(rct) || !finite(burden) || alf == null) return null;
    const value = CTKnee.calcProposedVk(Number(alf), Is, rct, burden, null, false).vk;
    return finite(value) ? { label: 'EALF', value } : null;
  }

  // The voltage the module requires of the core (V rms), or null
  function requiredEmf(type, result) {
    if (type === 'overcurrent') return finite(result.Esat_req) ? { label: 'Esat,req', value: result.Esat_req } : null;
    const v = finite(result.Vk_req) ? result.Vk_req : result.vk_required;
    return finite(v) ? { label: 'Vk,req', value: v } : null;
  }

  // checkVoltage(type, core, result) → { ok, offered, required, max, margin,
  // warnings, step } or null (not checked). `core` is the module core
  // (CTCalc.moduleCore: the estimated Rct, is_px from the class).
  function checkVoltage(type, core, result) {
    if (!VOLTAGE_TYPES.includes(type) || !result || result.isc_int_missing || result.isc_ext_missing) return null;
    const offered = offeredEmf(core);
    const required = requiredEmf(type, result);
    const values = [offered, required].filter(Boolean);
    if (!values.length) return null;
    const max = Math.max(...values.map((x) => x.value));
    const limit = SECONDARY_VOLTAGE_LIMIT_V;
    const ok = max <= limit;
    const warnings = [];
    if (required && required.value > limit) {
      warnings.push(['warning_vk_required_above_limit', required.label, required.value, limit]);
    }
    if (offered && offered.value > limit) {
      warnings.push(['warning_offered_emf_above_limit', offered.label, offered.value, limit]);
    }
    const sym = { 'Vk': 'V_k', 'EALF': 'E_{ALF}', 'Vk,req': 'V_{k,req}', 'Esat,req': 'E_{sat,req}' };
    const step = CTStep.conclusion({
      key: 'secondary_voltage_limit',
      label_en: 'Secondary voltage limit',
      label_da: 'Grænse for sekundærspænding',
      latex: `${values.length > 1 ? `\\max(${values.map((x) => sym[x.label]).join(', ')})` : sym[values[0].label]} \\leq ${limit}\\,V`,
      is_ok: ok,
      comparison: `${max.toFixed(2)} V ${ok ? '≤' : '>'} ${limit} V`,
    });
    return { ok, offered, required, max, limit, margin: (limit / max - 1) * 100, warnings, step };
  }

  // checkRct(type, core, commonData) → { rct, n, mohmPerTurn, maxPerTurn,
  // limitPerTurn, isn, warning } when a typed Rct is above the limit, else null
  function checkRct(type, core, commonData) {
    if (!RCT_TYPES.includes(type) || core?.rct_estimate === true) return null;
    const rct = Number(core?.rct), ip = Number(core?.Ip);
    if (core?.rct == null || core.rct === '' || !finite(rct) || !(ip > 0)) return null;
    const cell = CTRctEstimate.lookup(core, commonData?.voltage);
    if (!cell) return null;
    const n = ip / cell.isn;
    const mohmPerTurn = rct * 1000 / n;
    const limitPerTurn = RCT_WARN_FACTOR * cell.max;
    if (!(mohmPerTurn > limitPerTurn)) return null;
    return { rct, n, mohmPerTurn, maxPerTurn: cell.max, limitPerTurn, isn: cell.isn,
      // N as text: a turn count, not "800.0" (CTSReport.warningText's number format)
      warning: [RCT_KEY, rct, mohmPerTurn, Number.isInteger(n) ? String(n) : n.toFixed(1), cell.max, cell.isn, RCT_WARN_FACTOR] };
  }
  // Module conclusions a failed voltage check turns into a failure (as CTIedRating.apply)
  const FAILED_CONCLUSION = { ct_sufficient: 'ct_insufficient', OK: 'NOT_OK' };

  // apply(type, moduleCore, commonData, result) → a new result with the
  // checks: the step row, the remarks, and a failed voltage check failing
  // the core (status, is_ok, conclusion, margin, failed_methods)
  function apply(type, core, commonData, result) {
    if (!result) return result;
    const v = checkVoltage(type, core, result);
    const r = checkRct(type, core, commonData);
    if (!v && !r) return result;
    const out = {
      ...result,
      warnings: [...(result.warnings || []), ...(r ? [r.warning] : []), ...(v ? v.warnings : [])],
    };
    if (v) {
      out.secondary_voltage = { ok: v.ok, max: v.max, limit: v.limit, offered: v.offered, required: v.required };
      out.steps = [...(result.steps || []), v.step];
      if (!v.ok) {
        out.is_ok = false;
        out.status = 'NOT_OK';
        out.margin = result.margin != null ? Math.min(result.margin, v.margin) : v.margin;
        if (Object.prototype.hasOwnProperty.call(FAILED_CONCLUSION, result.conclusion)) {
          out.conclusion = FAILED_CONCLUSION[result.conclusion];
        }
        if (Array.isArray(result.failed_methods)) out.failed_methods = [...result.failed_methods, 'secondary_voltage'];
      }
    }
    if (r) out.rct_plausibility = { mohm_per_turn: r.mohmPerTurn, limit_per_turn: r.limitPerTurn, n: r.n };
    return out;
  }

  return {
    SECONDARY_VOLTAGE_LIMIT_V, RCT_WARN_FACTOR, VOLTAGE_TYPES, RCT_TYPES, KEYS, VOLTAGE_KEYS, RCT_KEY,
    offeredEmf, requiredEmf, checkVoltage, checkRct, apply,
  };
})();
