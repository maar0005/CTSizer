'use strict';
/**
 * auto_reclosure/computation.js — Port of calculations/ct_auto_reclosure/computation.py
 *
 * Core computation functions for auto-reclosure CT dimensioning (IEC 61869-2
 * Section 2B.1): curve interpolation, Ktd extraction, the C-O-C-O duty-cycle
 * combination rule, and Eal. Extends the CTAutoReclosure namespace
 * (calc/auto_reclosure.js, loaded first) — these were previously hand-
 * duplicated directly in that file; this is now their single source.
 */

(() => {
  // ── interpolate_curve — binary search, O(log n) ─────────────────────
  function interpolateCurve(points, t) {
    if (!points || points.length === 0) throw new Error('Curve points must not be empty');
    if (points.length === 1) return points[0][1];
    if (t <= points[0][0]) return points[0][1];
    if (t >= points[points.length - 1][0]) return points[points.length - 1][1];

    let left = 0, right = points.length - 1;
    while (left < right - 1) {
      const mid = Math.floor((left + right) / 2);
      if (points[mid][0] <= t) left = mid;
      else right = mid;
    }
    const [t0, v0] = points[left];
    const [t1, v1] = points[right];
    if (t1 === t0) return v0;
    return v0 + (t - t0) / (t1 - t0) * (v1 - v0);
  }

  // ── calculate_ktd_from_curve ─────────────────────────────────────────
  function calcKtdFromCurve(t_al, ktfCurve) {
    return interpolateCurve(ktfCurve, t_al);
  }

  // ── compute_ktd_co_co — C-O-C-O duty cycle (IEC 61869-2 §2B.1.3) ─────
  /**
   * Low TC class:  max{ Ktd(t_al), Ktd(t') × exp(-(tfr+t_al)/Ts) + Ktd(t''al) }
   * High TC class: Ktd(t_al) + Ktd(t''al)
   */
  function computeKtdCoCo(t_al, t_prime, tfr, t_double_al, ts, ktfCurve, tcClass = 'low') {
    const ktd_tal     = calcKtdFromCurve(t_al,        ktfCurve);
    const ktd_tprime  = calcKtdFromCurve(t_prime,     ktfCurve);
    const ktd_tdouble = calcKtdFromCurve(t_double_al, ktfCurve);

    if (tcClass.toLowerCase() === 'high') {
      return ktd_tal + ktd_tdouble;
    }

    const decay = ts > 0 ? Math.exp(-(tfr + t_al) / ts) : 0;
    const candidate = ktd_tprime * decay + ktd_tdouble;
    return Math.max(ktd_tal, candidate);
  }

  // ── compute_eal — Eal = Kssc × Ktd × (Rct + Rb) × Isr ────────────────
  function computeEal(kssc, ktd, rct, rb, isr) {
    return kssc * ktd * (rct + rb) * isr;
  }

  CTAutoReclosure.interpolateCurve = interpolateCurve;
  CTAutoReclosure.calcKtdFromCurve = calcKtdFromCurve;
  CTAutoReclosure.computeKtdCoCo = computeKtdCoCo;
  CTAutoReclosure.computeEal = computeEal;
})();
