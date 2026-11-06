'use strict';
/**
 * index.js — CTCalc global dispatcher ← calculations/ct_calculations.py
 *
 * Aggregates all submodules into a single CTCalc object that the rest of the
 * app uses.
 *
 * Two entry points:
 * - calculate(type, core, commonData) — the CTSizer entry. `type` is the UI's
 *   calc_type ('metering', 'distance', 'line_diff', 'transformer_diff',
 *   'overcurrent', 'busbar', 'generic', 'vt'). Errors are logged and give null,
 *   so one bad core does not break the results panel. The core is not
 *   modified: the module gets moduleCore(type, core), a shallow copy with the
 *   CT class keys the AR checks read (see moduleCore). The IED input rating
 *   check (CTIedRating, calc/ied_rating.js) then runs on the module result,
 *   as calculate_single_core does.
 *   Every module gets `commonData`, metering included: the project's cable
 *   settings (cable_r_method, cable_temp) travel there (PORTING_PLAN.md §9.4).
 * - calculateSingleCore(commonData, coreData) — port of
 *   CTCalculator.calculate_single_core. Routes by the Python keys `application`
 *   (default 'metering') and `relay_type` (default 'distance'; any unknown value
 *   → generic), runs the IED input rating check (CTIedRating) like the
 *   Python, then adds core_name / transformer_id / core_number /
 *   application to the result. Like the Python, errors are logged and re-thrown.
 *
 * Fidelity notes:
 * - Python passes `core_data["cable_resistance"]` into every calculate_*. The
 *   JS modules work out Rc from the core's cable fields instead, each with one
 *   CTCableRes.lead() call (the project's method and temperature, PORTING_PLAN.md
 *   §9), so that value is not forwarded. CTVT.calculate ignores
 *   core.cable_resistance too (§9.6 9C, D1).
 * - `.get(key, default)` only uses the default for a missing key, so an explicit
 *   null is kept (`pyGet`). core_name follows Python str(): null → 'None'.
 * - The legacy method aliases (calculate_metering(common, core, cable_resistance)
 *   etc.) are not ported: nothing in CTSizer calls them and the JS modules take
 *   no cable_resistance argument. Use CTCalc.<module>.calculate directly.
 * - The debug logging (_log.debug) is not ported; the exception log is.
 */

