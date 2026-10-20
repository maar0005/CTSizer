'use strict';
/**
 * transformer_diff/zone.js — the transformer differential ZONE (issue #135):
 * one combined check and verdict for a transformer_diff device in a bay, from
 * its side cores and the bay's transformer data (calc/bay.js), as the
 * reference calculation checks a zone ("Current transformers are correctly dimensioned").
 * A CTSizer product addition: there is no zone in the Python tool.
 *
 *   calculate(feeder, device, results) → zone result (null: not a
 *   transformer_diff device). results: the app's core results keyed
 *   `${feeder.id}-${device.id}-${core.id}`.
 *
 * Checks:
 *   1. sides complete — each winding the bay defines (winding_count) has
 *      exactly one CT core of the device linked to it (linked_winding); a
 *      winding without a core, two cores on one winding or a core on a
 *      winding the transformer does not have fails, with a remark;
 *   2. common Sref — Fadap,side = Ipr,side / Iref,side with
 *      Iref,side = Sref / (√3·Ur,side), Sref = the bay's Sr (three windings:
 *      the largest winding rating, per the reference calculation); one table of all sides;
 *   3. Fadap between the sides — Fadap,max / Fadap,min (= Ipr,a·Ur,a /
 *      (Ipr,b·Ur,b) for two windings; it does not depend on Sref). The limit
 *      is open (no source yet: the reference report has none and the 7UT8 manual
 *      clause could not be checked), so it is information only unless the
 *      side's IED sets transformer_diff.max_fadap_ratio in calc/relay_db.js
 *      (null = not checked);
 *   4. same secondary rating — the same Isr on all sides (same relay input).
 * Verdict: OK only when every side core is calculated and OK (its IEC
 * Req. 1–4, Ziegler, E.m.f. and IED checks: the core result's is_ok) and
 * every zone check is OK; NOT_OK when a check fails or a side core fails;
 * INCOMPLETE while the bay data or a side core's result is missing.
 */

