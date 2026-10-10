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

  Object.assign(CTCableRes, { calculate, lead, listMethods, listTopologies, resolveMethod });
})();
