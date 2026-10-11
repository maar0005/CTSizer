'use strict';
/**
 * transformer_diff/formatting.js — Port of
 * calculations/ct_transformer_differential/formatting.py
 *
 * Step-row builders for transformer differential protection: transformer data,
 * the IEC 61869 ALF method (burden → operating ALF → requirements 1–4 →
 * verification), the G. Ziegler method (Kssc → ALF requirements → check), the
 * E.m.f. method (relay resistance → three EMF scenarios → required Vk →
 * offered/specified Vk), plus the final verdict.
 *
 * Like ct_line_differential/formatting.py, these functions are genuinely called
 * by ct_transformer_differential/main.py — so this port emits CTSizer-native
 * CTStep rows (key/label_en/label_da/latex/result/unit) rather than 1:1 Python
 * dict-string mirrors. `key` is the StepNames value; EN/DA labels come from
 * pdf/locales/{en,da}.json's `calc_*` keys. Where Python's row has no single
 * number behind it, the Python string/token is kept (transformer-data result,
 * IEC "Krav 1–4" strings, `status: 'passed'|'failed'|'not_applicable_px'`).
 * Multi-row builders return arrays in the Python order.
 *
 * create_section_header / create_subsection_header (presentation-only divider
 * rows) are not ported, consistent with every other calc/*.js module.
 *
 * Extends the CTTransformerDiff namespace (calc/transformer_diff.js, loaded
 * first); consumed by calc/transformer_diff/main.js.
 */

