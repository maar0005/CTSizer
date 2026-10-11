# CTSizer tests

This release passed **5,828 checks in 53 test groups**
before it was published. 5,150 of them are golden checks against the
42 fixture files in `calc/golden/`; the other 678 are
hand-derived checks.

All the test code is in [`calc/tests.js`](calc/tests.js). Each test group
below links to its code and to the golden fixture it reads.

## How a check works

A check is one `assert` in `calc/tests.js`. It has a name, the value the
calculation gave and the value it should give. Numbers match within a relative
tolerance of 0.5 % unless the check sets its own tolerance or compares exactly.

- **Golden checks** run the CTSizer calculation with the inputs stored in a
  fixture in `calc/golden/` and compare the result with the expected result
  stored next to them. The fixtures were made by running the Python reference
  implementation that the CTSizer calculations were ported from, with the same
  inputs. Where a fixture stores a whole result object or array, it is
  compared key by key and element by element (`matchesExpected`), so the
  check covers every number in it, not only the final one.
- **Hand-derived checks** compare with values worked out by hand. The
  derivation is in the comment next to the check, for example
  `EALF = 20 × 1 × (4 + 30) = 680 V`. They also cover what the reference does
  not have, such as CTSizer's wiring topologies and its Ts table.

## Run them

With Node.js 18 or newer:

    node tools/run-tests.mjs              # all checks
    node tools/run-tests.mjs --no-golden  # the hand-derived checks only

The runner loads the calculation modules in the order `index.html` does,
gives `calc/tests.js` the golden fixtures and exits with an error if a check
fails. It also checks that no file outside the cable-resistance toolbox
calculates a cable resistance itself.

The app runs the same `calc/tests.js` in your browser when the page loads; the
results are the `[CTTest]` lines in the browser console. The browser does not
download the golden fixtures, so it runs the hand-derived checks only.

## Test groups

"Golden" is the number of golden checks in the group; the rest are
hand-derived.

### Foundation and materials (136 checks)

