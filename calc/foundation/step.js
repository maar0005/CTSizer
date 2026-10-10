'use strict';
/**
 * foundation/step.js — JS analog of calculations/formula_helper.make_step
 *
 * Builds a CTSizer-native calculation step:
 *   { key, label_en, label_da, latex, result, unit, precision, ... }
 * Use CTStep.make() for value rows and CTStep.conclusion() for pass/fail rows.
 * This collapses the verbose inline step literals currently repeated across
 * calc/*.js (see calc/metering.js) into one or two lines each.
 */
const CTStep = (() => {

  // Value step. `variables` is optional (kept for parity with Python make_step;
  // handy for substitution display in the Formula Steps tab). Any extra fields
  // in `spec` are passed through.
  function make(spec) {
    const {
      key, label_en, label_da, latex,
      result = null, unit = '', precision = 4, variables = null,
      ...rest
    } = spec;
    const step = { key, label_en, label_da, latex, result, unit, precision, ...rest };
    if (variables) step.variables = variables;
    return step;
  }

  // Conclusion / condition row (pass-fail). Mirrors the is_conclusion rows
  // already emitted by calc/metering.js and calc/overcurrent.js.
  function conclusion(spec) {
    const {
      key, label_en, label_da, latex,
      is_ok, comparison = '', unit = '', precision = 2,
      ...rest
    } = spec;
    return {
      key, label_en, label_da, latex,
      result: null, unit, precision,
      is_conclusion: true, is_ok, comparison,
      ...rest,
    };
  }

  return { make, conclusion };
})();
