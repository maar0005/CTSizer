'use strict';
/**
 * foundation/cable_resistance/common.js — shared core of the cable-resistance
 * toolbox (PORTING_PLAN.md §9.2 / §9.3).
 *
 * Declares the CTCableRes namespace (methods register on CTCableRes.methods,
 * see table.js / iec60287.js) and holds what every method shares:
 *   - param normalisation + guards (material code → full string via
 *     CTMaterials.getMaterialProps; RangeError on bad numbers),
 *   - formulaR20(material, A) = ρ20/A·1000 (used by iec60287 and by the
 *     table fallback, so neither method depends on the other),
 *   - the shared law  R′_T = R′20·(1+α(T−20)),  R_c = R′_T·L/1000  and its two
 *     steps (cable_resistance_at_temp, cable_r_conductor),
 *   - resolveParams(core, commonData, defaults): the only place that reads a
 *     core / the project settings. The temperature comes from the PROJECT
 *     (commonData.cable_temp); core.cable_temp is ignored.
 *
 * The result is always ONE conductor of one-way length L. The wiring factor
 * lives in topology.js and is never applied here.
 */

const CTCableRes = (() => {

  const MATERIAL_CU = 'Kobber (Cu)';
  const MATERIAL_AL = 'Aluminium (Al)';

  // ── Material normalisation ────────────────────────────────────────────
  // UI codes 'cu'/'al' first (getMaterialProps would read 'al' as copper),
  // then the word/symbol detection of CTMaterials.getMaterialProps, which
  // defaults to copper for '' / null / unrecognised strings.
  function normaliseMaterial(material) {
    if (material != null && typeof material !== 'string') {
      throw new TypeError(`cable material must be a string, got ${typeof material}`);
    }
    const code = material ? material.trim().toLowerCase() : '';
    if (code === 'cu') return MATERIAL_CU;
    if (code === 'al') return MATERIAL_AL;
    return CTMaterials.getMaterialProps(material).name === 'Aluminium' ? MATERIAL_AL : MATERIAL_CU;
  }

  function finiteNumber(name, value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new RangeError(`${name} must be a finite number, got ${value}`);
    }
    return value;
  }

  // ── normaliseParams(params) ───────────────────────────────────────────
  // Returns { material, material_name, alpha, cross_section_mm2, length_m,
  // temp_c }. Throws RangeError for a non-finite value, A ≤ 0 or L < 0.
  // L = 0 is valid (0 Ω).
  function normaliseParams(params = {}) {
    const material = normaliseMaterial(params.material);
    const cross_section_mm2 = finiteNumber('cross_section_mm2', params.cross_section_mm2);
    const length_m = finiteNumber('length_m', params.length_m);
    const temp_c = finiteNumber('temp_c', params.temp_c);
    if (cross_section_mm2 <= 0) {
      throw new RangeError(`cross_section_mm2 must be > 0, got ${cross_section_mm2}`);
    }
    if (length_m < 0) {
      throw new RangeError(`length_m must be ≥ 0, got ${length_m}`);
    }
    const { alpha, name: material_name } = CTMaterials.getMaterialProps(material);
    return { material, material_name, alpha, cross_section_mm2, length_m, temp_c };
  }

  // ── formulaR20(material, A) — IEC 60287 resistivity per km at 20 °C ──
  // R′20 = ρ20 / A · 1000   (Ω/km)
  function formulaR20(material, crossSectionMm2) {
    const { rho20 } = CTMaterials.getMaterialProps(normaliseMaterial(material));
    return rho20 / crossSectionMm2 * 1000;
  }

  // ── conductorAtTemp(np, r20_per_km) — the shared law ──────────────────
  // R′_T = R′20 · (1 + α·(T − 20))   (Ω/km)
  // R_c  = R′_T · L / 1000           (Ω, one conductor, one way)
  function conductorAtTemp(np, r20_per_km) {
    const { alpha, temp_c, length_m } = np;
    const r_per_km_at_temp = r20_per_km * (1 + alpha * (temp_c - 20));
    const r_conductor = r_per_km_at_temp * length_m / 1000;

    const steps = [
      CTStep.make({
        key: 'cable_resistance_at_temp',
        label_en: 'Cable resistance per km at conductor temperature',
        label_da: 'Kabelmodstand pr. km ved ledertemperatur',
        latex: "R'_{T} = R'_{20} \\cdot (1 + \\alpha \\cdot (T - 20))",
        variables: { "R'_20": r20_per_km, alpha, T: temp_c },
        result: r_per_km_at_temp, unit: 'Ω/km',
      }),
      CTStep.make({
        key: 'cable_r_conductor',
        label_en: 'Resistance of one conductor (one way)',
        label_da: 'Modstand af én leder (én vej)',
        latex: "R_{c} = \\frac{R'_{T} \\cdot L}{1000}",
        variables: { "R'_T": r_per_km_at_temp, L: length_m },
        result: r_conductor, unit: 'Ω',
      }),
    ];

    return { alpha, r_per_km_at_temp, r_conductor, steps };
  }

  // ── resolveParams(core, commonData, defaults) ─────────────────────────
  // Material / cross-section / length from the core (cable_material|cable_mat,
  // cable_cross_section|cable_cross, cable_length), else the module's
  // `defaults` ({ material, cross_section_mm2, length_m }). Temperature from
  // the project: commonData.cable_temp ?? DEFAULT_TEMP_C.
  function resolveParams(core = {}, commonData = {}, defaults = {}) {
    core = core || {};
    commonData = commonData || {};
    return {
      material: core.cable_material || core.cable_mat || defaults.material || MATERIAL_CU,
      cross_section_mm2: core.cable_cross_section ?? core.cable_cross ?? defaults.cross_section_mm2,
      length_m: core.cable_length ?? defaults.length_m,
      temp_c: commonData.cable_temp ?? CTCableRes.DEFAULT_TEMP_C,
    };
  }

  return {
    methods: {},
    MATERIAL_CU, MATERIAL_AL,
    normaliseMaterial, normaliseParams,
    formulaR20, conductorAtTemp,
    resolveParams,
  };
})();
