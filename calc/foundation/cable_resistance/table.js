'use strict';
/**
 * foundation/cable_resistance/table.js — the `table` method of the
 * cable-resistance toolbox (PORTING_PLAN.md §9.2 / §9.3).
 *
 * R′20 comes from the IEC 60228 Table 2 values (CTMaterials.IEC_60228, Class 2
 * stranded, max DC resistance at 20 °C, Ω/km) — the reference is the Python tool's
 * materials.get_dc_resistance_per_km. For a size/material the table has no
 * value for (5 mm², Al 0.5–1.0 mm², odd sizes), R′20 falls back to the IEC
 * 60287 formula (CTCableRes.formulaR20), exactly as the Python does — but not
 * silently: `source` becomes 'iec60287_fallback', the cable_r20 step says so
 * and a warning is added (§9.7 Q5).
 *
 * The temperature/length law is the shared one (CTCableRes.conductorAtTemp).
 */

CTCableRes.methods.table = (() => {
  const id = 'table';

  // IEC 60228 value (copper or aluminium column), or null when the table has
  // none (size missing, or the aluminium column is empty for that size).
  function lookupR20(isAl, crossSectionMm2) {
    const table = CTMaterials.IEC_60228;
    const key = String(crossSectionMm2);
    if (!Object.prototype.hasOwnProperty.call(table, key)) return null;
    const value = table[key][isAl ? 1 : 0];
    return value == null ? null : value;
  }

  function calculate(np) {
    const { material, cross_section_mm2 } = np;
    const isAl = material === CTCableRes.MATERIAL_AL;
    const matEn = isAl ? 'aluminium' : 'copper';
    const matDa = isAl ? 'aluminium' : 'kobber';
    const tableR20 = lookupR20(isAl, cross_section_mm2);
    const fallback = tableR20 === null;
    const iecRho = CTCableRes.iecRho20(material);
    const r20_per_km = fallback ? CTCableRes.formulaR20(material, cross_section_mm2) : tableR20;
    const source = fallback ? 'iec60287_fallback' : 'iec60228_table';

    const warnings = fallback
      ? [`IEC 60228 has no ${matEn} value for ${cross_section_mm2} mm²; `
        + "R'20 calculated with the IEC 60287 formula instead"]
      : [];

    const r20Step = fallback
      ? CTStep.make({
        key: 'cable_r20',
        label_en: `DC resistance per km at 20 °C (${matEn}, ${cross_section_mm2} mm² not in IEC 60228: IEC 60287 formula used, ρ20 = ${CTCableRes.fmtRho(iecRho)} Ω·mm²/m from IEC 60287-1-1 Table 1)`,
        label_da: `DC-modstand pr. km ved 20 °C (${matDa}, ${cross_section_mm2} mm² findes ikke i IEC 60228: IEC 60287-formel brugt, ρ20 = ${CTCableRes.fmtRho(iecRho)} Ω·mm²/m fra IEC 60287-1-1 tabel 1)`,
        latex: "R'_{20} = \\frac{\\rho_{20}}{A} \\cdot 1000",
        variables: { rho_20: iecRho, A: cross_section_mm2 },
        result: r20_per_km, unit: 'Ω/km', source, rho_source: 'iec60287_1_1',
      })
      : CTStep.make({
        key: 'cable_r20',
        label_en: `DC resistance per km at 20 °C (IEC 60228 table, ${matEn}, ${cross_section_mm2} mm²)`,
        label_da: `DC-modstand pr. km ved 20 °C (IEC 60228-tabel, ${matDa}, ${cross_section_mm2} mm²)`,
        latex: "R'_{20} = R'_{20,\\mathrm{IEC\\,60228}}(A)",
        variables: { A: cross_section_mm2 },
        result: r20_per_km, unit: 'Ω/km', source,
      });

    // The table has no single ρ (R′20 is per cross-section); only the fallback
    // uses one, always the IEC value — the project's manual ρ20 (#132)
    // belongs to the formula method and is never read here.
    const law = CTCableRes.conductorAtTemp(np, r20_per_km, fallback ? iecRho : null);
    return {
      source,
      rho20: fallback ? iecRho : null,
      rho_source: fallback ? 'iec60287_1_1' : null,
      rho_t: law.rho_t,
      r20_per_km,
      r_per_km_at_temp: law.r_per_km_at_temp,
      r_conductor: law.r_conductor,
      warnings,
      steps: [r20Step, ...law.steps],
    };
  }

  return {
    id,
    label_en: 'IEC 60228 (table)',
    label_da: 'IEC 60228 (tabel)',
    calculate,
  };
})();
