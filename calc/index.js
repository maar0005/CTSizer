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

  // ── The core a module gets ───────────────────────────────────────────
  // A shallow copy of the core: the distance port writes core.ar_tp when AR is
  // enabled (as main.py writes core_data["ar_tp"] into the dict ctvt_dim's GUI
  // builds fresh for every run), and `core` here is the app's stored
  // core.inputs.
  // Distance and line diff (the two AR checks) also get the CT class keys
  // ctvt_dim's GUI writes (ui/ct_widget/data_io.py): `ct_class` is the class it
  // shows, the same strings as CTSizer's ct_class_family ('5P', '5PR', 'PX',
  // 'TPY', …), and `ar_time_constant_class` = map_class_to_time_constant(class).
  // The IEC 61869-100 ODE check reads ct_class, the C-O-C-O Ktd the time
  // constant class. Keys already on the core (e.g. a converted ctvt_dim core)
  // win. A distance PX core has no `alf` there (data_io.py stores None for a
  // Vk-specified class), so its ODE check, which needs the rated ALF, does not
  // run; CTSizer keeps the ALF typed before switching to PX, and the main
  // calculation ignores it for PX (getAlfOrVk). PORTING_PLAN.md §10.6 F-AR-KEYS.
  // With ar_ts_mode 'table' (the AR card's default) `ar_ts` is the typical Ts
  // for the class the panel shows and the project voltage
  // (CTAutoReclosure.estimateTs); otherwise the stored ar_ts (blank → the
  // module default), so cores without the mode are unchanged.
  // The C-O-C-O measurement windows are the relay's time to accuracy limit
  // t_al, as ctvt_dim's GUI writes them (_add_distance_data): ar_t_al =
  // ar_t_double_al = t_al / 1000, t_al from the relay database or 25 ms for a
  // custom relay. In CTSizer t_al is the Relay Information card's relay_tal
  // (ms; blank → CTRelayDB.DEFAULT_TAL_MS), the one relay-time input, so it
  // overrides any stored ar_t_al.
  function moduleCore(type, core, commonData) {
    if (core == null) return core;
    const m = { ...core };
    const ar = type === 'distance' || type === 'line_diff';
    if (ar && core.ct_class_family != null) {
      if (m.ct_class === undefined) m.ct_class = core.ct_class_family;
      if (m.ar_time_constant_class === undefined) {
        m.ar_time_constant_class = CTBaseClasses.mapClassToTimeConstant(m.ct_class);
      }
    }
    if (ar && core.ar_ts_mode === 'table') {
      m.ar_ts = CTAutoReclosure.estimateTs(core.ct_class_family || '5P', commonData?.voltage).ts;
    }
    if (ar && core.auto_reclose_enabled) {
      const tal = (core.relay_tal ?? CTRelayDB.DEFAULT_TAL_MS) / 1000;
      m.ar_t_al = tal;
      m.ar_t_double_al = tal;
    }
    if (type === 'distance' && CTBase.getAlfOrVk(core).is_px) delete m.alf;
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
      return CTIedRating.apply(fn(m, commonData), CTIedRating.calculate(type, m, commonData));
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
    calculate, moduleCore, satCurve, waveformData,
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
    line_diff:        CTLineDiff,
    auto_reclosure:   CTAutoReclosure,
    vt:               CTVT,
  };
})();
