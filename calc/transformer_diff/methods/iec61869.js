'use strict';
/**
 * transformer_diff/methods/iec61869.js — Port of
 * calculations/ct_transformer_differential/methods/iec61869.py
 *
 * IEC 61869 method for transformer differential protection: required ALF for
 * external (through) and internal faults, the minimum ALF, the adaptation
 * factor F_adap, and the four pass/fail checks (with the Danish "Krav 1–4"
 * result strings, verbatim from the Python).
 *
 * Note (from the Python): the factors (1.5, 0.4, 12.5, F_adap 0.05–20) are
 * relay-manufacturer-specific (Siemens 7UT8 manual), not IEC normative.
 *
 * Python tuple returns are returned as JS arrays in the same order; Python
 * `None` is `null`. Extends the CTTransformerDiff namespace (calc/transformer_diff.js,
 * loaded first); consumed by calc/transformer_diff/main.js.
 */

CTTransformerDiff.methods = CTTransformerDiff.methods || {};
CTTransformerDiff.methods.iec61869 = (() => {
  const { IEC_CONSTANTS } = CTTransformerDiff.presets;

  // ── calculate_iec_requirements ────────────────────────────────────────
  // → [alf_ext_required, alf_int_required, alf_min_required, i_ref, f_adap]
  // minAlf (the IED's min_alf) is a CTSizer addition (issue #93): the Python
  // always takes IEC_CONSTANTS.min_alf for Requirement 3.
  function calculateIecRequirements(trafoItMax, trafoIkMax, primaryCurrent,
                                    trafoRatedPower, trafoPrimaryVoltage,
                                    extFaultFactor = null, intFaultFactor = null, minAlf = null) {
    if (extFaultFactor == null) extFaultFactor = IEC_CONSTANTS.ext_fault_factor;
    if (intFaultFactor == null) intFaultFactor = IEC_CONSTANTS.int_fault_factor;
    if (minAlf == null) minAlf = IEC_CONSTANTS.min_alf;

    // Requirement 1: ALF_O >= ext_fault_factor × (Isc,max,ext / Ipr)
    const alfExtRequired = extFaultFactor * (trafoItMax / primaryCurrent);

    // Requirement 2: ALF_O >= int_fault_factor × (Isc,max,int / Ipr)
    const alfIntRequired = intFaultFactor * (trafoIkMax / primaryCurrent);

    // Requirement 3: ALF_O >= min_alf
    const alfMinRequired = minAlf;

    // Requirement 4: adaptation factor range
    const iRef = trafoRatedPower / (Math.sqrt(3) * trafoPrimaryVoltage);  // kA
    const fAdap = (primaryCurrent / 1000) / iRef;  // primary_current in A, i_ref in kA

    return [alfExtRequired, alfIntRequired, alfMinRequired, iRef, fAdap];
  }

  // ── verify_alf_external_fault / internal_fault / minimum ──────────────
  // null when ALF_O is unknown (Python None), else ALF_O >= required.
  function verifyAlfExternalFault(alfO, alfExtRequired) {
    if (alfO == null) return null;
    return alfO >= alfExtRequired;
  }

  function verifyAlfInternalFault(alfO, alfIntRequired) {
    if (alfO == null) return null;
    return alfO >= alfIntRequired;
  }

  function verifyAlfMinimum(alfO, alfMinRequired) {
    if (alfO == null) return null;
    return alfO >= alfMinRequired;
  }

  // ── verify_adaptation_factor ──────────────────────────────────────────
  function verifyAdaptationFactor(fAdap, minFadap = null, maxFadap = null) {
    if (minFadap == null) minFadap = IEC_CONSTANTS.min_fadap;
    if (maxFadap == null) maxFadap = IEC_CONSTANTS.max_fadap;
    return minFadap <= fAdap && fAdap <= maxFadap;
  }

  // ── check_all_iec_requirements ────────────────────────────────────────
  // → [iec_ok, req1_ok, req2_ok, req3_ok, req4_ok, iec_results]
  function checkAllIecRequirements(alfO, alfExtRequired, alfIntRequired,
                                   alfMinRequired, fAdap,
                                   minFadap = null, maxFadap = null) {
    if (minFadap == null) minFadap = IEC_CONSTANTS.min_fadap;
    if (maxFadap == null) maxFadap = IEC_CONSTANTS.max_fadap;

    if (alfO == null) return [false, null, null, null, null, []];

    const req1Ok = verifyAlfExternalFault(alfO, alfExtRequired);
    const req2Ok = verifyAlfInternalFault(alfO, alfIntRequired);
    const req3Ok = verifyAlfMinimum(alfO, alfMinRequired);
    const req4Ok = verifyAdaptationFactor(fAdap, minFadap, maxFadap);

    const cmp = (ok) => (ok ? '>=' : '<');
    const verdict = (ok) => (ok ? 'OK' : 'IKKE OK');
    const alf = alfO.toFixed(1);
    const iecResults = [
      `Krav 1: ALFo (${alf}) ${cmp(req1Ok)} ${alfExtRequired.toFixed(1)} → ${verdict(req1Ok)}`,
      `Krav 2: ALFo (${alf}) ${cmp(req2Ok)} ${alfIntRequired.toFixed(1)} → ${verdict(req2Ok)}`,
      `Krav 3: ALFo (${alf}) ${cmp(req3Ok)} ${alfMinRequired.toFixed(1)} → ${verdict(req3Ok)}`,
      `Krav 4: ${minFadap} <= Fadap (${fAdap.toFixed(3)}) <= ${maxFadap} → ${verdict(req4Ok)}`,
    ];

    const iecOk = req1Ok && req2Ok && req3Ok && req4Ok;

    return [iecOk, req1Ok, req2Ok, req3Ok, req4Ok, iecResults];
  }

  return {
    calculateIecRequirements, verifyAlfExternalFault, verifyAlfInternalFault,
    verifyAlfMinimum, verifyAdaptationFactor, checkAllIecRequirements,
  };
})();
