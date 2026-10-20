'use strict';
/**
 * metering.js — Port of calculations/ct_metering.py
 * IEC 61869-2 Metering class CT (0.2, 0.2S, 0.5, 0.5S) dimensioning
 *
 * Deliberate deviations from ct_metering.py (issue #125, PORTING_PLAN.md
 * §10.6 F-MT-125):
 * - inclusive bounds per IEC 61869-2 5.6.201.3: Sn ≥ S ≥ Smin and Fmin ≥ Fsa;
 * - Smin is never below 1 VA (5.6.201.3: minimum 1 VA). `smin_floor_va`
 *   (default 1) is only there so the parity tests can feed the Python cases;
 * - the extended burden range (5.6.201.4, `extended_burden_range`): accuracy
 *   from 1 VA to Sn, allowed only for Sn ≤ 15 VA (warned and not applied
 *   otherwise);
 * - Smin% follows the accuracy class when one is picked (`mt_class`: 25 % for
 *   0.1 – 1 and 0.2S / 0.5S, 50 % for 3 and 5); with none it is the typed
 *   min_burden_percent;
 * - defaults Fmin 20 and Sdevice 0.1 VA (CEWE Prometer 100, CTMeterDB);
 * - CTSizer-only remarks (EXTRA_WARNINGS) after the Python ones: cond. 2
 *   cannot be met (Fs ≥ Fmin or S_req ≥ Sn), the burden missing for cond. 2
 *   (ΔS = S_req − S, S_req = Fs·(S_in+Sn)/Fmin − S_in), the lead burden above
 *   Sn and the extended burden range as a way out of S < Smin.
 */

