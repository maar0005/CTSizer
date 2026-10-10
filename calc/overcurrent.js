'use strict';
/**
 * overcurrent.js — Exact port of calculations/ct_overcurrent.py
 * IEC 61869-2 Overcurrent Protection CT dimensioning
 */

const CTOvercurrent = (() => {

  // Module defaults for the cable fields (resolveParams); the temperature and
  // the method come from the project (commonData), PORTING_PLAN.md §9.2.
  const CABLE_DEFAULTS = { material: 'cu', cross_section_mm2: 4, length_m: 100 };

  function calculate(core, commonData = {}) {
    const {
      rct          = 4,
      burden       = 30,
      Is           = 1,
      Ip           = 2000,
      relay_burden = 0.05,
      // Isc_max: prefer system data, allow per-core override
      Isc_max_override,
    } = core;

    // ct_base.get_alf_or_vk — resolves alf/vk/is_px (conservative default ALF 30)
    const { alf, vk, is_px } = CTBase.getAlfOrVk(core);

    const Isc_max = Isc_max_override != null
      ? Isc_max_override
      : (commonData.isc_sys ?? 63) * 1000;

    // Lead resistance R_lead = k·R_c — the project's method and temperature,
    // the core's wiring. Overcurrent takes the worst current case, the 1-phase
    // one (§9.8): k = 2 with either wiring.
    const cable = CTCableRes.lead(
      CTCableRes.resolveMethod(commonData),
      CTCableRes.resolveParams(core, commonData, CABLE_DEFAULTS),
      CTCableRes.resolveTopology(core, 'overcurrent'), 'single_phase');
    const Rc  = cable.r_loop;
    const Rr  = CTBase.calcRelayResistance(relay_burden, Is);
    const Rn  = burden / (Is * Is);
    const Rext = Rc + Rr;
    const Rt   = rct + Rc + Rr;

    const ALF_req = Isc_max / Ip;

    let ALF_act;
    if (is_px && vk != null) {
      ALF_act = vk / (Is * (rct + Rext));
    } else {
      ALF_act = alf * (rct + Rn) / (rct + Rext);
    }

    const Esat     = ALF_act * Is * Rt;
    const Esat_req = ALF_req  * Is * Rt;
    const is_ok    = ALF_act >= ALF_req;
    const margin   = ((ALF_act - ALF_req) / ALF_req) * 100;

    // warnings — mirrors ct_overcurrent.py's result["warnings"] [key, ...args] entries
    const warnings = is_ok ? [] : [['warning_alf_insufficient', ALF_act, ALF_req]];
    warnings.push(...cable.warnings);
    const conclusion = is_ok ? 'ct_sufficient' : 'ct_insufficient';

    const steps = [
      ...cable.steps,
      CTStep.make({
        key:'relay_r', label_en:'Relay resistance', label_da:'Relæmodstand',
        latex:'R_{relay}=\\frac{S_R}{I_{sr}^2}', result:Rr, unit:'Ω',
        variables: { SR: relay_burden, Isr: Is },
      }),
      CTStep.make({
        key:'total_r', label_en:'Total secondary resistance', label_da:'Total sekundær modstand',
        latex:'R_{total}=R_{ct}+R_{lead}+R_{relay}', result:Rt, unit:'Ω',
        variables: { Rct: rct, Rlead: Rc, Rrelay: Rr },
      }),
      CTStep.make({
        key:'alf_req', label_en:'Required ALF', label_da:'Krævet ALF',
        latex:'ALF_{req}=\\frac{I_{sc,max}}{I_{pr}}', result:ALF_req, precision:2,
        variables: { Isc_max, Ipr: Ip },
      }),
      CTStep.make({
        key:'burden_r', label_en:'Burden resistance', label_da:'Byrdemodstand',
        latex:'R_n=\\frac{S_n}{I_{sr}^2}', result:Rn, unit:'Ω',
        variables: { Sn: burden, Isr: Is },
      }),
      CTStep.make({
        key:'alf_act',
        label_en: is_px ? 'Equiv. ALF from knee-point' : 'Actual ALF at connected burden',
        label_da: is_px ? 'Ækvivalent ALF fra knæpunkt' : 'Aktuel ALF ved tilsluttet byrde',
        latex: is_px
          ? 'ALF_{eq}=\\frac{V_k}{I_{sr}(R_{ct}+R_{ext})}'
          : 'ALF_{act}=ALF\\cdot\\frac{R_{ct}+R_n}{R_{ct}+R_{ext}}',
        result:ALF_act, precision:2,
        variables: is_px ? { Vk: vk, Isr: Is, Rct: rct, Rext } : { ALF: alf, Rct: rct, Rn, Rext },
      }),
      CTStep.make({
        key:'esat', label_en:'Secondary saturation voltage', label_da:'Sekundær mætningsspænding',
        latex:'E_{sat}=ALF_{act}\\cdot I_{sr}\\cdot R_{total}', result:Esat, unit:'V', precision:2,
        variables: { ALF_act, Isr: Is, R_total: Rt },
      }),
      CTStep.conclusion({
        key:'conclusion', label_en:'Conclusion', label_da:'Konklusion',
        latex:'ALF_{act}\\geq ALF_{req}', is_ok,
        comparison:`${ALF_act.toFixed(2)} ${is_ok?'≥':'<'} ${ALF_req.toFixed(2)}`,
      }),
    ];

    return { Rc, Rr, Rt, Rn, Rext, ALF_req, ALF_act, Esat, Esat_req, Is,
             Isc_max, is_ok, margin, warnings, conclusion, steps, status: is_ok ? 'OK' : 'NOT_OK',
             cable_res: {
               method: cable.method, source: cable.source, topology: cable.topology, factor: cable.factor,
               r_conductor: cable.r_conductor, r_loop: cable.r_loop, r20_per_km: cable.r20_per_km,
             } };
  }

  // ── Saturation curve (for chart) ──────────────────────────────────────
  function satCurve(result) {
    if (!result?.ALF_act) return [];
    const { ALF_act, ALF_req, Rt, Is } = result;
    const maxAlf = Math.max(ALF_act, ALF_req, 5) * 1.55;
    return Array.from({ length: 80 }, (_, i) => ({
      alf: (i / 79) * maxAlf,
      e:   (i / 79) * maxAlf * Is * Rt,
    }));
  }

  return { calculate, satCurve };
})();
