'use strict';
/**
 * distance/main.js — Port of calculations/ct_distance/main.py
 *
 * The composition entry for the full-fidelity distance protection package: it
 * orchestrates the eight already-ported sub-files (data / cable_resistance /
 * relay / fault_calculation / transient_factors / knee_point /
 * auto_reclosure_ext, plus the shared CTBase/CTKnee/CTMaterials/CTStep
 * foundations) into a single `CTDistance.calculate(core, commonData)`,
 * mirroring `calculate_distance_protection(common_data, core_data, cable_resistance)`
 * step-for-step.
 *
 * This sets only the `calculate` property on the existing CTDistance
 * namespace object (declared by calc/distance.js, extended by the seven
 * sub-files loaded before this one). Its legacy calculate() is removed (§9.6
 * 9D), and so is the legacy calcAutoReclosure: the results panel's AR badge,
 * steps and canvas read ar_ktd / eal_ar / kssc_ar / is_adequate / ode_is_ok
 * and the AR steps from this result (§10.6 F-AR).
 *
 * Fidelity notes (confirmed by reading ct_distance/main.py in full):
 * - Cable resistance (PORTING_PLAN.md §9.6 9C): r_lead is the toolbox's
 *   r_loop for the project method/temperature (params.cable_res), and the
 *   result carries `cable_res`. Under `table` at the same temperature this is
 *   Python's calculate_lead_resistance value. Two deliberate departures:
 *   validate_cable_resistivity is dropped (it only checked the removed
 *   dc_resistance_20 override, D1), and the AR ODE check uses r_lead where
 *   Python reads core_data["cable_resistance"] (default 0).
 * - The `conclusion` verdict ('ct_sufficient'/'ct_insufficient') is set ONCE
 *   from verify_vk_adequacy and never reassigned, even when the AR/ODE checks
 *   later flip `status` to NOT_OK. Python only overwrites a *separate*,
 *   presentation-only Danish "Konklusion" string on AR/ODE failure (no
 *   CTSizer analog) — `conclusion` itself stays fixed. Preserved exactly.
 * - `core.ar_tp = params.tp / 1000` mutates the input core object (Python does
 *   `core_data["ar_tp"] = ...`), feeding calculateOdeSaturationCheck's `tp`
 *   default-chain. Side effect preserved for fidelity.
 * - vka_factor: main.py 173-182 looks up get_relay_vka_factor(relay_name),
 *   which the Python tool's GUI never reaches (it writes relay_model). CTSizer takes
 *   it from the core's IED (CTRelayDB.vkaFactor: relay_model, else
 *   relay_name; 1.3 without one, the value every IED in the database has).
 * - get_ar_preview_path / make_section_header dividers are presentation/
 *   file-system plumbing — not ported (PORTING_PLAN.md §1 non-goals).
 * - Return object carries Python-fidelity lowercase primaries PLUS the
 *   back-compat aliases the UI reads (EALF / Vk_req / Vka / Vkb / Rc / Ktd_a /
 *   omega_Tp — ctsizer-app.jsx / ctsizer-panels.jsx buildMetrics).
 */

