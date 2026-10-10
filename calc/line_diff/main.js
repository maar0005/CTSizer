'use strict';
/**
 * line_diff/main.js — Port of calculations/ct_line_differential/main.py
 *
 * The composition entry for the full-fidelity line differential package: it
 * orchestrates the five already-ported sub-files (data / emf_calculation /
 * knee_point / auto_reclosure_ext / formatting, plus the shared
 * CTBase/CTKnee/CTMaterials/CTStep foundations) into a single
 * `CTLineDiff.calculate(core, commonData)`, mirroring
 * `calculate_line_differential(common_data, core_data, cable_resistance)`
 * step-for-step.
 *
 * calc/line_diff.js only declares the CTLineDiff namespace (its legacy
 * calculate() is removed, §9.6 9D), so this file is CTLineDiff's public entry.
 *
 * Fidelity notes (confirmed by reading ct_line_differential/main.py in full):
 * - Cable (lead) resistance (PORTING_PLAN.md §9.6 9C): `cable_resistance` is
 *   a parameter the real `calculate_line_differential` receives from its
 *   caller (ui/ct_widget → materials.calculate_wire_resistance), while main.py
 *   computes a second, report-only value from the IEC 60228 table
 *   (`cable_resistance_at_max_temp` / `cable_resistance_r_lead`). Both paths
 *   are now ONE CTCableRes.lead() call per core (data.js), with the project
 *   method and temperature, and its r_loop feeds both the E.M.F. math and the
 *   report steps. The 3-phase and 1-phase scenarios each get their own
 *   applyTopology() case with the core's wiring (§9.8): with the default
 *   `four_wire` the 3-phase scenarios get k = 1 and the 1-phase ones k = 2;
 *   with `six_wire` both get k = 2 (the ctvt_dim ×2).
 *   `validate_cable_resistivity` is no longer called: it compared the
 *   hand-edited `dc_resistance_20` override (removed, D1) with IEC 60228, so
 *   it could not fire any more (the Python, which validates its own table
 *   value, never fires without the override either).
 * - The `conclusion` verdict ('ct_sufficient'/'ct_insufficient') is set ONCE
 *   from verifyVkAdequacy and never reassigned, even when the AR check later
 *   flips `status` to NOT_OK. Python only overwrites a *separate*,
 *   presentation-only `calculations["conclusion"]` status string on AR
 *   failure (no CTSizer analog) — the real conclusion_key (returned by
 *   `verify_vk_adequacy` as `message` in Python but never stored anywhere)
 *   stays fixed. Preserved exactly.
 * - The AR adequacy check (`proposed_vk < eal_ar`) is inlined directly here,
 *   since ct_line_differential's auto_reclosure_ext.py has no separate
 *   `verify_ar_adequacy`-equivalent function (unlike ct_distance's package).
 * - `try/except ImportError` around the AR sub-import (main.py 260-297) is
 *   dead-letter (module always available) — not ported, consistent with the
 *   identical pattern already handled this way in distance/main.js.
 * - `preview_path` (AR waveform PNG filesystem lookup) is presentation
 *   plumbing — not ported (PORTING_PLAN.md §1 non-goals); already dropped
 *   from `computeAutoReclosureAnalysis`'s return shape.
 * - Return object carries Python-fidelity lowercase primaries PLUS the
 *   back-compat aliases the UI reads (EALF / Vk_req / Rc / is_ok — confirmed
 *   via grep of ctsizer-panels.jsx's line_diff summary panel). The Summary's
 *   `E_internal` / `E_through` cards read the larger of the 3-phase and
 *   1-phase E.M.F. of each fault (UI aliases, no Python field; the panel's old
 *   `R_ext` card is dropped, PORTING_PLAN.md §10.6 F-SUM).
 */

