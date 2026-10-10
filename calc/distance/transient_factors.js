'use strict';
/**
 * distance/transient_factors.js — Port of calculations/ct_distance/transient_factors.py
 *
 * Transient dimensioning factor (Ktd) and required knee-point voltage (Vka/Vkb)
 * calculations for the full-fidelity distance protection
 * package. Consumes the Python-shaped `params` object built by distance/data.js
 * (`tp`, `iscc_max`, `primary_current`, `secondary_current`) for the step
 * latex/variables panel; the core functions take direct scalar args matching
 * the Python signatures. Extends the CTDistance namespace (calc/distance.js,
 * loaded first); composed by calc/distance/main.js.
 *
 * Note: calc/auto_reclosure.js used to carry a `calcKtdAnalytical`/
 * `getKtdFactors` pair (a pre-refactor simplified port of this same Python
 * file, in the wrong namespace). This file is the full-fidelity,
 * golden-verified replacement; the legacy copy is removed (PORTING_PLAN.md
 * §10.6 F-LEGACY).
 *
 * Warnings deviation: `get_ktd_factors_with_validation` builds its `warnings`
 * list in Python via `Translator().t(key, *args)` — i.e. actual rendered text
 * (defaulting to *Danish*, since `Translator()`'s default language is "da").
 * CTSizer's calc layer has no Translator/i18n indirection (see
 * calc/generic.js, calc/overcurrent.js, calc/distance/fault_calculation.js),
 * so — consistent with every other ported module — warnings here are kept as
 * structured `[message_key, ...args]` tuples with raw numeric args, not
 * pre-rendered text. Likewise, the Python default for an unspecified
 * `relay_type` is `t.t('relay_type_unknown')` = "Ukendt" (Danish, the same
 * Translator-default quirk); this port defaults to the English "Unknown".
 */