CTTransformerDiff.formatting = (() => {
  const { IEC_CONSTANTS } = CTTransformerDiff.presets;
  const passFail = (ok) => (ok ? 'passed' : 'failed');

  // ── format_transformer_data_step(...) ───────────────────────────────────
  // Python result string: "It,max = {it/1000:.2f} kA, Ik,max = {ik/1000:.2f} kA".
  function formatTransformerDataStep(linkedWinding, trafoRatedPower, zPercent, trafoPrimaryVoltage,
                                     iRated, trafoItMax, trafoIkMax) {
    return CTStep.make({
      key: 'transformer_data',
      label_en: 'Transformer Data',
      label_da: 'Transformerdata',
      latex: `U_r = ${trafoPrimaryVoltage} \\, kV, \\; I_r = ${iRated.toFixed(3)} \\, kA`,
      variables: { Ur: trafoPrimaryVoltage, Ir: iRated, It_max: trafoItMax, Ik_max: trafoIkMax },
      result: `It,max = ${(trafoItMax / 1000).toFixed(2)} kA, Ik,max = ${(trafoIkMax / 1000).toFixed(2)} kA`,
      unit: '',
      _linked_winding: linkedWinding,
      _trafo_rated_power: trafoRatedPower,
      _z_percent: zPercent,
    });
  }

  // ── format_cable_burden_step(...) ────────────────────────────────────────
  // main.js passes the CTCableRes topology factor as kWire and the toolbox's
  // equivalent ρ_T (PORTING_PLAN.md §9.6 9C), not IEC_CONSTANTS.k_wire.
  function formatCableBurdenStep(kWire, rhoT, cableLength, cableCrossSection, secondaryCurrent, sWire) {
    return CTStep.make({
      key: 'cable_burden',
      label_en: 'Cable burden',
      label_da: 'Kabelbyrde',
      latex: 'S_{wire} = \\frac{k_{wire} \\cdot \\rho \\cdot l_{wire}}{a_{wire}} \\cdot I_{sr}^2',
      variables: { k_wire: kWire, rho: rhoT, l_wire: cableLength, a_wire: cableCrossSection, Isr: secondaryCurrent },
      result: sWire, unit: 'VA', precision: 4,
    });
  }

  // ── format_total_burden_step(...) ────────────────────────────────────────
  function formatTotalBurdenStep(relayBurden, sWire, sTotal) {
    return CTStep.make({
      key: 'total_burden',
      label_en: 'Total burden',
      label_da: 'Total byrde',
      latex: 'S_{total} = S_{relay} + S_{add} + S_{wire}',
      variables: { S_relay: relayBurden, S_add: 0, S_wire: sWire },
      result: sTotal, unit: 'VA', precision: 4,
    });
  }

  // ── format_ct_burden_step(...) ───────────────────────────────────────────
  function formatCtBurdenStep(rct, secondaryCurrent, sCt) {
    return CTStep.make({
      key: 'internal_burden',
      label_en: 'Internal burden',
      label_da: 'Intern byrde',
      latex: 'S_{ct} = R_{ct} \\cdot I_{sr}^2',
      variables: { Rct: rct, Isr: secondaryCurrent },
      result: sCt, unit: 'VA', precision: 4,
    });
  }

  // ── format_operating_alf_step(...) ───────────────────────────────────────
  function formatOperatingAlfStep(alf, burdenVa, sCt, sTotal, alfO) {
    return CTStep.make({
      key: 'operational_alf',
      label_en: 'Operational ALF (ALFo)',
      label_da: 'Operationel ALF (ALFo)',
      latex: 'ALF_O = ALF_r \\cdot \\frac{S_r + S_{ct}}{S_{total} + S_{ct}}',
      variables: { ALF_r: alf, S_r: burdenVa, S_ct: sCt, S_total: sTotal },
      result: alfO, unit: '', precision: 3,
    });
  }

  // ── format_iec_requirement_steps(...) → [req1, req2, Iref, Fadap] ────────
  // extFaultFactor / intFaultFactor: the IED's factors, shown in the formulas
  // (CTSizer addition, issue #93; the Python prints 1.5 and 0.4 always).
  function formatIecRequirementSteps(alfExtRequired, alfIntRequired, trafoItMax, trafoIkMax,
                                     primaryCurrent, iRef, trafoRatedPower, trafoPrimaryVoltage, fAdap,
                                     extFaultFactor = IEC_CONSTANTS.ext_fault_factor,
                                     intFaultFactor = IEC_CONSTANTS.int_fault_factor) {
    return [
      CTStep.make({
        key: 'requirement_1_alf_external_fault',
        label_en: 'Requirement 1: ALF for external fault',
        label_da: 'Krav 1: ALF for ekstern fejl',
        latex: `ALF_{ext} = ${extFaultFactor} \\cdot \\frac{I_{sc,max,ext}}{I_{pr}}`,
        variables: { Isc_max_ext: trafoItMax, Ipr: primaryCurrent },
        result: alfExtRequired, unit: '', precision: 2,
      }),
      CTStep.make({
        key: 'requirement_2_alf_internal_fault',
        label_en: 'Requirement 2: ALF for internal fault',
        label_da: 'Krav 2: ALF for intern fejl',
        latex: `ALF_{int} = ${intFaultFactor} \\cdot \\frac{I_{sc,max,int}}{I_{pr}}`,
        variables: { Isc_max_int: trafoIkMax, Ipr: primaryCurrent },
        result: alfIntRequired, unit: '', precision: 2,
      }),
      CTStep.make({
        key: 'reference_current',
        label_en: 'Reference current (Iref)',
        label_da: 'Reference strøm (Iref)',
        latex: 'I_{ref} = \\frac{S_{ref}}{\\sqrt{3} \\cdot U_{r,side}}',
        variables: { S_ref: trafoRatedPower, U_r_side: trafoPrimaryVoltage },
        result: iRef, unit: 'kA', precision: 3,
      }),
      CTStep.make({
        key: 'adaptation_factor',
        label_en: 'Adaptation factor (Fadap)',
        label_da: 'Adaptionfaktor (Fadap)',
        latex: 'F_{adap} = \\frac{I_{pr}}{I_{ref}}',
        variables: { Ipr_kA: primaryCurrent / 1000, Iref: iRef },
        result: fAdap, unit: '', precision: 3,
      }),
    ];
  }

  // ── format_iec_verification_steps(iec_results) ──────────────────────────
  // One row per "Krav i: …" string from checkAllIecRequirements; key
  // `iec_requirement_{i}` (1-based), the Python string becomes `result`.
  function formatIecVerificationSteps(iecResults) {
    const LABELS = [
      ['IEC Req. 1 (external)', 'IEC Krav 1 (ekstern)'],
      ['IEC Req. 2 (internal)', 'IEC Krav 2 (intern)'],
      ['IEC Req. 3 (minimum)', 'IEC Krav 3 (minimum)'],
      ['IEC Req. 4 (Fadap)', 'IEC Krav 4 (Fadap)'],
    ];
    return (iecResults || []).map((text, idx) => {
      const i = idx + 1;
      const [en, da] = LABELS[idx] || [`IEC Req. ${i}`, `IEC Krav ${i}`];
      return CTStep.make({
        key: `iec_requirement_${i}`,
        label_en: en,
        label_da: da,
        latex: '',
        result: text, unit: '',
      });
    });
  }

  // ── format_ziegler_steps(...) → [Kssc,int, Kssc,ext, ALFext, ALFreq]
  // The internal fault term is the Siemens 7UT8 Requirement 2, 0.4·Kssc,int, in
  // the combined row (= IEC Req. 2). The former 0.5·Kssc,int row had no
  // traceable G. Ziegler source and is removed (issue #87).
  function formatZieglerSteps(ksscInt, ksscExt, trafoIkMax, trafoItMax, primaryCurrent,
                              siemensAlfIntReq, siemensAlfExtReq, siemensAlfRequired) {
    return [
      CTStep.make({
        key: 'symmetrical_short_circuit_factor_internal',
        label_en: 'Symmetrical short circuit factor (internal)',
        label_da: 'Symmetrisk kortslutningsfaktor (intern)',
        latex: 'K_{ssc,int} = \\frac{I_{sc,max,int}}{I_{pr}}',
        variables: { Isc_max_int: trafoIkMax, Ipr: primaryCurrent },
        result: ksscInt, unit: '', precision: 2,
      }),
      CTStep.make({
        key: 'symmetrical_short_circuit_factor_external',
        label_en: 'Symmetrical short circuit factor (external)',
        label_da: 'Symmetrisk kortslutningsfaktor (ekstern)',
        latex: 'K_{ssc,ext} = \\frac{I_{sc,max,ext}}{I_{pr}}',
        variables: { Isc_max_ext: trafoItMax, Ipr: primaryCurrent },
        result: ksscExt, unit: '', precision: 2,
      }),
      CTStep.make({
        key: 'required_alf_external_fault_ziegler',
        label_en: 'Required ALF for external fault (G. Ziegler)',
        label_da: 'Krævet ALF for ekstern fejl (G. Ziegler)',
        latex: 'ALF_{req,ext} = 1.5 \\cdot K_{ssc,ext}',
        variables: { Kssc_ext: ksscExt },
        result: siemensAlfExtReq, unit: '', precision: 2,
      }),
      CTStep.make({
        key: 'required_alf_siemens_combined',
        label_en: 'Required ALF (Siemens combined)',
        label_da: 'Krævet ALF (Siemens samlet)',
        latex: 'ALF_{req} = \\max(0.4 \\cdot K_{ssc,int}, ALF_{req,ext}, 12.5)',
        variables: { Kssc_int: ksscInt, ALF_req_ext: siemensAlfExtReq },
        result: siemensAlfRequired, unit: '', precision: 2,
      }),
    ];
  }

  // ── format_emf_steps(...) → [Rrelay, E_int, E_through, E_inrush, Vk_req] ─
  function formatEmfSteps(rRelay, relayBurden, secondaryCurrent, eInternal, eThrough, eInrush,
                          trafoIkMax, trafoItMax, inrushFactor, primaryCurrent, rct,
                          cableResistance, vkRequired) {
    const loop = { Isr: secondaryCurrent, Ipr: primaryCurrent, Rct: rct, Rlead: cableResistance, Rrelay: rRelay };
    return [
      CTStep.make({
        key: 'relay_resistance',
        label_en: 'Relay resistance',
        label_da: 'Relæmodstand',
        latex: 'R_{relay} = \\frac{S_R}{I_R^2}',
        variables: { SR: relayBurden, IR: secondaryCurrent },
        result: rRelay, unit: 'Ω', precision: 4,
      }),
      CTStep.make({
        key: 'emf_internal_fault',
        label_en: 'E.m.f. for internal fault',
        label_da: 'E.m.f. for intern fejl',
        latex: 'E_{int} = I_{k,max} \\cdot \\frac{I_{sr}}{I_{pr}} \\cdot (R_{ct} + R_{lead} + R_{relay})',
        variables: { Ik_max: trafoIkMax, ...loop },
        result: eInternal, unit: 'V', precision: 2,
      }),
      CTStep.make({
        key: 'emf_through_fault',
        label_en: 'E.m.f. for through fault',
        label_da: 'E.m.f. for through fejl',
        latex: 'E_{through} = 2 \\cdot I_{t,max} \\cdot \\frac{I_{sr}}{I_{pr}} \\cdot (R_{ct} + R_{lead} + R_{relay})',
        variables: { It_max: trafoItMax, ...loop },
        result: eThrough, unit: 'V', precision: 2,
      }),
      CTStep.make({
        key: 'emf_inrush_current',
        label_en: 'E.m.f. for inrush current',
        label_da: 'E.m.f. for indkoblingsstrøm',
        latex: 'E_{inrush} = k_{inrush} \\cdot I_{pr} \\cdot \\frac{I_{sr}}{I_{pr}} \\cdot (R_{ct} + R_{lead} + R_{relay})',
        variables: { k_inrush: inrushFactor, ...loop },
        result: eInrush, unit: 'V', precision: 2,
      }),
      CTStep.make({
        key: 'required_knee_point_voltage',
        label_en: 'Required knee point voltage',
        label_da: 'Krævet knæpunktspænding',
        latex: 'V_k = \\max(E_{int}, E_{through}, E_{inrush})',
        variables: { E_int: eInternal, E_through: eThrough, E_inrush: eInrush },
        result: vkRequired, unit: 'V', precision: 2,
      }),
    ];
  }

  // ── format_specified_vk_step(vk_specified, ealf) ─────────────────────────
  function formatSpecifiedVkStep(vkSpecified, ealf) {
    return CTStep.make({
      key: 'specified_knee_point_voltage_px',
      label_en: 'Specified knee point voltage (PX class)',
      label_da: 'Specificeret knæpunktspænding (PX klasse)',
      latex: 'V_k = V_{k,spec}',
      variables: { Vk_spec: vkSpecified },
      result: ealf, unit: 'V', precision: 2,
    });
  }

  // ── format_offered_vk_step(alf, Isr, Rct, Rb, ealf) ──────────────────────
  function formatOfferedVkStep(alf, secondaryCurrent, rct, burdenResistance, ealf) {
    return CTStep.make({
      key: 'offered_knee_point_voltage_alf',
      label_en: 'Offered knee point voltage (from ALF)',
      label_da: 'Tilbudt knæpunktspænding (fra ALF)',
      latex: 'E_{ALF} = ALF \\cdot I_{sr} \\cdot \\left(R_{ct} + \\frac{S_n}{I_{sr}^2}\\right)',
      variables: { ALF: alf, Isr: secondaryCurrent, Rct: rct, Rb: burdenResistance },
      result: ealf, unit: 'V', precision: 2,
    });
  }

  // ── format_ziegler_verification_step(alf_o, ALFreq, ok) ──────────────────
  // Python substitution "{alf_o:.2f} >= {req:.2f}" → comparison with "≥".
  function formatZieglerVerificationStep(alfO, siemensAlfRequired, siemensOk) {
    return CTStep.conclusion({
      key: 'ziegler_requirement_check',
      label_en: 'G. Ziegler Requirement Check',
      label_da: 'G. Ziegler Kravkontrol',
      latex: 'ALF_O \\geq ALF_{req}',
      is_ok: !!siemensOk,
      comparison: `${alfO.toFixed(2)} ${siemensOk ? '≥' : '<'} ${siemensAlfRequired.toFixed(2)}`,
      status: passFail(siemensOk),
    });
  }

  // ── format_ziegler_px_step() ─────────────────────────────────────────────
  function formatZieglerPxStep() {
    return CTStep.make({
      key: 'ziegler_requirement_check',
      label_en: 'G. Ziegler Requirement Check — PX class: ALF not available, use E.m.f. method.',
      label_da: 'G. Ziegler Kravkontrol — PX klasse: ALF ikke tilgængelig, anvend E.m.f. metode.',
      latex: '',
      result: null, unit: '',
      status: 'not_applicable_px',
    });
  }

  // ── format_iec_check_step(iec_ok, iec_results) ───────────────────────────
  // Empty iec_results (PX — no ALF) → substitution token 'alf_not_available_px'.
  function formatIecCheckStep(iecOk, iecResults) {
    const noAlf = !iecResults || iecResults.length === 0;
    return CTStep.conclusion({
      key: 'iec_requirement_check',
      label_en: 'IEC requirement check',
      label_da: 'IEC krav kontrol',
      latex: '',
      is_ok: !!iecOk,
      comparison: noAlf ? 'ALF not available (PX)' : '',
      substitution: noAlf ? 'alf_not_available_px' : '',
      status: passFail(iecOk),
    });
  }

  // ── format_final_verdict(emf_ok, iec_ok, siemens_ok) → [status, failed] ──
  function formatFinalVerdict(emfOk, iecOk, siemensOk) {
    if (emfOk && iecOk && siemensOk) return ['OK', []];
    const failed = [];
    if (!emfOk) failed.push('emf');
    if (!iecOk) failed.push('iec_61869');
    if (!siemensOk) failed.push('ziegler');
    return ['NOT_OK', failed];
  }

  return {
    formatTransformerDataStep,
    formatCableBurdenStep,
    formatTotalBurdenStep,
    formatCtBurdenStep,
    formatOperatingAlfStep,
    formatIecRequirementSteps,
    formatIecVerificationSteps,
    formatZieglerSteps,
    formatEmfSteps,
    formatSpecifiedVkStep,
    formatOfferedVkStep,
    formatZieglerVerificationStep,
    formatZieglerPxStep,
    formatIecCheckStep,
    formatFinalVerdict,
  };
})();
