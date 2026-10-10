'use strict';
/**
 * vt/calculator.js — Port of calculations/vt_calculations/calculator.py
 *
 * The composition entry for the VT package: it runs the already-ported sub-files
 * (data / impedance / current_burden / voltage_analysis / thermal / validation /
 * formatting) in the order VTCalculator._execute_core_calculation does. The Python
 * class holds no state, so its methods become plain functions on CTVT.calculator:
 *   executeCoreCalculation(cable_resistance, core_data) → core result
 *   calculateSingleCore(common_data, core_data)         → core result + name/id/number
 *   calculate(common_data, core_data)                   → { overall_status, common_calculations, cores }
 *   calculateCoreInternal(cable_resistance, core)       (legacy)
 *   parallelResistance(resistances)                     (legacy)
 *   getMaxVoltageDrop(vt_class)                         (legacy)
 *
 * A core result has the Python shape: status ('OK' / 'IKKE OK'), calculations (the
 * Danish labels → formatted strings, same key order), warnings (Danish, verbatim) and
 * intermediate_steps. The steps are the CTStep rows the sub-files return, plus a
 * CTStep.conclusion row for make_conclusion_step (key conclusion_comparison). Its
 * `comparison` is the Python comparison_substitution and `result_text` the Python
 * "OK" / "NOT OK".
 *
 * The calculations strings go through pyFixed, which follows Python's format():
 * float('inf') prints "inf" (Zn = ∞ is the normal result for the default burden 0),
 * and an exact binary tie rounds half to even where toFixed rounds it up.
 *
 * Fidelity notes:
 * - calculate() (several cores) uses the shared common_data cable resistance and
 *   ignores each core's own; calculateSingleCore() does the opposite and ignores
 *   common_data. Both kept as in Python.
 * - calculate() walks core_data with Object.entries, so integer-like keys come first
 *   in ascending order. Python keeps insertion order. Only the order of `cores`
 *   differs; each core's result does not.
 * - The _log.debug / _log.exception calls are logging only and are not ported.
 *
 * CTVT.calculate(core, commonData) is the CTSizer entry used by CTCalc.calculate('vt',
 * …) and the VT core panel. Its cable resistance comes from the cable-resistance
 * toolbox (PORTING_PLAN.md §9.6 9C): CTCableRes.lead() with the project's method and
 * temperature and the core's cable fields (cable_mat / cable_cross / cable_length),
 * the core's wiring (default four_wire, §9.6 9E), balanced 3-phase load: k = 1 for
 * 4-wire, 2 for 6-wire. It replaces the Python GUI's ui/vt_widget.py
 * calculate_cable_resistance, which had its own ρ20 constants (Cu 0.0175, Al 0.0283;
 * retired, D2). core.cable_resistance and core.cable_temp are ignored (D1). It then
 * runs calculateSingleCore and adds the fields the results panel reads: `steps` (the
 * toolbox steps, then intermediate_steps), `is_ok`, `margin`, `cable_res` and the
 * numeric intermediates. The CTVT.calculator functions above are the Python API and
 * still take cable_resistance as an input.
 */

var CTVT = CTVT || {};

