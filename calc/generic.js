'use strict';
/**
 * generic.js — Exact port of calculations/ct_generic.py
 * Generic protection fallback: used when a core's relay_type has no
 * dedicated module. Simple ALF/Vk-vs-connected-burden adequacy check
 * (no fault-current ratio is involved — the verdict is just ALF_act >= 1).
 */
const CTGeneric = (() => {

  // Module defaults for the cable fields (resolveParams); the temperature and
  // the method come from the project (commonData), PORTING_PLAN.md §9.2.
  const CABLE_DEFAULTS = { material: 'cu', cross_section_mm2: 4, length_m: 100 };

  function calculate(core, commonData = {}) {
    const {
      rct          = 4,
      burden       = 30,
      Is           = 1,
    } = core;

    const { alf, vk, is_px } = CTBase.getAlfOrVk(core);

    // Lead resistance R_lead = k·R_c — the project's method and temperature,
    // the core's wiring. Generic takes the worst current case, the 1-phase one
    // (§9.8): k = 2 with either wiring.
    const cable = CTCableRes.lead(
      CTCableRes.resolveMethod(commonData),
      CTCableRes.resolveParams(core, commonData, CABLE_DEFAULTS),
      CTCableRes.resolveTopology(core, 'generic'), 'single_phase');

    const Rn  = burden / (Is * Is);
    const Rc  = cable.r_loop;
    const total_ext = Rc;

    const steps = [
      ...cable.steps,
      CTStep.make({
        key:'burden_r', label_en:'Burden resistance', label_da:'Modstandsbyrde',
        latex:'R_n=\\frac{S_n}{I_{sr}^2}', result:Rn, unit:'Ω',
        variables: { Sn: burden, Isr: Is },
      }),
      CTStep.make({
        key:'total_ext', label_en:'Total external resistance', label_da:'Total kabelmodstand',
        latex:'R_{ext}=R_{lead}', result:total_ext, unit:'Ω',
        variables: { Rlead: Rc },
      }),
    ];

    let alf_actual, ealf = null;

    if (is_px && vk != null) {
      alf_actual = vk / (Is * (rct + total_ext));
      steps.push(CTStep.make({
        key:'alf_eq', label_en:'Equivalent ALF from knee-point voltage',
        label_da:'Ækvivalent ALF fra knæpunktspænding',
        latex:'ALF_{eq}=\\frac{V_k}{I_{sr}\\cdot(R_{ct}+R_{ext})}',
        result:alf_actual, precision:2,
        variables: { Vk: vk, Isr: Is, Rct: rct, Rext: total_ext },
      }));
    } else {
      alf_actual = alf * (rct + Rn) / (rct + total_ext);
      steps.push(CTStep.make({
        key:'alf_act', label_en:'Actual ALF at connected burden',
        label_da:'Aktuel ALF ved tilsluttet byrde',
        latex:'ALF_{act}=ALF\\cdot\\frac{R_{ct}+R_n}{R_{ct}+R_{ext}}',
        result:alf_actual, precision:2,
        variables: { ALF: alf, Rct: rct, Rn, Rext: total_ext },
      }));

      ealf = alf * Is * (rct + Rn);
      steps.push(CTStep.make({
        key:'ealf', label_en:'Offered knee-point voltage (from ALF)',
        label_da:'Tilbudt knæpunktspænding (fra ALF)',
        latex:'E_{ALF}=ALF\\cdot I_{sr}\\cdot(R_{ct}+R_n)',
        result:ealf, unit:'V', precision:2,
        variables: { ALF: alf, Isr: Is, Rct: rct, Rn },
      }));
    }

    const is_ok      = alf_actual >= 1;
    const conclusion = is_ok ? 'ct_sufficient' : 'ct_insufficient';
    const margin     = (alf_actual - 1) * 100;
    const warnings   = is_ok ? [] : [['warning_alf_insufficient', alf_actual, 1]];
    warnings.push(...cable.warnings);

    steps.push(CTStep.conclusion({
      key:'conclusion', label_en:'Conclusion', label_da:'Konklusion',
      latex:'ALF_{act}\\geq 1', is_ok,
      comparison:`${alf_actual.toFixed(2)} ${is_ok ? '≥' : '<'} 1`,
    }));

    const cable_res = {
      method: cable.method, source: cable.source, topology: cable.topology, factor: cable.factor,
      r_conductor: cable.r_conductor, r_loop: cable.r_loop, r20_per_km: cable.r20_per_km,
    };

    return { Rn, Rc, total_ext, alf_actual, ealf, alf, vk, is_px,
             is_ok, margin, warnings, conclusion, steps, status: is_ok ? 'OK' : 'NOT_OK',
             cable_res };
  }

  return { calculate };
})();
