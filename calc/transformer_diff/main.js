'use strict';
/**
 * transformer_diff/main.js — Port of
 * calculations/ct_transformer_differential/main.py
 *
 * The composition entry for the full-fidelity transformer differential
 * package: it orchestrates the already-ported sub-files (presets / data /
 * burden_calculation / methods.{iec61869,ziegler,emf} / formatting, plus the
 * shared CTBase/CTMaterials/CTStep foundations) into a single
 * `CTTransformerDiff.calculate(core, commonData)`, mirroring
 * `calculate_transformer_differential(common_data, core_data, cable_resistance)`
 * step-for-step. All three methods (IEC 61869 ALF, G. Ziegler, E.m.f.) must
 * pass for status 'OK'.
 *
 * calc/transformer_diff.js only declares the CTTransformerDiff namespace (its
 * legacy calculate() is removed, §9.6 9D), so this file is the public entry.
 *
 * Fidelity notes (confirmed by reading ct_transformer_differential/main.py in full):
 * - Cable resistance (PORTING_PLAN.md §9.6 9C): `cable_resistance` is injected
 *   by the Python caller (ct_calculations.py ← ui/ct_widget/widget.py →
 *   materials.calculate_wire_resistance()), and the IEC burden path computes
 *   its own S_wire. Here both come from the one CTCableRes.lead() call per core
 *   that data.extractCtInputs makes (project method and temperature,
 *   the core's wiring, the worst current case `single_phase`, so k = 2 with
 *   either wiring, §9.8): r_loop is
 *   `cable_resistance` (E.m.f. method) and S_wire = r_loop·Isr² (IEC 61869 /
 *   Ziegler). The cable-burden step's k_wire is the topology factor, not
 *   IEC_CONSTANTS.k_wire. The toolbox steps come first, its warnings last.
 * - Relay-specific IEC ALF parameters: main.py queries
 *   `data.relay_database.get_relay_trafo_diff_params(relay_name)`; CTSizer
 *   asks CTRelayDB.trafoDiffParams for the core's IED (relay_model, else
 *   relay_name). An E.m.f.-only IED (no transformer_diff group: ABB RET670,
 *   GE Multilin T60, SEL-487E) marks the IEC method not applicable, as
 *   main.py does. Deviations (issue #93): an IED name the database does not
 *   have is a custom relay and takes the defaults (main.py marks it not
 *   applicable, against the DB function's docstring "caller uses defaults"),
 *   and the IED's `min_alf` sets Krav 3 (main.py only passes it to the Krav 3
 *   warning; calculate_iec_requirements always used IEC_CONSTANTS.min_alf).
 * - Warnings are kept as Python's structured tuples ([key, ...args]).
 * - `conclusion` is the status key, as Python's `calculations["conclusion"]`;
 *   `failed_methods` is returned alongside.
 * - create_section_header / create_subsection_header dividers and the
 *   string-formatted `result["calculations"]` report dict are presentation-only
 *   and not ported (PORTING_PLAN.md §1 non-goals).
 * - Return object carries Python-fidelity lowercase primaries PLUS the
 *   back-compat aliases the UI reads (EALF / Vk_req / emf_ok / ziegler_ok /
 *   alf_o / ALF_ziegler / is_ok / margin — ctsizer-panels.jsx, ctsizer-app.jsx).
 */

