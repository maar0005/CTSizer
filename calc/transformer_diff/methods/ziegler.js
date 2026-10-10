'use strict';
/**
 * transformer_diff/methods/ziegler.js — Port of
 * calculations/ct_transformer_differential/methods/ziegler.py
 *
 * G. Ziegler method for transformer differential protection: symmetrical
 * short-circuit factors Kssc (internal / external), the derived ALF
 * requirements, and the pass/fail check against the operating ALF.
 *
 * Reference: G. Ziegler, "Numerical Differential Protection: Principles and
 * Applications", 4th Ed., Section 3.2.3. Factors: Siemens SIP5 7UT8 manual
 * C53000-G5040-C016, CT requirements 1–3 (ALF_O ≥ 1.5·Isc,max,ext/Ipr,
 * ALF_O ≥ 0.4·Isc,max,int/Ipr, ALF_O ≥ 12.5).
 *
 * Python tuple returns are returned as JS arrays in the same order; Python
 * `None` is `null`. Extends the CTTransformerDiff namespace (calc/transformer_diff.js,
 * loaded first); consumed by calc/transformer_diff/main.js.
 */

CTTransformerDiff.methods = CTTransformerDiff.methods || {};
CTTransformerDiff.methods.ziegler = (() => {
  const { ZIEGLER_CONSTANTS } = CTTransformerDiff.presets;

  // ── calculate_kssc ────────────────────────────────────────────────────
  // → [kssc_int, kssc_ext]
  function calculateKssc(trafoItMax, trafoIkMax, primaryCurrent) {
    const ksscInt = trafoIkMax / primaryCurrent;
    const ksscExt = trafoItMax / primaryCurrent;
    return [ksscInt, ksscExt];
  }

  // ── calculate_alf_requirements ────────────────────────────────────────
  // ALF_req,int = 0.4 × Kssc,int (Siemens 7UT8 Requirement 2, internal faults)
  // ALF_req,ext = 1.5 × Kssc,ext (security during through faults)
  // ALF_req = max(ALF_req,int, ALF_req,ext, 12.5) (Siemens combined)
  // → [siemens_alf_int_req, siemens_alf_ext_req, siemens_alf_required]
  function calculateAlfRequirements(ksscInt, ksscExt) {
    const siemensAlfIntReq = ZIEGLER_CONSTANTS.int_fault_factor * ksscInt;
    const siemensAlfExtReq = ZIEGLER_CONSTANTS.ext_fault_factor * ksscExt;
    const siemensAlfRequired = Math.max(siemensAlfIntReq, siemensAlfExtReq, ZIEGLER_CONSTANTS.min_alf);

    return [siemensAlfIntReq, siemensAlfExtReq, siemensAlfRequired];
  }

  // ── verify_ziegler_method ─────────────────────────────────────────────
  // For PX class (alf_o is None) → true (use the E.m.f. method instead).
  function verifyZieglerMethod(alfO, siemensAlfRequired) {
    if (alfO == null) return true;  // For PX class, use E.m.f. method instead
    return alfO >= siemensAlfRequired;
  }

  return { calculateKssc, calculateAlfRequirements, verifyZieglerMethod };
})();
