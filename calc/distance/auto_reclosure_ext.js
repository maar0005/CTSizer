'use strict';
/**
 * distance/auto_reclosure_ext.js — Port of calculations/ct_distance/auto_reclosure_ext.py
 *
 * Auto-reclosure (C-O-C-O duty cycle) extension for distance protection: the
 * relay-manual-lookup EAL_AR check (Kssc x Ktd x (Rct+Rb) x Isr) plus the IEC
 * 61869-100 Section 5.2.3 ODE reference method (numerical flux integration,
 * compared against the two C-O-C-O measurement windows). Built entirely on
 * already-ported foundations: CTAutoReclosure (computeKtdCoCo/computeEal/
 * getKtfPreset/generateCocoFlux) and CTBase/CTBaseClasses (calcOperatingAlf/
 * getRemanenceFactor/mapClassToTimeConstant). Extends the CTDistance
 * namespace (calc/distance.js, loaded first); composed by calc/distance/main.js.
 *
 * Not ported (presentation/file-system plumbing, not math — PORTING_PLAN.md
 * §1 non-goals): `_get_ar_preview_dir`/`get_ar_preview_path` (AR waveform
 * preview PNG lookup on disk — no PDF preview pipeline exists in CTSizer),
 * the `make_section_header` divider, and `_add_iec61869_100_ode_steps`'s 4th
 * "graph" step (a verdict string with an attached preview image, no formula
 * — same presentation-only status as every other distance/*.js section
 * header / `result["calculations"]` report dict).
 *
 * Deliberate fidelity notes:
 * - `verify_ar_adequacy`'s warning/success text is rendered by Python via
 *   `Translator()` (Danish by default) — kept here as structured
 *   `[message_key, ...args]` tuples per CTSizer's i18n-free calc-layer
 *   convention (see transient_factors.js / generic.js).
 * - Python's `add_ar_steps` only emits an "evaluation" row on the *success*
 *   path (`if is_adequate and success_message`); on failure it adds no row
 *   at all, relying solely on the warning string. This port always emits one
 *   `CTStep.conclusion()` row (is_ok true/false), matching the symmetric
 *   pass/fail-row convention used by every other CTSizer calc module
 *   (generic.js/overcurrent.js/busbar.js's `conclusion` step).
 * - The compute/build-steps split (`calculateOdeSaturationCheck` +
 *   `addOdeSaturationSteps`, analogous to distance/knee_point.js's
 *   `calculateProposedEalf` + `addKneePointSteps`) replaces Python's single
 *   inlined `_add_iec61869_100_ode_steps` — same math, factored so the ODE
 *   numbers are independently testable from the step-rendering.
 * - `core.ar_t_al`/`core.ar_ts` have *different* Python-side defaults in
 *   `compute_ar_ktd` (0.2 / 0.05 — relay-manual-lookup method) vs.
 *   `calculateOdeSaturationCheck` (0.025 / 1.0 — ODE reference method). This
 *   is a real quirk in the Python source, not a porting error — preserved
 *   exactly, not unified.
 */

