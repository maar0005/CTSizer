// ctsizer-projects.jsx — Project list and project store.
//
// Shown after the Terms and Conditions are accepted: every project kept in
// this browser, with new / open / rename / duplicate / download / delete and
// import of a .ctvt file.
//
// Storage: all projects live in localStorage `ctsizer_projects` as
//   [{ id, name, createdAt, updatedAt, system, feeders, report }].
// The open project is also the working copy in the keys the app has always
// used (ctsizer_system, ctsizer_feeders, ctsizer_projname, ctsizer_report);
// `ctsizer_active_project` names it. The working copy is the newest state of
// that project, so it is copied back into the list (syncActive) before the
// list is shown and before another project is opened. A browser that only has
// the older single-project keys gets them migrated into one project.
(() => {
const { useState, useEffect, useRef } = React;

const STORE  = 'ctsizer_projects';
const ACTIVE = 'ctsizer_active_project';
const WORK   = { system: 'ctsizer_system', feeders: 'ctsizer_feeders', projName: 'ctsizer_projname', report: 'ctsizer_report' };

function readJSON(key, def) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? def; } catch { return def; }
}
function writeJSON(key, val) {
  try {
    if (val === null || val === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch { return false; }
}

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// ── Store ─────────────────────────────────────────────────────────────────
function readAll() {
  const a = readJSON(STORE, null);
  return Array.isArray(a) ? a : null;
}
function writeAll(list) { return writeJSON(STORE, list); }

function readWorking() {
  return {
    system:   readJSON(WORK.system, null),
    feeders:  readJSON(WORK.feeders, null),
    projName: readJSON(WORK.projName, null),
    report:   readJSON(WORK.report, null),
  };
}
function writeWorking(p) {
  writeJSON(WORK.system, p.system ?? null);
  writeJSON(WORK.feeders, Array.isArray(p.feeders) ? p.feeders : []);
  writeJSON(WORK.projName, p.name || 'Untitled Project');
  writeJSON(WORK.report, p.report || {});
}

// Copy the working copy back into its project; migrate the single-project keys.
function syncActive() {
  let list = readAll();
  const w = readWorking();
  if (!list) {
    list = [];
    const hasData = (Array.isArray(w.feeders) && w.feeders.length > 0) || w.system;
    if (hasData) {
      const now = new Date().toISOString();
      const p = { id: newId(), name: w.projName || 'Untitled Project', createdAt: now, updatedAt: now,
                  system: w.system, feeders: Array.isArray(w.feeders) ? w.feeders : [], report: w.report || {} };
      list.push(p);
      writeJSON(ACTIVE, p.id);
    }
    writeAll(list);
    return list;
  }
  const id = readJSON(ACTIVE, null);
  const i = list.findIndex(p => p.id === id);
  if (i < 0) return list;
  const cur = list[i];
  const next = { ...cur,
    system: w.system ?? cur.system,
    feeders: Array.isArray(w.feeders) ? w.feeders : cur.feeders,
    name: w.projName ?? cur.name,
    report: w.report ?? cur.report };
  const changed = ['system', 'feeders', 'name', 'report'].some(k => JSON.stringify(next[k]) !== JSON.stringify(cur[k]));
  if (changed) {
    list = list.map((p, j) => j === i ? { ...next, updatedAt: new Date().toISOString() } : p);
    writeAll(list);
  }
  return list;
}

// Make a project the working copy.
function openProject(id) {
  const list = syncActive();
  const p = list.find(q => q.id === id);
  if (!p) return false;
  writeWorking(p);
  writeJSON(ACTIVE, id);
  return true;
}

// New project: no bays, default station data (the app fills in the defaults).
function createProject(name, data) {
  const list = syncActive();
  const now = new Date().toISOString();
  const p = { id: newId(), name: (name || '').trim() || 'Untitled Project', createdAt: now, updatedAt: now,
              system: data?.system ?? null, feeders: Array.isArray(data?.feeders) ? data.feeders : [],
              report: data?.report || {} };
  if (!writeAll([p, ...list])) return null;
  writeWorking(p);
  writeJSON(ACTIVE, p.id);
  return p;
}

// Project from a .ctvt file. Settings in the file replace the user's, as opening a file always has.
function importProject(data, fileName) {
  if (!data || (typeof data !== 'object')) return null;
  if (data.settings) writeJSON('ctsizer_settings', data.settings);
  const name = data.projName || (fileName || '').replace(/\.(ctvt|json)$/i, '') || 'Imported Project';
  return createProject(name, data);
}

function renameProject(id, name) {
  const list = syncActive();
  writeAll(list.map(p => p.id === id ? { ...p, name, updatedAt: new Date().toISOString() } : p));
  if (readJSON(ACTIVE, null) === id) writeJSON(WORK.projName, name);
}

function duplicateProject(id, suffix) {
  const list = syncActive();
  const p = list.find(q => q.id === id);
  if (!p) return;
  const now = new Date().toISOString();
  const copy = { ...JSON.parse(JSON.stringify(p)), id: newId(), name: `${p.name} ${suffix}`, createdAt: now, updatedAt: now };
  writeAll([copy, ...list]);
}

function deleteProject(id) {
  const list = syncActive();
  writeAll(list.filter(p => p.id !== id));
  if (readJSON(ACTIVE, null) === id) {
    writeJSON(ACTIVE, null);
    Object.values(WORK).forEach(k => writeJSON(k, null));
  }
}

// Same file format as the app's Save (ctsizer-app.jsx doSave).
function downloadProject(p) {
  const settings = readJSON('ctsizer_settings', {});
  const blob = new Blob([JSON.stringify({ version: '2.1', system: p.system, feeders: p.feeders || [], settings,
                                          projName: p.name, report: p.report || {} }, null, 2)],
                        { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${p.system?.station_abbr || p.name || 'project'}.ctvt`;
  a.click(); URL.revokeObjectURL(a.href);
}

// ── UI ────────────────────────────────────────────────────────────────────
const btnSt = (primary, disabled) => ({
  padding: '7px 14px', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: 'var(--font-head)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
  border: primary ? 'none' : '1px solid var(--border-2)',
  background: primary ? (disabled ? 'var(--surface-3)' : 'var(--accent)') : 'var(--surface-2)',
  color: primary ? (disabled ? 'var(--text-muted)' : '#fff') : 'var(--text-dim)',
});
const smallBtn = { padding: '4px 9px', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)',
                   border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text-dim)' };
const inputSt = { background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: 'var(--text)',
                  borderRadius: 6, padding: '7px 10px', fontFamily: 'var(--font-body)', fontSize: 13, minWidth: 0 };

function fmtDate(iso, lang) {
  try { return new Date(iso).toLocaleString(lang === 'da' ? 'da-DK' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return iso; }
}

function ProjectCard({ lang, p, onOpen, onChanged }) {
  const T = k => CTSI18n.t(lang, k);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(p.name);
  const [confirmDel, setConfirmDel] = useState(false);
  const feeders = Array.isArray(p.feeders) ? p.feeders : [];
  const nDev  = feeders.reduce((n, f) => n + (f.devices?.length || 0), 0);
  const nCore = feeders.reduce((n, f) => n + (f.devices || []).reduce((m, d) => m + (d.cores?.length || 0), 0), 0);
  const station = [p.system?.station_name, p.system?.station_abbr && `(${p.system.station_abbr})`].filter(Boolean).join(' ');
  const saveName = () => { const v = name.trim(); if (v && v !== p.name) { renameProject(p.id, v); onChanged(); } setRenaming(false); };

  return (
    <div data-project-id={p.id}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16,
               display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        {renaming ? (
          <input autoFocus value={name} onChange={e => setName(e.target.value)} onBlur={saveName}
            onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setName(p.name); setRenaming(false); } }}
            aria-label={T('proj_rename')} style={{ ...inputSt, width: '100%', fontFamily: 'var(--font-head)', fontWeight: 600 }}/>
        ) : (
          <div style={{ fontFamily: 'var(--font-head)', fontSize: 16, fontWeight: 700, color: 'var(--text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>{p.name}</div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2, minHeight: 18 }}>
          {station || <span style={{ color: 'var(--text-muted)' }}>{T('proj_no_station')}</span>}
          {station && p.system?.voltage ? <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}> · {p.system.voltage} kV</span> : null}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
        <span>{feeders.length} {T('proj_bays')}</span>
        <span>{nDev} {T('proj_devices')}</span>
        <span>{nCore} {T('proj_cores')}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
        {T('proj_modified')} {fmtDate(p.updatedAt, lang)}
      </div>
      {confirmDel ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--red)', flex: 1 }}>{T('proj_delete_confirm')}</span>
          <button style={{ ...smallBtn, borderColor: 'var(--red)', background: 'var(--red-bg)', color: 'var(--red)' }}
            onClick={() => { deleteProject(p.id); CTSActivity.log('file', `Deleted project "${p.name}"`); onChanged(); }}>
            {T('proj_delete_yes')}
          </button>
          <button style={smallBtn} onClick={() => setConfirmDel(false)}>{T('proj_cancel')}</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={btnSt(true, false)} onClick={() => onOpen(p.id)}>{T('proj_open')}</button>
          <button style={smallBtn} onClick={() => setRenaming(true)}>{T('proj_rename')}</button>
          <button style={smallBtn} onClick={() => { duplicateProject(p.id, T('proj_copy_suffix')); onChanged(); }}>{T('proj_duplicate')}</button>
          <button style={smallBtn} onClick={() => downloadProject(p)}>{T('proj_download')}</button>
          <button style={{ ...smallBtn, color: 'var(--red)' }} onClick={() => setConfirmDel(true)}>{T('proj_delete')}</button>
        </div>
      )}
    </div>
  );
}

function ProjectList({ lang, setLang, onOpen }) {
  const T = k => CTSI18n.t(lang, k);
  const [list, setList] = useState(() => syncActive());
  const [newName, setNewName] = useState('');
  const [error, setError] = useState(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const fileRef = useRef(null);
  const refresh = () => setList(readAll() || []);
  const sorted = [...list].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  const create = () => {
    const p = createProject(newName);
    if (!p) { setError(T('proj_storage_full')); return; }
    CTSActivity.log('file', `Created project "${p.name}"`);
    onOpen(p.id, true);
  };
  const doImport = file => {
    const r = new FileReader();
    r.onload = e => {
      let data;
      try { data = JSON.parse(e.target.result); } catch { setError(T('proj_import_bad')); return; }
      const p = importProject(data, file.name);
      if (!p) { setError(T('proj_import_bad')); return; }
      CTSActivity.log('file', `Imported project file "${file.name}" (version ${data.version ?? '—'}, ${data.feeders?.length ?? 0} bays)`);
      onOpen(p.id, true);
    };
    r.readAsText(file);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: 'var(--bg)' }}>
      <header style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10, height: 54 }}>
          <img src="logo/icon.svg" alt="" width="26" height="26"/>
          <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 16, color: 'var(--accent)', letterSpacing: '-0.3px' }}>
            CT<span style={{ color: 'var(--text-dim)' }}>Sizer</span>
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
            {[['en', 'EN'], ['da', 'DA']].map(([l, label]) => (
              <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l}
                style={{ padding: '4px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 11,
                         fontFamily: 'var(--font-mono)', fontWeight: 600,
                         background: lang === l ? 'var(--accent-glow)' : 'var(--surface-2)',
                         color: lang === l ? 'var(--accent)' : 'var(--text-muted)',
                         border: `1px solid ${lang === l ? 'var(--accent)' : 'var(--border-2)'}` }}>{label}</button>
            ))}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 16px 40px' }}>
        <h1 style={{ fontFamily: 'var(--font-head)', fontSize: 24, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
          {T('proj_title')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 20 }}>{T('proj_intro')}</p>

        {/* New / import */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16,
                      display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={T('proj_name_ph')}
            aria-label={T('proj_name_ph')} onKeyDown={e => e.key === 'Enter' && create()}
            style={{ ...inputSt, flex: '1 1 220px' }}/>
          <button style={btnSt(true, false)} onClick={create}>{T('proj_create')}</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{T('proj_or')}</span>
          <button style={btnSt(false, false)} onClick={() => fileRef.current?.click()}>{T('proj_import')}</button>
          <input ref={fileRef} type="file" accept=".ctvt,.json" style={{ display: 'none' }}
            onChange={e => { if (e.target.files[0]) doImport(e.target.files[0]); e.target.value = ''; }}/>
        </div>
        {error && (
          <div role="alert" style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-bg)', border: '1px solid var(--red)',
                                     borderRadius: 6, padding: '8px 12px', marginBottom: 16 }}>{error}</div>
        )}

        {sorted.length === 0 ? (
          <div style={{ border: '1px dashed var(--border-2)', borderRadius: 10, padding: '40px 20px', textAlign: 'center',
                        color: 'var(--text-muted)', fontSize: 14 }}>
            {T('proj_empty')}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {sorted.map(p => <ProjectCard key={p.id} lang={lang} p={p} onOpen={onOpen} onChanged={refresh}/>)}
          </div>
        )}

        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 20, lineHeight: 1.6 }}>{T('proj_storage_note')}</p>
        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
          <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)',
                           fontSize: 12, textDecoration: 'underline' }} onClick={() => setShowPrivacy(true)}>{T('privacy_view')}</button>
          <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)',
                           fontSize: 12, textDecoration: 'underline' }} onClick={() => setShowTerms(true)}>{T('terms_view')}</button>
        </div>
      </main>
      {showPrivacy && <PrivacyViewer lang={lang} onClose={() => setShowPrivacy(false)}/>}
      {showTerms && <TermsViewer lang={lang} onClose={() => setShowTerms(false)}/>}
    </div>
  );
}

// ── Gate: project list, then the app for the chosen project ───────────────
// render(ctl) draws the app; ctl = { projectId, toList, newProject, importFile }.
function ProjectsGate({ render }) {
  const [lang, setLangState] = useState(() => readJSON('ctsizer_lang', 'en'));
  const [openId, setOpenId] = useState(null);
  // Bumped on every open, so re-opening (or importing into) a project remounts the app.
  const [mount, setMount] = useState(0);

  const setLang = l => { setLangState(l); writeJSON('ctsizer_lang', l); };

  const open = (id, ready) => {
    if (!ready && !openProject(id)) return;
    const p = (readAll() || []).find(q => q.id === id);
    CTSActivity.log('file', `Opened project "${p?.name ?? id}"`);
    setOpenId(id); setMount(m => m + 1);
  };

  if (!openId) return <ProjectList lang={lang} setLang={setLang} onOpen={open}/>;

  const ctl = {
    projectId: openId, mountKey: `${openId}:${mount}`,
    toList: () => { syncActive(); setLangState(readJSON('ctsizer_lang', 'en')); setOpenId(null); },
    newProject: name => { const p = createProject(name); if (p) open(p.id, true); },
    importFile: (data, fileName) => { syncActive(); const p = importProject(data, fileName); if (p) open(p.id, true); return !!p; },
  };
  return render(ctl);
}

window.CTSProjects = { syncActive, openProject, createProject, importProject, renameProject,
                       duplicateProject, deleteProject, list: () => readAll() || [] };
Object.assign(window, { ProjectsGate });
})();
