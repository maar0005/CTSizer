'use strict';
/**
 * foundation/knee_point.js — Port of calculations/ct_shared/knee_point.py
 *
 * Shared knee-point (EALF / Vk) helpers used by distance + line differential.
 * Note: required-Vk stays application-specific (distance: max of two fault
 * locations; line-diff: max of four EMF scenarios) and lives in those packages.
 */
const CTKnee = (() => {

  // calculate_proposed_vk — PX uses the specified Vk directly; otherwise
  // EALF = ALF · I_sr · (R_ct + S_n/I_sr²). Returns { vk, is_px }.
  function calcProposedVk(alf, secondaryCurrent, rct, burdenVa, vkSpecified = null, isPx = false) {
    if (isPx && vkSpecified != null) {
      return { vk: vkSpecified, is_px: true };
    }
    const burdenResistance = burdenVa / (secondaryCurrent * secondaryCurrent);
    const ealf = alf * secondaryCurrent * (rct + burdenResistance);
    return { vk: ealf, is_px: false };
  }

  // verify_vk_adequacy — compare proposed/offered vs required knee-point voltage.
  // Returns { status, conclusion, warning } where warning is null when adequate.
  function verifyVkAdequacy(proposedVk, requiredVk, isPx = false) {
    const vkLabel = isPx ? 'Vk' : 'EALF';
    if (proposedVk >= requiredVk) {
      return { status: 'OK', conclusion: 'ct_sufficient', warning: null };
    }
    return {
      status: 'NOT_OK',
      conclusion: 'ct_insufficient',
      warning: ['warning_knee_point_voltage_insufficient', vkLabel, proposedVk, requiredVk],
    };
  }

  return { calcProposedVk, verifyVkAdequacy };
})();