CTDistance.calculate = function calculate(core, commonData = {}) {
  const D = CTDistance;

  const warnings = [];
  const steps = [];

  // ── Input extraction (extract_distance_inputs) ────────────────────────
  const params = D.data.extractDistanceInputs(core, commonData);

  // ── Cable lead resistance (CTCableRes, PORTING_PLAN.md §9) ───────────
  // The one toolbox call per core ran in extractDistanceInputs. Python's
  // validate_cable_resistivity check is not ported any more: it compared a
  // user-supplied dc_resistance_20 with IEC 60228, and that override is gone
  // (§9.7 D1). The toolbox warnings (the table fallback) are appended last,
  // as in the other migrated modules.
  const cable = params.cable_res;
  const r_lead = cable.r_loop;
  cable.steps.forEach((s) => steps.push(s));
  // Ik1 max above Ik3 max: params.iscc_max is Ik1 (CTFaultLevel)
  const ikStep = CTFaultLevel.governingStep(commonData.isc_sys ?? 40, commonData.isc_1ph);
  if (ikStep) steps.push(ikStep);

  // ── Relay parameters ──────────────────────────────────────────────────
  const { ratedCurrent: rated_current, relayResistance: relay_resistance } =
    D.relay.calculateRelayParameters(params);
  D.relay.addRelayParameterSteps(steps, params, rated_current, relay_resistance);

  // ── Fault calculation ─────────────────────────────────────────────────
  // Use the source-impedance validation path when an alternative fault
  // current is supplied (fault-type worst-case tracking); else the standard
  // calculation.
  let zs, rs, xs, omega_tp;
  if (params.ik_alternative != null) {
    const impedanceResult = D.faultCalculation.calculateSourceImpedanceWithValidation({
      un: params.voltage_level,
      ik_max: params.iscc_max,
      tp: params.tp,
      frequency: params.frequency,
      fault_type: params.fault_type != null ? params.fault_type : '1-phase',
      ik_alternative: params.ik_alternative,
    });
    zs = impedanceResult.zs;
    rs = impedanceResult.rs;
    xs = impedanceResult.xs;
    omega_tp = impedanceResult.omega_tp;
    // Fault-type comparison warnings (structured; Python renders these to
    // text via Translator — kept structured per CTSizer's i18n-free convention).
    impedanceResult.warnings.forEach((w) => warnings.push(w));
  } else {
    ({ zs, rs, xs, omega_tp } = D.faultCalculation.calculateSourceImpedance(params));
  }

  const { rl, xl } = D.faultCalculation.calculateZone1Impedance(params);
  const { rsc, xsc, zsc, isc_lim } =
    D.faultCalculation.calculateZone1FaultCurrent(rs, xs, rl, xl, params.voltage_level);
  const faultStepResult =
    D.faultCalculation.addFaultCalculationSteps(
      steps, params, zs, rs, xs, omega_tp, rl, xl, rsc, xsc, zsc, isc_lim
    );
  // Numerical-precision guard warnings (dead code for valid inputs, empty here).
  faultStepResult.warnings.forEach((w) => warnings.push(w));

  // ── Transient factors (analytical if relay_tal given, else lookup) ────
  const t_al = core.relay_tal != null ? core.relay_tal : null;
  const relay_type = core.relay_type != null ? core.relay_type : null;
  const ktdResult = D.transientFactors.getKtdFactorsWithValidation(params.tp, t_al, relay_type);
  const ktd_a = ktdResult.ktd_a;
  const ktd_b = ktdResult.ktd_b;
  const method_used = ktdResult.method;
  ktdResult.warnings.forEach((w) => warnings.push(w));

  const tp_range_a = ktdResult.tp_range_a != null ? ktdResult.tp_range_a : `Tp = ${params.tp} ms`;
  const tp_range_b = ktdResult.tp_range_b != null ? ktdResult.tp_range_b : `Tp = ${params.tp} ms`;

  // Total secondary resistance: R_total = Rct + R_lead + R_relay
  const r_total = params.rct + r_lead + relay_resistance;
  steps.push(CTStep.make({
    key: 'total_secondary_resistance_sum',
    label_en: 'Total secondary resistance',
    label_da: 'Total sekundær modstand',
    latex: 'R_{total} = R_{ct} + R_{lead} + R_{relay}',
    variables: { Rct: params.rct, R_lead: r_lead, R_relay: relay_resistance },
    result: r_total, unit: 'Ω', precision: 4,
  }));

  // vka_factor: the IED's close-in Vka divisor (default 1.3)
  const vka_factor = CTRelayDB.vkaFactor(core);

  // K'ssc1 (close-in) and Vka
  const kssc1 = D.transientFactors.calculateKssc(ktd_a, params.iscc_max, params.primary_current);
  const vka = D.transientFactors.calculateVka(kssc1, r_total, params.secondary_current, vka_factor);

  // Methodology note for the analytical path (mirrors main.py 189-202).
  if (method_used === 'analytical') {
    steps.push(CTStep.make({
      key: 'ktd_methodology_description',
      label_en: 'K_td methodology',
      label_da: 'K_td metode',
      latex: '',
      result: 'analytical_iec_61869_100_2017', unit: '', precision: 0,
    }));
  }

  // Ktd / Vka steps (kssc2/vkb passed as null — they get their own steps below).
  D.transientFactors.addTransientFactorSteps(
    steps, params, ktd_a, ktd_b, tp_range_a, tp_range_b,
    kssc1, null, vka, null, r_total, vka_factor
  );

  // K'ssc2 (zone-1 end) and Vkb
  const kssc2 = D.transientFactors.calculateKssc(ktd_b, isc_lim, params.primary_current);
  const vkb = D.transientFactors.calculateVkb(kssc2, r_total, params.secondary_current);

  // Vkb steps need ktd_b on params for the K'ssc2 row's variable display.
  params.ktd_b = ktd_b;
  D.transientFactors.addVkbCalculationSteps(steps, params, kssc2, vkb, isc_lim, r_total);

  // ── Knee-point voltage verification ───────────────────────────────────
  const vk_required = D.kneePoint.calculateRequiredVk(vka, vkb);
  const { ealf, is_px } = D.kneePoint.calculateProposedEalf(
    core, params.burden_va, params.secondary_current, params.rct
  );
  D.kneePoint.addKneePointSteps(
    steps, vka, vkb, vk_required, ealf, is_px, core,
    params.burden_va, params.secondary_current, params.rct
  );

  // Adequacy verdict (set ONCE; never reassigned even if AR/ODE flips status).
  const adequacy = CTKnee.verifyVkAdequacy(ealf, vk_required, is_px);
  let status = adequacy.status;
  const conclusion = adequacy.conclusion;
  if (adequacy.warning) warnings.push(adequacy.warning);

  const vk_label = is_px ? 'Vk' : 'EALF';
  steps.push(CTStep.conclusion({
    key: 'conclusion_comparison',
    label_en: 'Conclusion',
    label_da: 'Konklusion',
    latex: `${vk_label} \\geq V_{k,req}`,
    is_ok: status === 'OK',
    comparison: `${ealf.toFixed(2)} V ${status === 'OK' ? '≥' : '<'} ${vk_required.toFixed(2)} V`,
  }));

  // ── Auto-reclosure extension (if enabled) ─────────────────────────────
  let ar_ktd = null, eal_ar = null, kssc_ar = null, is_adequate = null, ode_is_ok = null;
  if (core.auto_reclose_enabled) {
    ar_ktd = D.autoReclosureExt.computeArKtd(core);

    if (ar_ktd != null) {
      const burden_resistance =
        params.burden_va / (params.secondary_current * params.secondary_current);
      ({ ealAr: eal_ar, ksscAr: kssc_ar } = D.autoReclosureExt.computeArEal(
        ar_ktd, params.iscc_max, params.primary_current, params.rct,
        burden_resistance, params.secondary_current
      ));

      if (eal_ar != null) {
        // Mutate core (feeds the ODE check's tp default-chain) — Python does
        // core_data["ar_tp"] = params["tp"]/1000 here too.
        core.ar_tp = params.tp / 1000.0;

        const ar = D.autoReclosureExt.verifyArAdequacy(eal_ar, ealf);
        is_adequate = ar.isAdequate;

        D.autoReclosureExt.addArSteps(
          steps, eal_ar, ealf, ar_ktd, kssc_ar, params.rct,
          burden_resistance, params.secondary_current, is_adequate
        );

        if (ar.warning) warnings.push(ar.warning);
        // AR-adequacy failure flips the overall status (Bug 1 fix in Python).
        if (!is_adequate) status = 'NOT_OK';

        // IEC 61869-100 ODE saturation check (the `burden_resistance` arg is
        // accepted but unused inside — kept for signature fidelity).
        // The cable resistance in its operating-ALF burden is this core's
        // r_lead (PORTING_PLAN.md §9.6), not core.cable_resistance.
        const odeResult = D.autoReclosureExt.calculateOdeSaturationCheck(
          core, kssc_ar, params.rct, burden_resistance, params.secondary_current, r_lead
        );
        if (odeResult != null) {
          D.autoReclosureExt.addOdeSaturationSteps(steps, odeResult);
          // The two ODE notes are appended unconditionally (pass or fail).
          odeResult.warnings.forEach((w) => warnings.push(w));
          ode_is_ok = odeResult.isOk;
          // ODE saturation failure flips the overall status (Bug 3 fix).
          if (!odeResult.isOk) status = 'NOT_OK';
        }
      }
    }
  }

  const is_ok = status === 'OK';
  const margin = vk_required > 0 ? ((ealf - vk_required) / vk_required) * 100 : 0;

  cable.warnings.forEach((w) => warnings.push(w));
  const cable_res = {
    method: cable.method, source: cable.source, topology: cable.topology, factor: cable.factor,
    r_conductor: cable.r_conductor, r_loop: cable.r_loop, r20_per_km: cable.r20_per_km,
  };

  return {
    // Python-fidelity primaries
    r_lead, relay_resistance, r_total,
    zs, rs, xs, omega_tp, rl, xl, rsc, xsc, zsc, isc_lim,
    ktd_a, ktd_b, kssc1, kssc2, vka, vkb, vk_required, ealf, is_px,
    method: method_used,
    // Auto-reclosure results (null when AR disabled / skipped)
    ar_ktd, eal_ar, kssc_ar, is_adequate, ode_is_ok,
    // Back-compat aliases read by the UI (Rc: the AR canvas, PORTING_PLAN.md §9.4;
    // Ktd_a / omega_Tp: the Summary's Ktd and ωTp cards, §10.6 F-SUM)
    EALF: ealf, Vk_req: vk_required, Vka: vka, Vkb: vkb, Rc: r_lead,
    Ktd_a: ktd_a, omega_Tp: omega_tp,
    // Verdict
    conclusion, status, is_ok, margin, warnings, steps,
    cable_res,
  };
};
