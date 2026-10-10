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

  return { checkBurdenLimits, checkThermalBurdenLimits, verifyRangeCompliance };
})();