CTTransformerDiff.calculate = (() => {
  return function calculate(core, commonData = {}) {
    const T = CTTransformerDiff;
    const { IEC_CONSTANTS, Z_PERCENT_RANGE } = T.presets;
    const F = T.formatting;

    const warnings = [];
    const steps = [];

    // Extract CT input data
    const ctInputs = T.data.extractCtInputs(core, commonData);
    const cable_res = ctInputs.cable_res;
    const { alf, vk: vk_specified, is_px } = CTBase.getAlfOrVk(core);

    // Extract transformer data
    const [
      trafo_primary_voltage, trafo_rated_power, z_percent, inrush_factor,
      i_rated, trafo_it_max, trafo_ik_max, linked_winding,
    ] = T.data.extractTransformerData(commonData, core);

    // No internal fault current: no Isc,max,int on the core / winding and no
    // project Ik max. There is no default (it was a fixed 40 kA, issue #85), so
    // the methods are not evaluated and the core is NOT_OK with a warning
    // (= main.py's early return). The method results are absent; the lead
    // resistance (an input, PORTING_PLAN.md §9.2) is still reported.
    if (trafo_ik_max == null) {
      return {
        trafo_primary_voltage, trafo_rated_power, z_percent, inrush_factor,
        i_rated, trafo_it_max, trafo_ik_max, linked_winding,
        isc_int_missing: true,
        is_px: !!is_px,
        cable_resistance: cable_res.r_loop, Rc: cable_res.r_loop,
        cable_res: {
          method: cable_res.method, source: cable_res.source, topology: cable_res.topology,
          factor: cable_res.factor, r_conductor: cable_res.r_conductor,
          r_loop: cable_res.r_loop, r20_per_km: cable_res.r20_per_km,
        },
        conclusion: 'NOT_OK', failed_methods: ['internal_fault_current'],
        status: 'NOT_OK', is_ok: false, margin: null,
        warnings: [['warning_isc_int_missing']], steps: [],
      };
    }

    // Externally-injected cable resistance in Python (see header note).
    const cable_resistance = cable_res.r_loop;
    cable_res.steps.forEach((s) => steps.push(s));

    // Transformer data step (only if from modern structure)
    const remote_end = commonData.remote_end || {};
    if (remote_end.transformer_data != null) {
      steps.push(F.formatTransformerDataStep(
        linked_winding, trafo_rated_power, z_percent, trafo_primary_voltage,
        i_rated, trafo_it_max, trafo_ik_max
      ));
    }

    // Validate Z% range
    if (z_percent < Z_PERCENT_RANGE.min || z_percent > Z_PERCENT_RANGE.max) {
      warnings.push(['warning_z_percent_out_of_range', z_percent, Z_PERCENT_RANGE.min, Z_PERCENT_RANGE.max]);
    }

    // Relay-specific IEC ALF parameters of the core's IED
    const relay_iec = CTRelayDB.trafoDiffParams(core);
    const iec_method_applicable = relay_iec.applicable;
    const iec_params = { ...IEC_CONSTANTS, ...relay_iec.params };

    // ========== IEC 61869 ALF METHOD ==========
    const [s_wire, rho_t] = T.burden.calculateCableBurden(
      cable_res, ctInputs.cable_cross_section, ctInputs.secondary_current
    );
    steps.push(F.formatCableBurdenStep(
      cable_res.factor, rho_t, ctInputs.cable_length, ctInputs.cable_cross_section,
      ctInputs.secondary_current, s_wire
    ));

    const s_total = T.burden.calculateTotalBurden(ctInputs.relay_burden, s_wire);
    steps.push(F.formatTotalBurdenStep(ctInputs.relay_burden, s_wire, s_total));

    const s_ct = T.burden.calculateCtInternalBurden(ctInputs.rct, ctInputs.secondary_current);
    steps.push(F.formatCtBurdenStep(ctInputs.rct, ctInputs.secondary_current, s_ct));

    const alf_o = T.burden.calculateOperatingAlf(alf, ctInputs.burden_va, s_ct, s_total);
    if (alf_o != null) {
      steps.push(F.formatOperatingAlfStep(alf, ctInputs.burden_va, s_ct, s_total, alf_o));
    }

    // ========== IEC 61869 REQUIREMENTS ==========
    let iec_ok;
    let alf_ext_required = null, alf_int_required = null, alf_min_required = null;
    let i_ref = null, f_adap = null, iec_results = [];
    if (iec_method_applicable) {
      [alf_ext_required, alf_int_required, alf_min_required, i_ref, f_adap] =
        T.methods.iec61869.calculateIecRequirements(
          trafo_it_max, trafo_ik_max, ctInputs.primary_current,
          trafo_rated_power, trafo_primary_voltage,
          iec_params.ext_fault_factor, iec_params.int_fault_factor, iec_params.min_alf
        );

      F.formatIecRequirementSteps(
        alf_ext_required, alf_int_required, trafo_it_max, trafo_ik_max,
        ctInputs.primary_current, i_ref, trafo_rated_power, trafo_primary_voltage, f_adap,
        iec_params.ext_fault_factor, iec_params.int_fault_factor
      ).forEach((s) => steps.push(s));

      let req1_ok, req2_ok, req3_ok, req4_ok;
      [iec_ok, req1_ok, req2_ok, req3_ok, req4_ok, iec_results] =
        T.methods.iec61869.checkAllIecRequirements(
          alf_o, alf_ext_required, alf_int_required, alf_min_required, f_adap,
          iec_params.min_fadap, iec_params.max_fadap
        );

      if (iec_results.length) {
        if (!req1_ok) warnings.push(['warning_iec_req_1_not_met', alf_o, alf_ext_required]);
        if (!req2_ok) warnings.push(['warning_iec_req_2_not_met', alf_o, alf_int_required]);
        if (!req3_ok) warnings.push(['warning_iec_req_3_not_met', alf_o, alf_min_required]);
        if (!req4_ok) warnings.push(['warning_iec_req_4_not_met', f_adap]);

        F.formatIecVerificationSteps(iec_results).forEach((s) => steps.push(s));
      }

      steps.push(F.formatIecCheckStep(iec_ok, iec_results));
    } else {
      // IEC ALF method not applicable for this relay (e.g., ABB RET670)
      iec_ok = true;  // Does not block final verdict
      steps.push(CTStep.make({
        key: 'iec_61869_requirements',
        label_en: 'IEC 61869 Requirements',
        label_da: 'IEC 61869 Krav',
        latex: '',
        result: 'N/A', unit: '',
        substitution: 'iec_alf_method_not_applicable',
      }));
    }

    // ========== G. ZIEGLER METHOD ==========
    const [kssc_int, kssc_ext] = T.methods.ziegler.calculateKssc(
      trafo_it_max, trafo_ik_max, ctInputs.primary_current
    );
    const [siemens_alf_int_req, siemens_alf_ext_req, siemens_alf_required] =
      T.methods.ziegler.calculateAlfRequirements(kssc_int, kssc_ext);

    F.formatZieglerSteps(
      kssc_int, kssc_ext, trafo_ik_max, trafo_it_max, ctInputs.primary_current,
      siemens_alf_int_req, siemens_alf_ext_req, siemens_alf_required
    ).forEach((s) => steps.push(s));

    const siemens_ok = T.methods.ziegler.verifyZieglerMethod(alf_o, siemens_alf_required);
    if (alf_o != null) {
      steps.push(F.formatZieglerVerificationStep(alf_o, siemens_alf_required, siemens_ok));
      if (!siemens_ok) warnings.push(['warning_ziegler_not_met', alf_o, siemens_alf_required]);
    } else {
      steps.push(F.formatZieglerPxStep());
    }

    // ========== E.M.F. METHOD ==========
    const r_relay = T.methods.emf.calculateRelayResistance(ctInputs.relay_burden, ctInputs.secondary_current);

    const [e_internal, e_through, e_inrush] = T.methods.emf.calculateEmfScenarios(
      trafo_ik_max, trafo_it_max, inrush_factor, ctInputs.primary_current,
      ctInputs.secondary_current, ctInputs.rct, cable_resistance, r_relay
    );
    const vk_required = T.methods.emf.calculateRequiredVk(e_internal, e_through, e_inrush);

    F.formatEmfSteps(
      r_relay, ctInputs.relay_burden, ctInputs.secondary_current,
      e_internal, e_through, e_inrush, trafo_ik_max, trafo_it_max, inrush_factor,
      ctInputs.primary_current, ctInputs.rct, cable_resistance, vk_required
    ).forEach((s) => steps.push(s));

    const [ealf, vk_label] = T.methods.emf.calculateOfferedVk(
      alf, ctInputs.secondary_current, ctInputs.rct, ctInputs.burden_va, is_px, vk_specified
    );

    if (is_px && vk_specified != null) {
      steps.push(F.formatSpecifiedVkStep(vk_specified, ealf));
    } else {
      const burden_resistance = ctInputs.burden_va / (ctInputs.secondary_current ** 2);
      steps.push(F.formatOfferedVkStep(alf, ctInputs.secondary_current, ctInputs.rct, burden_resistance, ealf));
    }

    const emf_ok = T.methods.emf.verifyEmfMethod(ealf, vk_required);
    if (!emf_ok) warnings.push(['warning_emf_insufficient', vk_label, ealf, vk_required]);

    // ========== FINAL VERDICT ==========
    const [status, failed_methods] = F.formatFinalVerdict(emf_ok, iec_ok, siemens_ok);
    const okText = (ok) => (ok ? 'OK' : 'NOT OK');
    const is_ok = status === 'OK';
    steps.push(CTStep.conclusion({
      key: 'conclusion_comparison',
      label_en: 'Final Verdict',
      label_da: 'Endelig Vurdering',
      latex: '\\text{EMF} \\wedge \\text{IEC} \\wedge \\text{Ziegler}',
      is_ok,
      comparison: `EMF: ${okText(emf_ok)}, IEC: ${okText(iec_ok)}, Ziegler: ${okText(siemens_ok)}`,
    }));

    const margin = vk_required > 0 ? ((ealf - vk_required) / vk_required) * 100 : 0;
    cable_res.warnings.forEach((w) => warnings.push(w));

    return {
      // Python-fidelity primaries
      trafo_primary_voltage, trafo_rated_power, z_percent, inrush_factor,
      i_rated, trafo_it_max, trafo_ik_max, linked_winding,
      cable_resistance, s_wire, rho_t, s_total, s_ct, alf_o,
      iec_method_applicable, alf_ext_required, alf_int_required, alf_min_required,
      i_ref, f_adap, iec_ok, iec_results,
      kssc_int, kssc_ext, siemens_alf_int_req, siemens_alf_ext_req, siemens_alf_required, siemens_ok,
      r_relay, e_internal, e_through, e_inrush, vk_required, ealf, vk_label, emf_ok,
      is_px: vk_label === 'Vk',
      // Lead resistance (PORTING_PLAN.md §9.2): Rc = r_loop, plus the summary fields
      Rc: cable_resistance,
      cable_res: {
        method: cable_res.method, source: cable_res.source, topology: cable_res.topology,
        factor: cable_res.factor, r_conductor: cable_res.r_conductor,
        r_loop: cable_res.r_loop, r20_per_km: cable_res.r20_per_km,
      },
      // Back-compat aliases read by the UI (ctsizer-panels.jsx / ctsizer-app.jsx)
      EALF: ealf, Vk_req: vk_required, ziegler_ok: siemens_ok, ALF_ziegler: siemens_alf_required,
      // Verdict
      conclusion: status, failed_methods, status, is_ok, margin, warnings, steps,
    };
  };
})();
