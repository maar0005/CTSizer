'use strict';
/**
 * vt/thermal.js — Port of calculations/vt_calculations/thermal.py
 *
 * VT thermal-burden analysis: the actual burden as a percentage of the thermal
 * burden limit (0 % when the limit is <= 0), the > 100 % overload check and the
 * remaining thermal margin in VA. The Python tuples become JS arrays:
 *   calculateThermalUtilization → [utilization_percent, step]
 *   checkThermalLimits          → [is_ok, warnings]
 *   getThermalMargin            → margin in VA (negative when overloaded)
 *
 * As in calc/vt/impedance.js, the Python's hand-built formula/substitution/result
 * string dict becomes a CTSizer-native CTStep row with the same key, the Python
 * latex_formula and EN/DA labels from pdf/locales/{en,da}.json (calc_<key>). The
 * result is the utilization in % with 1 decimal, as the Python result string shows it.
 *
 * The warning keeps the Python Danish text. Strictly greater than 100 % fails;
 * exactly 100 % passes.
 *
 * Extends the CTVT namespace created by calc/vt/data.js. Consumed by
 * calc/vt/calculator.js; not wired into calc/index.js.
 */

var CTVT = CTVT || {};

CTVT.thermal = (() => {
  // Python f"{x:.1f}" (same helper as calc/vt/validation.js). An exact tie at one
  // decimal is x·4 odd (x.25 / x.75), where Python keeps the even last digit;
  // everything else matches toFixed(1).
  const pyFixed1 = (x) => {
    const q = x * 4;
    if (Number.isInteger(q) && q % 2 !== 0) {
      let n = Math.floor(x * 10);
      if (n % 2 !== 0) n += 1;
      return (n / 10).toFixed(1);
    }
    return x.toFixed(1);
  };

  // ── calculate_thermal_utilization(actual_burden, thermal_burden) ────────
  // thermal_burden <= 0 → 0 %.
  function calculateThermalUtilization(actual_burden, thermal_burden) {
    const utilization = thermal_burden > 0
      ? (actual_burden / thermal_burden) * 100
      : 0;

    const step = CTStep.make({
      key: 'thermal_utilization',
      label_en: 'Thermal utilization',
      label_da: 'Termisk udnyttelse',
      latex: 'Thermal_{util} = \\frac{S_{actual}}{S_{thermal}} \\cdot 100\\%',
      variables: { S_actual: actual_burden, S_thermal: thermal_burden },
      result: utilization, unit: '%', precision: 1,
    });

    return [utilization, step];
  }

  // ── check_thermal_limits(thermal_utilization) ───────────────────────────
  function checkThermalLimits(thermal_utilization) {
    const warnings = [];

    if (thermal_utilization > 100) {
      warnings.push(`Termisk overbelastning: ${pyFixed1(thermal_utilization)}% > 100%`);
      return [false, warnings];
    }

    return [true, warnings];
  }

  // ── get_thermal_margin(actual_burden, thermal_burden) ───────────────────
  function getThermalMargin(actual_burden, thermal_burden) {
    return thermal_burden - actual_burden;
  }

  return { calculateThermalUtilization, checkThermalLimits, getThermalMargin };
})();
