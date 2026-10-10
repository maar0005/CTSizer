// ctsizer-activity.js — activity log and feedback report for the "Give feedback" button.
//
// Loaded before every other script so it also records script and calculation
// errors. The log is a ring buffer kept in sessionStorage: it survives a reload
// in the same tab, but is never sent anywhere unless the user opens the
// feedback dialog and chooses to send it.
//
// The report never contains the user's personal settings (name, company,
// address). Project data (station + feeders) is included only when the user
// leaves "Include project data" ticked.
'use strict';

const CTSActivity = (() => {
  const REPO_URL = 'https://github.com/maar0005/CTSizer';
  const STORE_KEY = 'ctsizer_activity';
  const MAX_ENTRIES = 300;
  const COALESCE_MS = 4000;      // typing "2","20","200" in one field → one entry
  // GitHub answers 414 above roughly 8 kB of URL; keep a margin.
  const MAX_ISSUE_URL = 7500;
  // Relay that creates the issue server-side (feedback.php). GitHub caps an
  // issue body at 65 536 characters; the relay adds a short footer.
  const FEEDBACK_ENDPOINT = 'feedback.php';
  const MAX_SEND_BODY = 60000;

  const t0 = Date.now();
  let entries = [];
  try { entries = JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]'); } catch { entries = []; }
  if (!Array.isArray(entries)) entries = [];

  function persist() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(entries)); } catch { /* storage full or blocked */ }
  }

  function short(v) {
    if (v === undefined) return undefined;
    let s;
    try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch { s = String(v); }
    return s != null && s.length > 200 ? s.slice(0, 197) + '...' : s;
  }

  // log(type, msg, { key, from, to }) — `key` lets repeated edits of the same
  // field within COALESCE_MS update the previous entry instead of adding one.
  function log(type, msg, extra) {
    const now = Date.now();
    const e = { ts: now, type, msg: short(msg) };
    if (extra) {
      if (extra.key !== undefined) e.key = extra.key;
      if ('from' in extra) e.from = short(extra.from);
      if ('to' in extra) e.to = short(extra.to);
    }
    const last = entries[entries.length - 1];
    if (e.key && last && last.key === e.key && now - last.ts < COALESCE_MS) {
      last.ts = now; last.to = e.to; last.msg = e.msg;
    } else {
      entries.push(e);
      if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
    }
    persist();
  }

  function getEntries() { return entries.slice(); }
  function clear() { entries = []; persist(); }

  // ── Error capture ──────────────────────────────────────────────────────
  window.addEventListener('error', ev => {
    const where = ev.filename ? ` (${String(ev.filename).split('/').pop()}:${ev.lineno})` : '';
    log('error', `${ev.message || 'Script error'}${where}`);
  });
  window.addEventListener('unhandledrejection', ev => {
    log('error', `Unhandled promise rejection: ${ev.reason?.message || ev.reason}`);
  });
  const origConsoleError = console.error.bind(console);
  console.error = (...args) => {
    try {
      log('error', args.map(a => a instanceof Error ? `${a.name}: ${a.message}` : short(a)).join(' '));
    } catch { /* never let logging break the app */ }
    origConsoleError(...args);
  };

  // ── State diffs (called by the app on every state change) ──────────────
  function diffInputs(prefix, keyBase, a, b) {
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    keys.forEach(k => {
      const x = a?.[k], y = b?.[k];
      if (JSON.stringify(x) !== JSON.stringify(y))
        log('input', `${prefix} · ${k}`, { key: `${keyBase}.${k}`, from: x, to: y });
    });
  }

  function byId(list) { const m = new Map(); (list || []).forEach(o => m.set(o.id, o)); return m; }

  function diffSystem(prev, next) {
    if (prev === next) return;
    diffInputs('Station', 'system', prev, next);
  }

  function diffFeeders(prev, next) {
    if (prev === next || !prev || !next) return;
    const pf = byId(prev);
    next.forEach(f => {
      const of = pf.get(f.id);
      if (!of) { log('structure', `Added bay "${f.name}"`); return; }
      if (of.name !== f.name) log('structure', `Renamed bay "${of.name}" → "${f.name}"`);
      if (of.feeder_type !== f.feeder_type)
        log('input', `${f.name} · bay type`, { key: `${f.id}.type`, from: of.feeder_type, to: f.feeder_type });
      const pd = byId(of.devices);
      (f.devices || []).forEach(d => {
        const od = pd.get(d.id);
        if (!od) { log('structure', `Added device "${d.name}" (${d.device_type}) to "${f.name}"`); return; }
        if (od.name !== d.name) log('structure', `Renamed device "${od.name}" → "${d.name}"`);
        const pc = byId(od.cores);
        (d.cores || []).forEach(c => {
          const oc = pc.get(c.id);
          const path = `${f.name} › ${d.name} › ${c.name}`;
          if (!oc) { log('structure', `Added core "${c.name}" (${c.calc_type}) to "${d.name}"`); return; }
          if (oc.name !== c.name) log('structure', `Renamed core "${oc.name}" → "${c.name}"`);
          if (oc.calc_type !== c.calc_type) {
            log('input', `${path} · calc_type`, { key: `${c.id}.calc_type`, from: oc.calc_type, to: c.calc_type });
            return;   // the inputs were reset to the new type's defaults
          }
          if (oc.inputs !== c.inputs) diffInputs(path, c.id, oc.inputs, c.inputs);
        });
        const nc = byId(d.cores);
        (od.cores || []).forEach(c => { if (!nc.has(c.id)) log('structure', `Removed core "${c.name}" from "${d.name}"`); });
      });
      const nd = byId(f.devices);
      (of.devices || []).forEach(d => { if (!nd.has(d.id)) log('structure', `Removed device "${d.name}" from "${f.name}"`); });
    });
    const nf = byId(next);
    prev.forEach(f => { if (!nf.has(f.id)) log('structure', `Removed bay "${f.name}"`); });
  }

  // ── Report ─────────────────────────────────────────────────────────────
  function fmtTime(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  function entryLine(e) {
    let s = `${fmtTime(e.ts)} [${e.type}] ${e.msg}`;
    if ('from' in e || 'to' in e) s += `: ${e.from ?? '—'} → ${e.to ?? '—'}`;
    return s;
  }

  function environment(ctx) {
    const terms = window.CTSTerms?.getAcceptance?.();
    return {
      time: new Date().toISOString(),
      url: location.href.split('#')[0],
      user_agent: navigator.userAgent,
      viewport: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio || 1}x`,
      language: ctx.lang,
      theme: ctx.theme,
      terms_version: terms?.version ?? window.CTSTerms?.TERMS_VERSION ?? null,
      session_minutes: Math.round((Date.now() - t0) / 60000),
    };
  }

  // ctx: { description, category, email, includeProject, includeActivity, lang, theme,
  //        projName, system, feeders, selection, summary }
  // Returns { title, markdown, publicMarkdown, json, issueUrl, truncated, sendBody, sendTruncated }.
  function buildReport(ctx) {
    const env = environment(ctx);
    const log_ = ctx.includeActivity ? getEntries() : [];
    const errors = log_.filter(e => e.type === 'error');
    const project = ctx.includeProject
      ? { version: '2.1', projName: ctx.projName, system: ctx.system, feeders: ctx.feeders } : null;

    const email = (ctx.email || '').trim();
    const json = {
      category: ctx.category, description: ctx.description, contact_email: email || null, environment: env,
      selection: ctx.selection || null, results: ctx.summary || [],
      activity: log_, project,
    };

    const firstLine = (ctx.description || '').trim().split('\n')[0];
    const title = `[${ctx.category}] ${firstLine.length > 70 ? firstLine.slice(0, 67) + '...' : firstLine || 'Feedback'}`;

    const sections = (opts) => {
      const L = [];
      L.push('### Description', '', (ctx.description || '').trim() || '_(none)_', '');
      if (email && opts.contact) L.push('### Contact', '', `${email} — wants to hear about updates.`, '');
      L.push('### Environment', '');
      L.push(`- **Time:** ${env.time}`, `- **URL:** ${env.url}`, `- **Browser:** ${env.user_agent}`,
             `- **Viewport:** ${env.viewport}`, `- **Language / theme:** ${env.language} / ${env.theme}`,
             `- **Terms version:** ${env.terms_version ?? '—'}`, '');
      if (ctx.selection) L.push('### Selected', '', ctx.selection, '');
      if ((ctx.summary || []).length) {
        L.push('### Results', '', '| Bay | Device | Core | Type | Status | Key metric |', '|---|---|---|---|---|---|');
        const cell = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
        ctx.summary.forEach(r => L.push(`| ${[r.feeder, r.device, r.core, r.calc_type, r.status, r.metric].map(cell).join(' | ')} |`));
        L.push('');
      }
      if (ctx.includeActivity) {
        if (errors.length) {
          L.push(`### Errors (${errors.length})`, '', '```');
          errors.slice(-opts.maxErrors).forEach(e => L.push(entryLine(e)));
          L.push('```', '');
        }
        const shown = log_.slice(-opts.maxActivity);
        L.push(`<details><summary>Activity log (last ${shown.length} of ${log_.length})</summary>`, '', '```');
        shown.forEach(e => L.push(entryLine(e)));
        L.push('```', '</details>', '');
      }
      if (project) {
        if (opts.project) {
          L.push('<details><summary>Project data (.ctvt)</summary>', '', '```json', JSON.stringify(project), '```', '</details>', '');
        } else {
          L.push('### Project data', '', opts.tooLarge, '');
        }
      }
      return L.join('\n');
    };

    // The email goes only to the relay, whose issues are private; the GitHub
    // issue form is in the public repository, so its text leaves it out.
    const full = sections({ project: true, maxActivity: Infinity, maxErrors: Infinity, contact: true });
    const fullPublic = sections({ project: true, maxActivity: Infinity, maxErrors: Infinity });
    const urlFor = body => `${REPO_URL}/issues/new?labels=feedback&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;

    // Shrink the body until fits(body): first drop the project data, then the
    // older activity, and as a last resort cut the text.
    const attempts = [
      { project: true, maxActivity: Infinity, maxErrors: Infinity },
      { project: false, maxActivity: 60, maxErrors: 20 },
      { project: false, maxActivity: 30, maxErrors: 10 },
      { project: false, maxActivity: 10, maxErrors: 5 },
      { project: false, maxActivity: 0, maxErrors: 3 },
    ];
    const shrink = (fits, tooLarge, cut, cutNote, contact = false) => {
      for (const [i, a] of attempts.entries()) {
        const b = sections({ ...a, tooLarge, contact });
        if (fits(b)) return { body: b, truncated: i > 0 };
      }
      return { body: sections({ ...attempts.at(-1), tooLarge, contact }).slice(0, cut) + cutNote, truncated: true };
    };

    const link = shrink(b => urlFor(b).length <= MAX_ISSUE_URL,
      '_Too large for the issue link. The full report has been copied to the clipboard — paste it here, ' +
      'or attach the downloaded report file._',
      2500, '\n\n_…truncated. The full report has been copied to the clipboard — paste it here._');
    const send = shrink(b => b.length <= MAX_SEND_BODY,
      '_Too large to send — not included._',
      MAX_SEND_BODY - 100, '\n\n_…truncated._', true);

    return { title, markdown: full, publicMarkdown: fullPublic, json, issueUrl: urlFor(link.body), truncated: link.truncated,
             sendBody: send.body, sendTruncated: send.truncated };
  }

  return { REPO_URL, FEEDBACK_ENDPOINT, log, getEntries, clear, diffSystem, diffFeeders, buildReport, entryLine };
})();

window.CTSActivity = CTSActivity;
CTSActivity.log('session', 'Page loaded');
