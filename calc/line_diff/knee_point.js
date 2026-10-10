'use strict';
/**
 * line_diff/knee_point.js — Port of calculations/ct_line_differential/knee_point.py
 *
 * Knee-point (Vk/EALF) calculations for line differential protection, on top
 * of the shared CTKnee helpers (foundation/knee_point.js ← ct_shared/knee_point.py).
 * calculateRequiredVk stays application-specific (max of 4 EMF scenarios, vs.
 * distance's max of 2 fault locations); calculateProposedVk is a direct
 * re-export of CTKnee.calcProposedVk, mirroring the Python file's unchanged
 * re-export of ct_shared's calculate_proposed_vk; verifyVkAdequacy is a thin
 * wrapper dropping the warning element CTKnee.verifyVkAdequacy returns,
 * matching the Python's (status, conclusion_key) tuple. Extends the
 * CTLineDiff namespace (calc/line_diff.js, loaded first); composed by calc/line_diff/main.js.
 */

CTLineDiff.kneePoint = (() => {
  // ── calculate_required_vk(emf_results) ──────────────────────────────────
  // Required Vk for line differential: max of all four E.M.F. scenarios
  // (3-phase/1-phase internal, 3-phase/1-phase external/through fault).
  function calculateRequiredVk(emfResults) {
    return Math.max(
      emfResults.e_3p_in,
      emfResults.e_1p_in,
      emfResults.e_3p_ex,
      emfResults.e_1p_ex
    );
  }

  // ── calculate_proposed_vk(...) ───────────────────────────────────────────
  // Re-exported unchanged from the shared foundation (ct_shared/knee_point.py),
  // same as the Python file's `from calculations.ct_shared.knee_point import
  // calculate_proposed_vk`.
  const calculateProposedVk = CTKnee.calcProposedVk;

  // ── verify_vk_adequacy(proposed_vk, required_vk, is_px=False) ───────────
  // Backward-compat wrapper around the shared function: returns only
  // { status, conclusion }, dropping the warning element.
  function verifyVkAdequacy(proposedVk, requiredVk, isPx = false) {
    const { status, conclusion } = CTKnee.verifyVkAdequacy(proposedVk, requiredVk, isPx);
    return { status, conclusion };
  }

  return { calculateRequiredVk, calculateProposedVk, verifyVkAdequacy };
})();
