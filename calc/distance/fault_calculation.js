'use strict';
/**
 * distance/fault_calculation.js — Port of calculations/ct_distance/fault_calculation.py
 *
 * Source impedance, zone-1 impedance, and zone-1 fault current for the
 * full-fidelity distance protection package. Consumes the
 * `params` shape built by distance/data.js (`voltage_level`, `iscc_max`,
 * `frequency`, `tp`, `klim`, `line_length`, `r_line`, `x_line`). Extends the
 * CTDistance namespace (calc/distance.js, loaded first); composed by calc/distance/main.js.
 */

CTDistance.faultCalculation = (() => {
  // ── calculate_source_impedance(params) ────────────────────────────────
  function calculateSourceImpedance(params) {
    const zs = (CTBase.SECURITY_FACTOR_C * params.voltage_level * 1000) /
      (Math.sqrt(3) * params.iscc_max);
    const omega_tp = 2 * Math.PI * params.frequency * params.tp / 1000;
    const rs = zs / Math.sqrt(1 + omega_tp * omega_tp);
    const xsSquared = zs * zs - rs * rs;
    const xs = xsSquared < 0 ? 0.0 : Math.sqrt(xsSquared);
    return { zs, rs, xs, omega_tp };
  }

  // ── calculate_source_impedance_with_validation(un, ik_max, tp, frequency,
  //    fault_type, ik_alternative) ────────────────────────────────────────
  // For EHV solidly-grounded systems, I_k1 (1-phase, incl. zero-sequence) is
  // often higher than I_k3 (3-phase, symmetric); CT dimensioning takes the
  // worst case. Mirrors Python's kwargs with the same defaults.
  function calculateSourceImpedanceWithValidation({
    un, ik_max, tp, frequency = 50, fault_type = '3-phase', ik_alternative = null,
  }) {
    const warnings = [];
    let ik_design, fault_type_used;

    if (ik_alternative != null) {
      if (fault_type === '3-phase' && ik_alternative > ik_max) {
        warnings.push({
          type: 'fault_current_comparison', ik1: ik_alternative, ik3: ik_max,
          message_key: 'warning_ik1_higher_than_ik3',
        });
        ik_design = ik_alternative;
        fault_type_used = '1-phase';
      } else if (fault_type === '1-phase' && ik_alternative < ik_max) {
        warnings.push({
          type: 'fault_current_comparison', ik1: ik_max, ik3: ik_alternative,
          message_key: 'info_ik1_higher_design',
        });
        ik_design = ik_max;
        fault_type_used = '1-phase';
      } else {
        ik_design = ik_max;
        fault_type_used = fault_type;
      }
    } else {
      ik_design = ik_max;
      fault_type_used = fault_type;
    }

    // Z_s = (c × U_n) / (√3 × I_k) — IEC 60909
    const zs = (CTBase.SECURITY_FACTOR_C * un * 1000) / (Math.sqrt(3) * ik_design);
    const omega_tp = 2 * Math.PI * frequency * tp / 1000;
    const rs = zs / Math.sqrt(1 + omega_tp * omega_tp);
    const xsSquared = zs * zs - rs * rs;
    const xs = xsSquared < 0 ? 0.0 : Math.sqrt(xsSquared);

    return {
      zs, rs, xs, omega_tp, ik_design, fault_type_used, warnings,
      iec_reference: 'IEC 60909',
    };
  }

  // ── calculate_zone1_impedance(params) ──────────────────────────────────
  function calculateZone1Impedance(params) {
    const rl = params.klim * params.line_length * params.r_line;
    const xl = params.klim * params.line_length * params.x_line;
    return { rl, xl };
  }

  // ── calculate_zone1_fault_current(rs, xs, rl, xl, voltage_level) ──────
  function calculateZone1FaultCurrent(rs, xs, rl, xl, voltage_level) {
    const rsc = rs + rl;
    const xsc = xs + xl;
    const zsc = Math.sqrt(rsc * rsc + xsc * xsc);
    const isc_lim = (CTBase.SECURITY_FACTOR_C * voltage_level * 1000) / (Math.sqrt(3) * zsc);
    return { rsc, xsc, zsc, isc_lim };
  }

  // ── add_fault_calculation_steps(steps, params, zs, rs, xs, omega_tp, rl,
  //    xl, rsc, xsc, zsc, isc_lim) ─────────────────────────────────────────
  // Section-header divider from the Python is presentation-only and not
  // ported, matching the rest of calc/distance/*.js. The `calculations`
  // string-formatted report dict has no CTSizer-native analog either —
  // `steps` (Formula Steps tab) is the only output here.
  function addFaultCalculationSteps(steps, params, zs, rs, xs, omega_tp, rl, xl, rsc, xsc, zsc, isc_lim) {
    const warnings = [];

    steps.push(CTStep.make({
      key: 'safety_factor', label_en: 'Safety factor', label_da: 'Sikkerhedsfaktor',
      latex: 'c = 1.1',
      result: CTBase.SECURITY_FACTOR_C, unit: '', precision: 1,
    }));

    steps.push(CTStep.make({
      key: 'source_impedance', label_en: 'Source impedance', label_da: 'Kildeimpedans',
      latex: 'Z_s = \\frac{c \\cdot U_n \\cdot 1000}{\\sqrt{3} \\cdot I_{scc,max}}',
      variables: { c: CTBase.SECURITY_FACTOR_C, Un: params.voltage_level, Iscc_max: params.iscc_max },
      result: zs, unit: 'Ω', precision: 4,
    }));

    steps.push(CTStep.make({
      key: 'source_resistance_calculation', label_en: 'Source resistance (calculation)', label_da: 'Kildemodstand (beregning)',
      latex: 'R_s = \\frac{Z_s}{\\sqrt{1 + (2\\pi f \\cdot T_p)^2}}',
      variables: { Zs: zs, f: params.frequency, Tp: params.tp },
      result: rs, unit: 'Ω', precision: 4,
    }));

    steps.push(CTStep.make({
      key: 'source_reactance_calculation', label_en: 'Source reactance (calculation)', label_da: 'Kildereaktans (beregning)',
      latex: 'X_s = \\sqrt{Z_s^2 - R_s^2}',
      variables: { Zs: zs, Rs: rs },
      result: xs, unit: 'Ω', precision: 4,
    }));

    steps.push(CTStep.make({
      key: 'source_impedance_complex', label_en: 'Source impedance (complex)', label_da: 'Kildeimpedans (kompleks)',
      latex: 'Z_s = R_s + jX_s',
      variables: { Rs: rs, Xs: xs },
      result: `(${rs.toFixed(3)} + j${xs.toFixed(3)})`, unit: 'Ω', precision: 3,
    }));

    steps.push(CTStep.make({
      key: 'zone1_line_resistance', label_en: 'Zone-1 line resistance (positive sequence)', label_da: 'Zone-1 linjemodstand (positiv sekvens)',
      latex: "R_L = K_{lim} \\cdot l_L \\cdot R'_L",
      variables: { Klim: params.klim, lL: params.line_length, "R'L": params.r_line },
      result: rl, unit: 'Ω', precision: 4,
    }));

    steps.push(CTStep.make({
      key: 'zone1_line_reactance', label_en: 'Zone-1 line reactance (positive sequence)', label_da: 'Zone-1 linjereaktans (positiv sekvens)',
      latex: "X_L = K_{lim} \\cdot l_L \\cdot X'_L",
      variables: { Klim: params.klim, lL: params.line_length, "X'L": params.x_line },
      result: xl, unit: 'Ω', precision: 4,
    }));

    steps.push(CTStep.make({
      key: 'zone1_short_circuit_resistance', label_en: 'Zone-1 short circuit resistance', label_da: 'Zone-1 kortslutningsmodstand',
      latex: 'R_{sc} = R_s + R_L',
      variables: { Rs: rs, RL: rl },
      result: rsc, unit: 'Ω', precision: 4,
    }));

    steps.push(CTStep.make({
      key: 'zone1_short_circuit_reactance', label_en: 'Zone-1 short circuit reactance', label_da: 'Zone-1 kortslutningsreaktans',
      latex: 'X_{sc} = X_s + X_L',
      variables: { Xs: xs, XL: xl },
      result: xsc, unit: 'Ω', precision: 4,
    }));

    steps.push(CTStep.make({
      key: 'zone1_short_circuit_impedance', label_en: 'Zone-1 short circuit impedance', label_da: 'Zone-1 kortslutningsimpedans',
      latex: 'Z_{sc} = \\sqrt{R_{sc}^2 + X_{sc}^2}',
      variables: { Rsc: rsc, Xsc: xsc },
      result: zsc, unit: 'Ω', precision: 4,
    }));

    steps.push(CTStep.make({
      key: 'zone1_short_circuit_current', label_en: 'Zone-1 short circuit current', label_da: 'Zone-1 kortslutningsstrøm',
      latex: 'I_{sc,lim} = \\frac{c \\cdot U_n \\cdot 1000}{\\sqrt{3} \\cdot Z_{sc}}',
      variables: { c: CTBase.SECURITY_FACTOR_C, Un: params.voltage_level, Zsc: zsc },
      result: isc_lim, unit: 'A', precision: 2,
    }));

    // Numerical-precision guard, ported 1:1 from the Python defensive check.
    // Algebraically Rs ≤ Zs always (Rs = Zs/√(1+ωTp²)), so xs_squared < 0
    // only from float rounding — already absorbed by the 1e-10 tolerance
    // above; this branch is for a "significant" negative value and is not
    // realistically reachable from valid inputs.
    const xsSquared = zs * zs - rs * rs;
    if (xsSquared < 0 && Math.abs(xsSquared) >= 1e-10) {
      warnings.push(['warning_numerical_precision_reactance', zs, rs, xsSquared]);
    }

    return { steps, warnings };
  }

  return {
    calculateSourceImpedance,
    calculateSourceImpedanceWithValidation,
    calculateZone1Impedance,
    calculateZone1FaultCurrent,
    addFaultCalculationSteps,
  };
})();