CTVT.calculator = (() => {
  // Python f"{x:.{d}f}". Infinities print "inf"/"-inf", NaN "nan". An exact tie (the
  // exact decimal expansion of the double is "…5" at digit d+1 and stops there) rounds
  // half to even; everything else matches toFixed(d).
  const pyFixed = (x, d) => {
    if (Number.isNaN(x)) return 'nan';
    if (x === Infinity) return 'inf';
    if (x === -Infinity) return '-inf';
    const exact = x.toFixed(Math.min(100, d + 60));
    const dot = exact.indexOf('.');
    const tail = exact.slice(dot + 1 + d);
    if (/^50*$/.test(tail)) {
      const truncated = exact.slice(0, d > 0 ? dot + 1 + d : dot);
      const lastDigit = Number(truncated[truncated.length - 1]);
      if (lastDigit % 2 === 0) return truncated;
    }
    return x.toFixed(d);
  };

  // ── _execute_core_calculation, returning the numeric intermediates as well ──
  function executeWithValues(cable_resistance, core_data) {
    const F = CTVT.formatting;
    const result = F.createResultDict();
    const calcs = result.calculations;
    const steps = result.intermediate_steps;

    // Udtræk data
    const burden_va = core_data.burden;
    const thermal_burden = core_data.thermal_burden;
    const secondary_voltage = core_data.secondary_voltage;
    const attached_resistor = core_data.attached_resistor;
    const device_resistance = core_data.device_resistance;
    const vt_class = core_data.vt_class;

    // 1. Beregn sekundær strøm ved mærkebelastning
    const [rated_current, step1] = CTVT.impedance.calculateRatedSecondaryCurrent(
      burden_va, secondary_voltage
    );
    calcs['Mærke sekundær strøm'] = `${pyFixed(rated_current * 1000, 2)} mA`;
    steps.push(step1);

    // 2. Beregn byrdeimpedans
    const [burden_impedance, step2] = CTVT.impedance.calculateBurdenImpedance(
      secondary_voltage, rated_current
    );
    calcs['Byrdeimpedans (Zn)'] = `${pyFixed(burden_impedance, 2)} Ω`;
    steps.push(step2);

    // 3. Beregn total ekstern belastning
    const [total_impedance, load_resistance, step3] = CTVT.impedance.calculateTotalImpedance(
      cable_resistance, device_resistance, attached_resistor
    );
    calcs['Total belastningsimpedans'] = `${pyFixed(total_impedance, 2)} Ω`;
    steps.push(step3);

    // 4. Beregn aktuel sekundær strøm
    const [actual_current, step4] = CTVT.currentBurden.calculateActualCurrent(
      secondary_voltage, total_impedance
    );
    calcs['Aktuel sekundær strøm'] = `${pyFixed(actual_current * 1000, 2)} mA`;
    steps.push(step4);

    // 5. Beregn aktuel byrde
    const [actual_burden_va, step5] = CTVT.currentBurden.calculateActualBurden(
      secondary_voltage, actual_current
    );
    calcs['Aktuel byrde'] = `${pyFixed(actual_burden_va, 2)} VA`;
    steps.push(step5);

    // 6. Beregn byrde udnyttelse
    const [burden_utilization, step6] = CTVT.currentBurden.calculateBurdenUtilization(
      actual_burden_va, burden_va
    );
    calcs['Byrde udnyttelse'] = `${pyFixed(burden_utilization, 1)} %`;
    steps.push(step6);

    // Tjek byrde grænser
    const [burden_ok, burden_warnings] = CTVT.validation.checkBurdenLimits(burden_utilization);
    result.warnings.push(...burden_warnings);
    if (!burden_ok) result.status = 'IKKE OK';

    // 7. Beregn spændingsfald i kabel
    const [voltage_drop, voltage_drop_percent, step7] = CTVT.voltageAnalysis.calculateVoltageDrop(
      cable_resistance, actual_current, secondary_voltage
    );
    calcs['Spændingsfald i kabel'] =
      `${pyFixed(voltage_drop, 4)} V (${pyFixed(voltage_drop_percent, 3)}%)`;
    steps.push(step7);

    // Tjek spændingsfald grænser (warning only — never changes status)
    const [vdrop_ok, vdrop_warnings] = CTVT.voltageAnalysis.checkVoltageDropLimits(
      voltage_drop_percent, vt_class
    );
    result.warnings.push(...vdrop_warnings);

    // 8. Beregn termisk udnyttelse
    const [thermal_utilization, step8] = CTVT.thermal.calculateThermalUtilization(
      actual_burden_va, thermal_burden
    );
    calcs['Termisk udnyttelse'] = `${pyFixed(thermal_utilization, 1)} %`;
    steps.push(step8);

    // Tjek termisk grænser
    const [thermal_ok, thermal_warnings] = CTVT.validation.checkThermalBurdenLimits(
      thermal_utilization
    );
    result.warnings.push(...thermal_warnings);
    if (!thermal_ok) result.status = 'IKKE OK';

    // 9. Beregn reserve kapacitet
    const [reserve_capacity, step9] = CTVT.currentBurden.calculateReserveCapacity(
      burden_va, actual_burden_va
    );
    calcs['Reserve kapacitet'] = `${pyFixed(reserve_capacity, 2)} VA`;
    steps.push(step9);

    // 10. Effektfaktor (antaget)
    const power_factor = 1.0;
    calcs['Effektfaktor (antaget)'] = pyFixed(power_factor, 2);

    // 11. Final conclusion step
    const is_ok = result.status === 'OK';
    const issues = [];
    if (!burden_ok) issues.push(`Burden ${pyFixed(burden_utilization, 1)}% > 100%`);
    if (!thermal_ok) issues.push(`Thermal ${pyFixed(thermal_utilization, 1)}% > 100%`);
    const summary = burden_ok && thermal_ok
      ? `Burden ${pyFixed(burden_utilization, 1)}% ≤ 100%, Thermal ${pyFixed(thermal_utilization, 1)}% ≤ 100%`
      : issues.join(', ');
    steps.push(CTStep.conclusion({
      key: 'conclusion_comparison',
      label_en: 'Conclusion',
      label_da: 'Konklusion',
      latex: '\\text{Burden} \\leq 100\\% \\wedge \\text{Thermal} \\leq 100\\%',
      is_ok,
      comparison: summary,
      result_text: is_ok ? 'OK' : 'NOT OK',
    }));

    const values = {
      rated_current, burden_impedance, total_impedance, load_resistance,
      actual_current, actual_burden_va, burden_utilization, burden_ok,
      voltage_drop, voltage_drop_percent, vdrop_ok,
      thermal_utilization, thermal_ok, reserve_capacity, power_factor,
    };
    return [result, values];
  }

  // ── _execute_core_calculation(cable_resistance, core_data) ──────────────
  function executeCoreCalculation(cable_resistance, core_data) {
    return executeWithValues(cable_resistance, core_data)[0];
  }

  // ── calculate_single_core(common_data, core_data), with the intermediates ──
  function singleCoreWithValues(common_data, core_data) {
    // Udtræk kerne data
    const data = CTVT.data.extractVtCoreData(core_data);

    // Brug kernens egne kabeldata
    const cable_resistance = data.cable_resistance;
    const transformer_id = data.transformer_id;
    const core_number = data.core_number;
    const core_name = `${transformer_id} kerne ${core_number}`;

    const [result, values] = executeWithValues(cable_resistance, data);

    result.core_name = core_name;
    result.transformer_id = transformer_id;
    result.core_number = core_number;

    return [result, values, data];
  }

  // ── calculate_single_core(common_data, core_data) ───────────────────────
  // common_data is accepted for API parity; the Python never reads it.
  function calculateSingleCore(common_data, core_data) {
    return singleCoreWithValues(common_data, core_data)[0];
  }

  // ── calculate(common_data, core_data) ───────────────────────────────────
  function calculate(common_data = {}, core_data = {}) {
    const results = { overall_status: 'OK', common_calculations: {}, cores: {} };

    // Fælles beregninger
    const cable_resistance = common_data.cable_resistance ?? 0;
    results.common_calculations = CTVT.formatting.formatCommonCalculations(cable_resistance);

    // Beregn for hver kerne
    for (const [core_num, core] of Object.entries(core_data)) {
      const data = CTVT.data.extractVtCoreData(core);
      const core_result = executeCoreCalculation(cable_resistance, data);
      results.cores[core_num] = core_result;

      if (core_result.status !== 'OK') results.overall_status = 'IKKE OK';
    }

    return results;
  }

  // ── Legacy compatibility methods ────────────────────────────────────────
  function calculateCoreInternal(cable_resistance, core) {
    const data = CTVT.data.extractVtCoreData(core);
    return executeCoreCalculation(cable_resistance, data);
  }

  function parallelResistance(resistances) {
    return CTVT.impedance.calculateParallelResistance(resistances);
  }

  function getMaxVoltageDrop(vt_class) {
    return CTVT.voltageAnalysis.getMaxVoltageDrop(vt_class);
  }

  return {
    pyFixed,
    executeWithValues,
    singleCoreWithValues,
    executeCoreCalculation,
    calculateSingleCore,
    calculate,
    calculateCoreInternal,
    parallelResistance,
    getMaxVoltageDrop,
  };
})();

