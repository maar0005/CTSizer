'use strict';
/**
 * distance/knee_point.js — Port of calculations/ct_distance/knee_point.py
 *
 * Required/proposed knee-point voltage for distance protection, on top of
 * the shared CTKnee helpers (foundation/knee_point.js ← ct_shared/knee_point.py).
 * Extends the CTDistance namespace (calc/distance.js, loaded first); composed by calc/distance/main.js.
 */

CTDistance.kneePoint = (() => {
  // ── calculate_required_vk(vka, vkb) ────────────────────────────────────
  // Required Vk for distance protection: max of close-in (Vka) and zone-1
  // end-fault (Vkb) requirements.
  function calculateRequiredVk(vka, vkb) {
    return Math.max(vka, vkb);
  }

  // ── calculate_proposed_ealf(core, burdenVa, secondaryCurrent, rct) ──────
  // Resolves ALF/Vk from the core, then delegates to the shared
  // CTKnee.calcProposedVk. Returns { ealf, is_px }.
  function calculateProposedEalf(core, burdenVa, secondaryCurrent, rct) {
    const { alf, vk, is_px } = CTBase.getAlfOrVk(core);
    const { vk: ealf, is_px: isPxResult } = CTKnee.calcProposedVk(
      alf, secondaryCurrent, rct, burdenVa, vk, is_px
    );
    return { ealf, is_px: isPxResult };
  }

  // ── add_knee_point_steps(...) ───────────────────────────────────────────
  // Appends the required-Vk row, then either the specified-Vk (PX) row or
  // the offered-EALF (ALF) row, depending on the core's class.
  function addKneePointSteps(steps, vka, vkb, vkRequired, ealf, isPx, core, burdenVa, secondaryCurrent, rct) {
    steps.push(CTStep.make({
      key: 'required_knee_point_voltage',
      label_en: 'Required knee point voltage',
      label_da: 'Krævet knæpunktspænding',
      latex: 'V_k = \\max(V_{ka}, V_{kb})',
      variables: { Vka: vka, Vkb: vkb },
      result: vkRequired, unit: 'V', precision: 2,
    }));

    const { alf, vk: vkSpecified } = CTBase.getAlfOrVk(core);

    if (isPx && vkSpecified != null) {
      steps.push(CTStep.make({
        key: 'specified_knee_point_voltage_px',
        label_en: 'Specified knee point voltage (PX class)',
        label_da: 'Specificeret knæpunktspænding (PX klasse)',
        latex: 'V_k = V_{k,spec}',
        variables: { 'Vk_spec': vkSpecified },
        result: ealf, unit: 'V', precision: 2,
      }));
    } else {
      steps.push(CTStep.make({
        key: 'offered_knee_point_voltage_alf',
        label_en: 'Offered knee point voltage (from ALF)',
        label_da: 'Tilbudt knæpunktspænding (fra ALF)',
        latex: 'E_{ALF} = ALF \\cdot I_{sr} \\cdot \\left(R_{ct} + \\frac{S_n}{I_{sr}^2}\\right)',
        variables: { ALF: alf, Isr: secondaryCurrent, Rct: rct, Sn: burdenVa },
        result: ealf, unit: 'V', precision: 2,
      }));
    }

    return steps;
  }

  return { calculateRequiredVk, calculateProposedEalf, addKneePointSteps };
})();
