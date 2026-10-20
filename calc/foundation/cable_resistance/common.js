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
 *     (commonData.cable_temp); core.cable_temp is ignored. So does the ρ20
 *     source of the formula method (commonData.cable_rho_mode 'iec' | 'manual',
 *     with cable_rho20_cu / cable_rho20_al in manual mode; issue #132).
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
  // temp_c, rho_mode, rho20_manual }. Throws RangeError for a non-finite
  // value, A ≤ 0 or L < 0. L = 0 is valid (0 Ω).
  // rho_mode / rho20_manual are passed through unchecked: only the formula
  // method reads them (iec60287.js validates them there), so a manual value
  // can never make the table method fail. A missing rho_mode (a direct call,
  // or a project saved before #132) means the IEC values.
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
    const rho_mode = params.rho_mode === undefined ? 'iec' : params.rho_mode;
    return { material, material_name, alpha, cross_section_mm2, length_m, temp_c,
      rho_mode, rho20_manual: params.rho20_manual };
  }

  // ── IEC ρ20 and the shared number formats for the step labels ─────────
  const iecRho20 = (material) => CTMaterials.getMaterialProps(normaliseMaterial(material)).rho20;
  const fmtRho = (x) => String(+x.toPrecision(6));

  // ── formulaR20(material, A) — IEC 60287 resistivity per km at 20 °C ──
  // R′20 = ρ20 / A · 1000   (Ω/km)
  function formulaR20(material, crossSectionMm2, rho20 = iecRho20(material)) {
    return rho20 / crossSectionMm2 * 1000;
  }

  // ── conductorAtTemp(np, r20_per_km, rho20) — the shared law ───────────
  // R′_T = R′20 · (1 + α·(T − 20))   (Ω/km)
  // R_c  = R′_T · L / 1000           (Ω, one conductor, one way)
  // rho20 (Ω·mm²/m) is the resistivity the formula used; with it the label
  // also shows ρ(T) = ρ20·(1 + α·(T − 20)). The table method passes none:
  // its R′20 comes per cross-section from IEC 60228, so there is no single ρ.
  function conductorAtTemp(np, r20_per_km, rho20 = null) {
    const { alpha, temp_c, length_m } = np;
    const r_per_km_at_temp = r20_per_km * (1 + alpha * (temp_c - 20));
    const r_conductor = r_per_km_at_temp * length_m / 1000;
    const rhoT = rho20 != null ? rho20 * (1 + alpha * (temp_c - 20)) : null;
    const rhoEn = rhoT != null ? `; ρ(${temp_c} °C) = ${rhoT.toFixed(6)} Ω·mm²/m` : '';

    const steps = [
      CTStep.make({
        key: 'cable_resistance_at_temp',
        label_en: `Cable resistance per km at conductor temperature (α20 = ${alpha} 1/K, IEC 60287-1-1${rhoEn})`,
        label_da: `Kabelmodstand pr. km ved ledertemperatur (α20 = ${alpha} 1/K, IEC 60287-1-1${rhoEn})`,
        latex: "R'_{T} = R'_{20} \\cdot (1 + \\alpha \\cdot (T - 20))",
        variables: rhoT != null ? { "R'_20": r20_per_km, alpha, T: temp_c, rho_T: rhoT } : { "R'_20": r20_per_km, alpha, T: temp_c },
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

    return { alpha, r_per_km_at_temp, r_conductor, rho_t: rhoT, steps };
  }

  // ── resolveParams(core, commonData, defaults) ─────────────────────────
  // Material / cross-section / length from the core (cable_material|cable_mat,
  // cable_cross_section|cable_cross, cable_length), else the module's
  // `defaults` ({ material, cross_section_mm2, length_m }). Temperature from
  // the project: commonData.cable_temp ?? DEFAULT_TEMP_C.
  // ρ20 source (formula method, #132), also from the project:
  //   cable_rho_mode absent  → a project saved before the choice existed: IEC
  //                            values, as it was calculated then (legacy);
  //   'iec' / 'manual'       → as picked; manual takes cable_rho20_cu or
  //                            cable_rho20_al for the core's metal;
  //   null (blank)           → passed on; iec60287.js refuses it, so a blank
  //                            source never falls back to IEC.
  // commonData must keep the system's own keys (spread it, do not rebuild it):
  // an absent cable_rho_mode is what marks a project as saved before #132.
  function resolveParams(core = {}, commonData = {}, defaults = {}) {
    core = core || {};
    commonData = commonData || {};
    const material = core.cable_material || core.cable_mat || defaults.material || MATERIAL_CU;
    const mode = commonData.cable_rho_mode;
    const params = {
      material,
      cross_section_mm2: core.cable_cross_section ?? core.cable_cross ?? defaults.cross_section_mm2,
      length_m: core.cable_length ?? defaults.length_m,
      temp_c: commonData.cable_temp ?? CTCableRes.DEFAULT_TEMP_C,
      rho_mode: mode === undefined ? 'iec' : mode,
    };
    if (mode === 'manual') {
      params.rho20_manual = normaliseMaterial(material) === MATERIAL_AL
        ? commonData.cable_rho20_al : commonData.cable_rho20_cu;
    }
    return params;
  }

  return {
    methods: {},
    MATERIAL_CU, MATERIAL_AL,
    normaliseMaterial, normaliseParams,
    iecRho20, fmtRho,
    formulaR20, conductorAtTemp,
    resolveParams,
  };
})();