// ── CTSizer entry: CTVT.calculate(core, commonData) ───────────────────────
CTVT.calculate = function calculate(core = {}, commonData = {}) {
  const C = CTVT.calculator;
  // Cable defaults follow ui/vt_widget.py (Cu, 4 mm², 150 m); the temperature is
  // the project's (CTCableRes.resolveParams).
  const CABLE_DEFAULTS = { material: 'cu', cross_section_mm2: 4, length_m: 150 };

  // Lead resistance R_lead = k·R_c — the project's method and temperature,
  // the core's wiring. A VT evaluates the balanced 3-phase load case (§9.8):
  // k = 1 with the default 4-wire, 2 with 6-wire.
  const cable = CTCableRes.lead(
    CTCableRes.resolveMethod(commonData),
    CTCableRes.resolveParams(core, commonData, CABLE_DEFAULTS),
    CTCableRes.resolveTopology(core, 'vt'), 'three_phase');
  const cable_resistance = cable.r_loop;

  const [result, v, data] = C.singleCoreWithValues(commonData, { ...core, cable_resistance });
  result.warnings.push(...cable.warnings);

  const is_ok = result.status === 'OK';
  // CTSizer-only headroom figure for the results panel: the smaller of the burden and
  // thermal reserves in % points. It is >= 0 exactly when both checks pass.
  const margin = Math.min(100 - v.burden_utilization, 100 - v.thermal_utilization);

  return {
    ...result,
    ...v,
    cable_resistance,
    vt_class: data.vt_class,
    // Fields the results panel reads
    Rc: cable_resistance,
    steps: [...cable.steps, ...result.intermediate_steps],
    is_ok,
    margin,
    cable_res: {
      method: cable.method, source: cable.source, topology: cable.topology, factor: cable.factor,
      r_conductor: cable.r_conductor, r_loop: cable.r_loop, r20_per_km: cable.r20_per_km,
    },
  };
};
