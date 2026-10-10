'use strict';
/**
 * foundation/cable_resistance/iec60287.js — the `iec60287` method of the
 * cable-resistance toolbox ("calculation", the project default; PORTING_PLAN.md
 * §9.2 / §9.3 / §9.7 Q3).
 *
 * R′20 comes from the IEC 60287-1 resistivity formula, R′20 = ρ20/A·1000
 * (CTCableRes.formulaR20, ρ20 = 0.017241 / 0.02826 Ω·mm²/m). The reference is
 * ctvt_dim materials.calculate_single_conductor_resistance (R = ρ(T)·L/A).
 * Every size has a value, so there is no fallback and no warning.
 *
 * The temperature/length law is the shared one (CTCableRes.conductorAtTemp).
 */

CTCableRes.methods.iec60287 = (() => {
  const id = 'iec60287';

  function calculate(np) {
    const { material, cross_section_mm2 } = np;
    const isAl = material === CTCableRes.MATERIAL_AL;
    const matEn = isAl ? 'aluminium' : 'copper';
    const matDa = isAl ? 'aluminium' : 'kobber';
    const source = 'iec60287_formula';
    const r20_per_km = CTCableRes.formulaR20(material, cross_section_mm2);

    const r20Step = CTStep.make({
      key: 'cable_r20',
      label_en: `DC resistance per km at 20 °C (IEC 60287 formula, ${matEn}, ${cross_section_mm2} mm²)`,
      label_da: `DC-modstand pr. km ved 20 °C (IEC 60287-formel, ${matDa}, ${cross_section_mm2} mm²)`,
      latex: "R'_{20} = \\frac{\\rho_{20}}{A} \\cdot 1000",
      variables: { rho_20: CTMaterials.getMaterialProps(material).rho20, A: cross_section_mm2 },
      result: r20_per_km, unit: 'Ω/km', source,
    });

    const law = CTCableRes.conductorAtTemp(np, r20_per_km);
    return {
      source,
      r20_per_km,
      r_per_km_at_temp: law.r_per_km_at_temp,
      r_conductor: law.r_conductor,
      warnings: [],
      steps: [r20Step, ...law.steps],
    };
  }

  return {
    id,
    label_en: 'IEC 60287 (calculation)',
    label_da: 'IEC 60287 (beregning)',
    calculate,
  };
})();
