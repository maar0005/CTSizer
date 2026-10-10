'use strict';
/**
 * distance/relay.js — Port of calculations/ct_distance/relay.py
 *
 * Relay rated current and relay resistance for distance protection — a thin
 * wrapper over the already-ported CTBase.calcRelayResistance. Extends the
 * CTDistance namespace (calc/distance.js, loaded first); composed by calc/distance/main.js.
 */

CTDistance.relay = (() => {
  // ── calculate_relay_parameters(params) ──────────────────────────────────
  // Rated current equals the CT secondary current; relay resistance comes
  // from the shared ct_base helper. Returns { ratedCurrent, relayResistance }.
  function calculateRelayParameters(params) {
    const ratedCurrent = params.secondary_current;
    const relayResistance = CTBase.calcRelayResistance(params.relay_burden, params.secondary_current);
    return { ratedCurrent, relayResistance };
  }

  // ── add_relay_parameter_steps(...) ──────────────────────────────────────
  // Appends the rated-current row then the relay-resistance row.
  function addRelayParameterSteps(steps, params, ratedCurrent, relayResistance) {
    steps.push(CTStep.make({
      key: 'relay_nominal_current',
      label_en: "The relay's nominal current equals the CT secondary current.",
      label_da: 'Relæets nominelle strøm er lig med CT sekundær strøm.',
      latex: 'I_R = I_{sr}',
      variables: { Isr: ratedCurrent },
      result: ratedCurrent, unit: 'A', precision: 0,
    }));

    steps.push(CTStep.make({
      key: 'relay_resistance',
      label_en: 'Maximum resistance of the protection relay is calculated from the relay burden.',
      label_da: 'Maksimal modstand af beskyttelsesrelæet beregnes fra relæbyrden.',
      latex: 'R_{relay} = \\frac{S_R}{I_R^2}',
      variables: { SR: params.relay_burden, IR: ratedCurrent },
      result: relayResistance, unit: 'Ω', precision: 4,
    }));

    return steps;
  }

  return { calculateRelayParameters, addRelayParameterSteps };
})();
