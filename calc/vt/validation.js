'use strict';
/**
 * vt/validation.js — Port of calculations/vt_calculations/validation.py
 *
 * VT limit checks against IEC 61869-3: the burden utilization (> 100 % fails; below
 * 25 % passes with a Range I warning), the thermal utilization (> 100 % fails) and
 * which accuracy range a burden utilization falls in. The Python tuples become JS
 * arrays:
 *   checkBurdenLimits        → [is_ok, warnings]
 *   checkThermalBurdenLimits → [is_ok, warnings]
 *   verifyRangeCompliance    → { range, description, compliant[, warning] }
 *   resolveBurdenRange       → 'I' | 'II' (CTSizer, issue #125)
 *   checkBurdenRange         → { range, is_ok, low_percent, warnings } (CTSizer)
 *   burdenRangeLabel         → rating-plate style label, e.g. "0 VA-10 VA class 0.2"
 *
 * The warnings and descriptions keep the Python Danish text. Their "{x:.1f}" goes
 * through pyFixed1, because Python rounds an exact tie (24.25, 100.75, …) half to
 * even ("24.2") where toFixed rounds it up ("24.3").
 *
 * Extends the CTVT namespace created by calc/vt/data.js. Consumed by
 * calc/vt/calculator.js; not wired into calc/index.js.
 */

var CTVT = CTVT || {};

CTVT.validation = (() => {
  // Python f"{x:.1f}". An exact tie at one decimal is x·4 odd (x.25 / x.75), where
  // Python keeps the even last digit; everything else matches toFixed(1).
  const pyFixed1 = (x) => {
    const q = x * 4;
    if (Number.isInteger(q) && q % 2 !== 0) {
      let n = Math.floor(x * 10);
      if (n % 2 !== 0) n += 1;
      return (n / 10).toFixed(1);
    }
    return x.toFixed(1);
  };

  // ── check_burden_limits(burden_utilization) ─────────────────────────────
  function checkBurdenLimits(burden_utilization) {
    const warnings = [];

    if (burden_utilization > 100) {
      warnings.push(`Byrde overskridelse: ${pyFixed1(burden_utilization)}% > 100%`);
      return [false, warnings];
    }

    if (burden_utilization < 25) {
      // IEC 61869-3 typically requires accuracy down to 25 % burden (Range II),
      // unless the VT is specified for Range I (0-100 %).
      warnings.push(
        `Lav byrde: ${pyFixed1(burden_utilization)}% < 25%. Verificer om VT understøtter Range I (0-100%) jf. IEC 61869-3. Standard område II er 25-100%.`
      );
    }

    return [burden_utilization <= 100, warnings];
  }

  // ── check_thermal_burden_limits(thermal_utilization) ────────────────────
  function checkThermalBurdenLimits(thermal_utilization) {
    const warnings = [];

    if (thermal_utilization > 100) {
      warnings.push(`Termisk overbelastning: ${pyFixed1(thermal_utilization)}% > 100%`);
      return [false, warnings];
    }

    return [true, warnings];
  }

  // ── verify_range_compliance(burden_utilization) ─────────────────────────
  function verifyRangeCompliance(burden_utilization) {
    if (burden_utilization >= 25 && burden_utilization <= 100) {
      return {
        range: 'II',
        description: 'Standard område (25-100%)',
        compliant: true,
      };
    } else if (burden_utilization >= 0 && burden_utilization < 25) {
      return {
        range: 'I',
        description: 'Udvidet område (0-100%) - Kræver særlig specifikation',
        compliant: false,
        warning: 'VT skal være specificeret til Range I',
      };
    } else {
      return {
        range: 'None',
        description: 'Udenfor gyldige områder',
        compliant: false,
        warning: 'Byrde overskridelse',
      };
    }
  }

  // ── CTSizer: the VT's burden range (IEC 61869-3 5.6.301.3, issue #125) ──
  // Range I: 0 – 100 % of the rated burden at pf 1 (standard outputs 1, 2.5,
  // 5, 10 VA); range II: 25 – 100 % at pf 0.8 (10, 25, 50, 100 VA). The core's
  // vt_burden_range, else I for a rated burden ≤ 10 VA and II above.
  const RANGE_I_MAX_VA = 10;
  function resolveBurdenRange(core = {}) {
    const r = core.vt_burden_range;
    if (r === 'I' || r === 'II') return r;
    return (core.burden ?? 0) <= RANGE_I_MAX_VA ? 'I' : 'II';
  }

  // Range I has no lower limit (a 0.1 VA meter on a 10 VA range I VT is
  // fine); range II fails below 25 % (verifyRangeCompliance). Over 100 % is
  // checkBurdenLimits' failure. A rated burden outside the range's standard
  // values is allowed (NOTE 301) but warned. Warnings are [key, ...args].
  function checkBurdenRange(range, burden_utilization, rated_burden) {
    const warnings = [];
    let is_ok = true;
    if (range === 'II') {
      if (verifyRangeCompliance(burden_utilization).range === 'I') {
        is_ok = false;
        warnings.push(['warning_vt_range_ii_below_25', burden_utilization]);
      }
      if (rated_burden < RANGE_I_MAX_VA) warnings.push(['warning_vt_range_nonstandard', 'II', rated_burden]);
    } else if (rated_burden > RANGE_I_MAX_VA) {
      warnings.push(['warning_vt_range_nonstandard', 'I', rated_burden]);
    }
    return { range, is_ok, low_percent: range === 'II' ? 25 : 0, warnings };
  }

  // Rating-plate style (6.13.302), e.g. "0 VA-10 VA class 0.2"; range II
  // starts at 25 % of the rated burden.
  function burdenRangeLabel(range, rated_burden, vt_class) {
    const low = range === 'II' ? +(rated_burden * 0.25).toPrecision(6) : 0;
    return `${low} VA-${rated_burden} VA class ${vt_class}`;
  }

  return {
    checkBurdenLimits, checkThermalBurdenLimits, verifyRangeCompliance,
    resolveBurdenRange, checkBurdenRange, burdenRangeLabel,
  };
})();