const CTMetering = (() => {

  // Module defaults for the cable fields (resolveParams); the temperature and
  // the method come from the project (commonData), PORTING_PLAN.md §9.2.
  const CABLE_DEFAULTS = { material: 'cu', cross_section_mm2: 4, length_m: 100 };

  // IEC 61869-2 5.6.201.3: the lower end of the burden range per measuring class [% of Sn]
  const CLASS_SMIN_PERCENT = {
    '0.1': 25, '0.2': 25, '0.2S': 25, '0.5': 25, '0.5S': 25, '1': 25, '3': 50, '5': 50,
  };
  const SMIN_FLOOR_VA = 1;          // 5.6.201.3: minimum 1 VA
  const EXTENDED_MAX_SN_VA = 15;    // 5.6.201.4: extended range only for Sn ≤ 15 VA

  // Remarks CTSizer adds to the ct_metering.py ones (the parity tests drop them)
  const EXTRA_WARNINGS = [
    'warning_fs_not_below_fmin', 'hint_metering_add_burden',
    'hint_lead_burden_above_sn', 'hint_extended_burden_range',
    'warning_extended_range_sn_above_15',
  ];

  // a ≥ b with a relative tolerance, so a boundary that is equal on paper stays equal
  const ge = (a, b) => a >= b - 1e-9 * Math.max(1, Math.abs(b));

  // The Smin% the calculation uses: the class's, else the typed one
  function sminPercent(core) {
    const c = core && core.mt_class;
    return Object.prototype.hasOwnProperty.call(CLASS_SMIN_PERCENT, c)
      ? CLASS_SMIN_PERCENT[c] : (core && core.min_burden_percent != null ? core.min_burden_percent : 25);
  }

  function calculate(core, commonData = {}) {
    const {
      rct                = 2,
      burden             = 5,    // Sn — CT rated burden (nameplate)
      Is                 = 1,    // Isr — rated secondary current
      Ip                 = 1000, // Ipr — rated primary current
      fs_factor          = 5,    // Fs — instrument security factor (CT rating)
      min_safety_factor  = CTMeterDB.DEFAULT_FMIN,          // Fmin — meter overcurrent withstand
      attached_resistor  = 0,    // Rres — attached resistor (Ω)
      device_burden      = CTMeterDB.DEFAULT_CT_BURDEN_VA,  // Sdevice — meter burden (VA/phase)
      extended_burden_range = false,
      smin_floor_va      = SMIN_FLOOR_VA,
    } = core;
    const min_burden_percent = sminPercent(core);   // Smin% — min burden as % of Sn

    // CT Ratio
    const ct_ratio = Ip / Is;

    // Lead resistance R_lead = k·R_c — the project's method and temperature,
    // the core's wiring (default 6-wire for metering). Metering evaluates the
    // balanced 3-phase load case (§9.8).
    const cable = CTCableRes.lead(
      CTCableRes.resolveMethod(commonData),
      CTCableRes.resolveParams(core, commonData, CABLE_DEFAULTS),
      CTCableRes.resolveTopology(core, 'metering'), 'three_phase');
    const Rc = cable.r_loop;

    // Lead (cable) burden  S_lead = Isr² × R_lead
    const S_lead = Is * Is * Rc;

    // Resistor burden  S_res = Isr² × Rres
    const S_res = Is * Is * attached_resistor;

    // Total connected burden  S = Sconnected + Slead + Sres
    const S_total = device_burden + S_lead + S_res;

    // Internal burden  S_in = Rct × Isr²
    const S_in = rct * Is * Is;

    // Minimum required burden: the extended range (1 VA – Sn, only for
    // Sn ≤ 15 VA), else Smin% of the rated burden Sn, never below 1 VA
    const extended_requested = !!extended_burden_range;
    const extended = extended_requested && burden <= EXTENDED_MAX_SN_VA;
    const S_min = extended ? SMIN_FLOOR_VA
      : Math.max((min_burden_percent / 100) * burden, smin_floor_va);

    // Effective safety factor  Fsa = Fs × (S_in + Sn) / (S_in + S)
    const Fsa = (S_in + S_total) > 0
      ? fs_factor * (S_in + burden) / (S_in + S_total)
      : fs_factor;

    // Smallest total burden for cond. 2:  Fsa ≤ Fmin  ⇔  S ≥ Fs·(S_in + Sn)/Fmin − S_in
    const S_req = min_safety_factor > 0
      ? fs_factor * (S_in + burden) / min_safety_factor - S_in
      : Infinity;
    const delta_S = Math.max(0, S_req - S_total);
    // Cond. 2 can be met inside the burden range only if S_req < Sn, i.e. Fs < Fmin
    const cond2_feasible = fs_factor < min_safety_factor && S_req < burden;

    // Condition 1: Sn ≥ S ≥ Smin   |   Condition 2: Fmin ≥ Fsa  (inclusive, 5.6.201.3)
    const cond1 = ge(burden, S_total) && ge(S_total, S_min);
    const cond2 = ge(min_safety_factor, Fsa);
    const is_ok = cond1 && cond2;
    const margin = Fsa > 0 ? ((min_safety_factor - Fsa) / min_safety_factor) * 100 : 0;

    // warnings — ct_metering.py's result["warnings"] [key, ...args] entries,
    // then the CTSizer-only remarks (EXTRA_WARNINGS)
    const warnings = [];
    if (!cond1) warnings.push(['warning_burden_condition_not_met', burden, S_total, S_min]);
    if (!cond2) warnings.push(['warning_safety_factor_condition_not_met', min_safety_factor, Fsa]);
    if (!cond2) {
      if (!cond2_feasible) warnings.push(['warning_fs_not_below_fmin', fs_factor, min_safety_factor, S_req, burden]);
      else warnings.push(['hint_metering_add_burden', delta_S, S_req]);
    }
    if (S_lead > burden) warnings.push(['hint_lead_burden_above_sn', S_lead, burden]);
    if (extended_requested && !extended) {
      warnings.push(['warning_extended_range_sn_above_15', burden, EXTENDED_MAX_SN_VA]);
    }
    if (!extended && !ge(S_total, S_min) && ge(S_total, SMIN_FLOOR_VA) && burden <= EXTENDED_MAX_SN_VA) {
      warnings.push(['hint_extended_burden_range', S_total, S_min]);
    }
    warnings.push(...cable.warnings);
    const conclusion = is_ok ? 'ct_sufficient' : 'ct_insufficient';

    const steps = [
      ...cable.steps,
      CTStep.make({
        key: 'ct_ratio', label_en: 'CT Ratio', label_da: 'CT Forhold',
        latex: 'CT_{ratio}=\\frac{I_{pr}}{I_{sr}}', result: ct_ratio, precision: 0,
        variables: { Ipr: Ip, Isr: Is },
      }),
      CTStep.make({
        key: 's_lead', label_en: 'Cable burden', label_da: 'Kabelbyrde',
        latex: 'S_{lead}=I_{sr}^2\\cdot R_{lead}', result: S_lead, unit: 'VA',
        variables: { Isr: Is, Rlead: Rc },
      }),
      CTStep.make({
        key: 's_res', label_en: 'Resistor burden', label_da: 'Modstandsbyrde',
        latex: 'S_{res}=I_{sr}^2\\cdot R_{res}', result: S_res, unit: 'VA',
        variables: { Isr: Is, Rres: attached_resistor },
      }),
      CTStep.make({
        key: 's_total', label_en: 'Total connected burden', label_da: 'Total tilsluttet byrde',
        latex: 'S=S_{connected}+S_{lead}+S_{res}', result: S_total, unit: 'VA',
        variables: { Sconnected: device_burden, Slead: S_lead, Sres: S_res },
      }),
      CTStep.make({
        key: 's_in', label_en: 'Internal burden', label_da: 'Intern byrde',
        latex: 'S_{in}=R_{ct}\\cdot I_{sr}^2', result: S_in, unit: 'VA',
        variables: { Rct: rct, Isr: Is },
      }),
      extended
        ? CTStep.make({
          key: 's_min', label_en: 'Min. required burden (extended range)', label_da: 'Min. krævet byrde (udvidet område)',
          latex: 'S_{min}=1\\,\\text{VA}', result: S_min, unit: 'VA',
          variables: { Sn: burden },
        })
        : CTStep.make({
          key: 's_min', label_en: 'Min. required burden', label_da: 'Min. krævet byrde',
          latex: 'S_{min}=\\max(S_{min\\%}\\cdot S_n,\\;1\\,\\text{VA})', result: S_min, unit: 'VA',
          variables: { 'Smin%': min_burden_percent / 100, Sn: burden },
        }),
      CTStep.make({
        key: 'fsa', label_en: 'Effective safety factor Fsa', label_da: 'Effektiv sikkerhedsfaktor Fsa',
        latex: 'F_{sa}=F_s\\cdot\\frac{S_{in}+S_n}{S_{in}+S}', result: Fsa,
        variables: { Fs: fs_factor, S_in, Sn: burden, S: S_total },
      }),
      ...(Number.isFinite(S_req) ? [CTStep.make({
        key: 's_req', label_en: 'Min. burden for cond. 2 (Fsa = Fmin)', label_da: 'Min. byrde for bet. 2 (Fsa = Fmin)',
        latex: 'S_{req}=\\frac{F_s\\cdot(S_{in}+S_n)}{F_{min}}-S_{in}', result: S_req, unit: 'VA',
        variables: { Fs: fs_factor, S_in, Sn: burden, Fmin: min_safety_factor },
      })] : []),
      CTStep.conclusion({
        key: 'cond1', label_en: 'Cond. 1 — Burden check (Sn ≥ S ≥ Smin)', label_da: 'Bet. 1 — Byrde kontrol',
        latex: 'S_n\\geq S\\geq S_{min}', is_ok: cond1,
        comparison: `${burden} ≥ ${S_total.toFixed(4)} ≥ ${S_min.toFixed(4)}`,
      }),
      CTStep.conclusion({
        key: 'cond2', label_en: 'Cond. 2 — Safety factor (Fmin ≥ Fsa)', label_da: 'Bet. 2 — Sikkerhedsfaktor',
        latex: 'F_{min}\\geq F_{sa}', is_ok: cond2,
        comparison: `${min_safety_factor} ≥ ${Fsa.toFixed(4)}`,
      }),
      CTStep.conclusion({
        key: 'conclusion', label_en: 'Final conclusion', label_da: 'Endelig konklusion',
        latex: '\\text{Cond.1}\\wedge\\text{Cond.2}', is_ok,
        comparison: `${cond1 ? '✓' : '✗'}  ∧  ${cond2 ? '✓' : '✗'}`,
      }),
    ];

    return {
      ct_ratio, Rc, S_lead, S_res, S_total, S_in, S_min, Fsa,
      min_safety_factor,   // Fmin, the Summary's "Fmin req" card
      min_burden_percent, extended_burden_range: extended,
      S_req, delta_S, cond2_feasible,
      cond1, cond2, is_ok, margin, warnings, conclusion, steps,
      status: is_ok ? 'OK' : 'NOT_OK',
      cable_res: {
        method: cable.method, source: cable.source, topology: cable.topology, factor: cable.factor,
        r_conductor: cable.r_conductor, r_loop: cable.r_loop, r20_per_km: cable.r20_per_km,
      },
    };
  }

  return { calculate, sminPercent, CLASS_SMIN_PERCENT, SMIN_FLOOR_VA, EXTENDED_MAX_SN_VA, EXTRA_WARNINGS };
})();
