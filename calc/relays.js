'use strict';
/**
 * relays.js — CTRelayDB: IED lookup for the Relay Information card and the
 * relay-specific calculation parameters.
 *
 * The data is calc/relay_db.js, CTSizer's IED database (imported from
 * the Python tool's data/relays.db, now edited here). The lookups follow
 * data/relay_database.py and the Python tool's relay picker (ui/ct_widget/handlers.py):
 * - the model list is filtered by the core's application
 *   (get_relays_by_application, supported_applications);
 * - picking a model fills the relay burden from the CT input with the core's
 *   rated secondary current (get_ct_specs(name, Isr).burden_va) and the relay
 *   time t_al from measurement_time_ms (get_relay_measurement_time; an IED
 *   row without one takes DEFAULT_TAL_MS, 25 ms, the database column's
 *   default). With auto-reclosure on, t_al is both C-O-C-O measurement
 *   windows (CTCalc.moduleCore), so every AR core is checked with its own
 *   IED's time;
 * - an IED with operate_times (CTSizer's own, e.g. SIPROTEC 5) has no
 *   measurement_time_ms: t_al is the operate time of the protection function
 *   the core picks (relay_function; the only one when the application lists
 *   one) at the project's rated frequency, + inrush_ms when the core uses
 *   inrush detection (relay_inrush), + the core's network delay
 *   (relay_network_delay, ms) for a function with network_delay. Until all
 *   of those are known t_al is blank (no default). An application the IED
 *   lists no operate time for leaves t_al to be typed;
 * - a custom relay (no model picked) is entered by hand. The Python tool's GUI gives
 *   it 25 ms; CTSizer has no default: t_al is required with AR on
 *   (CTRequired, PORTING_PLAN.md §10.7 W7).
 *
 * The core keys: relay_model = the database name (e.g. "SIPROTEC 5 7SA87"),
 * relay_manufacturer / relay_type = its manufacturer and model, relay_burden =
 * SR (VA), relay_tal = t_al (ms), relay_function / relay_inrush /
 * relay_network_delay = the operate-time choices. relayNameOf(core) is the one rule for
 * which IED a core uses: relay_model, else relay_name (the key the Python tool's
 * calculations read; an imported core may carry it).
 *
 * iedRatingSpecs feeds the IED input rating check (CTIedRating,
 * calc/ied_rating.js). busbarParams / trafoDiffParams / vkaFactor feed the
 * busbar P-class Check 3, the transformer differential IEC 61869 ALF method
 * and the distance close-in Vka. The Python tool reads these from relay_name only,
 * which its GUI never sets, so there they are always off; CTSizer applies
 * the picked IED's values (issue #93, PORTING_PLAN.md F-BB-RELAY).
 */