CTTransformerDiff.zone = (() => {
  const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

  // Req. 1–4 of one side core from its result (null when the IEC ALF method
  // does not apply: an E.m.f.-only IED or a Vk class)
  function requirements(core, r) {
    if (!r || !r.iec_method_applicable || r.alf_o == null) return null;
    const p = { ...CTTransformerDiff.presets.IEC_CONSTANTS, ...(CTRelayDB.trafoDiffParams(core.inputs || {}).params || {}) };
    const ge = (a, b) => isNum(a) && isNum(b) && a >= b;
    return {
      1: { required: r.alf_ext_required, ok: ge(r.alf_o, r.alf_ext_required) },
      2: { required: r.alf_int_required, ok: ge(r.alf_o, r.alf_int_required) },
      3: { required: r.alf_min_required, ok: ge(r.alf_o, r.alf_min_required) },
      4: { required: [p.min_fadap, p.max_fadap], value: r.f_adap,
           ok: isNum(r.f_adap) && r.f_adap >= p.min_fadap && r.f_adap <= p.max_fadap },
    };
  }

  function calculate(feeder, device, results = {}) {
    if (!feeder || !device || device.device_type !== 'transformer_diff') return null;
    const t = feeder.transformer || {};
    const count = t.winding_count;
    const defined = count === '2' ? ['HV', 'LV'] : count === '3' ? ['HV', 'LV', 'TV'] : null;
    const sref = isNum(t.sr_mva) && t.sr_mva > 0 ? t.sr_mva : null;
    const cores = (device.cores || []).filter((c) => c.kind !== 'vt' && c.calc_type === 'transformer_diff');
    const remarks = [];
    let incomplete = false;

    // 1. sides
    const byWinding = {};
    cores.forEach((c) => {
      const w = (c.inputs || {}).linked_winding;
      if (w) (byWinding[w] = byWinding[w] || []).push(c);
    });
    let sidesOk = null;
    // a core without a linked winding may still be meant for the missing
    // side: then a missing side is "not checked yet", not a failure
    const unlinked = cores.some((c) => !(c.inputs || {}).linked_winding);
    if (!defined) {
      remarks.push(['zone_rm_no_count']);
      incomplete = true;
    } else {
      sidesOk = true;
      defined.forEach((w) => {
        const list = byWinding[w] || [];
        if (!list.length) {
          remarks.push(['zone_rm_missing_side', w]);
          if (unlinked || !cores.length) { if (sidesOk) sidesOk = null; incomplete = true; } else sidesOk = false;
        }
        if (list.length > 1) { sidesOk = false; remarks.push(['zone_rm_double_side', w, list.length, list.map((c) => c.name).join(', ')]); }
      });
      Object.keys(byWinding).filter((w) => !defined.includes(w)).forEach((w) => {
        sidesOk = false;
        byWinding[w].forEach((c) => remarks.push(['zone_rm_extra', c.name, w, defined.length]));
      });
    }
    cores.filter((c) => !(c.inputs || {}).linked_winding).forEach((c) => {
      remarks.push(['zone_rm_unlinked', c.name]);
      incomplete = true;
    });
    if (!sref) { remarks.push(['zone_rm_no_sr']); incomplete = true; }

    // 2. one row per side (every linked core, in winding order)
    const order = (w) => ['HV', 'LV', 'TV'].indexOf(w);
    const sides = cores.filter((c) => (c.inputs || {}).linked_winding)
      .sort((a, b) => order(a.inputs.linked_winding) - order(b.inputs.linked_winding))
      .map((c) => {
        const v = c.inputs || {};
        const w = v.linked_winding;
        const r = results[`${feeder.id}-${device.id}-${c.id}`] || null;
        const ur = isNum(t[`ur_kv_${w}`]) ? t[`ur_kv_${w}`] : null;
        const iref_a = sref && ur ? CTTransformerDiff.data.windingRatedCurrent(sref, ur) * 1000 : null;
        const fadap = iref_a && isNum(v.Ip) ? v.Ip / iref_a : null;
        if (!r) { remarks.push(['zone_rm_not_calc', c.name]); incomplete = true; }
        else if (r.is_ok !== true) remarks.push(['zone_rm_side_failed', w, c.name]);
        return {
          winding: w, core_id: c.id, core_name: c.name,
          ipr: isNum(v.Ip) ? v.Ip : null, isr: v.Is != null ? Number(v.Is) : null,
          ur_kv: ur, iref_a, fadap,
          isc_ext_a: r && isNum(r.trafo_it_max) ? r.trafo_it_max : null,
          alf_o: r && isNum(r.alf_o) ? r.alf_o : null,
          req: requirements(c, r),
          calculated: !!r, core_ok: r ? r.is_ok === true : null,
          relay: CTRelayDB.relayNameOf(v) || null,
        };
      });

    // 3. Fadap between the sides
    const fadaps = sides.map((s) => s.fadap).filter(isNum);
    const fadap_ratio = fadaps.length >= 2 ? Math.max(...fadaps) / Math.min(...fadaps) : null;
    const limits = cores.map((c) => (CTRelayDB.trafoDiffParams(c.inputs || {}).params || {}).max_fadap_ratio)
      .filter((x) => isNum(x));
    const max_fadap_ratio = limits.length ? Math.min(...limits) : null;
    let ratioOk = null;
    if (fadap_ratio != null && max_fadap_ratio != null) {
      ratioOk = fadap_ratio <= max_fadap_ratio;
      if (!ratioOk) remarks.push(['zone_rm_ratio_exceeded', fadap_ratio, max_fadap_ratio]);
    } else if (fadap_ratio != null) {
      remarks.push(['zone_rm_ratio_info', fadap_ratio]);
    }

    // 4. the same Isr on all sides (the sides with a result: an Isr still
    // being entered is not a failure)
    const isrs = [...new Set(sides.filter((s) => s.calculated).map((s) => s.isr).filter((x) => x != null && x > 0))];
    const isrOk = sides.some((s) => s.calculated) ? isrs.length <= 1 : null;
    if (isrOk === false) remarks.push(['zone_rm_isr', sides.map((s) => `${s.winding} ${s.isr} A`).join(', ')]);

    const checks = [
      { id: 'sides', ok: sidesOk },
      { id: 'fadap_ratio', ok: ratioOk, value: fadap_ratio, limit: max_fadap_ratio },
      { id: 'isr', ok: isrOk },
    ];
    const failed = checks.some((c) => c.ok === false) || sides.some((s) => s.core_ok === false);
    const status = failed ? 'NOT_OK' : (incomplete || !sides.length) ? 'INCOMPLETE' : 'OK';
    return {
      status, is_ok: status === 'OK' ? true : status === 'NOT_OK' ? false : null,
      sref_mva: sref, winding_count: count || null, windings: defined,
      sides, checks, fadap_ratio, max_fadap_ratio, remarks,
    };
  }

  return { calculate };
})();