CTDistance.transientFactors = (() => {
  // ── calculate_ktd_analytical(t_p, t_al, t_s, frequency, duty_cycle,
  //    remanence_factor) — IEC 61869-100:2017 Annex B ─────────────────────
  function calculateKtdAnalytical(t_p, t_al, t_s = null, frequency = 50, duty_cycle = 'C-O', remanence_factor = null) {
    const t_p_sec = t_p / 1000;
    const t_al_sec = t_al / 1000;
    const omega = 2 * Math.PI * frequency;
    const ktd_max = 1 + omega * t_p_sec;

    let ktd, method_used;
    if (t_s !== null) {
      const t_s_sec = t_s / 1000;
      if (Math.abs(t_p_sec - t_s_sec) < 1e-6) {
        ktd = 1 + omega * t_p_sec * t_al_sec;
        method_used = 'simplified_equal_tc';
      } else {
        const term1 = (omega * t_p_sec * t_s_sec) / (t_p_sec - t_s_sec);
        const term2 = Math.exp(-t_al_sec / t_p_sec) - Math.exp(-t_al_sec / t_s_sec);
        ktd = term1 * term2 + 1;
        method_used = 'analytical_full';
      }
    } else {
      ktd = (omega * t_p_sec + 1) * (1 - Math.exp(-t_al_sec / t_p_sec));
      method_used = 'analytical_simplified';
    }

    if (duty_cycle === 'C-O-C-O') {
      const k_remanence = remanence_factor !== null ? remanence_factor : 0.10;
      const k_rem = 1.0 / (1.0 - k_remanence);
      ktd *= k_rem;
      method_used += '_auto_reclosure';
    }

    return { ktd, ktd_max, t_al_used: t_al, method_used };
  }

  // ── calculate_tal_from_ktd(t_p, k_td, frequency) — inverse of the
  //    simplified analytical formula ──────────────────────────────────────
  function calculateTalFromKtd(t_p, k_td, frequency = 50) {
    const t_p_sec = t_p / 1000;
    const omega = 2 * Math.PI * frequency;
    const omega_tp = omega * t_p_sec;
    const ratio = k_td / (omega_tp + 1);

    if (ratio >= 1.0) return Infinity;

    const t_al_sec = -t_p_sec * Math.log(1 - ratio);
    return t_al_sec * 1000;
  }

  // ── get_ktd_factors(tp) — lookup table ───────────────────────────────────
  function getKtdFactors(tp) {
    if (tp <= 30) {
      return { ktd_a: 1, ktd_b: 4, tp_range_a: 'Tp <= 30 ms', tp_range_b: 'Tp <= 30 ms' };
    }
    if (tp <= 50) {
      return { ktd_a: 2, ktd_b: 5, tp_range_a: '30 ms < Tp <= 50 ms', tp_range_b: '30 ms < Tp <= 200 ms' };
    }
    if (tp <= 100) {
      return { ktd_a: 4, ktd_b: 5, tp_range_a: '50 ms < Tp <= 100 ms', tp_range_b: '30 ms < Tp <= 200 ms' };
    }
    return { ktd_a: 4, ktd_b: 5, tp_range_a: '100 ms < Tp <= 200 ms', tp_range_b: '30 ms < Tp <= 200 ms' };
  }

  // ── get_ktd_factors_with_validation(t_p, t_al, relay_type) ───────────────
  // Analytical Ktd(b) (zone-1, the critical case) when t_al is given, with
  // Ktd(a) always taken from the lookup table (close-in faults: strong
  // signal, relay decides fast, manufacturer lookup value is appropriate).
  // Falls back to the full lookup table — with an unconditional info
  // warning — when t_al is not given.
  function getKtdFactorsWithValidation(t_p, t_al = null, relay_type = null) {
    const warnings = [];

    if (t_al !== null) {
      const { ktd: ktd_b, ktd_max: ktd_max_b, method_used: method_b } = calculateKtdAnalytical(t_p, t_al);
      void method_b; // mirrors Python's unused `method_b` from the tuple unpack
      const { ktd_a: lookup_ktd_a, ktd_b: lookup_ktd_b, tp_range_a: tp_range_a_lookup } = getKtdFactors(t_p);
      const ktd_a = lookup_ktd_a;

      const deviation_b = lookup_ktd_b !== 0 ? Math.abs(ktd_b - lookup_ktd_b) / lookup_ktd_b * 100 : 0;

      if (deviation_b > 20) {
        const implied_tal_b = calculateTalFromKtd(t_p, lookup_ktd_b);
        warnings.push(['warning_ktd_analytical_deviation', ktd_a, ktd_b, lookup_ktd_a, lookup_ktd_b, implied_tal_b, t_al]);
      }

      return {
        ktd_a, ktd_b, t_al_used: t_al, method: 'analytical', warnings,
        relay_type: relay_type || 'Unknown',
        ktd_max: ktd_max_b,
        tp_range_a: tp_range_a_lookup,
        tp_range_b: `Analytical (t_al = ${t_al} ms)`,
      };
    }

    const { ktd_a, ktd_b, tp_range_a, tp_range_b } = getKtdFactors(t_p);
    const implied_tal_a = calculateTalFromKtd(t_p, ktd_a);
    const implied_tal_b = calculateTalFromKtd(t_p, ktd_b);

    warnings.push(['info_ktd_lookup_table_assumption', implied_tal_a, implied_tal_b]);

    return {
      ktd_a, ktd_b, t_al_used: implied_tal_a, method: 'lookup_table', warnings,
      relay_type: relay_type || 'Unknown',
      tp_range_a, tp_range_b,
    };
  }

  // ── calculate_kssc(ktd, fault_current, primary_current) ──────────────────
  function calculateKssc(ktd, fault_current, primary_current) {
    return ktd * fault_current / primary_current;
  }

  // ── calculate_vka(kssc1, r_total, secondary_current, vka_factor) ─────────
  function calculateVka(kssc1, r_total, secondary_current, vka_factor = 1.3) {
    return kssc1 * r_total * secondary_current / vka_factor;
  }

  // ── calculate_vkb(kssc2, r_total, secondary_current) ──────────────────────
  function calculateVkb(kssc2, r_total, secondary_current) {
    return kssc2 * r_total * secondary_current;
  }

  // ── add_transient_factor_steps(steps, params, ktd_a, ktd_b, tp_range_a,
  //    tp_range_b, kssc1, kssc2, vka, vkb, r_total, vka_factor) ────────────
  // `kssc2`/`vkb` are accepted (matching Python's signature, which main.py
  // calls with null/None for these two) but unused in the body — Vkb gets
  // its own steps from addVkbCalculationSteps below. Section-header divider
  // from the Python is presentation-only and not ported.
  function addTransientFactorSteps(steps, params, ktd_a, ktd_b, tp_range_a, tp_range_b, kssc1, kssc2, vka, vkb, r_total, vka_factor = 1.3) {
    steps.push(CTStep.make({
      key: 'transient_dimensioning_factor_close_in',
      label_en: 'Transient dimensioning factor for close-in fault Ktd(a)',
      label_da: 'Transient dimensioneringsfaktor for close-in fejl Ktd(a)',
      latex: `${tp_range_a} \\rightarrow K_{td(a)} = ${ktd_a}`,
      variables: { Tp: params.tp },
      result: ktd_a, unit: '', precision: 0,
    }));

    steps.push(CTStep.make({
      key: 'transient_dimensioning_factor_zone1',
      label_en: 'Transient dimensioning factor for zone-1 end fault Ktd(b)',
      label_da: 'Transient dimensioneringsfaktor for zone-1 ende fejl Ktd(b)',
      latex: `${tp_range_b} \\rightarrow K_{td(b)} = ${ktd_b}`,
      variables: { Tp: params.tp },
      result: ktd_b, unit: '', precision: 0,
    }));

    steps.push(CTStep.make({
      key: 'min_required_ssc_factor_close_in',
      label_en: "Min. required symmetrical short circuit current factor for close-in fault K'ssc1",
      label_da: "Min. krævet symmetrisk kortslutningsstrømfaktor for close-in fejl K'ssc1",
      latex: "K'_{ssc1} \\geq K_{td(a)} \\cdot \\frac{I_{scc,max}}{I_{pr}}",
      variables: { Ktd_a: ktd_a, Iscc_max: params.iscc_max, Ipr: params.primary_current },
      result: kssc1, unit: '', precision: 4,
    }));

    steps.push(CTStep.make({
      key: 'min_required_knee_point_close_in',
      label_en: 'Min. required knee point voltage for close-in fault Vka',
      label_da: 'Min. krævet knæpunktspænding for close-in fejl Vka',
      latex: `V_{ka} \\geq K'_{ssc1} \\cdot R_{total} \\cdot \\frac{I_{sr}}{${vka_factor}}`,
      variables: { "K'ssc1": kssc1, Rtotal: r_total, Isr: params.secondary_current },
      result: vka, unit: 'V', precision: 2,
    }));

    return steps;
  }

  // ── add_vkb_calculation_steps(steps, params, kssc2, vkb, isc_lim,
  //    r_total) ───────────────────────────────────────────────────────────
  // Reads `params.ktd_b` for the K'ssc2 step's variable display, matching
  // the Python's reliance on the caller having set `params["ktd_b"] = ktd_b`
  // just before this call (main.py — composed later in main.js).
  function addVkbCalculationSteps(steps, params, kssc2, vkb, isc_lim, r_total) {
    steps.push(CTStep.make({
      key: 'min_required_ssc_factor_zone1',
      label_en: "Min. required symmetrical short circuit current factor for zone-1 end fault K'ssc2",
      label_da: "Min. krævet symmetrisk kortslutningsstrømfaktor for zone-1 ende fejl K'ssc2",
      latex: "K'_{ssc2} \\geq K_{td(b)} \\cdot \\frac{I_{sc,lim}}{I_{pr}}",
      variables: { Ktd_b: params.ktd_b, Isc_lim: isc_lim, Ipr: params.primary_current },
      result: kssc2, unit: '', precision: 4,
    }));

    steps.push(CTStep.make({
      key: 'min_required_knee_point_zone1',
      label_en: 'Min. required knee point voltage for zone-1 end fault Vkb',
      label_da: 'Min. krævet knæpunktspænding for zone-1 ende fejl Vkb',
      latex: "V_{kb} \\geq K'_{ssc2} \\cdot R_{total} \\cdot I_{sr}",
      variables: { "K'ssc2": kssc2, Rtotal: r_total, Isr: params.secondary_current },
      result: vkb, unit: 'V', precision: 2,
    }));

    return steps;
  }

  return {
    calculateKtdAnalytical,
    calculateTalFromKtd,
    getKtdFactors,
    getKtdFactorsWithValidation,
    calculateKssc,
    calculateVka,
    calculateVkb,
    addTransientFactorSteps,
    addVkbCalculationSteps,
  };
})();
