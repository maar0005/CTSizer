// ctsizer-export.jsx — "Export RTF" dialog.
//
// The user fills in the document fields (number, revision, client, who
// prepared / checked / approved it), picks the content and the bays, and
// downloads the report built by CTSReport.build (ctsizer-report.js). Company,
// address and logo come from Settings. The document fields are project data:
// the app keeps them in `report` and saves them with the project file.
(() => {
const { useState, useEffect } = React;

const btn = (primary, disabled) => ({
  padding: '7px 14px', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: 'var(--font-head)', fontSize: 12, fontWeight: 600,
  border: primary ? 'none' : '1px solid var(--border-2)',
  background: primary ? (disabled ? 'var(--surface-3)' : 'var(--accent)') : 'var(--surface-2)',
  color: primary ? (disabled ? 'var(--text-muted)' : '#fff') : 'var(--text-dim)',
});
const label = { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block' };
const field = { width: '100%', background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border-2)',
                borderRadius: 5, padding: '5px 8px', fontSize: 12, fontFamily: 'var(--font-body)', outline: 'none' };
const sectionTitle = { fontFamily: 'var(--font-head)', fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 };

// ── Charts for the report ─────────────────────────────────────────────────
// The same charts as the results panel's Charts tab, with the same inputs
// (chartFaultParams / chartArData, ctsizer-panels.jsx), drawn off-screen in
// the light theme at 2× and handed to CTSReport as PNG.
const LIGHT = {
  '--bg': '#eef2f8', '--surface': '#ffffff', '--surface-2': '#f5f8fc', '--surface-3': '#edf1f7',
  '--border': '#dce4ef', '--border-2': '#c8d4e3', '--text': '#0c1829', '--text-dim': '#445870',
  '--text-muted': '#8095aa', '--accent': '#0284c7', '--green': '#059669', '--red': '#dc2626',
  '--amber': '#d97706', '--font-mono': "'JetBrains Mono', Consolas, monospace",
};
const CHART_DPR = 2;

function pngOf(cv) {
  const url = cv.toDataURL('image/png');
  return { type: 'png', data: url.slice(url.indexOf(',') + 1), w: cv.width, h: cv.height };
}

// A CTSDraw canvas chart. The canvas is in the page (off-screen) so it has a
// size; data-dpr fixes its pixel ratio.
function canvasChart(draw, params, lang, w, h) {
  const cv = document.createElement('canvas');
  cv.dataset.dpr = String(CHART_DPR);
  cv.style.cssText = `position:fixed;left:-10000px;top:0;width:${w}px;height:${h}px`;
  document.body.appendChild(cv);
  try {
    draw(cv, params, 'light', lang);
    return cv.width ? pngOf(cv) : null;
  } finally { cv.remove(); }
}

// A React SVG chart: rendered off-screen, CSS variables replaced by the light
// theme's colours, then rasterised.
async function svgChart(element, w, h) {
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${w}px`;
  document.body.appendChild(host);
  const root = ReactDOM.createRoot(host);
  try {
    ReactDOM.flushSync(() => root.render(element));
    const svg = host.querySelector('svg');
    if (!svg) return null;
    const xml = new XMLSerializer().serializeToString(svg)
      .replace(/var\((--[a-z0-9-]+)\)/g, (m, v) => LIGHT[v] ?? '#000')
      .replace('width="100%"', `width="${w}" height="${h}"`);
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res; img.onerror = rej;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    });
    const cv = document.createElement('canvas');
    cv.width = w * CHART_DPR; cv.height = h * CHART_DPR;
    const g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(img, 0, 0, cv.width, cv.height);
    return pngOf(cv);
  } finally { root.unmount(); host.remove(); }
}

async function coreCharts(core, result, system, lang) {
  if (!result || core.kind === 'vt' || core.calc_type === 'vt') return [];
  const t = k => CTSReport.text(lang, k);
  const out = [];
  const tryAdd = async (make) => {
    try { const c = await make(); if (c?.img) out.push(c); }
    catch (e) { CTSActivity.log('error', `Report chart failed (${core.name}): ${e?.message || e}`); }
  };
  if (core.calc_type === 'overcurrent' && result.ALF_act)
    await tryAdd(async () => ({ title: t('chart_sat'),
      img: await svgChart(<SaturationChart result={result} lang={lang}/>, 500, 250) }));
  const faultParams = chartFaultParams(result, system, core);
  await tryAdd(() => ({
    title: t('chart_fault').replace('{tp}', system?.tp ?? 100),
    img: canvasChart(CTSDraw.drawFaultWaveform, faultParams, lang, 760, 360),
    warn: faultParams.ratio != null && faultParams.ratio < 1 ? t('chart_sat_warn') : null,
  }));
  const ar = chartArData(core.calc_type, core, result, system);
  if (ar) {
    const a = ar.arResult;
    await tryAdd(() => ({
      title: t('chart_ar'),
      img: canvasChart(CTSDraw.drawArWaveform, ar.canvasParams, lang, 760, 360),
      caption: `${a.is_ok ? '\u2713 PASS' : '\u2717 FAIL'}  EALF = ${a.EALF.toFixed(1)} V / EAL_AR = ${a.EAL_AR.toFixed(1)} V | ` +
        `Ktd = ${a.Ktd.toFixed(3)} | Kssc = ${a.Kssc.toFixed(2)}${a.ALFo != null ? ` | ALFo = ${a.ALFo.toFixed(1)}` : ''}` +
        (a.ode_is_ok == null ? `\n${t('chart_no_ode')}` : ''),
    }));
  }
  return out;
}

async function projectCharts(feeders, results, system, lang, bayIds) {
  const charts = {};
  for (const f of feeders) {
    if (!bayIds.includes(f.id)) continue;
    for (const d of f.devices) for (const c of d.cores) {
      const key = `${f.id}-${d.id}-${c.id}`;
      charts[key] = await coreCharts(c, results[key], system, lang);
    }
  }
  return charts;
}

function today() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function Field({ id, title, value, onChange, placeholder, type = 'text', wide }) {
  return (
    <div style={{ gridColumn: wide ? '1 / -1' : undefined }}>
      <label htmlFor={id} style={label}>{title}</label>
      <input id={id} type={type} value={value ?? ''} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} style={field} />
    </div>
  );
}

function Check({ checked, onChange, children, testid }) {
  return (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text-dim)', cursor: 'pointer' }}>
      <input type="checkbox" data-testid={testid} checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

// report = { title, doc_no, revision, rev_desc, client, prepared_by, checked_by,
//            approved_by, note, lang, steps, charts, nomenclature, methodology }
function ExportDialog({ lang, onClose, report, setReport, settings, system, feeders, results, projName, metrics, onOpenSettings }) {
  const L = k => CTSI18n.t(lang, k);
  const r = report || {};
  const set = (k, v) => setReport(x => ({ ...(x || {}), [k]: v }));
  const [date, setDate] = useState(today());
  const [bays, setBays] = useState(() => feeders.map(f => f.id));
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const repLang = r.lang || lang;
  const autoTitle = CTSReport.reportTitle(repLang, feeders);
  const preparedDefault = [settings.full_name, settings.initials && `(${settings.initials})`].filter(Boolean).join(' ');
  const selected = feeders.filter(f => bays.includes(f.id));
  const nCores = selected.reduce((n, f) => n + f.devices.reduce((m, d) => m + d.cores.length, 0), 0);
  const company = [settings.company_name, settings.department].filter(Boolean).join(' — ');
  const address = [settings.address, [settings.postal_code, settings.city].filter(Boolean).join(' '), settings.country]
    .filter(Boolean).join(', ');

  const doExport = async () => {
    if (!nCores) { setStatus({ kind: 'warn', text: L('ex_no_cores') }); return; }
    const withCharts = r.charts !== false;
    let charts = null;
    if (withCharts) {
      setBusy(true); setStatus({ kind: 'warn', text: L('ex_busy') });
      try { charts = await projectCharts(feeders, results, system, repLang, bays); }
      finally { setBusy(false); }
    }
    const { rtf, filename } = CTSReport.build({
      lang: repLang, projName, system, feeders, settings, results,
      fingerprint: CTSFingerprint.of({ system, feeders, projName, report }),
      meta: { title: r.title, doc_no: r.doc_no, revision: r.revision, rev_desc: r.rev_desc, date,
              client: r.client, prepared_by: r.prepared_by || preparedDefault,
              checked_by: r.checked_by, approved_by: r.approved_by, note: r.note },
      charts,
      options: { steps: r.steps !== false, charts: withCharts, nomenclature: r.nomenclature !== false, methodology: r.methodology !== false,
                 feederIds: bays.length === feeders.length ? null : bays },
      metrics: (type, res) => metrics(type, res, repLang),
    });
    const blob = new Blob([rtf], { type: 'application/rtf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    CTSActivity.log('file', `Exported RTF report "${filename}" (${nCores} cores, ${repLang})`);
    setStatus({ kind: 'ok', text: L('ex_done').replace('{f}', filename) });
  };

  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ex-title" data-testid="export-dialog"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)',
               display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 720, maxHeight: '100%', display: 'flex', flexDirection: 'column',
                 background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10,
                 boxShadow: '0 8px 32px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 id="ex-title" style={{ fontFamily: 'var(--font-head)', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
            {L('ex_title')}
          </h2>
          <button aria-label={L('ex_cancel')} onClick={onClose}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)',
                     fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>{L('ex_intro')}</p>

          {/* Company (from Settings) */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', borderRadius: 7,
                        background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            {settings.logo?.data && (
              <img src={`data:image/${settings.logo.type};base64,${settings.logo.data}`} alt=""
                style={{ maxWidth: 90, maxHeight: 40, objectFit: 'contain' }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={label}>{L('ex_company')}</div>
              <div style={{ fontSize: 13, color: company ? 'var(--text)' : 'var(--text-muted)', fontWeight: 600 }}>
                {company || L('ex_company_none')}
              </div>
              {address && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{address}</div>}
            </div>
            <button onClick={onOpenSettings}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12,
                       fontFamily: 'var(--font-body)', textAlign: 'right' }}>
              {L('ex_edit_settings')}
            </button>
          </div>

          {/* Document */}
          <div>
            <div style={sectionTitle}>{L('ex_section_doc')}</div>
            <div style={grid}>
              <Field id="ex-doc-title" title={L('ex_doc_title')} value={r.title} onChange={v => set('title', v)}
                placeholder={L('ex_doc_title_ph').replace('{t}', autoTitle)} wide />
              <Field id="ex-doc-no" title={L('ex_doc_no')} value={r.doc_no} onChange={v => set('doc_no', v)} />
              <Field id="ex-rev" title={L('ex_revision')} value={r.revision} onChange={v => set('revision', v)} placeholder="A" />
              <Field id="ex-date" title={L('ex_date')} value={date} onChange={setDate} type="date" />
              <Field id="ex-client" title={L('ex_client')} value={r.client} onChange={v => set('client', v)} />
              <Field id="ex-rev-desc" title={L('ex_rev_desc')} value={r.rev_desc} onChange={v => set('rev_desc', v)}
                placeholder={L('ex_rev_desc_ph')} />
              <div>
                <label style={label}>{L('ex_lang')}</label>
                <select value={repLang} onChange={e => set('lang', e.target.value)} style={field} data-testid="ex-lang">
                  <option value="en">English</option>
                  <option value="da">Dansk</option>
                </select>
              </div>
              <Field id="ex-note" title={L('ex_note')} value={r.note} onChange={v => set('note', v)} wide />
            </div>
          </div>

          {/* Responsible */}
          <div>
            <div style={sectionTitle}>{L('ex_section_people')}</div>
            <div style={grid}>
              <Field id="ex-prepared" title={L('ex_prepared_by')} value={r.prepared_by}
                onChange={v => set('prepared_by', v)} placeholder={preparedDefault} />
              <Field id="ex-checked" title={L('ex_checked_by')} value={r.checked_by} onChange={v => set('checked_by', v)} />
              <Field id="ex-approved" title={L('ex_approved_by')} value={r.approved_by} onChange={v => set('approved_by', v)} />
            </div>
          </div>

          {/* Content */}
          <div>
            <div style={sectionTitle}>{L('ex_section_content')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              <Check testid="ex-steps" checked={r.steps !== false} onChange={v => set('steps', v)}>{L('ex_opt_steps')}</Check>
              <Check testid="ex-charts" checked={r.charts !== false} onChange={v => set('charts', v)}>{L('ex_opt_charts')}</Check>
              <Check checked={r.nomenclature !== false} onChange={v => set('nomenclature', v)}>{L('ex_opt_nomenclature')}</Check>
              <Check checked={r.methodology !== false} onChange={v => set('methodology', v)}>{L('ex_opt_methodology')}</Check>
            </div>
            <div style={label}>{L('ex_scope')}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[{ id: '*', name: L('ex_scope_all') }, ...feeders].map(f => {
                const on = f.id === '*' ? bays.length === feeders.length : bays.includes(f.id);
                const toggle = () => setBays(b => f.id === '*'
                  ? (on ? [] : feeders.map(x => x.id))
                  : (on ? b.filter(x => x !== f.id) : feeders.map(x => x.id).filter(x => x === f.id || b.includes(x))));
                return (
                  <button key={f.id} onClick={toggle} aria-pressed={on}
                    style={{ padding: '4px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12,
                             fontFamily: 'var(--font-body)', fontWeight: on ? 600 : 400,
                             background: on ? 'var(--accent-glow)' : 'var(--surface-2)',
                             color: on ? 'var(--accent)' : 'var(--text-dim)',
                             border: `1px solid ${on ? 'var(--accent)' : 'var(--border-2)'}` }}>
                    {f.name}
                  </button>
                );
              })}
            </div>
          </div>

          {status && (
            <div role="status" data-testid="export-status"
              style={{ fontSize: 12, padding: '8px 10px', borderRadius: 6,
                       background: status.kind === 'ok' ? 'var(--green-bg)' : 'var(--surface-3)',
                       color: status.kind === 'ok' ? 'var(--green)' : 'var(--amber)',
                       border: `1px solid ${status.kind === 'ok' ? 'var(--green)' : 'var(--amber)'}` }}>
              {status.text}
            </div>
          )}
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{L('ex_saved_hint')}</p>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px', display: 'flex', gap: 8,
                      flexWrap: 'wrap', justifyContent: 'flex-end', background: 'var(--surface-2)' }}>
          <button style={btn(false, false)} onClick={onClose}>{L('ex_cancel')}</button>
          <button data-testid="export-go" style={btn(true, !nCores || busy)} disabled={!nCores || busy} onClick={doExport}
            title={nCores ? '' : L('ex_no_cores')}>
            {L('ex_export')}
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ExportDialog });
})();
