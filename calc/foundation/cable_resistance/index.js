'use strict';
/**
 * foundation/cable_resistance/index.js — public API of the cable-resistance
 * toolbox (PORTING_PLAN.md §9.2). Loaded last in the folder, after the method
 * files have registered on CTCableRes.methods, so a new method is one file +
 * one <script> line and needs no edit here.
 *
 *   calculate(method, params)                → per-conductor result
 *   lead(method, params, topology, case)     → calculate + applyTopology
 *   listMethods() / listTopologies()         → registries for the UI and tests
 *   resolveMethod(commonData)                → project method, else default
 *   resistivity(system)                      → the ρ20 / α / ρ(T) a project uses (#132)
 *   (topology.js: applyTopology / defaultTopology / resolveTopology)
 */

CTCableRes.DEFAULT_METHOD = 'iec60287';
CTCableRes.DEFAULT_TEMP_C = CTMaterials.MAX_CONDUCTOR_TEMP;   // 75 °C
CTCableRes.DEFAULT_TOPOLOGY = 'six_wire';                     // applyTopology's fallback only; modules pass resolveTopology(core, calcType) (§9.8)

(() => {
  const hasMethod = (id) =>
    typeof id === 'string' && Object.prototype.hasOwnProperty.call(CTCableRes.methods, id);

  // ── calculate(method, params) ─────────────────────────────────────────
  // Throws Error for an unknown method id, RangeError for bad params (see
  // normaliseParams). The method module returns { source, r20_per_km,
  // r_per_km_at_temp, r_conductor, warnings?, steps }; this stamps `method`
  // and the normalised material fields.
  function calculate(method, params) {
    if (!hasMethod(method)) {
      throw new Error(`unknown cable resistance method: ${method}`);
    }
    const np = CTCableRes.normaliseParams(params);
    const r = CTCableRes.methods[method].calculate(np);
    return {
      method,
      source: r.source,
      rho20: r.rho20 ?? null,
      rho_source: r.rho_source ?? null,
      rho_t: r.rho_t ?? null,
      material: np.material,
      material_name: np.material_name,
      alpha: np.alpha,
      r20_per_km: r.r20_per_km,
      r_per_km_at_temp: r.r_per_km_at_temp,
      r_conductor: r.r_conductor,
      warnings: r.warnings ? [...r.warnings] : [],
      steps: r.steps ? [...r.steps] : [],
    };
  }

  // ── lead(method, params, topology, currentCase) ───────────────────────
  // What every protection module calls, once per core; feeds r_loop into
  // its math.
  function lead(method, params, topology, currentCase) {
    const r = calculate(method, params);
    const t = CTCableRes.applyTopology(r, topology, currentCase);
    return {
      ...r,
      topology: t.topology,
      current_case: t.current_case,
      factor: t.factor,
      r_loop: t.r_loop,
      steps: [...r.steps, ...t.steps],
    };
  }

  // ── listMethods() — default method first (D7), then registration order ──
  function listMethods() {
    const ids = Object.keys(CTCableRes.methods);
    ids.sort((a, b) => (b === CTCableRes.DEFAULT_METHOD) - (a === CTCableRes.DEFAULT_METHOD));
    return ids.map((id) => {
      const m = CTCableRes.methods[id];
      return { id, label_en: m.label_en, label_da: m.label_da };
    });
  }

  // ── listTopologies() ──────────────────────────────────────────────────
  // `factor` is the worst-case (largest) k over the current cases; the
  // per-case values are in `factors`.
  function listTopologies() {
    return Object.values(CTCableRes.topology).map((t) => ({
      id: t.id,
      factor: Math.max(...Object.values(t.factors)),
      factors: { ...t.factors },
      label_en: t.label_en,
      label_da: t.label_da,
    }));
  }

  // ── resolveMethod(commonData) ─────────────────────────────────────────
  // The project's method if it is a registered id; an unknown id from a
  // saved project maps to the default instead of throwing.
  function resolveMethod(commonData) {
    const id = commonData ? commonData.cable_r_method : undefined;
    return hasMethod(id) ? id : CTCableRes.DEFAULT_METHOD;
  }

  // ── resistivity(system) — what the Station Data card and the RTF show ──
  // The resistivity a project's method uses, per metal, with no default
  // anywhere: a value the user did not enter stays null.
  //   method   registered id or null (no resolveMethod default here)
  //   uses_rho true for the formula method; the table method has no single ρ
  //   mode     'iec' | 'manual' | null; a formula project saved before #132
  //            (cable_rho_mode absent) reads as 'iec' with legacy: true
  //   cu / al  { rho20, alpha, rho_t } — rho_t only with a cable temperature
  // α is always the IEC 60287-1-1 value (CTMaterials).
  const RHO_MODES = ['iec', 'manual'];
  // Allowed manual ρ20, Ω·mm²/m (CTRequired's rule; also catches Ω·m or µΩ·cm)
  const RHO20_RANGE = [0.01, 0.05];
  function resistivity(system) {
    const s = system || {};
    const method = hasMethod(s.cable_r_method) ? s.cable_r_method : null;
    const uses_rho = method === 'iec60287';
    const legacy = uses_rho && s.cable_rho_mode === undefined;
    const mode = !uses_rho ? null : legacy ? 'iec' : (RHO_MODES.includes(s.cable_rho_mode) ? s.cable_rho_mode : null);
    const temp_c = typeof s.cable_temp === 'number' && Number.isFinite(s.cable_temp) ? s.cable_temp : null;
    const metal = (code, material) => {
      const { alpha } = CTMaterials.getMaterialProps(material);
      let rho20 = null;
      if (mode === 'iec') rho20 = CTCableRes.iecRho20(material);
      else if (mode === 'manual') {
        const v = s[`cable_rho20_${code}`];
        // a value outside the allowed range is not shown as if it were used
        rho20 = typeof v === 'number' && v >= RHO20_RANGE[0] && v <= RHO20_RANGE[1] ? v : null;
      }
      const rho_t = rho20 != null && temp_c != null ? rho20 * (1 + alpha * (temp_c - 20)) : null;
      return { rho20, alpha, rho_t };
    };
    return {
      method, uses_rho, mode, legacy, temp_c,
      cu: metal('cu', CTCableRes.MATERIAL_CU),
      al: metal('al', CTCableRes.MATERIAL_AL),
    };
  }

  Object.assign(CTCableRes, { calculate, lead, listMethods, listTopologies, resolveMethod, resistivity, RHO_MODES, RHO20_RANGE });
})();
