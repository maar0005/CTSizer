'use strict';
/**
 * line_diff/auto_reclosure_ext.js — Port of calculations/ct_line_differential/auto_reclosure_ext.py
 *
 * Auto-reclosure (C-O-C-O duty cycle) extension for line differential
 * protection: the relay-manual-lookup EAL_AR check (Kssc x Ktd x (Rct+Rb) x
 * Isr). Built entirely on already-ported foundations: CTAutoReclosure
 * (computeKtdCoCo/computeEal/getKtfPreset). Extends the CTLineDiff
 * namespace (calc/line_diff.js, loaded first); composed by calc/line_diff/main.js.
 *
 * Not ported (presentation/file-system plumbing, not math — PORTING_PLAN.md
 * §1 non-goals): `_get_ar_preview_dir`/`get_ar_preview_path` (AR waveform
 * preview PNG lookup on disk — no PDF preview pipeline exists in CTSizer).
 * `compute_auto_reclosure_analysis`'s `preview_path` field is therefore
 * dropped from this port's return object.
 */

CTLineDiff.autoReclosureExt = (() => {
  // ── get_ktf_curve(preset_name) ───────────────────────────────────────────
  function getKtfCurve(presetName) {
    return CTAutoReclosure.getKtfPreset(presetName || 'iec_default');
  }

  // ── calculate_ar_ktd(ar_params, ktf_curve) ───────────────────────────────
  function calculateArKtd(arParams, ktfCurve) {
    return CTAutoReclosure.computeKtdCoCo(
      arParams.t_al,
      arParams.t_prime,
      arParams.tfr,
      arParams.t_double_al,
      arParams.ts,
      ktfCurve,
      arParams.time_constant_class
    );
  }

  // ── calculate_ar_kssc(fault_currents, primary_current) ───────────────────
  function calculateArKssc(faultCurrents, primaryCurrent) {
    const maxIt = Math.max(faultCurrents.it_max_3ph, faultCurrents.it_max_1ph);
    return primaryCurrent !== 0 ? maxIt / primaryCurrent : 0;
  }

  // ── calculate_ar_eal(kssc, ktd, rct, burden_resistance, secondary_current) ──
  function calculateArEal(kssc, ktd, rct, burdenResistance, secondaryCurrent) {
    return CTAutoReclosure.computeEal(kssc, ktd, rct, burdenResistance, secondaryCurrent);
  }

  // ── compute_auto_reclosure_analysis(ar_params, fault_currents, ct_inputs,
  //    burden_resistance) ───────────────────────────────────────────────────
  function computeAutoReclosureAnalysis(arParams, faultCurrents, ctInputs, burdenResistance) {
    if (arParams == null) return null;

    const ktfCurve = getKtfCurve(arParams.preset_name);
    const ktdAr = calculateArKtd(arParams, ktfCurve);
    const ksscAr = calculateArKssc(faultCurrents, ctInputs.primary_current);
    const ealAr = calculateArEal(ksscAr, ktdAr, ctInputs.rct, burdenResistance, ctInputs.secondary_current);

    return { eal_ar: ealAr, ktd_ar: ktdAr, kssc_ar: ksscAr };
  }

  return { getKtfCurve, calculateArKtd, calculateArKssc, calculateArEal, computeAutoReclosureAnalysis };
})();