const CTRelayDB = (() => {
  const RELAYS = typeof CT_RELAY_DB_DATA !== 'undefined' ? CT_RELAY_DB_DATA : [];
  const DEFAULT_TAL_MS = 25;

  // Defaults for a field missing inside an IED's busbar / distance group
  // (relay_database.py get_relay_busbar_params, get_relay_vka_factor). The
  // transformer_diff defaults are the module's IEC_CONSTANTS
  // (calc/transformer_diff/presets.js).
  const CALC_DEFAULTS = {
    busbar: { fa_min_low_tp: 10, fa_min_high_tp: 20, tp_threshold_ms: 120 },
    distance: { vka_factor: 1.3 },
  };

  // CTSizer calc_type → the Python tool's supported_applications entry
  const APPLICATION = {
    overcurrent:      'overcurrent',
    busbar:           'busbar',
    distance:         'distance',
    line_diff:        'line_differential',
    transformer_diff: 'transformer_differential',
  };

  function supports(calcType) {
    return Object.prototype.hasOwnProperty.call(APPLICATION, calcType);
  }

  function manufacturers() {
    return [...new Set(RELAYS.map((r) => r.manufacturer))].sort();
  }

  // Models of one manufacturer for a calc type, sorted by name
  function list(manufacturer, calcType) {
    const app = APPLICATION[calcType];
    return RELAYS.filter((r) => r.manufacturer === manufacturer && (!app || r.applications.includes(app)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function byName(name) {
    return name ? RELAYS.find((r) => r.name === name) || null : null;
  }

  // The IED a core uses: relay_model (the picker), else relay_name
  function relayNameOf(core) {
    return (core && (core.relay_model || core.relay_name)) || null;
  }

  // The core's IED in the database, or null (manual entry, or a name the
  // database no longer has: both calculate with the defaults)
  function relayOf(core) {
    return byName(relayNameOf(core));
  }

  function group(relay, key) {
    return relay && relay[key] ? { ...CALC_DEFAULTS[key], ...relay[key] } : null;
  }

  // Busbar P-class Fa minimum { fa_min_low_tp, fa_min_high_tp,
  // tp_threshold_ms } for the core's IED; null: no IED, or one without a
  // manufacturer minimum (Check 3 not evaluated).
  function busbarParams(core) {
    return group(relayOf(core), 'busbar');
  }

  // Transformer differential IEC 61869 ALF factors for the core's IED:
  // { applicable, params }, params = the IED's own factors (a missing one
  // takes IEC_CONSTANTS). No IED: applicable, no factors of its own. An IED
  // without the transformer_diff group is E.m.f.-only: not applicable.
  function trafoDiffParams(core) {
    const relay = relayOf(core);
    if (!relay) return { applicable: true, params: null };
    const params = relay.transformer_diff ? { ...relay.transformer_diff } : null;
    return { applicable: params != null, params };
  }

  // Distance close-in Vka divisor for the core's IED (default 1.3)
  function vkaFactor(core) {
    return (group(relayOf(core), 'distance') || CALC_DEFAULTS.distance).vka_factor;
  }

  // get_ct_specs(name, Isr) → the CT input spec, or null
  function ctSpecs(name, Is) {
    const r = byName(name);
    return (r && r.ct_inputs[String(Number(Is ?? 1))]) || null;
  }

  // The IED's operate-time functions for a calc type, or null (none listed)
  function operateFunctions(relay, calcType) {
    const app = APPLICATION[calcType];
    const rows = relay && relay.operate_times && app ? relay.operate_times[app] : null;
    return rows && rows.length ? rows : null;
  }

  // The operate time t_al for the core's choices, or null when the IED lists
  // no function for the calc type: { functions, fn (the picked row, or null),
  // base_ms, inrush_ms, network_ms, tal_ms }. A value not known yet (no
  // function picked, no rated frequency, inrush detection / network delay
  // not entered) is null, and then tal_ms is null.
  function operateTime(relay, calcType, freq, core = {}) {
    const functions = operateFunctions(relay, calcType);
    if (!functions) return null;
    const fn = functions.length === 1 ? functions[0]
      : functions.find((f) => f.function === core.relay_function) || null;
    const out = { functions, fn, base_ms: null, inrush_ms: null, network_ms: null, tal_ms: null };
    if (!fn) return out;
    const base = typeof fn.ms === 'number' ? fn.ms : (freq != null ? fn.ms[String(freq)] : undefined);
    out.base_ms = typeof base === 'number' ? base : null;
    if (fn.inrush_ms == null) out.inrush_ms = 0;
    else if (typeof core.relay_inrush === 'boolean') out.inrush_ms = core.relay_inrush ? fn.inrush_ms : 0;
    if (!fn.network_delay) out.network_ms = 0;
    else if (typeof core.relay_network_delay === 'number' && core.relay_network_delay >= 0) out.network_ms = core.relay_network_delay;
    if (out.base_ms != null && out.inrush_ms != null && out.network_ms != null) {
      out.tal_ms = out.base_ms + out.inrush_ms + out.network_ms;
    }
    return out;
  }

  // The values a picked model sets: { relay, burden_va (null: not in the
  // database for this Isr), tal_ms, tal_db, times }, or null for a custom
  // relay. tal_db: the database sets t_al (tal_ms may still be null: the
  // operate-time choices are not complete); false: t_al is typed by hand.
  // times: operateTime(), or null for an IED without operate_times.
  function lookup(name, Is, calcType, freq, core) {
    const relay = byName(name);
    if (!relay) return null;
    const ct = ctSpecs(name, Is);
    const burden_va = ct && ct.burden_va != null ? ct.burden_va : null;
    if (!relay.operate_times) {
      return { relay, burden_va, tal_ms: relay.measurement_time_ms ?? DEFAULT_TAL_MS, tal_db: true, times: null };
    }
    const times = operateTime(relay, calcType, freq, core);
    return { relay, burden_va, tal_ms: times ? times.tal_ms : null, tal_db: times != null, times };
  }

  // get_ied_rating_specs(name, Isr, application) → { relay_name, ct_input,
  // thermal_duration_s, requirements }, or null for a relay not in the
  // database. requirements: the relay_requirements rows for this Isr and the
  // calc type's application (a row with no rated_current_a / application
  // applies to all).
  function iedRatingSpecs(name, Is, calcType) {
    const relay = byName(name);
    if (!relay) return null;
    const isr = Number(Is ?? 1);
    const app = APPLICATION[calcType] ?? null;
    return {
      relay_name: relay.name,
      ct_input: ctSpecs(name, isr),
      thermal_duration_s: relay.ied_thermal_duration_s ?? null,
      requirements: (relay.requirements || []).filter((r) =>
        (r.rated_current_a == null || Number(r.rated_current_a) === isr) &&
        (r.application == null || r.application === app)),
    };
  }

  // Core inputs with the picked model's values written in (manufacturer,
  // model, SR for the core's Isr, t_al for the calc type and the project's
  // rated frequency). Run on every change, so a new Isr brings the matching
  // burden. A custom relay, or a value the database does not have, is left as
  // typed; a database t_al not known yet (operate-time choices incomplete) is
  // removed. Returns the same object when nothing changes.
  function apply(core, calcType, freq) {
    const hit = core ? lookup(core.relay_model, core.Is, calcType, freq, core) : null;
    if (!hit) return core;
    const want = {
      relay_manufacturer: hit.relay.manufacturer,
      relay_type: hit.relay.model,
    };
    if (hit.tal_db && hit.tal_ms != null) want.relay_tal = hit.tal_ms;
    if (hit.burden_va != null) want.relay_burden = hit.burden_va;
    const drop = hit.tal_db && hit.tal_ms == null && 'relay_tal' in core;
    const changed = drop || Object.keys(want).some((k) => core[k] !== want[k]);
    if (!changed) return core;
    const out = { ...core, ...want };
    if (drop) delete out.relay_tal;
    return out;
  }

  return {
    RELAYS, DEFAULT_TAL_MS, CALC_DEFAULTS, APPLICATION, supports, manufacturers, list, byName,
    relayNameOf, relayOf, ctSpecs, iedRatingSpecs, operateFunctions, operateTime, lookup, apply, busbarParams, trafoDiffParams, vkaFactor,
  };
})();
