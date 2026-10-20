'use strict';
/**
 * ied_rating.js — CTIedRating ← calculations/ct_ied_rating.py
 *
 * IED input rating check: the secondary current the relay (IED) input sees at
 * the maximum fault current against that input's ratings in the Python tool's relay
 * database (CTRelayDB.iedRatingSpecs):
 * - measuring range: i_sec,peak ≤ ct_inputs.measuring_range_max (A, peak;
 *   a range stated as RMS, measuring_range_rms: I_sec ≤ it);
 * - dynamic capacity: i_sec,peak ≤ dynamic_capacity_x_in × Isr;
 * - short-time thermal: I_sec ≤ I_T·√(T / t), t the manufacturer-advised
 *   fault duration (relays.ied_thermal_duration_s; none → not evaluated), I_T
 *   the rating for the shortest rated T ≥ t (thermal_1s/10s/60s_x_in, and
 *   CTSizer's 120 s / 180 s);
 * - 1 s thermal (issue #136, the reference calculation's "relay input capability check"):
 *   I_sec ≤ thermal_1s_x_in × Isr, whenever the input has a 1 s rating; it
 *   needs no fault duration. When it runs, the short-time check's "not
 *   evaluated (no fault duration)" remark is dropped: the check stays in
 *   `checks` (ok null), but the 1 s check answers what the remark asked;
 * - relay-specific relay_requirements rows (peak_max / rms_max / thermal_i2t).
 *
 * The secondary current is the ideal (unsaturated) CT's, the upper bound:
 * I_sec = If·Isr/Ipr, i_sec,peak = κ·√2·I_sec, κ = 1.02 + 0.98·e^(−3R/X)
 * (IEC 60909-0), R/X = 1/(ω·Tp). If is the fault current the core's own module
 * uses (its own input extraction is reused):
 * - overcurrent: Isc_max_override, else the project Ik (63 kA default)
 * - busbar / generic: project Ik (40 kA default)
 * - distance: extractDistanceInputs().iscc_max
 * - line diff: the largest of extractFaultCurrents()
 * - transformer diff: the larger of the winding's It,max and Ik,max
 * Tp is core.tp, else the project Tp, else 100 ms.
 *
 * CTCalc.calculate runs it after the module for every relay calc type whose
 * picked IED (relay_model) is in the database; apply() merges it into the
 * result. A failed check makes the core NOT_OK (is_ok false) and sets its
 * margin to the failed IED limit's, (limit / value − 1)·100 % (a passing
 * check leaves the module's margin).
 *
 * Fidelity notes:
 * - Warnings are structured ([key, ...args], ctsizer-report.js WARN) where
 *   the Python writes English strings; the checks, values and verdict match.
 * - The Python takes the IED from relay_model, else relay_name. CTSizer only
 *   writes relay_model (the Relay Information card), so it reads that, with
 *   relay_name as the same fallback.
 * - Deviations from ct_ied_rating.py (product changes, not port items): the
 *   1 s thermal check and the dropped remark above (#136), the 120 s / 180 s
 *   thermal ratings and the RMS measuring range are CTSizer's own, and
 *   CTSizer's database gives the SIPROTEC 5 IEDs the Siemens datasheet
 *   ratings (calc/relay_db.js) where the Python tool's relays.db has its own.
 *   calc/golden/ied_rating.json stays the Python's: testIedRating
 *   (calc/tests.js) runs it on the Python tool's ratings, written out there, with
 *   the #136 checks as named deltas.
 */

