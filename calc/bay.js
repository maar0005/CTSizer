'use strict';
/**
 * bay.js — CTBay: the data a bay (feeder) holds for every device and core
 * below it (issue #133). One place for the bay → calculation mapping, the
 * fields and the migration of projects saved with the values on each core.
 *
 *   feeder.transformer  { sr_mva, z_percent, inrush_factor, winding_count,
 *                         ur_kv_HV, isc_int_HV, ur_kv_LV, isc_int_LV,
 *                         ur_kv_TV, isc_int_TV }
 *     sr_mva         Sr = Sref of every side, MVA (three windings: the largest
 *                    winding rating, as the reference calculation)
 *     z_percent      short-circuit impedance Z, %
 *     inrush_factor  inrush factor k
 *     winding_count  '2' | '3' — which windings the transformer has (HV/LV,
 *                    HV/LV/TV). Only the bay mark and the zone check (#135)
 *                    need it; a core needs only its own winding.
 *     ur_kv_<w>      rated voltage Ur of winding w, kV
 *     isc_int_<w>    Isc,max,int of winding w, A (typed in kA)
 *   feeder.line         { r_per_km, x_per_km, line_length }  R′L, X′L (Ω/km
 *                    primary) and lL (km); Klim (zone1_setting) is a relay
 *                    setting and stays on the distance core.
 *   feeder.bay_notes    remarks left by the migration (see migrateFeeder)
 *
 * Only entered values are stored (no default). The calculation reads the bay
 * through the existing remote-end path of the calc modules
 * (commonData.remote_end, ported from the Python tool's Field Data):
 *   transformer_data = { mva, z_percent, inrush_factor,
 *                        windings: { HV: { voltage, isc_int }, … } }
 *   R_L_per_km, X_L_per_km, lL
 * Ir and Isc,max,ext are derived, never stored (#134, windingCurrents):
 * Ir,w = Sr / (√3·Ur,w), Isc,max,ext,w = Ir,w / (Z%/100), the infinite-source
 * through-fault current (the transformer impedance alone, conservative). The
 * remote end carries isc_ext (A) per winding; Ir is left for
 * calc/transformer_diff/data.js to derive with the same expression, so the
 * floats are those of a core holding its own transformer data.
 */

