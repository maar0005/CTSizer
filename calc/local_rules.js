'use strict';
/**
 * local_rules.js — CTLocalRules: national metering rules a project can be
 * checked against, on top of the IEC 61869 calculation.
 *
 * The user picks a rule set in Station Data (system.local_rules); blank means
 * none, and nothing changes. A rule set checks the metering CT cores and the
 * VT cores against its own requirements, each with the clause it comes from.
 * The local check never changes the IEC verdict of a core: it is shown next
 * to it (results panel, RTF report).
 *
 * A rule set (one file per country under calc/local_rules/) registers itself:
 *   CTLocalRules.register({
 *     id, country, label_en, label_da, source_en, source_da, url,
 *     appliesTo: ['metering', 'vt'],      // the core types it checks
 *     check(type, inputs, result, system) → [item, …],
 *     manual(type, system)                 → [{ ref, ref_da, en, da }, …],
 *     remarks(type, inputs, result, system, warnings) → warnings   (optional)
 *   })
 * An item is { id, ref, ref_da, status, en, da } (the clause in English and
 * as the source writes it; refText picks one): status 'ok' (requirement met),
 * 'fail' (a requirement — "skal" — not met), 'advice' (a recommendation —
 * "bør", "anbefales" — not followed; never fails) or 'missing' (an input the
 * check needs is not entered). `manual` lists what the rule set requires that
 * CTSizer cannot check from the inputs (sealing, test protocols, …).
 *
 * remarks(id, core, result, system) → the core's remarks (result.warnings)
 * as the panel and the report show them. With no rule set picked (the
 * default) they are the calculation's own; a rule set may replace a remark
 * whose advice its rules do not allow (e.g. "add burden" where extra burden
 * is not permitted). The calculation result itself is never changed.
 *
 * evaluate(id, core, result, system) → null when no rule set is picked, the
 * set does not cover the core type or the core has no result; else
 * { set, items, manual, verdict } with verdict 'fail' | 'incomplete' | 'ok'.
 */

const CTLocalRules = (() => {
  const SETS = [];

  function register(set) {
    if (!set || !set.id || SETS.some((s) => s.id === set.id)) return;
    SETS.push(set);
  }

  const list = () => SETS.slice();
  const ids = () => SETS.map((s) => s.id);
  const byId = (id) => SETS.find((s) => s.id === id) || null;
  const label = (set, lang) => (set ? (lang === 'da' ? set.label_da : set.label_en) : '');
  const refText = (x, lang) => (lang === 'da' && x.ref_da ? x.ref_da : x.ref);

  // The core type a rule set sees: a VT core is 'vt' whatever its calc_type
  const coreType = (core) => (core && core.kind === 'vt' ? 'vt' : core && core.calc_type);

  function covers(set, core) {
    return !!(set && set.appliesTo.includes(coreType(core)));
  }

  // 'fail' if any requirement is not met, 'incomplete' if one could not be
  // checked, else 'ok'. Advice never fails.
  function verdict(items) {
    if (items.some((i) => i.status === 'fail')) return 'fail';
    if (items.some((i) => i.status === 'missing')) return 'incomplete';
    return 'ok';
  }

  function evaluate(id, core, result, system) {
    const set = byId(id);
    if (!covers(set, core) || !result) return null;
    const type = coreType(core);
    const sys = system || {};
    const items = set.check(type, (core && core.inputs) || {}, result, sys);
    return { set, items, manual: set.manual(type, sys), verdict: verdict(items) };
  }

  function remarks(id, core, result, system) {
    const warnings = Array.isArray(result && result.warnings) ? result.warnings : [];
    const set = byId(id);
    if (!covers(set, core) || typeof set.remarks !== 'function') return warnings;
    return set.remarks(coreType(core), (core && core.inputs) || {}, result, system || {}, warnings);
  }

  return { register, list, ids, byId, label, refText, covers, coreType, verdict, evaluate, remarks };
})();
