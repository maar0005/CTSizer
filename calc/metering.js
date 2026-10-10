'use strict';
/**
 * metering.js — Exact port of calculations/ct_metering.py
 * IEC 61869-2 Metering class CT (0.2, 0.2S, 0.5, 0.5S) dimensioning
 */

const CTMetering = (() => {

  // Module defaults for the cable fields (resolveParams); the temperature and
  // the method come from the project (commonData), PORTING_PLAN.md §9.2.
  const CABLE_DEFAULTS = { material: 'cu', cross_section_mm2: 4, length_m: 100 };

  function calculate(core, commonData = {}) {
    const {
      rct                = 2,
      burden             = 5,    // Sn — CT rated burden (nameplate)
      Is                 = 1,    // Isr — rated secondary current
      Ip                 = 1000, // Ipr — rated primary current
      fs_factor          = 5,    // Fs — instrument security factor
      min_burden_percent = 25,   // Smin% — min burden as % of Sn
      min_safety_factor  = 5,    // Fmin — min required safety factor of devices
      attached_resistor  = 0,    // Rres — attached resistor (Ω)
      device_burden      = 0,    // Sdevice — connected device burden (VA)
    } = core;

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

    // Minimum required burden (uses CT rated burden Sn, not connected burden)
    const S_min = (min_burden_percent / 100) * burden;

    // Effective safety factor  Fsa = Fs × (S_in + Sn) / (S_in + S)
    const Fsa = (S_in + S_total) > 0
      ? fs_factor * (S_in + burden) / (S_in + S_total)
      : fs_factor;

    // Condition 1: Sn > S > Smin   |   Condition 2: Fmin > Fsa
    const cond1 = burden > S_total && S_total > S_min;
    const cond2 = min_safety_factor > Fsa;
    const is_ok = cond1 && cond2;
    const margin = Fsa > 0 ? ((min_safety_factor - Fsa) / min_safety_factor) * 100 : 0;

    // warnings — mirrors ct_metering.py's result["warnings"] [key, ...args] entries
    const warnings = [];
    if (!cond1) warnings.push(['warning_burden_condition_not_met', burden, S_total, S_min]);
    if (!cond2) warnings.push(['warning_safety_factor_condition_not_met', min_safety_factor, Fsa]);
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
      CTStep.make({
        key: 's_min', label_en: 'Min. required burden', label_da: 'Min. krævet byrde',
        latex: 'S_{min}=S_{min\\%}\\cdot S_n', result: S_min, unit: 'VA',
        variables: { 'Smin%': min_burden_percent / 100, Sn: burden },
      }),
      CTStep.make({
        key: 'fsa', label_en: 'Effective safety factor Fsa', label_da: 'Effektiv sikkerhedsfaktor Fsa',
        latex: 'F_{sa}=F_s\\cdot\\frac{S_{in}+S_n}{S_{in}+S}', result: Fsa,
        variables: { Fs: fs_factor, S_in, Sn: burden, S: S_total },
      }),
      CTStep.conclusion({
        key: 'cond1', label_en: 'Cond. 1 — Burden check (Sn > S > Smin)', label_da: 'Bet. 1 — Byrde kontrol',
        latex: 'S_n>S>S_{min}', is_ok: cond1,
        comparison: `${burden} > ${S_total.toFixed(4)} > ${S_min.toFixed(4)}`,
      }),
      CTStep.conclusion({
        key: 'cond2', label_en: 'Cond. 2 — Safety factor (Fmin > Fsa)', label_da: 'Bet. 2 — Sikkerhedsfaktor',
        latex: 'F_{min}>F_{sa}', is_ok: cond2,
        comparison: `${min_safety_factor} > ${Fsa.toFixed(4)}`,
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
      cond1, cond2, is_ok, margin, warnings, conclusion, steps,
      status: is_ok ? 'OK' : 'NOT_OK',
      cable_res: {
        method: cable.method, source: cable.source, topology: cable.topology, factor: cable.factor,
        r_conductor: cable.r_conductor, r_loop: cable.r_loop, r20_per_km: cable.r20_per_km,
      },
    };
  }

  return { calculate };
})();