const CTBay = (() => {
  const WINDINGS = ['HV', 'LV', 'TV'];
  const WINDING_COUNTS = ['2', '3'];
  const TRAFO_KEYS = ['sr_mva', 'z_percent', 'inrush_factor', 'winding_count',
    ...WINDINGS.flatMap((w) => [`ur_kv_${w}`, `isc_int_${w}`])];
  const LINE_KEYS = ['r_per_km', 'x_per_km', 'line_length'];

  // The core keys a project saved before #133 holds, per bay part
  const LEGACY_TRAFO = ['trafo_power_mva', 'trafo_rated_power', 'trafo_z_percent', 'trafo_uk_percent',
    'inrush_factor', 'trafo_voltage_kv', 'trafo_ik_max', 'trafo_it_max'];
  const LEGACY_LINE = ['r_per_km', 'x_per_km', 'line_length'];

  // The allowed range of each bay field: [min, max, gt] (CTRequired's rules
  // are built from it; the migration lifts only values inside it)
  const RANGES = {
    sr_mva: [0.1, 5000], z_percent: [1, 50], inrush_factor: [1, 20],
    ur_kv: [0.1, 1200], isc_int: [0, 200000, true],   // A (typed in kA)
    r_per_km: [0, 10], x_per_km: [0, 10], line_length: [0.01, 1000],
  };
  const rangeOf = (field) => RANGES[field.replace(/_(HV|LV|TV)$/, '')];
  const inRange = (field, x) => {
    const r = rangeOf(field);
    if (!r) return true;
    const n = typeof x === 'string' && x.trim() !== '' ? Number(x) : x;
    return typeof n === 'number' && Number.isFinite(n) && (r[2] ? n > r[0] : n >= r[0]) && n <= r[1];
  };
  const isBlank = (x) => x === undefined || x === null || (typeof x === 'string' && x.trim() === '');
  const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

  function ctCores(f) {
    const out = [];
    for (const d of (f && f.devices) || []) {
      for (const c of d.cores || []) if (c.kind !== 'vt') out.push({ device: d, core: c });
    }
    return out;
  }
  // Which bay data the bay's cores read
  const usesTransformer = (f) => ctCores(f).some(({ core }) => core.calc_type === 'transformer_diff');
  const usesLine = (f) => ctCores(f).some(({ core }) => core.calc_type === 'distance');
  const hasData = (obj, keys) => !!obj && keys.some((k) => !isBlank(obj[k]));
  // A card is shown while a core reads it or data is stored (a device type
  // change never drops entered data)
  const showsTransformer = (f) => usesTransformer(f) || hasData(f && f.transformer, TRAFO_KEYS);
  const showsLine = (f) => usesLine(f) || hasData(f && f.line, LINE_KEYS);

  // Windings the card asks for: by winding_count, else HV/LV plus TV when a
  // core is linked to it or TV data is entered
  function windings(f) {
    const t = (f && f.transformer) || {};
    if (t.winding_count === '2') return ['HV', 'LV'];
    if (t.winding_count === '3') return [...WINDINGS];
    const tv = !isBlank(t.ur_kv_TV) || !isBlank(t.isc_int_TV)
      || ctCores(f).some(({ core }) => core.calc_type === 'transformer_diff' && (core.inputs || {}).linked_winding === 'TV');
    return tv ? [...WINDINGS] : ['HV', 'LV'];
  }
  // The windings a core may be linked to
  function windingOptions(f) {
    const t = (f && f.transformer) || {};
    return t.winding_count === '2' ? ['HV', 'LV'] : [...WINDINGS];
  }

  // ── windingCurrents(f) — #134 ─────────────────────────────────────────
  // { HV: { ir_a, isc_ext_a }, … } for every winding with Sr, Ur and Z%
  // entered (data.js's expressions: kA → A).
  function windingCurrents(f) {
    const t = (f && f.transformer) || {};
    const D = CTTransformerDiff.data;
    const out = {};
    // only from values inside their range (an invalid value is marked on the
    // card and gives no current)
    const ok = (k, x) => num(x) != null && inRange(k, x);
    if (!ok('sr_mva', t.sr_mva)) return out;
    for (const w of WINDINGS) {
      const ur = t[`ur_kv_${w}`];
      if (!ok('ur_kv', ur)) continue;
      const irKa = D.windingRatedCurrent(t.sr_mva, ur);
      out[w] = { ir_a: irKa * 1000, isc_ext_a: ok('z_percent', t.z_percent) ? D.throughFaultCurrent(irKa, t.z_percent) : null };
    }
    return out;
  }

  // ── bay → commonData.remote_end ───────────────────────────────────────
  // Entered values only. transformer_data is set for every bay a
  // transformer_diff core reads, so leftover per-core transformer keys can
  // never reach the calc's per-core path.
  function remoteEnd(f) {
    if (!f) return null;
    const re = {};
    if (showsTransformer(f)) {
      const t = f.transformer || {};
      const td = { windings: {} };
      const cur = windingCurrents(f);
      if (num(t.sr_mva) != null) td.mva = t.sr_mva;
      if (num(t.z_percent) != null) td.z_percent = t.z_percent;
      if (num(t.inrush_factor) != null) td.inrush_factor = t.inrush_factor;
      for (const w of WINDINGS) {
        const wd = {};
        if (num(t[`ur_kv_${w}`]) != null) wd.voltage = t[`ur_kv_${w}`];
        if (num(t[`isc_int_${w}`]) != null) wd.isc_int = t[`isc_int_${w}`];
        if (cur[w] && cur[w].isc_ext_a != null) wd.isc_ext = cur[w].isc_ext_a;   // A (#134)
        if (Object.keys(wd).length) td.windings[w] = wd;
      }
      re.transformer_data = td;
    }
    if (showsLine(f)) {
      const l = f.line || {};
      if (num(l.r_per_km) != null) re.R_L_per_km = l.r_per_km;
      if (num(l.x_per_km) != null) re.X_L_per_km = l.x_per_km;
      if (num(l.line_length) != null) re.lL = l.line_length;
    }
    return Object.keys(re).length ? re : null;
  }

  // The commonData a core of bay f is calculated with: the station data plus
  // the bay's remote end. The system object itself when the bay adds nothing.
  function commonData(system, f) {
    const re = remoteEnd(f);
    return re ? { ...(system || {}), remote_end: re } : system;
  }

  // Bay values as one flat object (marks, activity log, report)
  function flat(f) {
    return { ...((f && f.transformer) || {}), ...((f && f.line) || {}) };
  }

  // ── migrateFeeder(f) — projects saved before #133 ─────────────────────
  // Lifts the per-core values to the bay, once per part (only while
  // f.transformer / f.line is undefined):
  //   - every core of the bay that holds a value votes (transformer_diff CT
  //     cores for the transformer, distance CT cores for the line); Sr and Z%
  //     with the calc's precedence (trafo_rated_power ?? trafo_power_mva,
  //     trafo_uk_percent ?? trafo_z_percent); a core's trafo_voltage_kv /
  //     trafo_ik_max give its linked winding's Ur / Isc,max,int;
  //   - one value (blanks do not vote) → lifted; several → the bay field stays
  //     blank (marked) and a 'conflict' note names every value and its cores:
  //     a value is never picked silently;
  //   - a value outside the field's range (which the old core rules marked
  //     invalid, so no result ever used it) does not vote: an 'invalid' note
  //     names it, and it does not block the cores that agreed;
  //   - winding values of a core with no linked winding stay on that core with
  //     an 'unlinked' note; a core's It,max override (trafo_it_max, never an
  //     input of the panel) is dropped with an 'unused' note;
  //   - lifted keys are removed from the cores; linked_winding and Klim stay.
  // Returns the same object when there is nothing to lift (a project without
  // such cores keeps its fingerprint). Idempotent.
  const sameValue = (a, b) => (num(Number(a)) != null && num(Number(b)) != null ? Number(a) === Number(b) : String(a) === String(b));
  const asStored = (x) => (typeof x === 'string' && num(Number(x)) != null ? Number(x) : x);
  const coreLabel = ({ device, core }) => `${device.name || device.id} › ${core.name || core.id}`;

  function vote(entries, field, invalid) {
    // entries: [{ value, core }] → { value } | { conflict: [{ value, cores }] } | null
    const groups = [];
    for (const e of entries) {
      if (isBlank(e.value)) continue;
      if (!inRange(field, e.value)) { invalid.push({ value: e.value, core: e.core }); continue; }
      const g = groups.find((x) => sameValue(x.value, e.value));
      if (g) g.cores.push(e.core); else groups.push({ value: asStored(e.value), cores: [e.core] });
    }
    if (!groups.length) return null;
    return groups.length === 1 ? { value: groups[0].value } : { conflict: groups };
  }

  function migrateFeeder(f) {
    if (!f || typeof f !== 'object') return f;
    const cores = ctCores(f);
    const tdCores = cores.filter(({ core }) => core.calc_type === 'transformer_diff');
    const lnCores = cores.filter(({ core }) => core.calc_type === 'distance');
    const holds = (list, keys) => list.some(({ core }) => keys.some((k) => !isBlank((core.inputs || {})[k])));
    const liftT = f.transformer === undefined && holds(tdCores, LEGACY_TRAFO);
    const liftL = f.line === undefined && holds(lnCores, LEGACY_LINE);
    if (!liftT && !liftL) return f;

    const notes = [...(f.bay_notes || [])];
    const strip = new Map();   // core id → keys to remove
    const drop = (core, keys) => strip.set(core.id, [...(strip.get(core.id) || []), ...keys]);
    const out = { ...f };

    const liftField = (part, target, field, entries) => {
      const invalid = [];
      const r = vote(entries, field, invalid);
      if (invalid.length) {
        notes.push({ kind: 'invalid', part, field, values: invalid.map((x) => ({ value: x.value, cores: [coreLabel(x.core)] })) });
      }
      if (!r) return;
      if (r.conflict) {
        notes.push({ kind: 'conflict', part, field,
          values: r.conflict.map((g) => ({ value: g.value, cores: g.cores.map(coreLabel) })) });
      } else target[field] = r.value;
    };

    if (liftT) {
      const t = {};
      const val = (e, ...keys) => { const v = e.core.inputs || {}; const k = keys.find((x) => !isBlank(v[x])); return k ? v[k] : null; };
      liftField('transformer', t, 'sr_mva', tdCores.map((e) => ({ value: val(e, 'trafo_rated_power', 'trafo_power_mva'), core: e })));
      liftField('transformer', t, 'z_percent', tdCores.map((e) => ({ value: val(e, 'trafo_uk_percent', 'trafo_z_percent'), core: e })));
      liftField('transformer', t, 'inrush_factor', tdCores.map((e) => ({ value: val(e, 'inrush_factor'), core: e })));
      for (const w of WINDINGS) {
        const linked = tdCores.filter((e) => (e.core.inputs || {}).linked_winding === w);
        liftField('transformer', t, `ur_kv_${w}`, linked.map((e) => ({ value: val(e, 'trafo_voltage_kv'), core: e })));
        liftField('transformer', t, `isc_int_${w}`, linked.map((e) => ({ value: val(e, 'trafo_ik_max'), core: e })));
      }
      for (const e of tdCores) {
        const v = e.core.inputs || {};
        drop(e.core, ['trafo_power_mva', 'trafo_rated_power', 'trafo_z_percent', 'trafo_uk_percent', 'inrush_factor']);
        if (WINDINGS.includes(v.linked_winding)) drop(e.core, ['trafo_voltage_kv', 'trafo_ik_max']);
        else if (!isBlank(v.trafo_voltage_kv) || !isBlank(v.trafo_ik_max)) {
          notes.push({ kind: 'unlinked', core: coreLabel(e),
            values: { ur_kv: isBlank(v.trafo_voltage_kv) ? null : v.trafo_voltage_kv, isc_int: isBlank(v.trafo_ik_max) ? null : v.trafo_ik_max } });
        }
        if (!isBlank(v.trafo_it_max)) {
          notes.push({ kind: 'unused', core: coreLabel(e), field: 'trafo_it_max', value: v.trafo_it_max });
          drop(e.core, ['trafo_it_max']);
        }
      }
      out.transformer = t;
    }
    if (liftL) {
      const l = {};
      for (const k of LINE_KEYS) {
        liftField('line', l, k, lnCores.map((e) => ({ value: (e.core.inputs || {})[k], core: e })));
      }
      lnCores.forEach((e) => drop(e.core, LEGACY_LINE));
      out.line = l;
    }
    out.devices = (f.devices || []).map((d) => ({
      ...d,
      cores: (d.cores || []).map((c) => {
        const keys = strip.get(c.id);
        if (!keys) return c;
        const inputs = { ...(c.inputs || {}) };
        keys.forEach((k) => delete inputs[k]);
        return { ...c, inputs };
      }),
    }));
    if (notes.length) out.bay_notes = notes;
    return out;
  }

  function migrateFeeders(feeders) {
    if (!Array.isArray(feeders)) return feeders;
    const out = feeders.map(migrateFeeder);
    return out.every((f, i) => f === feeders[i]) ? feeders : out;
  }

  // ── editing ───────────────────────────────────────────────────────────
  // Set (or clear, with null) one bay value; a conflict note of that field
  // goes once the user enters the value.
  function setField(f, key, value) {
    const part = TRAFO_KEYS.includes(key) ? 'transformer' : LINE_KEYS.includes(key) ? 'line' : null;
    if (!part) throw new Error(`unknown bay field: ${key}`);
    const obj = { ...(f[part] || {}) };
    if (isBlank(value)) delete obj[key]; else obj[key] = value;
    const out = { ...f, [part]: obj };
    if (!isBlank(value) && f.bay_notes) {
      const notes = f.bay_notes.filter((n) => !(n.kind === 'conflict' && n.field === key));
      if (notes.length) out.bay_notes = notes; else delete out.bay_notes;
    }
    return out;
  }
  function dismissNote(f, i) {
    const notes = (f.bay_notes || []).filter((_, j) => j !== i);
    const out = { ...f };
    if (notes.length) out.bay_notes = notes; else delete out.bay_notes;
    return out;
  }

  return {
    WINDINGS, WINDING_COUNTS, TRAFO_KEYS, LINE_KEYS, RANGES, LEGACY_TRAFO, LEGACY_LINE,
    ctCores, usesTransformer, usesLine, showsTransformer, showsLine, windings, windingOptions,
    windingCurrents, remoteEnd, commonData, flat,
    migrateFeeder, migrateFeeders, setField, dismissNote,
  };
})();