| Test group | What it checks | Checks | Golden | Fixture |
|---|---|---:|---:|---|
| [Foundation](calc/tests.js#L3534) | The CT base functions every module builds on: ALF or Vk from the core data, relay burden resistance, EALF, operating ALF, the proposed knee-point voltage and its adequacy, remanence factors, typical secondary time constants, CT class parsing, core adequacy and the CT class recommendation. | 79 | 79 | [foundation.json](calc/golden/foundation.json) |
| [Materials](calc/tests.js#L53) | Conductor materials: copper or aluminium, material properties, DC resistance per km, wiring factor, resistivity and resistance at temperature, cable burden. | 57 | 54 | [materials.json](calc/golden/materials.json) |

### Cable resistance (2,053 checks)

| Test group | What it checks | Checks | Golden | Fixture |
|---|---|---:|---:|---|
| [CableResCore](calc/tests.js#L136) | The shared cable-resistance toolbox: input normalisation, guards, the temperature law, wiring topology, the method registry and `calculate()` / `lead()`. | 121 | 45 | [cable_resistance.json](calc/golden/cable_resistance.json) |
| [CableResTable](calc/tests.js#L358) | The `table` method: IEC 60228 conductor resistances for every cross-section, material and temperature. | 925 | 896 | [cable_resistance.json](calc/golden/cable_resistance.json) |
| [CableResIec60287](calc/tests.js#L591) | The `iec60287` method (the default): the resistance calculated from resistivity and temperature. | 923 | 896 | [cable_resistance.json](calc/golden/cable_resistance.json) |
| [CableResTopology](calc/tests.js#L478) | Four-wire and six-wire wiring: the loop factor for every fault current case, including √3 for a two-phase fault in four-wire, and the formula-step labels. | 65 | 0 | — |
| [CableResConsistency](calc/tests.js#L4371) | The same cable through every protection module, as the app calls them: for every method, temperature and wiring the loop resistance is the identical number in every module (372 combinations). | 19 | 0 | — |

### Protection and metering cores (672 checks)

| Test group | What it checks | Checks | Golden | Fixture |
|---|---|---:|---:|---|
| [Overcurrent](calc/tests.js#L828) | Complete overcurrent core calculation against the reference, for each cable-resistance method and wiring topology, and the saturation curve. | 136 | 119 | [overcurrent.json](calc/golden/overcurrent.json) |
| [Metering](calc/tests.js#L1009) | Complete metering core calculation (instrument security factor) against the reference, for each cable-resistance method and wiring topology. | 136 | 119 | [metering.json](calc/golden/metering.json) |
| [Busbar](calc/tests.js#L1163) | Complete busbar protection core calculation (P class: operating ALF; PX class: E.M.F. and knee-point voltage for high-impedance schemes) against the reference, for each cable-resistance method and wiring topology. | 133 | 110 | [busbar.json](calc/golden/busbar.json) |
| [Generic](calc/tests.js#L1300) | The generic protection core, for a relay type without its own module (ALF or Vk against the connected burden), against the reference, for each cable-resistance method and wiring topology. | 102 | 78 | [generic.json](calc/golden/generic.json) |
| [CtCalculations](calc/tests.js#L4239) | The dispatcher the app uses (`CTCalc`): which module each core type is routed to, the single-core calculation and the security factor constant. | 122 | 112 | [ct_calculations.json](calc/golden/ct_calculations.json) |
| [IedRating](calc/tests.js#L4936) | IED input rating: peak factor, thermal withstand current, the requirements, and that a failed IED check fails the core. | 33 | 33 | [ied_rating.json](calc/golden/ied_rating.json) |
| [RelayDb](calc/tests.js#L4789) | The relay database (23 relays): manufacturers, IEDs per application, burden and t_al per rated current, filling in SR and t_al, and t_al reaching the C-O-C-O check. | 10 | 0 | — |

### Distance protection (465 checks)

| Test group | What it checks | Checks | Golden | Fixture |
|---|---|---:|---:|---|
| [DistanceMain](calc/tests.js#L1421) | The complete distance protection calculation (data → cable resistance → relay → fault current → transient factors → knee point → auto-reclosure) against the reference, for each cable-resistance method and wiring topology. | 298 | 270 | [distance_main.json](calc/golden/distance_main.json) |
| [DistanceData](calc/tests.js#L1604) | Input extraction and validation: CT inputs, fault current data and input ranges. | 27 | 19 | [distance_data.json](calc/golden/distance_data.json) |
| [DistanceCableResistance](calc/tests.js#L1693) | The lead resistance for each fault type, with the project method and temperature and the core's wiring. | 15 | 0 | — |
| [DistanceFaultCalculation](calc/tests.js#L1744) | Source impedance, zone 1 impedance and zone 1 fault current, with input validation. | 22 | 11 | [distance_fault_calculation.json](calc/golden/distance_fault_calculation.json) |
| [DistanceTransientFactors](calc/tests.js#L1817) | Transient dimensioning factor Ktd (analytical and from the factor table), t_al from Ktd, and Kssc. | 35 | 27 | [distance_transient_factors.json](calc/golden/distance_transient_factors.json) |
| [DistanceKneePoint](calc/tests.js#L1910) | Required knee-point voltage and the proposed EALF. | 10 | 4 | [distance_knee_point.json](calc/golden/distance_knee_point.json) |
| [DistanceRelay](calc/tests.js#L1953) | Relay parameters: rated current and relay burden resistance S/I², including zero current. | 8 | 3 | [distance_relay.json](calc/golden/distance_relay.json) |
| [DistanceAutoReclosureExt](calc/tests.js#L1987) | Auto-reclosure for distance cores: Ktd and EAL for C-O-C-O, the adequacy check and the saturation check by ODE. | 36 | 18 | [distance_auto_reclosure_ext.json](calc/golden/distance_auto_reclosure_ext.json) |
| [DistanceFormatting](calc/tests.js#L2086) | The formula steps shown in the app and report: impedance, Ktd and the final result. | 14 | 8 | [distance_formatting.json](calc/golden/distance_formatting.json) |

### Auto-reclosure (C-O-C-O) (96 checks)

| Test group | What it checks | Checks | Golden | Fixture |
|---|---|---:|---:|---|
| [AutoReclosure](calc/tests.js#L2134) | Hand-derived C-O-C-O checks: curve interpolation, Ktd for low and high time-constant classes, EAL, and how distance and line differential cores use them. | 13 | 0 | — |
| [ArTsTable](calc/tests.js#L2196) | CTSizer's table of typical secondary time constants Ts per CT class and voltage, and how a core in table mode uses it. | 26 | 0 | — |
| [AutoReclosurePresets](calc/tests.js#L2243) | The whole table of Ktf curve presets, including the digitised curves. | 25 | 25 | [auto_reclosure.json](calc/golden/auto_reclosure.json) |
| [AutoReclosureComputation](calc/tests.js#L2269) | Curve interpolation, Ktd from a curve, C-O-C-O Ktd and EAL. | 20 | 20 | [auto_reclosure.json](calc/golden/auto_reclosure.json) |
| [AutoReclosureWaveform](calc/tests.js#L2306) | The C-O-C-O fault current (AC with a decaying DC offset) and the secondary flux by implicit Euler integration (IEC 61869-100 §5.2.3), compared point by point. | 12 | 12 | [auto_reclosure.json](calc/golden/auto_reclosure.json) |

### Transformer differential protection (873 checks)

| Test group | What it checks | Checks | Golden | Fixture |
|---|---|---:|---:|---|
| [TransformerDiffMain](calc/tests.js#L2332) | The complete transformer differential calculation against the reference, for each cable-resistance method and wiring topology. | 691 | 666 | [transformer_diff_main.json](calc/golden/transformer_diff_main.json) |
| [TransformerDiffPresets](calc/tests.js#L2518) | The constants: temperature coefficients, default values and the IEC, Ziegler and E.M.F. method constants. | 7 | 7 | [transformer_diff_presets.json](calc/golden/transformer_diff_presets.json) |
| [TransformerDiffData](calc/tests.js#L2560) | Input extraction: CT inputs, transformer windings and transformer data. | 32 | 20 | [transformer_diff_data.json](calc/golden/transformer_diff_data.json) |
| [TransformerDiffBurden](calc/tests.js#L2652) | Burden: resistivity at temperature, cable burden, CT internal burden and total burden. | 21 | 17 | [transformer_diff_burden_calculation.json](calc/golden/transformer_diff_burden_calculation.json) |
| [TransformerDiffMethodsEmf](calc/tests.js#L2703) | The E.M.F. method: relay resistance and the E.M.F. for internal fault, through fault and inrush. | 28 | 22 | [transformer_diff_methods_emf.json](calc/golden/transformer_diff_methods_emf.json) |
| [TransformerDiffMethodsIec61869](calc/tests.js#L2753) | The IEC 61869 method: requirements, ALF for external and internal faults, minimum ALF and the adaptation factor. | 31 | 25 | [transformer_diff_methods_iec61869.json](calc/golden/transformer_diff_methods_iec61869.json) |
| [TransformerDiffMethodsZiegler](calc/tests.js#L2795) | The Ziegler method: Kssc, ALF requirements and the verification. | 18 | 12 | [transformer_diff_methods_ziegler.json](calc/golden/transformer_diff_methods_ziegler.json) |
| [TransformerDiffFormatting](calc/tests.js#L2835) | The formula steps: transformer data, cable burden, total burden, CT burden and operating ALF. | 45 | 39 | [transformer_diff_formatting.json](calc/golden/transformer_diff_formatting.json) |

### Line differential protection (300 checks)

| Test group | What it checks | Checks | Golden | Fixture |
|---|---|---:|---:|---|
| [LineDiffMain](calc/tests.js#L2927) | The complete line differential calculation against the reference, for each cable-resistance method and wiring topology. | 206 | 184 | [line_diff_main.json](calc/golden/line_diff_main.json) |
| [LineDiffData](calc/tests.js#L3151) | Input extraction: CT inputs, cable data, fault currents and auto-reclosure parameters. | 22 | 14 | [line_diff_data.json](calc/golden/line_diff_data.json) |
| [LineDiffEmfCalculation](calc/tests.js#L3264) | Total loop resistance (three-phase and single-phase) and the E.M.F. for internal and external faults. | 22 | 14 | [line_diff_emf_calculation.json](calc/golden/line_diff_emf_calculation.json) |
| [LineDiffKneePoint](calc/tests.js#L3371) | Required knee-point voltage (the largest of the four E.M.F. scenarios) and its adequacy. | 9 | 5 | [line_diff_knee_point.json](calc/golden/line_diff_knee_point.json) |
| [LineDiffAutoReclosureExt](calc/tests.js#L3414) | Auto-reclosure for line differential cores: Ktd, Kssc, EAL and the complete analysis. | 12 | 9 | [line_diff_auto_reclosure_ext.json](calc/golden/line_diff_auto_reclosure_ext.json) |
| [LineDiffFormatting](calc/tests.js#L3469) | The formula steps: relay resistance and the E.M.F. for each fault scenario. | 29 | 22 | [line_diff_formatting.json](calc/golden/line_diff_formatting.json) |

### Voltage transformers (962 checks)

| Test group | What it checks | Checks | Golden | Fixture |
|---|---|---:|---:|---|
| [VtData](calc/tests.js#L3620) | Input extraction and validation for VT cores and the common data. | 23 | 17 | [vt_data.json](calc/golden/vt_data.json) |
| [VtPresets](calc/tests.js#L3663) | Voltage drop limits, thermal burden defaults and accuracy class definitions. | 16 | 11 | [vt_presets.json](calc/golden/vt_presets.json) |
| [VtImpedance](calc/tests.js#L3709) | Rated secondary current, burden impedance, parallel resistance and total impedance. | 72 | 65 | [vt_impedance.json](calc/golden/vt_impedance.json) |
| [VtCurrentBurden](calc/tests.js#L3775) | Actual current and burden, burden utilisation and reserve capacity. | 71 | 63 | [vt_current_burden.json](calc/golden/vt_current_burden.json) |
| [VtVoltageAnalysis](calc/tests.js#L3824) | Voltage drop, the largest voltage drop and the limits. | 56 | 49 | [vt_voltage_analysis.json](calc/golden/vt_voltage_analysis.json) |
| [VtThermal](calc/tests.js#L3872) | Thermal utilisation, limits and margin. | 50 | 44 | [vt_thermal.json](calc/golden/vt_thermal.json) |
| [VtValidation](calc/tests.js#L3918) | Burden limits, thermal limits and range compliance. | 58 | 50 | [vt_validation.json](calc/golden/vt_validation.json) |
| [VtFormatting](calc/tests.js#L3968) | The formula steps and result data for VT cores. | 23 | 16 | [vt_formatting.json](calc/golden/vt_formatting.json) |
| [VtCalculator](calc/tests.js#L4016) | The complete VT calculation for single and multiple cores against the reference, for each cable-resistance method and wiring topology. | 593 | 564 | [vt_calculator.json](calc/golden/vt_calculator.json) |

### End to end (257 checks)

| Test group | What it checks | Checks | Golden | Fixture |
|---|---|---:|---:|---|
| [EndToEnd](calc/tests.js#L4465) | 19 realistic cores of every type, stored as the app stores them, through `CTCalc.calculate` exactly as the app calls it: status, the numbers in the Summary panel and every formula-step row compared with the reference. Nothing is hand-written. | 257 | 257 | [e2e.json](calc/golden/e2e.json) |

### Other (14 checks)

| Test group | What it checks | Checks | Golden | Fixture |
|---|---|---:|---:|---|
| [RelayCalcParams](calc/tests.js#L4837) | — | 14 | 0 | — |