const CTCalc = (() => {

  // CTSizer calc_type → module entry.
  const CALCULATORS = {
    overcurrent:      (core, commonData) => CTOvercurrent.calculate(core, commonData),
    metering:         (core, commonData) => CTMetering.calculate(core, commonData),
    busbar:           (core, commonData) => CTBusbar.calculate(core, commonData),
    generic:          (core, commonData) => CTGeneric.calculate(core, commonData),
    distance:         (core, commonData) => CTDistance.calculate(core, commonData),
    transformer_diff: (core, commonData) => CTTransformerDiff.calculate(core, commonData),
    line_diff:        (core, commonData) => CTLineDiff.calculate(core, commonData),
    vt:               (core, commonData) => CTVT.calculate(core, commonData),
  };

  // ct_calculations.py relay_type → CTSizer calc_type.
  const RELAY_TYPES = {
    distance:                 'distance',
    line_differential:        'line_diff',
    transformer_differential: 'transformer_diff',
    overcurrent:              'overcurrent',
    busbar:                   'busbar',
  };

  // ── The CT class a core's panel shows ───────────────────────────────
  // The calc types whose panel has a CT class row (ctsizer-panels.jsx
  // CTClassRow). There the class decides how the core is specified, as in
  // the Python tool's GUI (ui/ct_widget/data_io.py): PX, TPX, TPY and TPZ by their
  // knee point voltage Vk, the others by ALF (CTBaseClasses.isVkClass). A
  // core with no ct_class_family (stored before the class row, or with only
  // the former "PX class CT" box ticked) shows PX when is_px (or the Python tool's
  // key is_px_class) is set, else 5P. PORTING_PLAN.md §10.6 F-TP-PX.
  // Generic (a core only from a project file) has the class row too (§10.6
  // F-GEN-PANEL); a core without a stored class keeps its is_px / is_px_class.
  const CLASS_ROW_TYPES = ['overcurrent', 'distance', 'transformer_diff', 'line_diff', 'generic'];
  function ctClassFamily(core) {
    if (core?.ct_class_family != null) return core.ct_class_family;
    return core?.is_px === true || core?.is_px_class === true ? 'PX' : '5P';
  }

  // ── Rct estimate ─────────────────────────────────────────────────────
  // The calc types whose Rct may be estimated by rule of thumb (the "Estimate
  // Rct" box, calc/rct_estimate.js): every CT core with an Ip, so not generic
  // (no Ip) and not VT. Made for P, PR and metering cores; on a class whose
  // Rct is a rated value (PX, PXR, TPX, TPY, TPZ) it is flagged as very
  // uncertain (CTRctEstimate.notes).
  const RCT_ESTIMATE_TYPES = ['overcurrent', 'metering', 'busbar', 'distance', 'transformer_diff', 'line_diff'];
  function rctEstimated(type, core) {
    return RCT_ESTIMATE_TYPES.includes(type) && core?.rct_estimate === true;
  }

  // ── IEDs in series (SLD_PLAN.md T03) ────────────────────────────────
  // One CT core can run through several IEDs: after the core's own IED
  // (relay_burden; on a metering core the meter, device_burden) come
  // core.inputs.series_loads = [{ id, name, burden_va, device? }], at most
  // SERIES_MAX, in chain order. `device` (optional) is the model device the
  // load is (the station diagram, T10); the calculation reads only burden_va.
  // The module gets the own burden + Σ burden_va (all at the core's Isr, so
  // the VA add up); the stored value stays the IED's own, so CTRelayDB.apply
  // (which writes a picked IED's SR) is unchanged.
  // SERIES_KEY: the calc types with a series chain and the burden it adds
  // to. Generic is not one: ct_generic.py (calc/generic.js) reads no relay
  // burden (Rext is the lead only) and its panel has no relay card.
  const SERIES_MAX = 10;
  const SERIES_KEY = {
    overcurrent: 'relay_burden', busbar: 'relay_burden', distance: 'relay_burden',
    line_diff: 'relay_burden', transformer_diff: 'relay_burden', metering: 'device_burden',
  };
  const finiteNum = (x) => (x === null || x === undefined || x === '' ? null
    : (Number.isFinite(Number(x)) ? Number(x) : null));
  // The entries the calculation adds: a list on a calc type with a chain,
  // capped at SERIES_MAX; blank or invalid burdens are skipped (the app
  // does not calculate such a core: CTRequired marks them)
  function seriesLoads(type, core) {
    if (!Object.prototype.hasOwnProperty.call(SERIES_KEY, type)) return [];
    const list = core && Array.isArray(core.series_loads) ? core.series_loads : [];
    return list.slice(0, SERIES_MAX)
      .filter((e) => e && typeof e === 'object' && finiteNum(e.burden_va) != null && finiteNum(e.burden_va) >= 0);
  }
  // → null (no chain) | { key, own, loads: [{ name, burden_va }], sum, total }.
  // Needs the own burden as a number: without it the module keeps its own
  // handling of a blank value, which the app never calculates (CTRequired).
  function seriesBurden(type, core) {
    const loads = seriesLoads(type, core);
    if (!loads.length) return null;
    const key = SERIES_KEY[type];
    const own = finiteNum(core[key]);
    if (own == null) return null;
    const items = loads.map((e) => ({ name: typeof e.name === 'string' ? e.name : '', burden_va: finiteNum(e.burden_va) }));
    const sum = items.reduce((a, e) => a + e.burden_va, 0);
    return { key, own, loads: items, sum, total: own + sum };
  }
  // The Formula Step listing the chain: S_R = S_IED + Σ S_i (metering:
  // S_device = S_meter + Σ S_i), the values in the formula and the entries'
  // names in `detail_en` / `detail_da` (plain text, shown under the formula
  // on screen and in the RTF)
  function seriesStep(sb) {
    const fmt = (x) => String(Number(x.toFixed(4)));
    const meter = sb.key === 'device_burden';
    const lhs = meter ? 'S_{device}' : 'S_R';
    const own = meter ? 'S_{meter}' : 'S_{IED}';
    const values = [sb.own, ...sb.loads.map((e) => e.burden_va)].map(fmt).join('+');
    const vars = { [meter ? 'Smeter' : 'SIED']: sb.own };
    sb.loads.forEach((e, i) => { vars[`S${i + 1}`] = e.burden_va; });
    const detail = (ownName) => [`${ownName} ${fmt(sb.own)} VA`,
      ...sb.loads.map((e, i) => `${e.name.trim() || `#${i + 1}`} ${fmt(e.burden_va)} VA`)].join(' + ');
    return CTStep.make({
      key: 'series_burden', label_en: 'Series burden', label_da: 'Seriebyrde',
      latex: `${lhs}=${own}+\\sum S_i=${values}`,
      result: sb.total, unit: 'VA', precision: 3, variables: vars,
      detail_en: detail(meter ? 'Meter' : 'IED'), detail_da: detail(meter ? 'Måler' : 'IED'),
    });
  }

  // ── The core a module gets ───────────────────────────────────────────
  // A shallow copy of the core: the distance port writes core.ar_tp when AR is
  // enabled (as main.py writes core_data["ar_tp"] into the dict the Python tool's GUI
  // builds fresh for every run), and `core` here is the app's stored
  // core.inputs.
  // Distance and line diff (the two AR checks) also get the CT class keys
  // the Python tool's GUI writes (ui/ct_widget/data_io.py): `ct_class` is the class it
  // shows, the same strings as CTSizer's ct_class_family ('5P', '5PR', 'PX',
  // 'TPY', …), and `ar_time_constant_class` = map_class_to_time_constant(class).
  // The IEC 61869-100 ODE check reads ct_class, the C-O-C-O Ktd the time
  // constant class. Keys already on the core (e.g. a converted Python-tool core)
  // win. A distance core of a Vk class (PX, TPX, TPY, TPZ) with a Vk has no
  // `alf` there (data_io.py stores None for a Vk-specified class), so its ODE
  // check, which needs the rated ALF, does not run; CTSizer keeps the ALF typed
  // before switching to the class, and the main calculation ignores it
  // (getAlfOrVk). PORTING_PLAN.md §10.6 F-AR-KEYS, F-TP-PX.
  // With ar_ts_mode 'table' (the AR card's default) `ar_ts` is the typical Ts
  // for the class the panel shows and the project voltage
  // (CTAutoReclosure.estimateTs); otherwise the stored ar_ts (blank → the
  // module default), so cores without the mode are unchanged.
  // The C-O-C-O measurement windows are the relay's time to accuracy limit
  // t_al, as the Python tool's GUI writes them (_add_distance_data): ar_t_al =
  // ar_t_double_al = t_al / 1000, t_al the IED's measurement_time_ms from the
  // relay database (_relay_measurement_time_ms). In CTSizer t_al is the Relay
  // Information card's relay_tal (ms), the one relay-time input: a picked IED
  // fills it (CTRelayDB.apply), so each core is checked with its own IED's
  // time, and it overrides any stored ar_t_al. A custom relay types it; it is
  // required with AR on (CTRequired), so there is no 25 ms default here
  // (PORTING_PLAN.md §10.6 F-AR-KEYS, §10.7 W7). A core without relay_tal is
  // not calculated by the app; called directly, it keeps any stored ar_t_al,
  // else the module defaults.
  // With rct_estimate (rctEstimated) `rct` is the rule-of-thumb estimate
  // N · r_turn, N = Np · Ip / Is (rct_np), for the class and the project
  // voltage (CTRctEstimate.estimate), over any stored rct. A core without the box
  // keeps its typed rct.
  // On a panel with a class row `is_px` follows the class (ctClassFamily), not
  // a stored is_px that may disagree with it (the former "PX class CT" box). A
  // Vk class with no Vk entered still falls back to its ALF (getAlfOrVk), and
  // the panel says so (§10.6 F-TP-PX).
  function moduleCore(type, core, commonData) {
    if (core == null) return core;
    const m = { ...core };
    if (CLASS_ROW_TYPES.includes(type)) {
      m.is_px = CTBaseClasses.isVkClass(ctClassFamily(core));
      if ('is_px_class' in m) m.is_px_class = m.is_px;
    }
    const ar = type === 'distance' || type === 'line_diff';
    if (ar && core.ct_class_family != null) {
      if (m.ct_class === undefined) m.ct_class = core.ct_class_family;
      if (m.ar_time_constant_class === undefined) {
        m.ar_time_constant_class = CTBaseClasses.mapClassToTimeConstant(m.ct_class);
      }
    }
    if (rctEstimated(type, core)) {
      const e = CTRctEstimate.estimate(core, commonData?.voltage);
      if (e) m.rct = e.rct;
    }
    if (ar && core.ar_ts_mode === 'table') {
      m.ar_ts = CTAutoReclosure.estimateTs(ctClassFamily(core), commonData?.voltage).ts;
    }
    // A picked IED with operate times (calc/relays.js) sets t_al for this calc
    // type at the project's rated frequency, so a stored relay_tal from before
    // a frequency change is not used
    const hit = CTRelayDB.lookup(core.relay_model, core.Is, type, commonData?.freq, core);
    if (hit && hit.times) {
      if (hit.tal_ms != null) m.relay_tal = hit.tal_ms;
      else delete m.relay_tal;
    }
    if (ar && core.auto_reclose_enabled && m.relay_tal != null) {
      const tal = m.relay_tal / 1000;
      m.ar_t_al = tal;
      m.ar_t_double_al = tal;
    }
    if (type === 'distance' && CTBase.getAlfOrVk(m).is_px) delete m.alf;
    // IEDs in series: the module sees the whole chain's burden (seriesBurden)
    const sb = seriesBurden(type, core);
    if (sb) m[sb.key] = sb.total;
    return m;
  }

  // ── Dispatcher ───────────────────────────────────────────────────────
  function calculate(type, core, commonData) {
    const fn = Object.prototype.hasOwnProperty.call(CALCULATORS, type) ? CALCULATORS[type] : null;
    if (!fn) return null;
    try {
      const m = moduleCore(type, core, commonData);
      // IED input rating: the secondary current against the picked IED's
      // input ratings (calc/ied_rating.js ← ct_ied_rating.py, which
      // calculate_single_core runs after the module the same way)
      let r = CTIedRating.apply(fn(m, commonData), CTIedRating.calculate(type, m, commonData));
      // IEDs in series: the step that sums the chain, first (it gives the
      // burden the module's own steps use)
      const sb = seriesBurden(type, core);
      if (r && sb) r = { ...r, series_burden: sb, steps: [seriesStep(sb), ...(r.steps || [])] };
      // CTSizer's sanity checks (calc/plausibility.js, issue #154): the
      // secondary voltage limit (fails the core) and a typed Rct far above
      // the rule-of-thumb table (a remark)
      return CTPlausibility.apply(type, m, commonData, r);
    } catch (e) {
      console.error('[CTCalc] Error in', type, e);
      return null;
    }
  }

  // ── CTCalculator (ct_calculations.py) ────────────────────────────────
  const SECURITY_FACTOR_C = CTBase.SECURITY_FACTOR_C;

  function getAlfOrVk(core) {
    return CTBase.getAlfOrVk(core);
  }

  // dict.get(key, default): the default only replaces a missing key.
  function pyGet(obj, key, dflt) {
    return obj != null && key in obj && obj[key] !== undefined ? obj[key] : dflt;
  }

  // str() for the f-string in core_name.
  function pyStr(v) {
    if (v === null || v === undefined) return 'None';
    if (v === true) return 'True';
    if (v === false) return 'False';
    return String(v);
  }

  // The routing branch of calculate_single_core → CTSizer calc_type.
  function routeCore(core_data) {
    const application = pyGet(core_data, 'application', 'metering');
    if (application === 'metering') return 'metering';
    const relay_type = pyGet(core_data, 'relay_type', 'distance');
    return Object.prototype.hasOwnProperty.call(RELAY_TYPES, relay_type)
      ? RELAY_TYPES[relay_type] : 'generic';
  }

  // The fields calculate_single_core adds to every result, in its order.
  function coreMetadata(core_data) {
    const transformer_id = pyGet(core_data, 'transformer_id', 'CT');
    const core_number = pyGet(core_data, 'core_number', 1);
    return {
      core_name: `${pyStr(transformer_id)} kerne ${pyStr(core_number)}`,
      transformer_id,
      core_number,
      application: pyGet(core_data, 'application', 'metering'),
    };
  }

  function calculateSingleCore(common_data, core_data) {
    const type = routeCore(core_data);
    const meta = coreMetadata(core_data);
    let result;
    try {
      result = CALCULATORS[type](core_data, common_data);
      result = CTIedRating.apply(result, CTIedRating.calculate(type, core_data, common_data));
    } catch (e) {
      console.error(
        `[CTCalc] CT calculation FAILED | core=${meta.core_name} | application=${pyStr(meta.application)}` +
        ` | relay_type=${pyStr(pyGet(core_data, 'relay_type', 'N/A'))}`, e
      );
      throw e;
    }
    return Object.assign(result, meta);
  }

  // ── Saturation curve (overcurrent) ───────────────────────────────────
  function satCurve(result) {
    return CTOvercurrent.satCurve(result);
  }

  // ── Waveform data (asymmetric fault, non-looping) ────────────────────
  function waveformData(Tp_ms, ALF_act, ALF_req, samples = 500) {
    const f     = 50;
    const Tp    = (Tp_ms || 100) / 1000;
    const cycles = 5;
    const T     = cycles / f;
    const dt    = T / samples;
    const omega = 2 * Math.PI * f;

    // Asymmetric fault current: i(t) = e^(-t/Tp) - cos(ωt)
    const rawIp = Array.from({ length: samples }, (_, i) => {
      const t = i * dt;
      return Math.exp(-t / Tp) - Math.cos(omega * t);
    });
    const peak = Math.max(...rawIp.map(Math.abs));
    const ip   = rawIp.map(v => v / peak);

    const ratio = ALF_act != null && ALF_req != null ? ALF_act / ALF_req : 1;
    const is_   = [];

    if (ratio >= 1) {
      ip.forEach(v => is_.push(v));
    } else {
      // Simplified saturation model: flux-limited
      let flux = 0;
      const fluxLim = ratio * 0.16;
      for (let i = 0; i < samples; i++) {
        flux += ip[i] * dt * omega * 0.4;
        if (Math.abs(flux) > fluxLim) {
          is_.push(ip[i] * 0.06);
          flux *= 0.9;
        } else {
          is_.push(ip[i]);
        }
      }
    }
    return { ip, is_, dt, ratio };
  }

  return {
    calculate, moduleCore, SERIES_MAX, SERIES_KEY, seriesLoads, seriesBurden, CLASS_ROW_TYPES, RCT_ESTIMATE_TYPES, rctEstimated, ctClassFamily, satCurve, waveformData,
    // ct_calculations.py CTCalculator
    calculateSingleCore, routeCore, coreMetadata, getAlfOrVk, SECURITY_FACTOR_C,
    // Expose submodules for direct access
    materials:        CTMaterials,
    cableRes:         CTCableRes,
    overcurrent:      CTOvercurrent,
    metering:         CTMetering,
    busbar:           CTBusbar,
    generic:          CTGeneric,
    distance:         CTDistance,
    transformer_diff: CTTransformerDiff,
    zone:             CTTransformerDiff.zone,   // the 87T zone check (#135)
    line_diff:        CTLineDiff,
    auto_reclosure:   CTAutoReclosure,
    vt:               CTVT,
  };
})();
