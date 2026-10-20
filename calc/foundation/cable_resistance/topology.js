'use strict';
/**
 * foundation/cable_resistance/topology.js — wiring topology (PORTING_PLAN.md
 * §9.2, §9.8). A separate multiplier on the per-conductor result, never part
 * of a method:  R_lead = k · R_c.
 *
 * k depends on the wiring and on the current case the calling module
 * evaluates (not a user setting). Phase currents are always 120° apart.
 *   six_wire  — a go + return pair per CT: k = 2 in every case
 *               (= the Python tool's materials.get_wiring_factor()).
 *   four_wire — three phase wires + one shared return carrying the vector
 *               sum: 3-phase balanced 1, 2-phase |2 + e^{−j120°}| = √3,
 *               1-phase 2. No reference in the Python tool; §9.8 is the source.
 * The wiring is per core (core.cable_topology); defaultTopology(calcType)
 * gives six_wire for metering and four_wire for every other calc type.
 */

CTCableRes.CURRENT_CASES = ['three_phase', 'two_phase', 'single_phase'];

CTCableRes.topology = {
  four_wire: {
    id: 'four_wire',
    label_en: '4-wire',
    label_da: '4-leder',
    factors: { three_phase: 1, two_phase: Math.sqrt(3), single_phase: 2 },
  },
  six_wire: {
    id: 'six_wire',
    label_en: '6-wire',
    label_da: '6-leder',
    factors: { three_phase: 2, two_phase: 2, single_phase: 2 },
  },
};

// ── applyTopology(result, topology, currentCase) ────────────────────────
// `result` is a calculate() result (only r_conductor is read). Returns
// { topology, current_case, factor, r_loop, steps: [total_cable_resistance] }.
CTCableRes.applyTopology = function applyTopology(result, topology = CTCableRes.DEFAULT_TOPOLOGY, currentCase) {
  const has = (obj, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(obj, k);
  if (!has(CTCableRes.topology, topology)) {
    throw new Error(`unknown cable topology: ${topology}`);
  }
  if (!CTCableRes.CURRENT_CASES.includes(currentCase)) {
    throw new Error(`unknown current case: ${currentCase}`);
  }
  const r_conductor = result ? result.r_conductor : undefined;
  if (typeof r_conductor !== 'number' || !Number.isFinite(r_conductor) || r_conductor < 0) {
    throw new RangeError(`r_conductor must be a finite number ≥ 0, got ${r_conductor}`);
  }

  const topo = CTCableRes.topology[topology];
  const factor = topo.factors[currentCase];
  const r_loop = factor * r_conductor;

  const step = CTStep.make({
    key: 'total_cable_resistance',
    label_en: `Total cable resistance (${topo.label_en})`,
    label_da: `Total kabelmodstand (${topo.label_da})`,
    latex: 'R_{lead} = k \\cdot R_{c}',
    variables: { k: factor, R_c: r_conductor },
    result: r_loop, unit: 'Ω',
  });

  return { topology, current_case: currentCase, factor, r_loop, steps: [step] };
};

// ── defaultTopology(calcType) ───────────────────────────────────────────
// §9.8 / D3: six_wire for metering, four_wire for every other calc type
// (VT included).
CTCableRes.defaultTopology = function defaultTopology(calcType) {
  return calcType === 'metering' ? 'six_wire' : 'four_wire';
};

// ── resolveTopology(core, calcType) ─────────────────────────────────────
// The core's wiring (core.cable_topology) if it is a registered id; a core
// without the field, or with an unknown id from a saved project, gets the
// calc type's default instead of throwing.
CTCableRes.resolveTopology = function resolveTopology(core, calcType) {
  const id = core ? core.cable_topology : undefined;
  const known = typeof id === 'string' && Object.prototype.hasOwnProperty.call(CTCableRes.topology, id);
  return known ? id : CTCableRes.defaultTopology(calcType);
};
