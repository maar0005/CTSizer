'use strict';
/**
 * required.js — CTRequired: the inputs the user must enter before a core is
 * calculated. CTSizer has no default values: a new project, bay and core
 * start blank, every value comes from the user, and a core is only calculated
 * when the station data and all of its own inputs are entered and valid.
 *
 * check(values, rules) → { ok, count, fields, sections, invalidSections }:
 *   fields          { key: 'missing' | 'invalid' } — the input marks (FormRow field=)
 *   sections        { section: n }                 — the card marks (SectionCard section=)
 *   invalidSections { section: true }              — a card with an invalid value
 *
 * system(system)          — the Station Data card ('station'); also returns
 *                           notes { key: 'legacy' }: non-blocking marks
 * core(core, feeder)      — one core; core.kind 'vt' is a VT core whatever its
 *                           calc_type (CoreInputPanel shows VtInputs then)
 * bay(feeder)             — the bay's transformer / line data (#133)
 * ready(core, system, feeder) — all complete: the core may be calculated;
 *                           core(core, feeder) includes the bay values it reads
 *
 * Sections: station, ct, relay, line, trafo, cable, ar, meter, vt. The ranges
 * are the min / max of the panel inputs (ctsizer-panels.jsx); `gt` marks a
 * value that must be above its minimum (a rated current, burden or voltage).
 * Free-text descriptors (relay / meter type and tag) are optional. A value
 * filled from a pick (an IED from the relay database, a meter preset) counts
 * as entered: the user chose it. Optional values that are entered must be in
 * range.
 */