CTLineDiff.calculate = function calculate(core, commonData = {}) {
  const L = CTLineDiff;

  const warnings = [];
  const steps = [];

  // ── Input extraction ───────────────────────────────────────────────────
  const ctInputs = L.data.extractCtInputs(core);
  const cableData = L.data.extractCableData(core, commonData);
  const faultCurrents = L.data.extractFaultCurrents(commonData, core);
  const arParams = L.data.extractAutoReclosureParams(core);

  // ── ALF / Vk resolution ─────────────────────────────────────────────────
  const { alf, vk: vk_specified, is_px } = CTBase.getAlfOrVk(core);

  // ── Cable (lead) resistance — CTCableRes, one lead() per core ──────────
  // cableData.cable_res is the 3-phase case; the 1-phase scenarios take the
  // same conductor through their own case. Rc / cable_res.r_loop is the
  // larger of the two (the worst case, as the single-case modules report).
  const lead3 = cableData.cable_res;
  const lead1 = CTCableRes.applyTopology(lead3, lead3.topology, 'single_phase');
  const Rc_3ph = lead3.r_loop;
  const Rc_1ph = lead1.r_loop;
  const worst = Rc_1ph >= Rc_3ph ? lead1 : lead3;

  // Toolbox steps (R′20, R′T, R_c), then the topology step once per case.
  steps.push(...lead3.steps.slice(0, -1));
  steps.push(L.formatting.formatLeadResistanceCaseStep(lead3.steps[lead3.steps.length - 1], 'three_phase'));
  steps.push(L.formatting.formatLeadResistanceCaseStep(lead1.steps[0], 'single_phase'));

  const cable_resistance = worst.r_loop;
  const cable_res = {
    method: lead3.method, source: lead3.source, topology: lead3.topology,
    factor: worst.factor, r_conductor: lead3.r_conductor, r_loop: worst.r_loop,
    r20_per_km: lead3.r20_per_km,
  };

  // ── Relay parameters ─────────────────────────────────────────────────────
  const r_relay = CTBase.calcRelayResistance(ctInputs.relay_burden, ctInputs.secondary_current);
  steps.push(L.formatting.formatRelayResistanceStep(r_relay, ctInputs.relay_burden, ctInputs.secondary_current));

  // ── E.M.F. calculations ───────────────────────────────────────────────────
  const emfResults = L.emfCalculation.calculateAllEmfScenarios(
    faultCurrents, ctInputs.secondary_current, ctInputs.primary_current,
    ctInputs.rct, Rc_3ph, r_relay, Rc_1ph
  );
  emfResults.warnings.forEach((w) => warnings.push(w));

  steps.push(L.formatting.formatEmf3PhaseInternalStep(
    emfResults.e_3p_in, faultCurrents.ik_max_3ph, ctInputs.secondary_current,
    ctInputs.primary_current, ctInputs.rct, Rc_3ph, r_relay
  ));
  steps.push(L.formatting.formatEmf1PhaseInternalStep(
    emfResults.e_1p_in, faultCurrents.ik_max_1ph, ctInputs.secondary_current,
    ctInputs.primary_current, ctInputs.rct, Rc_1ph, r_relay
  ));
  steps.push(L.formatting.formatEmf3PhaseExternalStep(
    emfResults.e_3p_ex, faultCurrents.it_max_3ph, ctInputs.secondary_current,
    ctInputs.primary_current, ctInputs.rct, Rc_3ph, r_relay
  ));
  steps.push(L.formatting.formatEmf1PhaseExternalStep(
    emfResults.e_1p_ex, faultCurrents.it_max_1ph, ctInputs.secondary_current,
    ctInputs.primary_current, ctInputs.rct, Rc_1ph, r_relay
  ));

  // ── Required knee-point voltage ──────────────────────────────────────────
  const vk_required = L.kneePoint.calculateRequiredVk(emfResults);
  steps.push(L.formatting.formatRequiredVkStep(
    vk_required, emfResults.e_3p_in, emfResults.e_1p_in, emfResults.e_3p_ex, emfResults.e_1p_ex
  ));

  // ── Proposed knee-point voltage (PX Vk or EALF) ──────────────────────────
  const burden_resistance = ctInputs.burden_va / (ctInputs.secondary_current * ctInputs.secondary_current);
  const { vk: proposed_vk, is_px: is_px_class } = L.kneePoint.calculateProposedVk(
    alf, ctInputs.secondary_current, ctInputs.rct, ctInputs.burden_va, vk_specified, is_px
  );

  if (is_px_class) {
    steps.push(L.formatting.formatProposedVkPxStep(proposed_vk));
  } else {
    steps.push(L.formatting.formatProposedVkAlfStep(
      proposed_vk, alf, ctInputs.secondary_current, ctInputs.rct, burden_resistance
    ));
  }

  // ── Final verdict (set ONCE; never reassigned even if AR later flips status) ──
  const vk_label = is_px_class ? 'Vk' : 'EALF';
  const { status: vkStatus, conclusion } = L.kneePoint.verifyVkAdequacy(proposed_vk, vk_required);
  let status = vkStatus;
  const is_ok = status === 'OK';

  steps.push(CTStep.conclusion({
    key: 'conclusion_comparison',
    label_en: 'Conclusion',
    label_da: 'Konklusion',
    latex: `${vk_label} \\geq V_{k,req}`,
    is_ok,
    comparison: `${proposed_vk.toFixed(2)} V ${is_ok ? '≥' : '<'} ${vk_required.toFixed(2)} V`,
  }));

  if (!is_ok) {
    warnings.push(['warning_knee_point_voltage_insufficient', vk_label, proposed_vk, vk_required]);
  }

  // ── Auto-reclosure extension (optional) ──────────────────────────────────
  let eal_ar = null, ktd_ar = null, kssc_ar = null;
  if (arParams != null) {
    const arResults = L.autoReclosureExt.computeAutoReclosureAnalysis(
      arParams, faultCurrents, ctInputs, burden_resistance
    );

    if (arResults) {
      eal_ar = arResults.eal_ar;
      ktd_ar = arResults.ktd_ar;
      kssc_ar = arResults.kssc_ar;

      steps.push(L.formatting.formatArEalStep(
        eal_ar, kssc_ar, ktd_ar, ctInputs.rct, burden_resistance, ctInputs.secondary_current
      ));

      // Bug 2 fix (Python): compare offered (proposed_vk/EALF) vs C-O-C-O
      // required (eal_ar).
      if (proposed_vk < eal_ar) {
        warnings.push(['warning_auto_reclosure_eal_below_vk', eal_ar, proposed_vk]);
        // Bug 1 fix (Python): AR failure must change overall status.
        status = 'NOT_OK';
      }
    }
  }

  // Toolbox warnings (the table fallback) last, as in the other modules.
  lead3.warnings.forEach((w) => warnings.push(w));

  const final_is_ok = status === 'OK';
  const margin = vk_required > 0 ? ((proposed_vk - vk_required) / vk_required) * 100 : 0;

  return {
    // Python-fidelity primaries
    cable_resistance, r_relay,
    e_3p_in: emfResults.e_3p_in, e_1p_in: emfResults.e_1p_in,
    e_3p_ex: emfResults.e_3p_ex, e_1p_ex: emfResults.e_1p_ex,
    total_resistance_3p: emfResults.total_resistance_3p,
    total_resistance_1p: emfResults.total_resistance_1p,
    vk_required, proposed_vk, is_px: is_px_class,
    eal_ar, ktd_ar, kssc_ar,
    // Back-compat aliases read by the UI (ctsizer-panels.jsx)
    Rc: cable_resistance, Rc_3ph, Rc_1ph, cable_res,
    EALF: proposed_vk, Vk_req: vk_required,
    E_internal: Math.max(emfResults.e_3p_in, emfResults.e_1p_in),
    E_through: Math.max(emfResults.e_3p_ex, emfResults.e_1p_ex),
    // Verdict
    conclusion, status, is_ok: final_is_ok, margin, warnings, steps,
  };
};
