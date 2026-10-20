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
  // opts.burden_range ('I' | 'II', CTSizer only, issue #125): the VT's burden
  // range decides the low end instead of the Python "Lav byrde" warning, and
  // range II below 25 % fails. Without it (the Python API) nothing changes.
  // opts.resistor_location ('meter' | 'vt', CTSizer only): where the attached
  // resistor sits. 'meter' (and without it, the Python model): at the meter,
  // after the lead, so its current flows in the lead,
  //   Z_total = R_cable + (R_device ∥ R_attached), ΔU = R_cable · I_s.
  // 'vt': across the VT terminals, before the lead; it loads the VT but only
  // the meter's current flows in the lead,
  //   Z_total = R_attached ∥ (R_cable + R_device),
  //   I_meter = Us / (R_cable + R_device), ΔU = R_cable · I_meter.
  // With no resistor both are the same.
  function executeWithValues(cable_resistance, core_data, opts = {}) {
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
    const atVt = opts.resistor_location === 'vt' && attached_resistor > 0;
    let [total_impedance, load_resistance, step3] = CTVT.impedance.calculateTotalImpedance(
      cable_resistance, device_resistance, attached_resistor
    );
    if (atVt) {
      // CTSizer: the resistor across the VT terminals, the meter behind the lead
      load_resistance = device_resistance;
      total_impedance = CTVT.impedance.calculateParallelResistance([attached_resistor, cable_resistance + device_resistance]);
      step3 = CTStep.make({
        key: 'total_load_impedance',
        label_en: 'Total load impedance (resistor at the VT)',
        label_da: 'Total belastningsimpedans (modstand ved VT)',
        latex: 'Z_{total} = R_{attached} \\parallel (R_{cable} + R_{device})',
        variables: { R_attached: attached_resistor, R_cable: cable_resistance, R_device: device_resistance },
        result: total_impedance, unit: 'Ω', precision: 2,
      });
    }
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
    let range_check = null;
    if (opts.burden_range) {
      range_check = CTVT.validation.checkBurdenRange(opts.burden_range, burden_utilization, burden_va);
      result.warnings.push(...burden_warnings.filter((w) => !w.startsWith('Lav byrde')), ...range_check.warnings);
      if (!range_check.is_ok) result.status = 'IKKE OK';
    } else {
      result.warnings.push(...burden_warnings);
    }
    if (!burden_ok) result.status = 'IKKE OK';

    // 7. Beregn spændingsfald i kabel. With the resistor at the VT only the
    // meter's current flows in the lead (CTSizer).
    let voltage_drop, voltage_drop_percent, step7;
    let lead_current = actual_current;
    if (atVt) {
      const branch = cable_resistance + device_resistance;
      lead_current = branch > 0 && branch !== Infinity ? secondary_voltage / branch : 0;
      steps.push(CTStep.make({
        key: 'lead_current',
        label_en: 'Current in the lead (meter only)',
        label_da: 'Strøm i måleledningen (kun måleren)',
        latex: 'I_{meter} = \\frac{U_s}{R_{cable} + R_{device}}',
        variables: { Us: secondary_voltage, R_cable: cable_resistance, R_device: device_resistance },
        result: lead_current * 1000, unit: 'mA', precision: 2,
      }));
      voltage_drop = cable_resistance * lead_current;
      voltage_drop_percent = secondary_voltage > 0 ? (voltage_drop / secondary_voltage) * 100 : 0;
      step7 = CTStep.make({
        key: 'voltage_drop_in_cable',
        label_en: 'Voltage drop in cable',
        label_da: 'Spændingsfald i kabel',
        latex: '\\Delta U = R_{cable} \\cdot I_{meter}',
        variables: { R_cable: cable_resistance, I_meter: lead_current, Us: secondary_voltage },
        result: voltage_drop, unit: 'V', precision: 4,
        percent: voltage_drop_percent, percent_precision: 3,
      });
    } else {
      [voltage_drop, voltage_drop_percent, step7] = CTVT.voltageAnalysis.calculateVoltageDrop(
        cable_resistance, actual_current, secondary_voltage
      );
    }
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

    // CTSizer: the burden range row (range I 0–100 %, range II 25–100 %)
    const range_ok = range_check ? range_check.is_ok : true;
    if (range_check) {
      const low = range_check.low_percent;
      steps.push(CTStep.conclusion({
        key: 'burden_range_check',
        label_en: `Burden range ${range_check.range} (${low}–100 %)`,
        label_da: `Byrdeområde ${range_check.range} (${low}–100 %)`,
        latex: `${low}\\% \\leq \\frac{S_{actual}}{S_n} \\leq 100\\%`,
        is_ok: range_ok && burden_ok,
        comparison: `${low}% ≤ ${pyFixed(burden_utilization, 1)}% ≤ 100%`,
      }));
    }

    // 11. Final conclusion step
    const is_ok = result.status === 'OK';
    const issues = [];
    if (!range_ok) issues.push(`Burden ${pyFixed(burden_utilization, 1)}% < 25% (range II)`);
    if (!burden_ok) issues.push(`Burden ${pyFixed(burden_utilization, 1)}% > 100%`);
    if (!thermal_ok) issues.push(`Thermal ${pyFixed(thermal_utilization, 1)}% > 100%`);
    const summary = burden_ok && thermal_ok && range_ok
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
      voltage_drop, voltage_drop_percent, vdrop_ok, lead_current,
      thermal_utilization, thermal_ok, reserve_capacity, power_factor, range_ok,
    };
    return [result, values];
  }

  // ── _execute_core_calculation(cable_resistance, core_data) ──────────────
  function executeCoreCalculation(cable_resistance, core_data) {
    return executeWithValues(cable_resistance, core_data)[0];
  }

  // ── calculate_single_core(common_data, core_data), with the intermediates ──
  function singleCoreWithValues(common_data, core_data, opts = {}) {
    // Udtræk kerne data
    const data = CTVT.data.extractVtCoreData(core_data);

    // Brug kernens egne kabeldata
    const cable_resistance = data.cable_resistance;
    const transformer_id = data.transformer_id;
    const core_number = data.core_number;
    const core_name = `${transformer_id} kerne ${core_number}`;

    const [result, values] = executeWithValues(cable_resistance, data, opts);

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

  // The connected device is entered as its burden in VA/phase, as datasheets
  // give it (issue #125). The series-circuit model still needs a resistance:
  // R_device = Us² / S_device at the core's secondary voltage, shown as a
  // step. A core with only the old device_resistance (Ω) — the Python API,
  // an unmigrated project — uses that resistance as before.
  const Us = core.secondary_voltage ?? 100;
  const device_burden = core.device_burden != null ? Number(core.device_burden) : null;
  let device_resistance = core.device_resistance;
  const deviceSteps = [];
  if (device_burden != null) {
    device_resistance = device_burden > 0 ? (Us * Us) / device_burden : Infinity;
    deviceSteps.push(CTStep.make({
      key: 'device_resistance_from_burden',
      label_en: 'Device resistance from its burden',
      label_da: 'Enhedsmodstand fra byrde',
      latex: 'R_{device} = \\frac{U_s^2}{S_{device}}',
      variables: { Us, S_device: device_burden },
      result: device_resistance, unit: 'Ω', precision: 2,
    }));
  }

  // The VT's burden range (IEC 61869-3 5.6.301.3): I (0–100 %) or II (25–100 %)
  const burden_range = CTVT.validation.resolveBurdenRange(core);
  // Where the attached resistor sits: at the VT terminals or at the meter
  // (after the lead). A core without it (the Python model) has it at the meter.
  const resistor_location = core.vt_resistor_location === 'vt' ? 'vt' : 'meter';

  const [result, v, data] = C.singleCoreWithValues(commonData,
    { ...core, device_resistance, cable_resistance }, { burden_range, resistor_location });
  result.warnings.push(...cable.warnings);

  const is_ok = result.status === 'OK';
  // CTSizer-only headroom figure for the results panel: the smallest of the burden,
  // thermal and (range II) low-burden reserves in % points. It is >= 0 exactly when
  // all the checks pass.
  const reserves = [100 - v.burden_utilization, 100 - v.thermal_utilization];
  if (burden_range === 'II') reserves.push(v.burden_utilization - 25);
  const margin = Math.min(...reserves);

  return {
    ...result,
    ...v,
    cable_resistance,
    vt_class: data.vt_class,
    device_burden, device_resistance,
    burden_range, resistor_location,
    burden_range_label: CTVT.validation.burdenRangeLabel(burden_range, data.burden, data.vt_class),
    // Fields the results panel reads
    Rc: cable_resistance,
    steps: [...cable.steps, ...deviceSteps, ...result.intermediate_steps],
    is_ok,
    margin,
    cable_res: {
      method: cable.method, source: cable.source, topology: cable.topology, factor: cable.factor,
      r_conductor: cable.r_conductor, r_loop: cable.r_loop, r20_per_km: cable.r20_per_km,
    },
  };
};

// ── Saved VT cores: device_resistance [Ω] → device_burden [VA/phase] ──────
// Issue #125: a project from before the device burden was entered in VA keeps
// its results: S_device = Us² / R_device at the core's secondary voltage (a
// non-positive or infinite resistance draws nothing: 0 VA, as the series
// model skips it). Inputs that already have device_burden are returned as is.
CTVT.migrateInputs = function migrateInputs(inputs) {
  if (!inputs || inputs.device_burden != null || inputs.device_resistance == null) return inputs;
  const Us = inputs.secondary_voltage ?? 100;
  const R = Number(inputs.device_resistance);
  const out = { ...inputs, device_burden: R > 0 && Number.isFinite(R) ? (Us * Us) / R : 0 };
  delete out.device_resistance;
  return out;
};
