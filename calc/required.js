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
 * system(system)          — the Station Data card ('station')
 * core(core)              — one core; core.kind 'vt' is a VT core whatever its
 *                           calc_type (CoreInputPanel shows VtInputs then)
 * ready(core, system)     — both complete: the core may be calculated
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

  function system(s) {
    return check(s || {}, SYSTEM_RULES);
  }

  // ── Core rule blocks ─────────────────────────────────────────────────
  const ctBase = () => [
    ['Ip', num(0, 100000, { gt: true }), 'ct'],
    ['Is', sel([1, 5]), 'ct'],
    ['rct', num(0, 100), 'ct'],
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
  // the Tp lookup table) or it is only drawn on the fault waveform.
  function relay(v, type) {
    const arTal = (type === 'distance' || type === 'line_diff') && v.auto_reclose_enabled === true;
    return [
      ['relay_manufacturer', text(), 'relay'],
      ['relay_burden', num(0, 10), 'relay'],
      ['relay_tal', num(10, 500, { optional: !arTal }), 'relay'],
    ];
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

  const LINE = [
    ['r_per_km', num(0, 10), 'line'],
    ['x_per_km', num(0, 10), 'line'],
    ['line_length', num(0.01, 1000), 'line'],
    ['zone1_setting', num(0.05, 1), 'line'],
  ];

  const TRAFO = [
    ['trafo_power_mva', num(0.1, 5000), 'trafo'],
    ['trafo_voltage_kv', num(0.1, 1200), 'trafo'],
    ['trafo_z_percent', num(1, 50), 'trafo'],
    ['inrush_factor', num(1, 20), 'trafo'],
    ['linked_winding', sel(['HV', 'LV', 'TV']), 'trafo'],
    ['trafo_ik_max', num(0, 200000, { gt: true }), 'trafo'],   // A (entered in kA)
  ];

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
  function coreRules(type, v) {
    switch (type) {
      case 'overcurrent':
        return [...ctBase(), ...ctBurden(200), ...classRow(v), ...relay(v, type), ...cable()];
      case 'busbar':
        return [...ctBase(), ...ctBurden(200), ['alf', num(1, 200), 'ct'], ...relay(v, type), ...cable()];
      case 'distance':
        return [...ctBase(), ...ctBurden(200), ...classRow(v), ...relay(v, type), ...LINE, ...cable(), ...ar(v)];
      case 'transformer_diff':
        return [...ctBase(), ...ctBurden(200), ...classRow(v), ...TRAFO, ...relay(v, type), ...cable()];
      case 'line_diff':
        return [...ctBase(), ...ctBurden(200), ...classRow(v), ...relay(v, type), ...cable(), ...ar(v)];
      case 'metering': {
        const rules = [...ctBase(), ...ctBurden(100),
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

  function core(c) {
    const type = coreType(c);
    const v = (c && c.inputs) || {};
    return check(derived(v), coreRules(type, v));
  }

  function ready(c, s) {
    return system(s).ok && core(c).ok;
  }

  return {
    system, core, ready, check, test, ctFamily, arTsMode, coreType,
    CT_FAMILIES, MT_CLASSES, VT_CLASSES, CABLE_CROSS, FREQS, SYSTEM_RULES,
    METER_STANDARDS, METER_CLASSES,
  };
})();