CTDistance.autoReclosureExt = (() => {
  // ── compute_ar_ktd(core_data) — C-O-C-O Ktd via the shared CTAutoReclosure
  //    duty-cycle combination rule ────────────────────────────────────────
  function computeArKtd(core) {
    const t_prime = core.ar_t_prime ?? 0.1;
    const t_al = core.ar_t_al ?? 0.2;
    const tfr = core.ar_tfr ?? 0.4;
    const t_double_al = core.ar_t_double_al ?? t_prime;
    const ts = core.ar_ts ?? 0.05;
    const tcClass = core.ar_time_constant_class ?? 'low';

    const presetName = core.ar_ktf_preset;
    const ktfCurve = CTAutoReclosure.getKtfPreset(presetName || 'iec_default');

    return CTAutoReclosure.computeKtdCoCo(t_al, t_prime, tfr, t_double_al, ts, ktfCurve, tcClass);
  }

  // ── compute_ar_eal(ktd_ar, iscc_max, primary_current, rct, burden_resistance,
  //    secondary_current) — Kssc_AR = Iscc,max / Ipr, then the shared Eal
  //    formula. Returns { ealAr, ksscAr }. ─────────────────────────────────
  function computeArEal(ktdAr, isccMax, primaryCurrent, rct, burdenResistance, secondaryCurrent) {
    const ksscAr = primaryCurrent !== 0 ? isccMax / primaryCurrent : 0;
    const ealAr = CTAutoReclosure.computeEal(ksscAr, ktdAr, rct, burdenResistance, secondaryCurrent);
    return { ealAr, ksscAr };
  }

  // ── verify_ar_adequacy(eal_ar, ealf) — offered (EALF) must cover the
  //    C-O-C-O required voltage (EAL_AR). Equal counts as adequate (only
  //    strictly-less fails). ───────────────────────────────────────────────
  function verifyArAdequacy(ealAr, ealf) {
    const isAdequate = !(ealf < ealAr);
    return {
      isAdequate,
      warning: isAdequate ? null : ['warning_ar_eal_insufficient', ealf, ealAr],
      success: isAdequate ? ['success_ar_eal_adequate', ealf, ealAr] : null,
    };
  }

  // ── add_ar_steps(...) — EAL_AR row + adequacy conclusion. The IEC
  //    61869-100 ODE section is appended separately via
  //    addOdeSaturationSteps once the caller has computed it with
  //    calculateOdeSaturationCheck. ───────────────────────────────────────
  function addArSteps(steps, ealAr, ealf, ktdAr, ksscAr, rct, burdenResistance, secondaryCurrent, isAdequate) {
    steps.push(CTStep.make({
      key: 'auto_reclosure_transient_dimensioning',
      label_en: 'Auto-Reclosure transient dimensioning (C-O-C-O) EAL calculation',
      label_da: 'Auto-Reclosure transient dimensioning (C-O-C-O) EAL beregning',
      latex: 'E_{AL} = K_{ssc} \\cdot K_{td} \\cdot (R_{ct} + R_b) \\cdot I_{sr}',
      variables: { Kssc: ksscAr, Ktd: ktdAr, Rct: rct, Rb: burdenResistance, Isr: secondaryCurrent },
      result: ealAr, unit: 'V', precision: 2,
    }));

    steps.push(CTStep.conclusion({
      key: 'auto_reclosure_evaluation',
      label_en: 'Auto-Reclosure evaluation',
      label_da: 'Auto-Reclosure vurdering',
      latex: 'E_{ALF} \\geq E_{AL,AR}',
      is_ok: isAdequate,
      comparison: `${ealf.toFixed(2)} V ${isAdequate ? '≥' : '<'} ${ealAr.toFixed(2)} V`,
    }));

    return steps;
  }

  // ── _add_iec61869_100_ode_steps — math half. Mirrors the Python 1:1; the
  //    early `return`s (no core / no rated ALF / no rated burden) become a
  //    `null` result. `kssc` is the same Kssc_AR computed by compute_ar_eal.
  //    `cableResistance` is the core's lead resistance (main.js passes the
  //    toolbox r_loop, PORTING_PLAN.md §9.6); Python reads it from
  //    core_data["cable_resistance"] (default 0), a field CTSizer no longer
  //    reads (§9.7 D1).
  // ─────────────────────────────────────────────────────────────────────────
  function calculateOdeSaturationCheck(core, kssc, rct, burdenResistance, secondaryCurrent, cableResistance) {
    if (!core) return null;

    const ctClass = core.ct_class ?? '5P';
    const alfRated = core.alf;
    if (alfRated == null) return null;
    const burdenVa = core.burden;
    if (burdenVa == null) return null;

    const relayBurdenVa = core.relay_burden ?? 0;
    const rRelay = secondaryCurrent > 0 ? relayBurdenVa / (secondaryCurrent ** 2) : 0;
    const rBurdenActual = cableResistance + rRelay;
    const rBurdenRated = secondaryCurrent > 0 ? burdenVa / (secondaryCurrent ** 2) : 0;

    const alfo = CTBase.calcOperatingAlf(alfRated, rct, rBurdenRated, rBurdenActual);
    const kr = CTBaseClasses.getRemanenceFactor(ctClass);
    const timeConstantClass = CTBaseClasses.mapClassToTimeConstant(ctClass);

    const tPrime = core.ar_t_prime ?? 0.1;
    const tAl = core.ar_t_al ?? 0.025;
    const tfr = core.ar_tfr ?? 0.4;
    const tDoubleAl = core.ar_t_double_al ?? tPrime;
    const ts = core.ar_ts ?? 1.0;
    const tp = core.ar_tp ?? 0.1;

    const omega = 2.0 * Math.PI * 50.0;
    const omegaTs = omega * ts;
    const ktdFactor = Math.sqrt(1.0 + omegaTs ** 2) / Math.sqrt(2.0);

    const { times, flux } = CTAutoReclosure.generateCocoFlux(
      tPrime, tfr, tDoubleAl, tp, ts, 50.0, 1e-4, timeConstantClass, kr
    );

    const peakMw1 = maxWhere(times, flux, (t) => t <= tAl);
    const ktdMw1 = peakMw1 * ktdFactor;

    const t2 = tPrime + tfr;
    const peakMw2 = maxWhere(times, flux, (t) => t >= t2 && t <= t2 + tAl);
    const ktdMw2 = peakMw2 * ktdFactor;

    const ktdWorst = Math.max(ktdMw1, ktdMw2);
    const ksscKtdMw1 = kssc * ktdMw1;
    const ksscKtdMw2 = kssc * ktdMw2;
    const ksscKtdWorst = kssc * ktdWorst;
    const isOk = ksscKtdWorst <= alfo;

    return {
      ctClass, alfRated, rct, rBurdenRated, rBurdenActual, alfo, kr, timeConstantClass,
      omega, ts, tp, kssc,
      ktdMw1, ktdMw2, ktdWorst, ksscKtdMw1, ksscKtdMw2, ksscKtdWorst, isOk,
      warnings: ['note_worst_case_inception_angle', 'note_iec61869_ar_overhead_disclaimer'],
    };
  }

  // np.max(flux_arr[mask]) if np.any(mask) else 0 — true max over the
  // selected window (not clamped to non-negative), 0 if the window is empty.
  function maxWhere(times, values, predicate) {
    let found = false;
    let max = -Infinity;
    for (let i = 0; i < times.length; i++) {
      if (predicate(times[i])) {
        found = true;
        if (values[i] > max) max = values[i];
      }
    }
    return found ? max : 0;
  }

  // ── addOdeSaturationSteps(steps, odeResult) — operating-ALF row, ODE-Ktd
  //    row, then the saturation-check conclusion. No-op if odeResult is null
  //    (mirrors `_add_iec61869_100_ode_steps`'s early returns). ───────────
  function addOdeSaturationSteps(steps, odeResult) {
    if (!odeResult) return steps;

    const {
      alfRated, rct, rBurdenRated, rBurdenActual, alfo, omega, ts,
      kssc, ktdMw1, ktdMw2, ksscKtdMw1, ksscKtdMw2, isOk,
    } = odeResult;

    steps.push(CTStep.make({
      key: 'auto_reclosure_operating_alf',
      label_en: 'Operating accuracy limit factor (ALFo)',
      label_da: 'Drifts nøjagtighedsgrænse faktor (ALFo)',
      latex: 'ALF_o = ALF_{rated} \\cdot \\frac{R_{ct}+R_{b,rated}}{R_{ct}+R_{b,actual}}',
      variables: { ALF_rated: alfRated, Rct: rct, Rb_rated: rBurdenRated, Rb_actual: rBurdenActual },
      result: alfo, unit: '', precision: 1,
    }));

    steps.push(CTStep.make({
      key: 'auto_reclosure_ode_ktd',
      label_en: 'ODE transient dimensioning factor K_td(t)',
      label_da: 'ODE transient dimensioneringsfaktor K_td(t)',
      latex: 'K_{td}(t) = \\psi_{raw}(t) \\cdot \\frac{\\sqrt{1+(\\omega T_s)^2}}{\\sqrt{2}}',
      variables: { omega: Math.round(omega * 100) / 100, Ts: ts },
      result: Math.max(ktdMw1, ktdMw2), unit: '', precision: 2,
    }));

    steps.push(CTStep.conclusion({
      key: 'auto_reclosure_ode_saturation_check',
      label_en: 'IEC 61869-100 saturation check (C-O-C-O)',
      label_da: 'IEC 61869-100 mætningskontrol (C-O-C-O)',
      latex: 'K_{ssc} \\cdot K_{td} \\leq ALF_o',
      is_ok: isOk,
      comparison: `1st MW: ${kssc.toFixed(1)} x ${ktdMw1.toFixed(2)} = ${ksscKtdMw1.toFixed(1)}  |  ` +
        `2nd MW: ${kssc.toFixed(1)} x ${ktdMw2.toFixed(2)} = ${ksscKtdMw2.toFixed(1)}  |  ALFo = ${alfo.toFixed(1)}`,
    }));

    return steps;
  }

  return {
    computeArKtd,
    computeArEal,
    verifyArAdequacy,
    addArSteps,
    calculateOdeSaturationCheck,
    addOdeSaturationSteps,
  };
})();
