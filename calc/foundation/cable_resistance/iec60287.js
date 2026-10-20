'use strict';
/**
 * foundation/cable_resistance/iec60287.js — the `iec60287` method of the
 * cable-resistance toolbox ("calculation", the project default; PORTING_PLAN.md
 * §9.2 / §9.3 / §9.7 Q3).
 *
 * R′20 comes from the IEC 60287-1 resistivity formula, R′20 = ρ20/A·1000
 * (CTCableRes.formulaR20). The reference is the Python tool's
 * materials.calculate_single_conductor_resistance (R = ρ(T)·L/A).
 * Every size has a value, so there is no fallback and no warning.
 *
 * ρ20 source (issue #132, np.rho_mode from the project's cable_rho_mode):
 *   'iec'    → IEC 60287-1-1 Table 1 (CTMaterials: Cu 0.017241, Al 0.028264
 *              Ω·mm²/m); rho_source 'iec60287_1_1';
 *   'manual' → the value the user entered for the metal (np.rho20_manual);
 *              rho_source 'manual'. α stays the IEC value.
 * Any other mode (null = not entered) or a manual value that is not a finite
 * number > 0 throws RangeError: CTCalc.calculate then returns null, so a
 * blank source is never replaced by the IEC value.
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
    let rho20, rho_source, srcEn, srcDa;
    if (np.rho_mode === 'manual') {
      rho20 = np.rho20_manual;
      if (typeof rho20 !== 'number' || !Number.isFinite(rho20) || rho20 <= 0) {
        throw new RangeError(`manual ρ20 (${matEn}) must be a number > 0, got ${rho20}`);
      }
      rho_source = 'manual';
      srcEn = 'entered manually';
      srcDa = 'indtastet manuelt';
    } else if (np.rho_mode === 'iec') {
      rho20 = CTCableRes.iecRho20(material);
      rho_source = 'iec60287_1_1';
      srcEn = 'from IEC 60287-1-1 Table 1';
      srcDa = 'fra IEC 60287-1-1 tabel 1';
    } else {
      throw new RangeError(`ρ20 source not entered (cable_rho_mode = ${np.rho_mode})`);
    }
    const r20_per_km = CTCableRes.formulaR20(material, cross_section_mm2, rho20);
    const rhoTxt = `ρ20 = ${CTCableRes.fmtRho(rho20)} Ω·mm²/m`;

    const r20Step = CTStep.make({
      key: 'cable_r20',
      label_en: `DC resistance per km at 20 °C (IEC 60287 formula, ${matEn}, ${cross_section_mm2} mm²; ${rhoTxt} ${srcEn})`,
      label_da: `DC-modstand pr. km ved 20 °C (IEC 60287-formel, ${matDa}, ${cross_section_mm2} mm²; ${rhoTxt} ${srcDa})`,
      latex: "R'_{20} = \\frac{\\rho_{20}}{A} \\cdot 1000",
      variables: { rho_20: rho20, A: cross_section_mm2 },
      result: r20_per_km, unit: 'Ω/km', source, rho_source,
    });

    const law = CTCableRes.conductorAtTemp(np, r20_per_km, rho20);
    return {
      source,
      rho20,
      rho_source,
      rho_t: law.rho_t,
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