const CTIedRating = (() => {
  const KIND_PEAK = 'peak_max';
  const KIND_RMS = 'rms_max';
  const KIND_THERMAL = 'thermal_i2t';
  const THERMAL_RATING_COLUMNS = [
    ['thermal_1s_x_in', 1],
    ['thermal_10s_x_in', 10],
    ['thermal_60s_x_in', 60],
    ['thermal_120s_x_in', 120],
    ['thermal_180s_x_in', 180],
  ];
  const DEFAULT_TP_MS = 100;
  const DEFAULT_FREQUENCY = 50;

  const LABELS = {
    measuring_range:    ['IED measuring range check', 'IED måleområde kontrol'],
    dynamic_capacity:   ['IED dynamic capacity check', 'IED dynamisk kapacitet kontrol'],
    thermal_short_time: ['IED short-time thermal check', 'IED korttids termisk kontrol'],
    thermal_1s:         ['IED 1 s thermal check', 'IED 1 s termisk kontrol'],
  };
  const LATEX = { thermal_1s: 'I_{sec} \\le I_{th,1s}' };
  // Remark keys as literals (ctsizer-report.js WARN; tools/rtf-check.mjs
  // checks every quoted warning_ key has an EN and a DA text)
  const EXCEEDED_KEY = {
    measuring_range: 'warning_ied_measuring_range_exceeded',
    dynamic_capacity: 'warning_ied_dynamic_capacity_exceeded',
    thermal_short_time: 'warning_ied_thermal_short_time_exceeded',
    thermal_1s: 'warning_ied_thermal_1s_exceeded',
  };
  const NOT_EVALUATED_KEY = {
    unknown_limit_unit: 'warning_ied_not_evaluated_unknown_limit_unit',
    no_thermal_rating: 'warning_ied_not_evaluated_no_thermal_rating',
    no_thermal_duration: 'warning_ied_not_evaluated_no_thermal_duration',
    unknown_kind: 'warning_ied_not_evaluated_unknown_kind',
  };

  // The shared rule (CTRelayDB.relayNameOf): relay_model, else relay_name
  function relayNameOf(core) {
    return CTRelayDB.relayNameOf(core);
  }

  // IEC 60909-0 peak factor κ = 1.02 + 0.98·e^(−3R/X), R/X = 1/(ω·Tp)
  function peakFactor(tp_ms, frequency = DEFAULT_FREQUENCY) {
    if (tp_ms == null || tp_ms <= 0) return 1.02 + 0.98;
    const r_over_x = 1 / (2 * Math.PI * frequency * tp_ms / 1000);
    return 1.02 + 0.98 * Math.exp(-3 * r_over_x);
  }

  // The maximum primary fault current (A) the core's own calculation uses
  function faultCurrentFor(calcType, core, commonData = {}) {
    switch (calcType) {
      case 'overcurrent':
        return core.Isc_max_override != null ? core.Isc_max_override : (commonData.isc_sys ?? 63) * 1000;
      case 'distance':
        return CTDistance.data.extractDistanceInputs(core, commonData).iscc_max;
      case 'line_diff':
        return Math.max(...Object.values(CTLineDiff.data.extractFaultCurrents(commonData, core)));
      case 'transformer_diff': {
        const d = CTTransformerDiff.data.extractTransformerData(commonData, core);
        const currents = [d[5], d[6]].filter((i) => i != null);
        return currents.length ? Math.max(...currents) : null;
      }
      default: // busbar, generic
        return (commonData.isc_sys ?? 40) * 1000;
    }
  }

  function primaryTimeConstant(core, commonData = {}) {
    return core.tp ?? commonData.tp ?? DEFAULT_TP_MS;
  }

  function limitA(value, unit, isr) {
    if (unit === 'x_in') return value * isr;
    if (unit === 'A') return value;
    return null;
  }

  // The checks for one IED input, from ct_inputs and relay_requirements
  function buildRequirements(specs, isr) {
    const reqs = [];
    const ct = specs.ct_input || {};
    // A range stated as RMS (measuring_range_rms, e.g. SIPROTEC 5 "0 A to
    // 100 A", all data RMS values) is checked against the rms current
    if (ct.measuring_range_max != null) {
      const rms = ct.measuring_range_rms === true;
      reqs.push({ id: 'measuring_range', kind: rms ? KIND_RMS : KIND_PEAK, limit_a: ct.measuring_range_max,
                  source: rms ? 'ct_inputs.measuring_range_max (rms)' : 'ct_inputs.measuring_range_max',
                  ...(rms ? { latex: 'I_{sec} \\le I_{range}' } : {}) });
    }
    if (ct.dynamic_capacity_x_in != null) {
      reqs.push({ id: 'dynamic_capacity', kind: KIND_PEAK, limit_a: ct.dynamic_capacity_x_in * isr,
                  source: 'ct_inputs.dynamic_capacity_x_in' });
    }
    const ratings = THERMAL_RATING_COLUMNS
      .filter(([col]) => ct[col] != null)
      .map(([col, duration]) => [duration, ct[col] * isr]);
    if (ratings.length) {
      reqs.push({ id: 'thermal_short_time', kind: KIND_THERMAL, ratings,
                  check_duration_s: specs.thermal_duration_s ?? null,
                  source: 'ct_inputs.thermal_*_x_in' });
    }
    // The reference calculation's plain thermal requirement (#136): the rms current against the
    // 1 s rating itself, no fault duration needed. Only a stated 1 s rating:
    // none is derived from the 10 s / 60 s ones.
    if (ct.thermal_1s_x_in != null) {
      reqs.push({ id: 'thermal_1s', kind: KIND_RMS, limit_a: ct.thermal_1s_x_in * isr,
                  source: 'ct_inputs.thermal_1s_x_in' });
    }
    (specs.requirements || []).forEach((row, i) => {
      const limit_a = limitA(row.limit_value, row.limit_unit || 'A', isr);
      const req = { id: row.label || `requirement_${i + 1}`, kind: row.kind, limit_a,
                    source: row.source || 'relay_requirements', custom: true };
      if (row.kind === KIND_THERMAL) {
        req.ratings = row.rating_duration_s && limit_a != null ? [[row.rating_duration_s, limit_a]] : [];
        req.check_duration_s = row.check_duration_s != null ? row.check_duration_s : (specs.thermal_duration_s ?? null);
      }
      reqs.push(req);
    });
    return reqs;
  }

  // Allowed rms current for duration_s from the I²t of the rating with the
  // shortest rated T ≥ duration_s (the longest one if none is).
  // → [allowed_a, rated_duration_s, rated_current_a]
  function thermalAllowedCurrent(ratings, duration_s) {
    const sorted = [...ratings].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const covering = sorted.filter((r) => r[0] >= duration_s);
    const [rated_t, rated_i] = covering.length ? covering[0] : sorted[sorted.length - 1];
    return [rated_i * Math.sqrt(rated_t / duration_s), rated_t, rated_i];
  }

  // One check → { id, kind, value, limit, ok, reason, ... }; ok null = not evaluated
  function evaluateRequirement(req, i_sec_rms, i_sec_peak) {
    const out = { id: req.id, kind: req.kind, source: req.source,
                  value: null, limit: null, ok: null, reason: null };
    if (req.kind === KIND_PEAK || req.kind === KIND_RMS) {
      if (req.limit_a == null) { out.reason = 'unknown_limit_unit'; return out; }
      out.value = req.kind === KIND_PEAK ? i_sec_peak : i_sec_rms;
      out.limit = req.limit_a;
    } else if (req.kind === KIND_THERMAL) {
      const t = req.check_duration_s;
      if (!req.ratings || !req.ratings.length) { out.reason = 'no_thermal_rating'; return out; }
      if (t == null || t <= 0) { out.reason = 'no_thermal_duration'; return out; }
      const [allowed, rated_t, rated_i] = thermalAllowedCurrent(req.ratings, t);
      Object.assign(out, { value: i_sec_rms, limit: allowed, duration_s: t,
                           rated_duration_s: rated_t, rated_current_a: rated_i });
    } else {
      out.reason = 'unknown_kind';
      return out;
    }
    out.ok = out.value <= out.limit;
    out.utilization = out.limit ? out.value / out.limit : null;
    return out;
  }

  function checkStep(req, chk) {
    const [en, da] = (!req.custom && LABELS[req.id]) ||
      [`IED-specific requirement: ${req.id}`, `IED-specifikt krav: ${req.id}`];
    const rel = chk.ok ? '≤' : '>';
    const f2 = (v) => v.toFixed(2);
    let latex, comparison;
    if (chk.kind === KIND_THERMAL) {
      latex = 'I_{sec} \\le I_{th,T} \\cdot \\sqrt{T / t}';
      comparison = `${f2(chk.value)} A ${rel} ${f2(chk.rated_current_a)} A · ` +
        `√(${chk.rated_duration_s} s / ${chk.duration_s} s) = ${f2(chk.limit)} A`;
    } else if (chk.kind === KIND_RMS) {
      latex = req.latex || (!req.custom && LATEX[req.id]) || 'I_{sec} \\le I_{max}';
      comparison = `${f2(chk.value)} A ${rel} ${f2(chk.limit)} A`;
    } else {
      latex = 'i_{sec,peak} \\le i_{max,peak}';
      comparison = `${f2(chk.value)} A ${rel} ${f2(chk.limit)} A`;
    }
    return CTStep.conclusion({
      key: `ied_${req.custom ? 'requirement' : req.id}_check${req.custom ? '_' + req.id : ''}`,
      label_en: en, label_da: da, latex, is_ok: chk.ok, comparison,
    });
  }

  // calculate_ied_rating(common_data, core_data) for a CTSizer calc type.
  // null: no database IED picked (custom relay, metering / VT core).
  function calculate(calcType, core, commonData = {}) {
    if (!core || !CTRelayDB.supports(calcType)) return null;
    const name = relayNameOf(core);
    if (!name) return null;
    const isr = core.Is ?? 1;
    const ipr = core.Ip ?? 2000;
    const specs = CTRelayDB.iedRatingSpecs(name, isr, calcType);
    if (!specs) return null;

    const result = { status: 'N/A', relay_name: name, checks: [], steps: [], warnings: [] };
    const reqs = buildRequirements(specs, isr);
    if (!reqs.length) {
      result.warnings.push(['warning_ied_no_input_data', name, isr]);
      return result;
    }
    const i_fault = faultCurrentFor(calcType, core, commonData);
    if (i_fault == null) {
      result.warnings.push(['warning_ied_no_fault_current']);
      return result;
    }
    const tp_ms = primaryTimeConstant(core, commonData);
    const frequency = commonData.freq != null ? (parseFloat(commonData.freq) || DEFAULT_FREQUENCY) : DEFAULT_FREQUENCY;
    const kappa = peakFactor(tp_ms, frequency);
    const i_sec_rms = i_fault * isr / ipr;
    const i_sec_peak = kappa * Math.SQRT2 * i_sec_rms;
    Object.assign(result, { i_fault, tp_ms, kappa, i_sec_rms, i_sec_peak });

    const steps = result.steps;
    steps.push(CTStep.make({
      key: 'ied_secondary_fault_current',
      label_en: 'Secondary fault current (rms)', label_da: 'Sekundær fejlstrøm (rms)',
      latex: 'I_{sec} = I_f \\cdot \\frac{I_{sr}}{I_{pr}}',
      variables: { If: i_fault, Isr: isr, Ipr: ipr },
      result: i_sec_rms, unit: 'A', precision: 2,
    }));
    steps.push(CTStep.make({
      key: 'ied_peak_factor',
      label_en: 'Peak factor κ (IEC 60909-0)', label_da: 'Spidsfaktor κ (IEC 60909-0)',
      latex: '\\kappa = 1.02 + 0.98 \\cdot e^{-3 / (2\\pi f T_p)}',
      variables: { f: frequency, Tp: tp_ms / 1000 },
      result: kappa, precision: 3,
    }));
    steps.push(CTStep.make({
      key: 'ied_secondary_peak_current',
      label_en: 'Secondary peak current (ideal CT)', label_da: 'Sekundær spidsstrøm (ideel CT)',
      latex: 'i_{sec,peak} = \\kappa \\cdot \\sqrt{2} \\cdot I_{sec}',
      variables: { kappa, I_sec: i_sec_rms },
      result: i_sec_peak, unit: 'A', precision: 2,
    }));

    // With a 1 s rating the plain 1 s check (#136) replaces the short-time
    // check's "no fault duration" remark (the check itself stays, ok null)
    const has1s = reqs.some((r) => !r.custom && r.id === 'thermal_1s');
    reqs.forEach((req) => {
      const chk = evaluateRequirement(req, i_sec_rms, i_sec_peak);
      result.checks.push(chk);
      if (chk.ok == null) {
        const answered = has1s && !req.custom && req.id === 'thermal_short_time' && chk.reason === 'no_thermal_duration';
        if (!answered) result.warnings.push([NOT_EVALUATED_KEY[chk.reason], name, chk.id]);
        return;
      }
      steps.push(checkStep(req, chk));
      if (!chk.ok) {
        result.warnings.push(req.custom
          ? ['warning_ied_requirement_exceeded', name, chk.id, chk.value, chk.limit]
          : [EXCEEDED_KEY[chk.id], name, chk.value, chk.limit]);
      }
    });

    const evaluated = result.checks.filter((c) => c.ok != null);
    if (evaluated.length) {
      result.status = evaluated.every((c) => c.ok) ? 'OK' : 'NOT_OK';
      // Margin of the tightest limit, % (CTSizer's margin; not in the Python)
      result.margin = Math.min(...evaluated.map((c) => (c.limit / c.value - 1) * 100));
    }
    return result;
  }

  // Module conclusions a failed IED check turns into a failure
  const FAILED_CONCLUSION = { ct_sufficient: 'ct_insufficient', OK: 'NOT_OK' };

  // Merge an IED rating result into a module result; NOT_OK fails the core.
  // Returns a new object (the module result is not modified).
  function apply(result, ied) {
    if (!result || !ied) return result;
    const out = {
      ...result,
      ied_rating: ied,
      steps: [...(result.steps || []), ...ied.steps],
      warnings: [...(result.warnings || []), ...ied.warnings],
    };
    if (ied.status === 'NOT_OK') {
      out.is_ok = false;
      out.status = 'NOT_OK';
      // The core's margin is the failed IED limit's (negative), so the margin
      // shown next to the verdict agrees with it
      if (ied.margin != null) out.margin = result.margin != null ? Math.min(result.margin, ied.margin) : ied.margin;
      if (Object.prototype.hasOwnProperty.call(FAILED_CONCLUSION, result.conclusion)) {
        out.conclusion = FAILED_CONCLUSION[result.conclusion];
      }
      if (Array.isArray(result.failed_methods)) out.failed_methods = [...result.failed_methods, 'ied_rating'];
    }
    return out;
  }

  return {
    KIND_PEAK, KIND_RMS, KIND_THERMAL,
    relayNameOf, peakFactor, faultCurrentFor, primaryTimeConstant,
    buildRequirements, thermalAllowedCurrent, evaluateRequirement, calculate, apply,
  };
})();
