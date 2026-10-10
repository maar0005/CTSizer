'use strict';
/**
 * busbar.js — Exact port of calculations/ct_busbar.py
 * IEC 61869-2 Busbar protection CT dimensioning.
 *
 * P-class: REB500 operating ALF method (Hitachi Energy BusbarApplication.pdf).
 * PX-class: EMF/Vk knee-point method for high-impedance busbar schemes.
 */
const CTBusbar = (() => {

  // Module defaults for the cable fields (resolveParams); the temperature and
  // the method come from the project (commonData), PORTING_PLAN.md §9.2.
  const CABLE_DEFAULTS = { material: 'cu', cross_section_mm2: 4, length_m: 100 };

  function calculate(core, commonData = {}) {
    const {
      rct          = 4,
      burden       = 30,    // Sn — rated CT burden
      Is           = 1,     // Isr
      Ip           = 2000,  // Ipr
      relay_burden = 0.02,  // SR
    } = core;

    const { isc_sys = 40, tp = 100 } = commonData;
    const i_fmax = isc_sys * 1000;

    // ct_base.get_alf_or_vk — resolves alf/vk/is_px (conservative default ALF 30)
    const { alf, vk, is_px } = CTBase.getAlfOrVk(core);

    // Lead resistance R_lead = k·R_c — the project's method and temperature,
    // the core's wiring. Busbar takes the worst current case, the 1-phase one
    // (§9.8): k = 2 with either wiring.
    const cable = CTCableRes.lead(
      CTCableRes.resolveMethod(commonData),
      CTCableRes.resolveParams(core, commonData, CABLE_DEFAULTS),
      CTCableRes.resolveTopology(core, 'busbar'), 'single_phase');
    const Rc      = cable.r_loop;
    const r_relay = CTBase.calcRelayResistance(relay_burden, Is);

    const relayStep = CTStep.make({
      key:'relay_r', label_en:'Relay resistance', label_da:'Relæmodstand',
      latex:'R_{relay}=\\frac{S_R}{I_R^2}', result:r_relay, unit:'Ω',
      variables: { SR: relay_burden, IR: Is },
    });

    const result = (is_px && vk != null)
      ? calculatePxClass({ i_fmax, Is, Ip, rct, Rc, r_relay, vk, relayStep })
      : calculatePClass({ core, i_fmax, tp, rct, burden, Is, Ip, alf, relay_burden, Rc, r_relay, relayStep });

    result.warnings.push(...cable.warnings);
    result.steps.unshift(...cable.steps);
    result.cable_res = {
      method: cable.method, source: cable.source, topology: cable.topology, factor: cable.factor,
      r_conductor: cable.r_conductor, r_loop: cable.r_loop, r20_per_km: cable.r20_per_km,
    };
    return result;
  }

  // ── PX class: EMF/Vk knee-point method ────────────────────────────────
  function calculatePxClass({ i_fmax, Is, Ip, rct, Rc, r_relay, vk, relayStep }) {
    // E.m.f. for internal fault
    const e_internal = i_fmax * (Is / Ip) * (rct + Rc + r_relay);
    // E.m.f. for through fault (factor of 2 for worst-case asymmetry)
    const e_through   = 2 * e_internal;
    const vk_required = Math.max(e_internal, e_through);

    const is_ok      = vk >= vk_required;
    const conclusion = is_ok ? 'ct_sufficient' : 'ct_insufficient';
    const margin     = vk_required > 0 ? ((vk - vk_required) / vk_required) * 100 : 0;
    const warnings   = is_ok ? [] : [['warning_knee_point_voltage_insufficient', 'Vk', vk, vk_required]];

    const steps = [
      relayStep,
      CTStep.make({
        key:'emf_internal', label_en:'E.m.f. for internal fault', label_da:'E.m.f. for intern fejl',
        latex:'E_{int}=I_{f,max}\\cdot\\frac{I_{sr}}{I_{pr}}\\cdot(R_{ct}+R_{lead}+R_{relay})',
        result:e_internal, unit:'V', precision:2,
        variables: { Ifmax: i_fmax, Isr: Is, Ipr: Ip, Rct: rct, Rlead: Rc, Rrelay: r_relay },
      }),
      CTStep.make({
        key:'emf_through', label_en:'E.m.f. for through fault', label_da:'E.m.f. for through fejl',
        latex:'E_{through}=2\\cdot I_{f,max}\\cdot\\frac{I_{sr}}{I_{pr}}\\cdot(R_{ct}+R_{lead}+R_{relay})',
        result:e_through, unit:'V', precision:2,
        variables: { Ifmax: i_fmax, Isr: Is, Ipr: Ip, Rct: rct, Rlead: Rc, Rrelay: r_relay },
      }),
      CTStep.make({
        key:'vk_required', label_en:'Required knee point voltage', label_da:'Krævet knæpunktspænding',
        latex:'V_k=\\max(E_{int},E_{through})', result:vk_required, unit:'V', precision:2,
        variables: { E_int: e_internal, E_through: e_through },
      }),
      CTStep.make({
        key:'vk_specified', label_en:'Specified knee point voltage (PX class)',
        label_da:'Specificeret knæpunktspænding (PX klasse)',
        latex:'V_k=V_{k,spec}', result:vk, unit:'V', precision:2,
        variables: { Vk_spec: vk },
      }),
      CTStep.conclusion({
        key:'conclusion', label_en:'Conclusion', label_da:'Konklusion',
        latex:'V_k\\geq V_{k,req}', is_ok,
        comparison:`${vk.toFixed(2)} V ${is_ok ? '≥' : '<'} ${vk_required.toFixed(2)} V`,
      }),
    ];

    return { Rc, r_relay, e_internal, e_through, vk_required, vk, is_px: true,
             is_ok, margin, warnings, conclusion, steps, status: is_ok ? 'OK' : 'NOT_OK' };
  }

  // ── P class: REB500 operating ALF method ──────────────────────────────
  function calculatePClass({ core, i_fmax, tp, rct, burden, Is, Ip, alf, relay_burden, Rc, r_relay, relayStep }) {
    // Relay-specific busbar Fa minimums (Check 3) require data/relay_database.py,
    // a separate not-yet-ported subsystem; this mirrors Python's own fallback
    // (returns null when no relay database entry is found).
    const busbarParams = getBusbarParams(core);

    // S_in = Isr² × Rct (internal CT burden)
    const S_in = Is * Is * rct;
    // S_a = (Isr² × R_lead) + SR (actual connected burden)
    const S_a  = Is * Is * Rc + relay_burden;
    const S_n  = burden;

    // Check 1: Sn > Sa (burden adequacy)
    const check1 = S_n > S_a;

    // F_a = Fn × (Sin + Sn) / (Sin + Sa) (operating ALF)
    const f_n = alf;
    const f_a = f_n * (S_in + S_n) / (S_in + S_a);

    // Check 2: Fa ≥ Ifmax / Ipr (fault current adequacy)
    const fault_ratio = i_fmax / Ip;
    const check2 = f_a >= fault_ratio;

    // Check 3: Fa ≥ Fa_min(Tp) (manufacturer minimum, if relay params available)
    let check3 = true;
    let fa_min = null;
    if (busbarParams) {
      fa_min = tp <= busbarParams.tp_threshold ? busbarParams.fa_min_low_tp : busbarParams.fa_min_high_tp;
      check3 = f_a >= fa_min;
    }

    const is_ok      = check1 && check2 && check3;
    const conclusion = is_ok ? 'ct_sufficient' : 'ct_insufficient';
    const margin     = fault_ratio > 0 ? ((f_a - fault_ratio) / fault_ratio) * 100 : 0;

    const warnings = [];
    if (!check1) warnings.push(['warning_burden_inadequate', S_n, S_a]);
    if (!check2) warnings.push(['warning_fault_current_ratio_exceeded', f_a, fault_ratio]);
    if (!check3) warnings.push(['warning_manufacturer_fa_minimum', f_a, fa_min]);

    const steps = [
      relayStep,
      CTStep.make({
        key:'s_in', label_en:'Internal CT burden', label_da:'Intern CT byrde',
        latex:'S_{in}=I_{sr}^2\\cdot R_{ct}', result:S_in, unit:'VA',
        variables: { Isr: Is, Rct: rct },
      }),
      CTStep.make({
        key:'s_a', label_en:'Actual connected burden', label_da:'Faktisk tilsluttet byrde',
        latex:'S_a=(I_{sr}^2\\cdot R_{lead})+S_R', result:S_a, unit:'VA',
        variables: { Isr: Is, Rlead: Rc, SR: relay_burden },
      }),
      CTStep.conclusion({
        key:'check1', label_en:'Check 1 — Burden adequacy (Sn > Sa)',
        label_da:'Check 1 — Byrde tilstrækkelighed',
        latex:'S_n>S_a', unit:'VA', is_ok:check1,
        comparison:`S_n ${S_n.toFixed(2)} VA ${check1 ? '>' : '≤'} S_a ${S_a.toFixed(4)} VA`,
      }),
      CTStep.make({
        key:'f_a', label_en:'Operating ALF (Fa)', label_da:'Drifts ALF (Fa)',
        latex:'F_a=F_n\\cdot\\frac{S_{in}+S_n}{S_{in}+S_a}', result:f_a,
        variables: { Fn: f_n, Sin: S_in, Sn: S_n, Sa: S_a },
      }),
      CTStep.make({
        key:'fault_ratio', label_en:'Required ratio (Ifmax/Ipr)', label_da:'Krævet forhold (Ifmax/Ipr)',
        latex:'\\frac{I_{f,max}}{I_{pr}}', result:fault_ratio, precision:2,
        variables: { Ifmax: i_fmax, Ipr: Ip },
      }),
      CTStep.conclusion({
        key:'check2', label_en:'Check 2 — Fault current adequacy (Fa ≥ Ifmax/Ipr)',
        label_da:'Check 2 — Fejlstrøm tilstrækkelighed',
        latex:'F_a\\geq\\frac{I_{f,max}}{I_{pr}}', is_ok:check2,
        comparison:`F_a ${f_a.toFixed(4)} ${check2 ? '≥' : '<'} I_fmax/I_pr ${fault_ratio.toFixed(2)}`,
      }),
    ];

    if (busbarParams) {
      steps.push(CTStep.conclusion({
        key:'check3', label_en:'Check 3 — Manufacturer Fa minimum (Tp-dependent)',
        label_da:'Check 3 — Fabrikant Fa minimum',
        latex:'F_a\\geq F_{a,min}(T_p)', is_ok:check3,
        comparison:`F_a ${f_a.toFixed(4)} ${check3 ? '≥' : '<'} F_a_min ${fa_min.toFixed(1)} (Tp=${tp.toFixed(0)} ms)`,
      }));
    }

    steps.push(CTStep.conclusion({
      key:'conclusion', label_en:'Conclusion', label_da:'Konklusion',
      latex:'\\text{Check1}\\wedge\\text{Check2}\\wedge\\text{Check3}', is_ok,
      comparison:`Check1 ${check1 ? '✓' : '✗'}  ∧  Check2 ${check2 ? '✓' : '✗'}` +
        (busbarParams ? `  ∧  Check3 ${check3 ? '✓' : '✗'}` : ''),
    }));

    return { Rc, r_relay, S_in, S_a, f_a, fault_ratio, check1, check2, check3, fa_min,
             is_px: false, is_ok, margin, warnings, conclusion, steps, status: is_ok ? 'OK' : 'NOT_OK' };
  }

  // ct_busbar._get_busbar_params — relay-specific busbar Fa minimums.
  // data/relay_database.py is not yet ported; returns null until it is,
  // which keeps Check 3 inactive ("N/A") exactly as Python does for any
  // relay_name not found in its database.
  function getBusbarParams(core) {
    return null;
  }

  return { calculate };
})();
