'use strict';
/**
 * relays.js — CTRelayDB: IED lookup for the Relay Information card.
 *
 * The data is ctvt_dim's relay database (data/relays.db), exported to
 * calc/relay_db.js by tools/gen_relay_db.py. The lookups follow
 * data/relay_database.py and ctvt_dim's relay picker (ui/ct_widget/handlers.py):
 * - the model list is filtered by the core's application
 *   (get_relays_by_application, supported_applications);
 * - picking a model fills the relay burden from the CT input with the core's
 *   rated secondary current (get_ct_specs(name, Isr).burden_va) and the relay
 *   time t_al from measurement_time_ms (get_relay_measurement_time);
 * - a custom relay (no model picked) is entered by hand; its t_al defaults to
 *   25 ms (DEFAULT_TAL_MS, the same default).
 *
 * The core keys: relay_model = the database name (e.g. "SIPROTEC 5 7SA87"),
 * relay_manufacturer / relay_type = its manufacturer and model, relay_burden =
 * SR (VA), relay_tal = t_al (ms). ctvt_dim's GUI stores the pick as
 * relay_model too; it never sets relay_name, so the relay-specific calc
 * parameters keyed by relay_name stay off, as in ctvt_dim.
 *
 * iedRatingSpecs feeds the IED input rating check (CTIedRating,
 * calc/ied_rating.js), which reads relay_model as ctvt_dim's
 * calculations/ct_ied_rating.py does.
 */

const CTRelayDB = (() => {
  const RELAYS = typeof CT_RELAY_DB_DATA !== 'undefined' ? CT_RELAY_DB_DATA : [];
  const DEFAULT_TAL_MS = 25;

  // CTSizer calc_type → ctvt_dim supported_applications entry
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

  // get_ct_specs(name, Isr) → the CT input spec, or null
  function ctSpecs(name, Is) {
    const r = byName(name);
    return (r && r.ct_inputs[String(Number(Is ?? 1))]) || null;
  }

  // The values a picked model sets: { relay, burden_va (null: not in the
  // database for this Isr), tal_ms }, or null for a custom relay.
  function lookup(name, Is) {
    const relay = byName(name);
    if (!relay) return null;
    const ct = ctSpecs(name, Is);
    return {
      relay,
      burden_va: ct && ct.burden_va != null ? ct.burden_va : null,
      tal_ms: relay.measurement_time_ms ?? DEFAULT_TAL_MS,
    };
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
  // model, SR for the core's Isr, t_al). Run on every change, so a new Isr
  // brings the matching burden. A custom relay, or a value the database does
  // not have, is left as typed. Returns the same object when nothing changes.
  function apply(core) {
    const hit = core ? lookup(core.relay_model, core.Is) : null;
    if (!hit) return core;
    const want = {
      relay_manufacturer: hit.relay.manufacturer,
      relay_type: hit.relay.model,
      relay_tal: hit.tal_ms,
    };
    if (hit.burden_va != null) want.relay_burden = hit.burden_va;
    const changed = Object.keys(want).some((k) => core[k] !== want[k]);
    return changed ? { ...core, ...want } : core;
  }

  return { RELAYS, DEFAULT_TAL_MS, APPLICATION, supports, manufacturers, list, byName, ctSpecs, iedRatingSpecs, lookup, apply };
})();
