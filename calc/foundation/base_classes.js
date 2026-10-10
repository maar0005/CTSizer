'use strict';
/**
 * foundation/base_classes.js — Port of calculations/ct_base.py (lines 122–475)
 *
 * CT-class-derived helpers: remanence factor, typical secondary time constant,
 * class→time-constant mapping, the IEC 61869-2 class metadata table, and the
 * ALF-from-class estimators used by core-adequacy checking (ct_base.py's
 * IntermediateStepBuilder / create_intermediate_step in this line range is
 * step-formatting machinery — not ported; CTStep is the JS equivalent).
 */
const CTBaseClasses = (() => {

  // ct_base.get_remanence_factor — IEC 61869-2 Clause 5.6.202.3.
  // K_R: 0.10 for gapped/low-remanence cores (PR, TPY, TPZ),
  //      0.80 for standard non-gapped cores (5P, 10P, PX, TPX).
  function getRemanenceFactor(ctClass) {
    if (!ctClass) return 0.80;
    const upper = ctClass.toUpperCase();
    if (upper.includes('PR') || upper.includes('TPY') || upper.includes('TPZ')) return 0.10;
    return 0.80;
  }

  // ct_base.get_typical_ts — representative secondary time constant T_s (s)
  // for AR preview visualization (user can still override via spinbox).
  // Order matters: 'PR' is checked before the '5P'/'10P' fallback so gapped
  // protection classes like '5PR' resolve to 1.0s, not the non-gapped 5.0s.
  function getTypicalTs(ctClass) {
    if (!ctClass) return 2.0;
    const upper = ctClass.toUpperCase();
    if (upper.includes('TPZ')) return 0.06;
    if (upper.includes('TPY')) return 1.5;
    if (upper.includes('TPX')) return 10.0;
    if (upper.includes('PR')) return 1.0;
    if (upper.includes('PX')) return 5.0;
    if (upper.includes('5P') || upper.includes('10P')) return 5.0;
    return 2.0;
  }

  // ct_base.map_class_to_time_constant — 'high' for fast cores (TPX), 'low'
  // for slow cores (TPY/TPZ) and protection classes. Defaults to 'low'.
  function mapClassToTimeConstant(ctClass) {
    if (!ctClass) return 'low';
    const upper = ctClass.toUpperCase();
    if (upper.includes('TPX')) return 'high';
    if (upper.includes('TPY') || upper.includes('TPZ')) return 'low';
    if (upper.includes('PR')) return 'low';
    if (upper.includes('PX')) return 'low';
    return 'low';
  }

  // ct_base.CT_CLASS_DESCRIPTIONS — IEC 61869-2 class metadata. The `_key`
  // fields are Python Translator keys; CTSizer has no resolved EN/DA text for
  // them (no source strings exist anywhere in ctvt_dim either), so they are
  // carried through unresolved as plain data for base_adequacy.js
  // (checkCoreAdequacy / recommendCtClass); no UI shows them.
  const CT_CLASS_DESCRIPTIONS = {
    '5P': {
      name: 'Class 5P',
      name_key: 'ct_class_5p_name',
      description_key: 'ct_class_5p_description',
      typical_applications_key: 'ct_class_5p_applications',
      remanence_key: 'ct_class_5p_remanence',
      best_for_tp_range_key: 'ct_class_5p_tp_range',
      iec_reference: 'IEC 61869-2 Clause 5.6.202.2',
    },
    '5PR': {
      name: 'Class 5PR',
      name_key: 'ct_class_5pr_name',
      description_key: 'ct_class_5pr_description',
      typical_applications_key: 'ct_class_5pr_applications',
      remanence_key: 'ct_class_5pr_remanence',
      best_for_tp_range_key: 'ct_class_5pr_tp_range',
      iec_reference: 'IEC 61869-2 Clause 5.6.202.3',
    },
    'PX': {
      name: 'Class PX',
      name_key: 'ct_class_px_name',
      description_key: 'ct_class_px_description',
      typical_applications_key: 'ct_class_px_applications',
      remanence_key: 'ct_class_px_remanence',
      best_for_tp_range_key: 'ct_class_px_tp_range',
      iec_reference: 'IEC 61869-2 Clause 5.6.202.4',
    },
    'TPX': {
      name: 'Class TPX',
      name_key: 'ct_class_tpx_name',
      description_key: 'ct_class_tpx_description',
      typical_applications_key: 'ct_class_tpx_applications',
      remanence_key: 'ct_class_tpx_remanence',
      best_for_tp_range_key: 'ct_class_tpx_tp_range',
      iec_reference: 'IEC 61869-2 Clause 5.6.202.6.1',
    },
    'TPY': {
      name: 'Class TPY',
      name_key: 'ct_class_tpy_name',
      description_key: 'ct_class_tpy_description',
      typical_applications_key: 'ct_class_tpy_applications',
      remanence_key: 'ct_class_tpy_remanence',
      best_for_tp_range_key: 'ct_class_tpy_tp_range',
      iec_reference: 'IEC 61869-2 Clause 5.6.202.6.2',
    },
    'TPZ': {
      name: 'Class TPZ',
      name_key: 'ct_class_tpz_name',
      description_key: 'ct_class_tpz_description',
      typical_applications_key: 'ct_class_tpz_applications',
      remanence_key: 'ct_class_tpz_remanence',
      best_for_tp_range_key: 'ct_class_tpz_tp_range',
      iec_reference: 'IEC 61869-2 Clause 5.6.202.6.3',
    },
  };

  // ct_base._estimate_alf_from_voltage — rough ALF estimate from an offered
  // E_ALF voltage, for core-adequacy suggestions only. Assumes typical
  // Isr=1A, Rct=4Ω, Rburden=30Ω (30VA): E_ALF = ALF × Isr × (Rct + Rburden).
  // `coreClass` is unused (kept for signature parity; reserved for future
  // refinement per the Python docstring).
  function estimateAlfFromVoltage(voltage, coreClass) {
    const typicalResistance = 4 + 30;
    return voltage / typicalResistance;
  }

  // ct_base._extract_alf_from_class — parse trailing ALF digits from a class
  // string, e.g. "5P30" -> 30, "5PR20" -> 20, "5P 30VA" -> 30. Defaults to
  // 30 (typical burden rating) when no trailing digits are present.
  function extractAlfFromClass(coreClass) {
    const match = /(\d+)(?:VA)?$/.exec(coreClass);
    if (match) return parseInt(match[1], 10);
    return 30;
  }

  return {
    getRemanenceFactor,
    getTypicalTs,
    mapClassToTimeConstant,
    CT_CLASS_DESCRIPTIONS,
    estimateAlfFromVoltage,
    extractAlfFromClass,
  };
})();