const CTRequired = (() => {
  const num = (min, max, o = {}) => ({ kind: 'num', min, max, ...o });
  const sel = (values, o = {}) => ({ kind: 'sel', values, ...o });
  const text = () => ({ kind: 'text' });

  const isBlank = (x) => x === undefined || x === null || (typeof x === 'string' && x.trim() === '');

  // → null (ok) | 'missing' | 'invalid'
  function test(spec, x) {
    if (isBlank(x)) return spec.optional ? null : 'missing';
    if (spec.kind === 'text') return null;
    if (spec.kind === 'sel') {
      const values = typeof spec.values === 'function' ? spec.values() : spec.values;
      return values.map(String).includes(String(x)) ? null : 'invalid';
    }
    if (spec.number && typeof x !== 'number') return 'invalid';
    const n = typeof x === 'number' ? x : Number(x);
    if (!Number.isFinite(n)) return 'invalid';
    if (spec.gt ? n <= spec.min : n < spec.min) return 'invalid';
    if (n > spec.max) return 'invalid';
    return null;
  }

  // rules: [[key, spec, section], …] read from `v`
  function check(v, rules) {
    const fields = {}, sections = {}, invalidSections = {};
    let count = 0;
    for (const [key, spec, section] of rules) {
      const r = test(spec, v ? v[key] : undefined);
      if (!r) continue;
      fields[key] = r;
      sections[section] = (sections[section] || 0) + 1;
      if (r === 'invalid') invalidSections[section] = true;
      count++;
    }
    return { ok: count === 0, count, fields, sections, invalidSections };
  }

  // ── Option lists (the panels' selects) ───────────────────────────────
  const CT_FAMILIES = ['5P', '5PR', '10P', '10PR', 'PX', 'TPX', 'TPY', 'TPZ'];
  const MT_CLASSES = ['0.1', '0.2', '0.2S', '0.5', '0.5S', '1', '3', '5'];
  const VT_CLASSES = ['0.1', '0.2', '0.5', '1.0', '3P'];
  // The meter's own standard and class (a local rule set's meter-class check,
  // calc/local_rules/): MID class A / B / C, DS/EN class 2 / 1 / 0.5S / 0.2S
  const METER_STANDARDS = ['mid', 'dsen'];
  const METER_CLASSES = { mid: ['A', 'B', 'C'], dsen: ['2', '1', '0.5S', '0.2S'] };
  const CABLE_CROSS = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50];
  const FREQS = ['50', '60'];
  const methods = () => CTCableRes.listMethods().map((m) => m.id);
  const topologies = () => CTCableRes.listTopologies().map((t) => t.id);
  const ktfPresets = () => Object.keys(CTAutoReclosure.KTF_PRESETS);

  // The CT class the class row shows: the stored family, or PX for a core
  // stored before the class row with only is_px set; null when none is picked.
  function ctFamily(v) {
    if (v && !isBlank(v.ct_class_family)) return v.ct_class_family;
    return v && (v.is_px === true || v.is_px_class === true) ? 'PX' : null;
  }

  // Ts of the AR card: 'table' | 'manual' | null. A core with a typed ar_ts
  // and no mode (older cores) is manual, as CTCalc.moduleCore reads it.
  function arTsMode(v) {
    if (v && (v.ar_ts_mode === 'table' || v.ar_ts_mode === 'manual')) return v.ar_ts_mode;
    return v && v.ar_ts != null ? 'manual' : null;
  }

  // ── Station data ─────────────────────────────────────────────────────
  const SYSTEM_RULES = [
    ['station_name', text(), 'station'],
    ['station_abbr', text(), 'station'],
    ['voltage', num(0, 1200, { gt: true }), 'station'],
    ['freq', sel(FREQS), 'station'],
    ['isc_sys', num(0, 200, { gt: true }), 'station'],
    ['tp', num(1, 500), 'station'],
    ['cable_r_method', sel(methods), 'station'],
    ['cable_temp', num(-20, 90), 'station'],
    // Optional: the national metering rules the project is also checked
    // against (CTLocalRules); blank is none
    ['local_rules', sel(() => CTLocalRules.ids(), { optional: true }), 'station'],
  ];

  // ρ20 source of the formula method (#132): required only with the formula
  // method. In manual mode both metals' ρ20 are required (Ω·mm²/m; the range
  // also catches a value typed in Ω·m). A formula project saved before the
  // choice existed (cable_rho_mode absent, not null) is calculated with the
  // IEC values as before: it gets a non-blocking note instead of a rule.
  // `number`: a value stored as text (a hand-edited file) is invalid, as the
  // calc reads only a number. The range is CTCableRes.RHO20_RANGE.
  const RHO20 = num(CTCableRes.RHO20_RANGE[0], CTCableRes.RHO20_RANGE[1], { number: true });
  function rhoRules(s) {
    if (s.cable_r_method !== 'iec60287' || s.cable_rho_mode === undefined) return [];
    const rules = [['cable_rho_mode', sel(['iec', 'manual']), 'station']];
    if (s.cable_rho_mode === 'manual') {
      rules.push(['cable_rho20_cu', RHO20, 'station'], ['cable_rho20_al', RHO20, 'station']);
    }
    return rules;
  }

  // `notes` are marks that do not block: { key: 'legacy' } for a value a
  // saved project never stored but is still calculated without (see rhoRules).
  // They are not counted in count / sections / ok.
  function system(s) {
    s = s || {};
    const r = check(s, [...SYSTEM_RULES, ...rhoRules(s)]);
    r.notes = s.cable_r_method === 'iec60287' && s.cable_rho_mode === undefined
      ? { cable_rho_mode: 'legacy' } : {};
    return r;
  }

  // ── Core rule blocks ─────────────────────────────────────────────────
  // Rct is typed unless it is estimated (rct_estimate, CTCalc.rctEstimated):
  // then the number of primary turns Np is typed instead; the estimate also
  // reads Ip, Is, the class and the station voltage, which are required anyway
  const ctBase = (type, v) => [
    ['Ip', num(0, 100000, { gt: true }), 'ct'],
    ['Is', sel([1, 5]), 'ct'],
    CTCalc.rctEstimated(type, v) ? ['rct_np', num(1, 100, { number: true }), 'ct'] : ['rct', num(0, 100), 'ct'],
  ];
  const ctBurden = (max) => [['burden', num(0, max, { gt: true }), 'ct']];

  // The class row: the class, then ALF or (PX, TPX, TPY, TPZ) Vk
  function classRow(v) {
    const fam = ctFamily(v);
    const rules = [['ct_class_family', sel(CT_FAMILIES), 'ct']];
    if (fam && CTBaseClasses.isVkClass(fam)) rules.push(['vk', num(0, 10000, { gt: true }), 'ct']);
    else rules.push(['alf', num(1, 200), 'ct']);
    return rules;
  }
  // The values the rules read: a legacy PX core (is_px, no class stored) has
  // the class PX, and an older AR core with a typed Ts and no mode is manual.
  function derived(v) {
    const fam = ctFamily(v), mode = arTsMode(v);
    if ((!fam || !isBlank(v.ct_class_family)) && (!mode || v.ar_ts_mode === mode)) return v;
    return { ...v, ...(fam ? { ct_class_family: fam } : {}), ...(mode ? { ar_ts_mode: mode } : {}) };
  }

  // relay_tal is the C-O-C-O measurement window when AR is enabled
  // (CTCalc.moduleCore); otherwise blank has a meaning of its own (distance:
  // the Tp lookup table) or it is only drawn on the fault waveform. A picked
  // IED with operate times (CTRelayDB.operateTime) sets it from the
  // protection function (when it lists more than one), inrush detection (a
  // function with an inrush extension) and network delay (a function with
  // one): those are required just as t_al is.
  function relay(v, type) {
    const arTal = (type === 'distance' || type === 'line_diff') && v.auto_reclose_enabled === true;
    const opt = { optional: !arTal };
    const rules = [
      ['relay_manufacturer', text(), 'relay'],
      ['relay_burden', num(0, 10), 'relay'],
      ['relay_tal', num(1, 500, opt), 'relay'],
    ];
    const times = CTRelayDB.operateTime(CTRelayDB.byName(v.relay_model), type, null, v);
    if (times) {
      if (times.functions.length > 1) rules.push(['relay_function', sel(times.functions.map((f) => f.function), opt), 'relay']);
      if (times.fn && times.fn.inrush_ms != null) rules.push(['relay_inrush', sel([true, false], opt), 'relay']);
      if (times.fn && times.fn.network_delay) rules.push(['relay_network_delay', num(0, 1000, opt), 'relay']);
    }
    return rules;
  }

  const cable = (attachedMax) => {
    const rules = [
      ['cable_length', num(0, 5000), 'cable'],
      ['cable_cross', sel(CABLE_CROSS), 'cable'],
      ['cable_mat', sel(['cu', 'al']), 'cable'],
      ['cable_topology', sel(topologies), 'cable'],
    ];
    if (attachedMax != null) rules.push(['attached_resistor', num(0, attachedMax), 'cable']);
    return rules;
  };

  // ── Bay data (#133, calc/bay.js): the transformer and line data live on
  // the bay, shared by its cores. The core keeps Klim / linked_winding.
  const LINE = [
    ['zone1_setting', num(0.05, 1), 'line'],
  ];
  // the bay's ranges (CTBay.RANGES); `number`: text is invalid, as the calc
  // reads only numbers (a hand-edited file)
  const bayNum = (k) => { const [min, max, gt] = CTBay.RANGES[k]; return num(min, max, { gt: !!gt, number: true }); };
  const BAY_LINE = [
    ['r_per_km', bayNum('r_per_km'), 'line'],
    ['x_per_km', bayNum('x_per_km'), 'line'],
    ['line_length', bayNum('line_length'), 'line'],
  ];
  const BAY_TRAFO = [
    ['sr_mva', bayNum('sr_mva'), 'trafo'],
    ['z_percent', bayNum('z_percent'), 'trafo'],
    ['inrush_factor', bayNum('inrush_factor'), 'trafo'],
  ];
  const winding = (w) => [
    [`ur_kv_${w}`, bayNum('ur_kv'), 'trafo'],
    [`isc_int_${w}`, bayNum('isc_int'), 'trafo'],   // A (entered in kA)
  ];
  const TRAFO = (f) => [['linked_winding', sel(CTBay.windingOptions(f)), 'trafo']];

  // bay(feeder): the bay's own card (the sidebar's bay mark). Required only
  // while a core reads it; the winding count and every winding it gives.
  function bay(f) {
    const rules = [];
    if (CTBay.usesTransformer(f)) {
      rules.push(...BAY_TRAFO, ['winding_count', sel(CTBay.WINDING_COUNTS), 'trafo'],
        ...CTBay.windings(f).flatMap(winding));
    }
    if (CTBay.usesLine(f)) rules.push(...BAY_LINE);
    return check(CTBay.flat(f), rules);
  }

  // The bay values one core reads: a transformer_diff core needs Sr, Z%, k and
  // its own winding's Ur and Isc,max,int (not the whole bay, so an old
  // project's core still calculates while another winding is blank); a
  // distance core needs the line data.
  function bayRulesFor(type, v, f) {
    if (type === 'transformer_diff') {
      const lw = CTBay.windingOptions(f).includes(v.linked_winding) ? v.linked_winding : null;
      return [...BAY_TRAFO, ...(lw ? winding(lw) : [])];
    }
    if (type === 'distance') return BAY_LINE;
    return [];
  }
  function merge(a, b) {
    const sections = { ...a.sections };
    for (const [k, n] of Object.entries(b.sections)) sections[k] = (sections[k] || 0) + n;
    return { ok: a.ok && b.ok, count: a.count + b.count, fields: { ...a.fields, ...b.fields },
      sections, invalidSections: { ...a.invalidSections, ...b.invalidSections } };
  }

  function ar(v) {
    if (v.auto_reclose_enabled !== true) return [];
    const rules = [
      ['ar_t_prime', num(0, 10), 'ar'],
      ['ar_tfr', num(0, 60), 'ar'],
      ['ar_ts_mode', sel(['table', 'manual']), 'ar'],
      ['ar_ktf_preset', sel(ktfPresets), 'ar'],
    ];
    if (arTsMode(v) === 'manual') rules.push(['ar_ts', num(0.01, 30), 'ar']);
    return rules;
  }

  function meter(v, type) {
    const rules = [['meter_manufacturer', text(), 'meter']];
    if (type === 'vt') {
      rules.push(['vt_supply_mode', sel(['aux', 'self']), 'meter'],
                 ['device_burden', num(0, 1000), 'meter']);
    } else {
      rules.push(['device_burden', num(0, 100), 'meter'],
                 ['min_safety_factor', num(1, 100), 'meter'],
                 // Optional: only a local rule set reads them (it reports
                 // them as not entered); a class must fit the standard
                 ['meter_standard', sel(METER_STANDARDS, { optional: true }), 'meter'],
                 ['meter_class', sel(METER_CLASSES[v.meter_standard] || [], { optional: true }), 'meter']);
    }
    return rules;
  }

  // calc type → [rules, the values they read]
  function coreRules(type, v, f) {
    switch (type) {
      case 'overcurrent':
        return [...ctBase(type, v), ...ctBurden(200), ...classRow(v), ...relay(v, type), ...cable()];
      case 'busbar':
        return [...ctBase(type, v), ...ctBurden(200), ['alf', num(1, 200), 'ct'], ...relay(v, type), ...cable()];
      case 'distance':
        return [...ctBase(type, v), ...ctBurden(200), ...classRow(v), ...relay(v, type), ...LINE, ...cable(), ...ar(v)];
      case 'transformer_diff':
        return [...ctBase(type, v), ...ctBurden(200), ...classRow(v), ...TRAFO(f), ...relay(v, type), ...cable()];
      case 'line_diff':
        return [...ctBase(type, v), ...ctBurden(200), ...classRow(v), ...relay(v, type), ...cable(), ...ar(v)];
      case 'generic':
        // the values ct_generic.py reads (calc/generic.js): Isr, Rct, Sn, the
        // class with ALF or Vk, the cable; no Ip, no relay
        return [...ctBase(type, v).filter(([k]) => k !== 'Ip'), ...ctBurden(200), ...classRow(v), ...cable()];
      case 'metering': {
        const rules = [...ctBase(type, v), ...ctBurden(100),
          ['mt_class', sel(['custom', ...MT_CLASSES]), 'ct'],
          ['fs_factor', num(1, 50), 'ct']];
        // Smin% is typed for a custom class without the extended range
        if (v.extended_burden_range !== true && !MT_CLASSES.includes(v.mt_class)) {
          rules.push(['min_burden_percent', num(0, 100), 'ct']);
        }
        return [...rules, ...meter(v, type), ...cable(100)];
      }
      case 'vt':
        return [
          ['secondary_voltage', num(0, 500, { gt: true }), 'vt'],
          ['vt_class', sel(VT_CLASSES), 'vt'],
          ['burden', num(0, 1000, { gt: true }), 'vt'],
          ['thermal_burden', num(0, 5000, { gt: true }), 'vt'],
          ['vt_burden_range', sel(['I', 'II']), 'vt'],
          ...meter(v, type), ...cable(1000000),
          // where an attached resistor sits: at the VT or at the meter (it
          // decides the current in the lead and so its voltage drop)
          ...(Number(v.attached_resistor) > 0 ? [['vt_resistor_location', sel(['vt', 'meter']), 'cable']] : []),
        ];
      default:
        return [];
    }
  }

  function coreType(c) {
    return c && c.kind === 'vt' ? 'vt' : (c && c.calc_type);
  }

  // core(core, feeder): its own inputs plus the bay values it reads (the
  // feeder holding it). Without a feeder those count as missing: a core of a
  // bay type is never calculated on values it does not have.
  function core(c, f) {
    const type = coreType(c);
    const v = (c && c.inputs) || {};
    const own = check(derived(v), coreRules(type, v, f));
    const bayRules = bayRulesFor(type, v, f);
    return bayRules.length ? merge(own, check(CTBay.flat(f), bayRules)) : own;
  }

  function ready(c, s, f) {
    return system(s).ok && core(c, f).ok;
  }

  return {
    system, core, bay, ready, check, test, ctFamily, arTsMode, coreType,
    CT_FAMILIES, MT_CLASSES, VT_CLASSES, CABLE_CROSS, FREQS, SYSTEM_RULES,
    METER_STANDARDS, METER_CLASSES,
  };
})();
