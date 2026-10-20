'use strict';
/**
 * auto_reclosure.js — declares the CTAutoReclosure namespace for
 * calculations/ct_auto_reclosure/ (IEC 61869-2 Annex B C-O and C-O-C-O Ktd).
 *
 * Ktf preset curves (presets.py) live in calc/auto_reclosure/presets.js,
 * interpolateCurve/calcKtdFromCurve/computeKtdCoCo/computeEal (computation.py)
 * in calc/auto_reclosure/computation.js and generateCoco{Transient,Flux}
 * (waveform.py) in calc/auto_reclosure/waveform.js — all loaded right after
 * this file, attaching onto this object. The legacy helpers that lived here
 * (calcKtdAnalytical / getKtdFactors, copies of transient_factors.py, and
 * getRemanenceFactor / getTimeConstantClass, simplified ct_base.py helpers)
 * are removed (PORTING_PLAN.md §10.6 F-LEGACY); the ports are
 * calc/distance/transient_factors.js and calc/foundation/base_classes.js.
 */

const CTAutoReclosure = {};
