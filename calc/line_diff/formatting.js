'use strict';
/**
 * line_diff/formatting.js — Port of calculations/ct_line_differential/formatting.py
 *
 * Step-row builders for line differential protection: cable/relay resistance,
 * the four EMF fault scenarios, required/proposed Vk, and the AR EAL row.
 * Unlike ct_distance/formatting.py (dead code), these functions are actually
 * imported and called by ct_line_differential/main.py — so this port's
 * functions are the step rows calc/line_diff/main.js consumes directly.
 * Extends the CTLineDiff namespace (calc/line_diff.js, loaded first); composed by calc/line_diff/main.js.
 *
 * create_section_header (a presentation-only divider row) is not ported,
 * consistent with every other calc/*.js module. format_cable_resistance_step
 * and format_lead_resistance_step are gone with the cable-resistance toolbox
 * (PORTING_PLAN.md §9.6 9C); the cable steps come from CTCableRes.
 */

CTLineDiff.formatting = (() => {
  // ── Lead resistance per scenario case (CTSizer, PORTING_PLAN.md §9.6 9C) ──
  // Replaces format_cable_resistance_step / format_lead_resistance_step: the
  // cable steps now come from CTCableRes. Line differential evaluates two
  // current cases, so it shows the toolbox's `total_cable_resistance` step
  // once per case. The 3-phase row keeps the toolbox key; the 1-phase row
  // gets its own key (the Formula Steps tab keys rows by step.key).
  const CASE_STEP = {
    three_phase: { key: 'total_cable_resistance', en: '3-phase faults', da: '3-fasede fejl' },
    single_phase: { key: 'total_cable_resistance_1ph', en: '1-phase faults', da: '1-fasede fejl' },
  };
  function formatLeadResistanceCaseStep(topologyStep, currentCase) {
    if (!Object.prototype.hasOwnProperty.call(CASE_STEP, currentCase)) {
      throw new Error(`line differential has no ${currentCase} lead step`);
    }
    const c = CASE_STEP[currentCase];
    return {
      ...topologyStep,
      key: c.key,
      label_en: `${topologyStep.label_en} — ${c.en}`,
      label_da: `${topologyStep.label_da} — ${c.da}`,
    };
  }

  // ── format_relay_resistance_step(...) ────────────────────────────────────
  function formatRelayResistanceStep(rRelay, relayBurden, secondaryCurrent) {
    return CTStep.make({
      key: 'relay_resistance',
      label_en: 'Maximum resistance of the line differential relay is calculated from the relay burden.',
      label_da: 'Maksimal modstand af linjedifferentialrelæet beregnes fra relæbyrden.',
      latex: 'R_{relay} = \\frac{S_R}{I_R^2}',
      variables: { SR: relayBurden, IR: secondaryCurrent },
      result: rRelay, unit: 'Ω', precision: 4,
    });
  }

  // ── format_emf_3phase_internal_step(...) ─────────────────────────────────
  function formatEmf3PhaseInternalStep(e3pIn, ikMax, isr, ipr, rct, rLead, rRelay) {
    return CTStep.make({
      key: 'emf_3phase_internal_fault',
      label_en: 'E.m.f. for 3-phase internal fault',
      label_da: 'E.m.f. for 3-fase intern fejl',
      latex: 'E_{3\\phi,in} = I_{k,max} \\cdot \\frac{I_{sr}}{I_{pr}} \\cdot (R_{ct} + R_{lead} + R_{relay})',
      variables: { Ik_max: ikMax, Isr: isr, Ipr: ipr, Rct: rct, Rlead: rLead, Rrelay: rRelay },
      result: e3pIn, unit: 'V', precision: 2,
    });
  }

  // ── format_emf_1phase_internal_step(...) ─────────────────────────────────
  function formatEmf1PhaseInternalStep(e1pIn, ikMax, isr, ipr, rct, rLead, rRelay) {
    return CTStep.make({
      key: 'emf_1phase_internal_fault',
      label_en: 'E.m.f. for 1-phase internal fault',
      label_da: 'E.m.f. for 1-fase intern fejl',
      latex: 'E_{1\\phi,in} = I_{ke,max} \\cdot \\frac{I_{sr}}{I_{pr}} \\cdot (R_{ct} + 2R_{lead} + R_{relay})',
      variables: { Ike_max: ikMax, Isr: isr, Ipr: ipr, Rct: rct, Rlead: rLead, Rrelay: rRelay },
      result: e1pIn, unit: 'V', precision: 2,
    });
  }

  // ── format_emf_3phase_external_step(...) ─────────────────────────────────
  function formatEmf3PhaseExternalStep(e3pEx, itMax, isr, ipr, rct, rLead, rRelay) {
    return CTStep.make({
      key: 'emf_3phase_through_fault',
      label_en: 'E.m.f. for 3-phase through fault',
      label_da: 'E.m.f. for 3-fase through fejl',
      latex: 'E_{3\\phi,ex} = 2 \\cdot I_{t,max} \\cdot \\frac{I_{sr}}{I_{pr}} \\cdot (R_{ct} + R_{lead} + R_{relay})',
      variables: { It_max: itMax, Isr: isr, Ipr: ipr, Rct: rct, Rlead: rLead, Rrelay: rRelay },
      result: e3pEx, unit: 'V', precision: 2,
    });
  }

  // ── format_emf_1phase_external_step(...) ─────────────────────────────────
  function formatEmf1PhaseExternalStep(e1pEx, itMax, isr, ipr, rct, rLead, rRelay) {
    return CTStep.make({
      key: 'emf_1phase_through_fault',
      label_en: 'E.m.f. for 1-phase through fault',
      label_da: 'E.m.f. for 1-fase through fejl',
      latex: 'E_{1\\phi,ex} = 2 \\cdot I_{te,max} \\cdot \\frac{I_{sr}}{I_{pr}} \\cdot (R_{ct} + 2R_{lead} + R_{relay})',
      variables: { Ite_max: itMax, Isr: isr, Ipr: ipr, Rct: rct, Rlead: rLead, Rrelay: rRelay },
      result: e1pEx, unit: 'V', precision: 2,
    });
  }

  // ── format_required_vk_step(...) ─────────────────────────────────────────
  function formatRequiredVkStep(vkRequired, e3pIn, e1pIn, e3pEx, e1pEx) {
    return CTStep.make({
      key: 'required_knee_point_voltage',
      label_en: 'Required knee point voltage',
      label_da: 'Krævet knæpunktspænding',
      latex: 'V_k = \\max(E_{3\\phi,in}, E_{1\\phi,in}, E_{3\\phi,ex}, E_{1\\phi,ex})',
      variables: { E3p_in: e3pIn, E1p_in: e1pIn, E3p_ex: e3pEx, E1p_ex: e1pEx },
      result: vkRequired, unit: 'V', precision: 2,
    });
  }

  // ── format_proposed_vk_px_step(vk) ───────────────────────────────────────
  function formatProposedVkPxStep(vk) {
    return CTStep.make({
      key: 'specified_knee_point_voltage_px',
      label_en: 'Specified knee point voltage (PX class)',
      label_da: 'Specificeret knæpunktspænding (PX klasse)',
      latex: 'V_k = V_{k,spec}',
      variables: { Vk: vk },
      result: vk, unit: 'V', precision: 2,
    });
  }

  // ── format_proposed_vk_alf_step(...) ─────────────────────────────────────
  function formatProposedVkAlfStep(ealf, alf, isr, rct, burdenResistance) {
    return CTStep.make({
      key: 'offered_knee_point_voltage_alf',
      label_en: 'Offered knee point voltage (from ALF)',
      label_da: 'Tilbudt knæpunktspænding (fra ALF)',
      latex: 'E_{ALF} = ALF \\cdot I_{sr} \\cdot \\left(R_{ct} + \\frac{S_n}{I_{sr}^2}\\right)',
      variables: { ALF: alf, Isr: isr, Rct: rct, Rn: burdenResistance },
      result: ealf, unit: 'V', precision: 2,
    });
  }

  // ── format_ar_eal_step(...) ──────────────────────────────────────────────
  function formatArEalStep(ealAr, ksscAr, ktdAr, rct, burdenResistance, isr) {
    return CTStep.make({
      key: 'auto_reclosure_transient_dimensioning',
      label_en: 'Auto-Reclosure transient dimensioning (C-O-C-O) EAL calculation',
      label_da: 'Auto-Reclosure transient dimensioning (C-O-C-O) EAL beregning',
      latex: 'E_{AL} = K_{ssc} \\cdot K_{td} \\cdot (R_{ct} + R_b) \\cdot I_{sr}',
      variables: { Kssc: ksscAr, Ktd: ktdAr, Rct: rct, Rb: burdenResistance, Isr: isr },
      result: ealAr, unit: 'V', precision: 2,
    });
  }

  return {
    formatLeadResistanceCaseStep,
    formatRelayResistanceStep,
    formatEmf3PhaseInternalStep,
    formatEmf1PhaseInternalStep,
    formatEmf3PhaseExternalStep,
    formatEmf1PhaseExternalStep,
    formatRequiredVkStep,
    formatProposedVkPxStep,
    formatProposedVkAlfStep,
    formatArEalStep,
  };
})();
