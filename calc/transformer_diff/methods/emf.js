'use strict';
/**
 * transformer_diff/methods/emf.js — Port of
 * calculations/ct_transformer_differential/methods/emf.py
 *
 * E.M.F. method for transformer differential protection: required knee-point
 * voltage as the max of the internal-fault, through-fault and inrush E.m.f.s,
 * offered Vk/EALF (delegated to CTKnee.calcProposedVk, as the Python delegates
 * to ct_shared.knee_point) and the pass/fail check. calculate_relay_resistance
 * is re-exported from ct_base (CTBase.calcRelayResistance), as in the Python.
 * Python tuple returns are returned as JS arrays in the same order.
 * Extends the CTTransformerDiff namespace (calc/transformer_diff.js, loaded
 * first); consumed by calc/transformer_diff/main.js.
 */

CTTransformerDiff.methods = CTTransformerDiff.methods || {};
CTTransformerDiff.methods.emf = (() => {
  const { EMF_CONSTANTS } = CTTransformerDiff.presets;

  // ── calculate_emf_internal_fault ──────────────────────────────────────
  // E_int = Ik max × (Isr/Ipr) × (Rct + Rlead + Rrelay)
  function calculateEmfInternalFault(trafoIkMax, secondaryCurrent, primaryCurrent, rct, cableResistance, rRelay) {
    return trafoIkMax
      * (secondaryCurrent / primaryCurrent)
      * (rct + cableResistance + rRelay);
  }

  // ── calculate_emf_through_fault ───────────────────────────────────────
  // E_through = 2 × It max × (Isr/Ipr) × (Rct + Rlead + Rrelay)
  function calculateEmfThroughFault(trafoItMax, secondaryCurrent, primaryCurrent, rct, cableResistance, rRelay) {
    return EMF_CONSTANTS.through_fault_factor
      * trafoItMax
      * (secondaryCurrent / primaryCurrent)
      * (rct + cableResistance + rRelay);
  }

  // ── calculate_emf_inrush ──────────────────────────────────────────────
  // E_inrush = k_inrush × Ipr × (Isr/Ipr) × (Rct + Rlead + Rrelay)
  function calculateEmfInrush(inrushFactor, primaryCurrent, secondaryCurrent, rct, cableResistance, rRelay) {
    return inrushFactor
      * primaryCurrent
      * (secondaryCurrent / primaryCurrent)
      * (rct + cableResistance + rRelay);
  }

  // ── calculate_emf_scenarios → [e_internal, e_through, e_inrush] ───────
  function calculateEmfScenarios(trafoIkMax, trafoItMax, inrushFactor, primaryCurrent, secondaryCurrent,
                                 rct, cableResistance, rRelay) {
    const eInternal = calculateEmfInternalFault(
      trafoIkMax, secondaryCurrent, primaryCurrent, rct, cableResistance, rRelay);
    const eThrough = calculateEmfThroughFault(
      trafoItMax, secondaryCurrent, primaryCurrent, rct, cableResistance, rRelay);
    const eInrush = calculateEmfInrush(
      inrushFactor, primaryCurrent, secondaryCurrent, rct, cableResistance, rRelay);
    return [eInternal, eThrough, eInrush];
  }

  // ── calculate_required_vk ─────────────────────────────────────────────
  // Vk = Max(E_int, E_through, E_inrush)
  function calculateRequiredVk(eInternal, eThrough, eInrush) {
    return Math.max(eInternal, eThrough, eInrush);
  }

  // ── calculate_offered_vk → [proposed_vk, vk_label] ────────────────────
  // EALF (or the specified Vk for PX), via the shared calculate_proposed_vk.
  function calculateOfferedVk(alf, secondaryCurrent, rct, burdenVa, isPx, vkSpecified) {
    const { vk, is_px } = CTKnee.calcProposedVk(
      alf, secondaryCurrent, rct, burdenVa, vkSpecified, isPx);
    return [vk, is_px ? 'Vk' : 'EALF'];
  }

  // ── verify_emf_method ─────────────────────────────────────────────────
  // True when the offered knee-point voltage meets the E.m.f. requirement.
  function verifyEmfMethod(ealf, vkRequired) {
    return ealf >= vkRequired;
  }

  return {
    calculateRelayResistance: CTBase.calcRelayResistance,
    calculateEmfInternalFault, calculateEmfThroughFault, calculateEmfInrush,
    calculateEmfScenarios, calculateRequiredVk, calculateOfferedVk, verifyEmfMethod,
  };
})();
