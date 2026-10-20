// ctsizer-components.jsx
const { useState, useEffect, useRef, useCallback } = React;
const T = (lang, k) => CTSI18n.t(lang, k);

// ── Icons ──────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 16, stroke = 'currentColor', fill = 'none', strokeWidth = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
       stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const icons = {
  station:  'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10',
  ct:       'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  vt:       'M22 12h-4l-3 9L9 3l-3 9H2',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06-.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z',
  sun:      'M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 17a5 5 0 100-10 5 5 0 000 10z',
  moon:     'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  monitor:  'M2 3h20a2 2 0 012 2v14a2 2 0 01-2 2H2a2 2 0 01-2-2V5a2 2 0 012-2zM8 21h8M12 17v4',
  chevron:  'M9 18l6-6-6-6',
  chevronD: 'M6 9l6 6 6-6',
  check:    'M20 6L9 17l-5-5',
  x:        'M18 6L6 18M6 6l12 12',
  plus:     'M12 5v14M5 12h14',
  minus:    'M5 12h14',
  file:     'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6',
  save:     'M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8',
  open:     'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
  zap:      'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  gauge:    'M12 2a10 10 0 100 20 10 10 0 000-20zM12 12l4-4',
  cpu:      'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18',
  diff:     'M5 12h14M12 5l7 7-7 7',
  message:  'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  export:   'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  grid:     'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  menu:     'M3 6h18M3 12h18M3 18h18',
  more:     'M12 5.5v.01M12 12v.01M12 18.5v.01',
};

// ── Phone layout ───────────────────────────────────────────────────────────
// Below this width the sidebar becomes a drawer, the top-bar actions move into
// a menu and the core page stacks its input and result panels.
const MOBILE_QUERY = '(max-width: 760px)';
function useMobile() {
  const [m, setM] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const h = e => setM(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return m;
}

// CT type metadata
const CT_TYPES = [
  { id: 'overcurrent', icon: icons.zap,   ready: true  },
  { id: 'metering',   icon: icons.gauge,  ready: true  },
  { id: 'busbar',     icon: icons.cpu,    ready: true  },
  { id: 'distance',   icon: icons.diff,   ready: false },
  { id: 'transformer_diff', icon: icons.diff, ready: false },
  { id: 'line_diff',  icon: icons.diff,   ready: false },
];

// ── TopBar ─────────────────────────────────────────────────────────────────
function TopBar({ lang, setLang, themeMode, setThemeMode, projectName, setProjectName, onHome, onProjects, onNew, onSave, onOpen, onExport, onFeedback,
                  mobile, onMenu }) {
  const [editingName, setEditingName] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const nameRef = useRef(null);
  const fileRef = useRef(null);
  useEffect(() => { if (editingName) nameRef.current?.focus(); }, [editingName]);
  useEffect(() => { if (!mobile) setMoreOpen(false); }, [mobile]);

  const themeIcons = { light: icons.sun, dark: icons.moon, auto: icons.monitor };
  const nextTheme  = { light: 'dark', dark: 'auto', auto: 'light' };

  const actions = [
    [icons.grid,   T(lang,'projects'),     onProjects],
    [icons.file,   T(lang,'new_project'),  onNew],
    [icons.open,   T(lang,'open_project'), () => fileRef.current?.click()],
    [icons.save,   T(lang,'save_project'), onSave],
    [icons.export, T(lang,'export_rtf'),   onExport],
  ];
  const langPill = (
    <button style={topbarSt.pill} onClick={() => setLang(lang === 'en' ? 'da' : 'en')}>
      <img src={lang === 'en' ? 'logo/flag_uk.svg' : 'logo/flag_dk.svg'}
           style={{ width: 16, height: 11, borderRadius: 1 }} alt={lang} />
      <span style={topbarSt.pillLabel}>{lang.toUpperCase()}</span>
    </button>
  );
  const themePill = (
    <button style={topbarSt.pill} title={themeMode}
      onClick={() => setThemeMode(nextTheme[themeMode] || 'light')}>
      <Icon d={themeIcons[themeMode] || icons.sun} size={14} />
      <span style={topbarSt.pillLabel}>{themeMode}</span>
    </button>
  );
  const fileInput = (
    <input ref={fileRef} type="file" accept=".ctvt,.json" style={{ display: 'none' }}
      onChange={e => { if (e.target.files[0]) onOpen(e.target.files[0]); e.target.value=''; }} />
  );

  return (
    <header style={{ ...topbarSt.bar, ...(mobile ? { padding: '0 6px', gap: 4 } : null) }}>
      {mobile && (
        <button style={topbarSt.iconBtn} onClick={onMenu} aria-label={T(lang,'menu')} title={T(lang,'menu')}>
          <Icon d={icons.menu} size={20} />
        </button>
      )}

      {/* The logo returns to the landing page */}
      <button style={topbarSt.logo} onClick={onHome} title={T(lang,'home')} aria-label={T(lang,'home')}>
        <img src="logo/icon.svg" alt="" style={{ width: 26, height: 26 }} />
        {!mobile && <span style={topbarSt.logoText}>CT<span style={{ color: 'var(--text-dim)' }}>Sizer</span></span>}
        {!mobile && window.CTSVersionBadge && <window.CTSVersionBadge note={T(lang,'beta_note')} />}
      </button>

      <div style={topbarSt.divider} />

      <div style={{ ...topbarSt.projWrap, ...(mobile ? { flex: 1, minWidth: 0 } : null) }} onClick={() => setEditingName(true)}>
        {editingName ? (
          <input ref={nameRef} defaultValue={projectName}
            onBlur={e => { setProjectName(e.target.value || 'Untitled'); setEditingName(false); }}
            onKeyDown={e => e.key === 'Enter' && e.target.blur()}
            style={{ ...topbarSt.projInput, ...(mobile ? { width: '100%' } : null) }} />
        ) : (
          <span style={{ ...topbarSt.projName, ...(mobile ? topbarSt.ellipsis : null) }}>{projectName}</span>
        )}
      </div>

      {mobile ? (
        <>
          {fileInput}
          <button style={topbarSt.iconBtn} onClick={() => setMoreOpen(o => !o)} aria-expanded={moreOpen}
            aria-label={T(lang,'more_actions')} title={T(lang,'more_actions')}>
            <Icon d={icons.more} size={22} strokeWidth={3} />
          </button>
          {moreOpen && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 300 }} onClick={() => setMoreOpen(false)}>
              <div role="menu" style={topbarSt.menu} onClick={e => e.stopPropagation()}>
                {[...actions, [icons.message, T(lang,'feedback'), onFeedback]].map(([icon, label, fn]) => (
                  <button key={label} role="menuitem" style={topbarSt.menuItem}
                    onClick={() => { setMoreOpen(false); fn(); }}>
                    <Icon d={icon} size={16} />
                    <span>{label}</span>
                  </button>
                ))}
                <div style={{ display: 'flex', gap: 8, padding: '10px 12px 4px', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                  {langPill}
                  {themePill}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          {actions.map(([icon, label, fn]) => <TBtn key={label} icon={icon} label={label} onClick={fn} />)}

          {fileInput}

          <div style={topbarSt.divider} />

          <TBtn icon={icons.message} label={T(lang,'feedback')} onClick={onFeedback} />

          <div style={topbarSt.divider} />

          {langPill}
          {themePill}
        </div>
      )}
    </header>
  );
}

function TBtn({ icon, label, onClick }) {
  const [h, setH] = useState(false);
  return (
    <button style={{ ...topbarSt.btn, background: h ? 'var(--surface-3)' : 'transparent' }}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={onClick}>
      <Icon d={icon} size={13} />
      <span style={{ fontSize: 12 }}>{label}</span>
    </button>
  );
}

const topbarSt = {
  bar:      { height: 'var(--topbar-h)', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
               display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8, flexShrink: 0, zIndex: 100 },
  logo:     { display: 'flex', alignItems: 'center', gap: 7, padding: 0, border: 'none', background: 'none',
               cursor: 'pointer', flexShrink: 0 },
  logoText: { fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 16, color: 'var(--accent)', letterSpacing: '-0.3px' },
  divider:  { width: 1, height: 18, background: 'var(--border-2)', margin: '0 2px' },
  projWrap: { cursor: 'text', padding: '3px 6px', borderRadius: 4 },
  projName: { fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)', fontWeight: 500 },
  projInput:{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text)', background: 'transparent',
               border: 'none', outline: 'none', width: 180 },
  btn:      { display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 5,
               border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontFamily: 'var(--font-body)',
               fontSize: 12, transition: 'background 0.15s' },
  pill:     { display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 5,
               background: 'var(--surface-3)', border: '1px solid var(--border-2)', cursor: 'pointer',
               color: 'var(--text-dim)' },
  iconBtn:  { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, flexShrink: 0,
               borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-dim)' },
  ellipsis: { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  menu:     { position: 'absolute', top: 'calc(var(--topbar-h) - 4px)', right: 6, minWidth: 220, padding: '6px 0',
               background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 8,
               boxShadow: '0 8px 28px rgba(0,0,0,0.3)' },
  menuItem: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '11px 16px', border: 'none',
               background: 'transparent', cursor: 'pointer', color: 'var(--text)', fontFamily: 'var(--font-body)',
               fontSize: 15, textAlign: 'left' },
  pillLabel:{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' },
};

// ── InlineEdit ─────────────────────────────────────────────────────────────
function InlineEdit({ value, onSave, style }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const ref = useRef(null);
  useEffect(() => { setVal(value); }, [value]);
  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select(); } }, [editing]);
  if (editing) return (
    <input ref={ref} value={val} onChange={e=>setVal(e.target.value)}
      onBlur={()=>{ onSave(val||value); setEditing(false); }}
      onKeyDown={e=>{ if(e.key==='Enter'){onSave(val||value);setEditing(false);}
                       if(e.key==='Escape') setEditing(false); }}
      style={{...style,background:'var(--surface-3)',border:'1px solid var(--accent)',
                borderRadius:3,padding:'1px 5px',outline:'none',minWidth:60}}/>
  );
  return <span style={style} onDoubleClick={()=>setEditing(true)} title="Double-click to rename">{value}</span>;
}

// ── Sidebar3 ────────────────────────────────────────────────────────────────
const DEVICE_TYPE_LIST = ['distance','overcurrent','transformer_diff','line_diff','busbar','metering','custom'];

function Sidebar3({ lang, navActive, setNavActive, feeders, sel,
                    onNavSelect, onCoreSelect,
                    onAddFeeder, removeFeeder, saveFeederTpl,
                    addDevice, removeDevice, addCore, removeCore,
                    renameFeeder, renameDevice, renameCore, results,
                    coreChecks = {}, stationCheck, bayChecks = {},
                    mobile, open, onClose }) {
  const [expFeeders, setExpFeeders] = useState({});
  const [expDevices, setExpDevices] = useState({});
  const [showAddDevice, setShowAddDevice] = useState(null); // feederId
  const [showAddCore,   setShowAddCore]   = useState(null); // {fid,did}
  const [tplInput, setTplInput] = useState({ show:false, kind:'', id:'', name:'' });
  const Tl = k => CTSI18n.t(lang, k);

  // Auto-expand new feeders/devices
  useEffect(() => {
    feeders.forEach(f => {
      if (expFeeders[f.id] === undefined) setExpFeeders(e => ({...e,[f.id]:true}));
      f.devices.forEach(d => {
        if (expDevices[d.id] === undefined) setExpDevices(e => ({...e,[d.id]:true}));
      });
    });
  }, [feeders]);

  const toggleF = id => setExpFeeders(e => ({...e,[id]:!e[id]}));
  const toggleD = id => setExpDevices(e => ({...e,[id]:!e[id]}));

  // On a phone the sidebar is a drawer over the page, opened from the top bar.
  // No transform while open: the template dialog inside is position:fixed.
  const navSt = mobile
    ? { ...sb3.nav, ...sb3.drawer, transform: open ? 'none' : 'translateX(-105%)',
        visibility: open ? 'visible' : 'hidden' }
    : sb3.nav;

  return (
    <>
    {mobile && open && <div style={sb3.backdrop} onClick={onClose} aria-hidden="true"/>}
    <nav style={navSt} className={mobile ? 'ctsizer-drawer' : undefined} aria-hidden={mobile && !open ? true : undefined}>
      {mobile && (
        <button style={sb3.drawerClose} onClick={onClose} aria-label={Tl('close')} title={Tl('close')}>
          <Icon d={icons.x} size={18}/>
        </button>
      )}
      {/* Station Data */}
      <SNavItem item={{key:'station',icon:icons.station,label:Tl('nav_station')}}
        active={navActive==='station'} onClick={()=>onNavSelect('station')}
        mark={stationCheck && !stationCheck.ok && <MissingMark lang={lang} count={stationCheck.count} testId="station-mark"/>}/>

      {/* Feeders section */}
      <div style={sb3.secLabel}>
        <Icon d={icons.ct} size={11} stroke="var(--text-muted)"/>
        <span>{Tl('nav_ct')}</span>
      </div>

      <div style={{flex:1,overflowY:'auto',minHeight:0}}>
        {feeders.map(feeder => {
          const fActive = sel.feederId===feeder.id;
          const fExpanded = expFeeders[feeder.id] !== false;
          return (
            <div key={feeder.id}>
              {/* Feeder row */}
              <div style={sb3.feederRow}>
                <button style={{...sb3.feederBtn, color: fActive&&!sel.deviceId?'var(--accent)':'var(--text-dim)'}}
                  onClick={()=>{ toggleF(feeder.id); onCoreSelect({feederId:feeder.id}); }}>
                  <span style={{transform:fExpanded?'rotate(90deg)':'none',transition:'transform 0.15s',
                                  display:'inline-flex',color:'var(--text-muted)',flexShrink:0}}>
                    <Icon d={icons.chevron} size={10}/>
                  </span>
                  <InlineEdit value={feeder.name} onSave={name=>renameFeeder(feeder.id,name)}
                    style={{fontSize:12,fontWeight:600,color:'inherit',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}/>
                  {/* the bay's transformer / line data incomplete (#133) */}
                  {bayChecks[feeder.id] && !bayChecks[feeder.id].ok &&
                    <MissingMark lang={lang} count={bayChecks[feeder.id].count} testId="bay-mark"/>}
                </button>
                {/* Feeder actions */}
                <button style={sb3.iconBtn} title={Tl('tpl_save_feeder')}
                  onClick={()=>setTplInput({show:true,kind:'feeders',id:feeder.id,name:feeder.name})}>
                  <Icon d="M5 5h14v14H5zM9 9h6M9 12h6M9 15h4" size={11} stroke="var(--text-muted)"/>
                </button>
                <button style={sb3.iconBtn} title={Tl('remove')}
                  onClick={()=>removeFeeder(feeder.id)}>
                  <Icon d={icons.minus} size={11} stroke="var(--text-muted)"/>
                </button>
              </div>

              {fExpanded && (
                <div style={sb3.devList}>
                  {feeder.devices.map(dev => {
                    const dActive = sel.deviceId===dev.id;
                    const dExpanded = expDevices[dev.id] !== false;
                    return (
                      <div key={dev.id}>
                        {/* Device row */}
                        <div style={sb3.devRow}>
                          <button style={{...sb3.devBtn, color:dActive&&!sel.coreId?'var(--accent)':'var(--text-dim)',
                            fontWeight:dActive&&!sel.coreId?600:400}}
                            onClick={()=>{ toggleD(dev.id); onCoreSelect({feederId:feeder.id,deviceId:dev.id}); }}>
                            <span style={{transform:dExpanded?'rotate(90deg)':'none',transition:'transform 0.15s',
                                            display:'inline-flex',color:'var(--text-muted)',flexShrink:0}}>
                              <Icon d={icons.chevron} size={9}/>
                            </span>
                            <InlineEdit value={dev.name} onSave={name=>renameDevice(feeder.id,dev.id,name)}
                              style={{fontSize:11,color:'inherit',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}/>
                            <span style={sb3.devType}>{Tl(`dev_${dev.device_type}`).split(' ')[0]}</span>
                          </button>
                          <button style={sb3.iconBtn} title={Tl('remove_device')}
                            onClick={()=>removeDevice(feeder.id,dev.id)}>
                            <Icon d={icons.x} size={9} stroke="var(--text-muted)"/>
                          </button>
                        </div>

                        {/* Cores */}
                        {dExpanded && (
                          <div style={sb3.coreList}>
                            {dev.cores.map(core => {
                              const isActive = sel.coreId===core.id && sel.deviceId===dev.id;
                              const rkey = `${feeder.id}-${dev.id}-${core.id}`;
                              const res = results?.[rkey];
                              const chk = coreChecks[rkey];
                              const dc = res ? (res.is_ok?'var(--green)':'var(--red)') : 'var(--border-2)';
                              return (
                                <div key={core.id} style={{display:'flex',alignItems:'center'}}>
                                  <button style={{...sb3.coreBtn,
                                    background:isActive?'var(--accent-glow)':'transparent',
                                    color:isActive?'var(--accent)':'var(--text-dim)',
                                    borderLeft:`2px solid ${isActive?'var(--accent)':'transparent'}`}}
                                    onClick={()=>onCoreSelect({feederId:feeder.id,deviceId:dev.id,coreId:core.id})}>
                                    <span style={{width:6,height:6,borderRadius:'50%',background:dc,flexShrink:0,
                                                    boxShadow:res?`0 0 4px ${dc}`:'none'}}/>
                                     <InlineEdit value={core.name}
                                      onSave={name=>renameCore(feeder.id,dev.id,core.id,name)}
                                      style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:11,color:'inherit'}}/>
                                    {chk && !chk.ok && <MissingMark lang={lang} count={chk.count} testId="core-mark"/>}
                                    <span style={sb3.coreKind}>{core.kind==='vt'?'VT Core':'CT Core'}</span>
                                  </button>
                                  <button style={sb3.iconBtn} onClick={()=>removeCore(feeder.id,dev.id,core.id)}>
                                    <Icon d={icons.x} size={9} stroke="var(--text-muted)"/>
                                  </button>
                                </div>
                              );
                            })}
                            {/* Add core buttons */}
                            {showAddCore?.fid===feeder.id && showAddCore?.did===dev.id ? (
                              <div style={{display:'flex',gap:4,marginTop:3}}>
                                <button style={sb3.addKindBtn} onClick={()=>{ addCore(feeder.id,dev.id,'ct'); setShowAddCore(null); }}>
                                  + CT
                                </button>
                                <button style={sb3.addKindBtn} onClick={()=>{ addCore(feeder.id,dev.id,'vt'); setShowAddCore(null); }}>
                                  + VT
                                </button>
                                <button style={{...sb3.addKindBtn,color:'var(--text-muted)'}} onClick={()=>setShowAddCore(null)}>✕</button>
                              </div>
                            ) : (
                              <button style={sb3.addDashedBtn}
                                onClick={()=>setShowAddCore({fid:feeder.id,did:dev.id})}>
                                {Tl('add_core')||'+ Add Core'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add device */}
                  {showAddDevice===feeder.id ? (
                    <div style={{padding:'6px 4px',display:'flex',flexDirection:'column',gap:3}}>
                      <div style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text-muted)',
                                    textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:2}}>
                        Select protection type:
                      </div>
                      {DEVICE_TYPE_LIST.map(dt => (
                        <button key={dt} style={{...sb3.devTypeBtn, textAlign:'left', padding:'4px 8px', width:'100%'}}
                          onClick={()=>{ addDevice(feeder.id,dt); setShowAddDevice(null); }}>
                          {Tl(`dev_${dt}`)}
                        </button>
                      ))}
                      <button style={{...sb3.devTypeBtn,color:'var(--text-muted)',marginTop:2}} onClick={()=>setShowAddDevice(null)}>✕ Cancel</button>
                    </div>
                  ) : (
                    <button style={sb3.addDashedBtn} onClick={()=>setShowAddDevice(feeder.id)}>
                      {Tl('add_device')}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Add feeder: the purpose is chosen first (NewFeederDialog) */}
        <button style={{...sb3.addDashedBtn,margin:'6px 10px',width:'calc(100% - 20px)'}} onClick={onAddFeeder}>
          {Tl('add_feeder')}
        </button>
      </div>

      {/* Settings */}
      <SNavItem item={{key:'settings',icon:icons.settings,label:Tl('nav_settings')}}
        active={navActive==='settings'} onClick={()=>onNavSelect('settings')}/>

      {/* Standards */}
      <div style={{padding:'8px 14px 10px',display:'flex',flexDirection:'column',gap:3}}>
        {['IEC 61869-2','IEC 61869-3','IEC TR 61869-100'].map(s=>(
          <div key={s} style={{display:'flex',alignItems:'center',gap:5}}>
            <span style={{width:4,height:4,borderRadius:'50%',background:'var(--accent)',
                           boxShadow:'0 0 3px var(--accent)',flexShrink:0}}/>
            <span style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text-muted)'}}>{s}</span>
          </div>
        ))}
        {/* Version print (ctsizer-version.js) */}
        {window.CTSVersion && (
          <div title={Tl('beta_note')}
            style={{marginTop:5,fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text-muted)',lineHeight:1.4}}>
            {window.CTSVersion.full()}
          </div>
        )}
      </div>

      {/* Template save dialog */}
      {tplInput.show && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:200,
                      display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={()=>setTplInput({show:false})}>
          <div style={{background:'var(--surface)',border:'1px solid var(--border-2)',borderRadius:10,
                        padding:20,width:280,display:'flex',flexDirection:'column',gap:10}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:'var(--font-head)',fontWeight:700,fontSize:14,color:'var(--text)'}}>
              {Tl('tpl_save_feeder')}
            </div>
            <input type="text" value={tplInput.name} autoFocus
              onChange={e=>setTplInput(t=>({...t,name:e.target.value}))}
              placeholder={Tl('tpl_name_prompt')}
              style={{background:'var(--surface-2)',border:'1px solid var(--border-2)',color:'var(--text)',
                       borderRadius:5,padding:'6px 10px',fontFamily:'var(--font-body)',fontSize:13,outline:'none'}}
              onKeyDown={e=>{ if(e.key==='Enter') {
                saveFeederTpl(tplInput.id, tplInput.name);
                setTplInput({show:false});
              }}}/>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button style={{padding:'5px 12px',borderRadius:5,border:'1px solid var(--border-2)',
                               background:'var(--surface-3)',color:'var(--text-dim)',cursor:'pointer',fontSize:12}}
                onClick={()=>setTplInput({show:false})}>Cancel</button>
              <button style={{padding:'5px 12px',borderRadius:5,border:'none',background:'var(--accent)',
                               color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}
                onClick={()=>{ saveFeederTpl(tplInput.id,tplInput.name); setTplInput({show:false}); }}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
    </>
  );
}

// ── New feeder: purpose first, then name and devices ──────────────────────
// Every device type is listed in the same order for each purpose, none marked
// or pre-selected, so a feeder starts empty unless the user ticks a device.
const FEEDER_PURPOSES = [
  { id:'line' }, { id:'transformer' }, { id:'cable' }, { id:'busbar' },
];

function NewFeederDialog({ lang, feeders, onCreate, onCancel }) {
  const Tl = k => CTSI18n.t(lang, k);
  const [purpose, setPurpose] = useState(null);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState([]);
  const feederTpls = typeof getTpls !== 'undefined' ? getTpls('feeders') : [];

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onCancel]);

  const choose = id => {
    const n = feeders.filter(f => (f.feeder_type||'line')===id).length + 1;
    setPurpose(id); setName(`${Tl(`purpose_${id}`)} ${n}`); setPicked([]);
  };
  const toggle = dt => setPicked(p => p.includes(dt) ? p.filter(x=>x!==dt) : [...p, dt]);
  const create = () => onCreate({ feeder_type:purpose, name:name.trim() || Tl(`purpose_${purpose}`),
    device_types: DEVICE_TYPE_LIST.filter(dt => picked.includes(dt)) });

  const lbl = { fontSize:10, fontFamily:'var(--font-mono)', color:'var(--text-muted)',
                textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 };
  const btn = primary => ({ padding:'7px 14px', borderRadius:6, cursor:'pointer', fontFamily:'var(--font-head)',
    fontSize:12, fontWeight:600, border: primary?'none':'1px solid var(--border-2)',
    background: primary?'var(--accent)':'var(--surface-2)', color: primary?'#fff':'var(--text-dim)' });

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ctsizer-nf-title"
      style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:300,display:'flex',
              alignItems:'center',justifyContent:'center',padding:16}}
      onClick={onCancel}>
      <div onClick={e=>e.stopPropagation()}
        style={{background:'var(--surface)',border:'1px solid var(--border-2)',borderRadius:10,width:'100%',
                maxWidth:640,maxHeight:'100%',overflowY:'auto',padding:20,display:'flex',flexDirection:'column',gap:14,
                boxShadow:'0 8px 32px rgba(0,0,0,0.25)'}}>
        <div id="ctsizer-nf-title" style={{fontFamily:'var(--font-head)',fontWeight:700,fontSize:16,color:'var(--text)'}}>
          {Tl('nf_title')}
        </div>

        {!purpose ? (
          <>
            <div>
              <div style={lbl}>{Tl('nf_step1')}</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10}}>
                {FEEDER_PURPOSES.map(p => {
                  const scheme = typeof CTSDraw !== 'undefined' ? CTSDraw.SCHEMES[p.id] : '';
                  const h = p.id==='transformer' ? 140 : 110;
                  return (
                    <button key={p.id} aria-label={Tl(`purpose_${p.id}`)} onClick={()=>choose(p.id)}
                      style={{display:'flex',flexDirection:'column',alignItems:'stretch',gap:6,padding:10,borderRadius:8,
                              cursor:'pointer',background:'var(--surface-2)',border:'1px solid var(--border-2)',textAlign:'left'}}>
                      {scheme && (
                        <svg viewBox={`0 0 200 ${h}`} style={{width:'100%',height:70,display:'block'}}
                          aria-hidden="true" dangerouslySetInnerHTML={{__html:scheme}}/>
                      )}
                      <span style={{fontFamily:'var(--font-head)',fontSize:14,fontWeight:600,color:'var(--text)'}}>
                        {Tl(`purpose_${p.id}`)}
                      </span>
                      <span style={{fontSize:11,color:'var(--text-dim)',lineHeight:1.4}}>{Tl(`purpose_${p.id}_desc`)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {feederTpls.length > 0 && (
              <div>
                <div style={lbl}>{Tl('nf_from_tpl')}</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {feederTpls.map(tpl => (
                    <button key={tpl.id} onClick={()=>onCreate({ tpl })}
                      style={{...btn(false),color:'var(--accent)',borderColor:'var(--accent)'}}>
                      {tpl.name}
                      <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--text-muted)',marginLeft:6}}>
                        {Tl(`purpose_${tpl.data?.feeder_type||'line'}`)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div style={{display:'flex',justifyContent:'flex-end'}}>
              <button style={btn(false)} onClick={onCancel}>{Tl('nf_cancel')}</button>
            </div>
          </>
        ) : (
          <>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:10,fontFamily:'var(--font-mono)',fontWeight:700,textTransform:'uppercase',
                            padding:'3px 8px',borderRadius:4,background:'var(--accent-glow)',color:'var(--accent)',
                            boxShadow:'0 0 0 1px var(--accent)'}}>
                {Tl('bay_purpose')}: {Tl(`purpose_${purpose}`)}
              </span>
            </div>
            <div style={lbl}>{Tl('nf_step2')}</div>
            <label style={{display:'flex',flexDirection:'column',gap:5,fontSize:12,color:'var(--text-dim)'}}>
              {Tl('nf_name')}
              <input type="text" value={name} autoFocus onChange={e=>setName(e.target.value)}
                onKeyDown={e=>{ if (e.key==='Enter') create(); }}
                style={{background:'var(--surface-2)',border:'1px solid var(--border-2)',color:'var(--text)',
                        borderRadius:6,padding:'7px 10px',fontFamily:'var(--font-body)',fontSize:13}}/>
            </label>
            <div>
              <div style={{fontSize:12,color:'var(--text-dim)',marginBottom:6}}>{Tl('nf_devices')}</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:6}}>
                {DEVICE_TYPE_LIST.map(type => (
                  <label key={type} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderRadius:6,
                                            cursor:'pointer',fontSize:12,color:'var(--text)',
                                            background:picked.includes(type)?'var(--accent-glow)':'var(--surface-2)',
                                            border:`1px solid ${picked.includes(type)?'var(--accent)':'var(--border-2)'}`}}>
                    <input type="checkbox" checked={picked.includes(type)} onChange={()=>toggle(type)}/>
                    <span style={{flex:1}}>{Tl(`dev_${type}`)}</span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
              <button style={btn(false)} onClick={()=>setPurpose(null)}>{Tl('nf_back')}</button>
              <div style={{display:'flex',gap:8}}>
                <button style={btn(false)} onClick={onCancel}>{Tl('nf_cancel')}</button>
                <button style={btn(true)} onClick={create}>{Tl('nf_create')}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SNavItem({ item, active, onClick, disabled, mark }) {
  return (
    <button style={{ ...sb3.navItem, background: active?'var(--accent-glow)':'transparent',
      color: active?'var(--accent)':disabled?'var(--text-muted)':'var(--text-dim)',
      borderLeft:`2px solid ${active?'var(--accent)':'transparent'}`,
      opacity:disabled?0.45:1, cursor:disabled?'default':'pointer' }}
      onClick={!disabled?onClick:undefined}>
      <Icon d={item.icon} size={14} stroke={active?'var(--accent)':'currentColor'}/>
      <span style={{fontSize:12,fontWeight:active?600:400}}>{item.label}</span>
      {mark}
    </button>
  );
}

const sb3 = {
  nav:        { width:'var(--sidebar-w)',background:'var(--surface)',borderRight:'1px solid var(--border)',
                 display:'flex',flexDirection:'column',flexShrink:0,paddingTop:8,overflowY:'hidden' },
  drawer:     { position:'fixed',top:'var(--topbar-h)',bottom:0,left:0,width:'min(320px, 86vw)',zIndex:160,
                 boxShadow:'4px 0 24px rgba(0,0,0,0.3)',transition:'transform 0.2s ease, visibility 0.2s' },
  backdrop:   { position:'fixed',inset:'var(--topbar-h) 0 0 0',background:'rgba(0,0,0,0.45)',zIndex:150 },
  drawerClose:{ position:'absolute',top:4,right:4,width:36,height:36,display:'flex',alignItems:'center',
                 justifyContent:'center',border:'none',background:'transparent',cursor:'pointer',
                 color:'var(--text-muted)',zIndex:1 },
  navItem:    { display:'flex',alignItems:'center',gap:8,padding:'7px 12px 7px 14px',border:'none',
                 fontFamily:'var(--font-body)',transition:'all 0.12s',width:'100%',textAlign:'left' },
  secLabel:   { display:'flex',alignItems:'center',gap:5,padding:'10px 14px 4px',fontSize:10,
                 fontFamily:'var(--font-mono)',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em' },
  feederRow:  { display:'flex',alignItems:'center',paddingRight:4 },
  feederBtn:  { flex:1,display:'flex',alignItems:'center',gap:5,padding:'5px 4px 5px 10px',border:'none',
                 background:'transparent',cursor:'pointer',fontFamily:'var(--font-body)',textAlign:'left',minWidth:0 },
  devList:    { marginLeft:14,borderLeft:'1px solid var(--border)',paddingLeft:4,paddingBottom:4 },
  devRow:     { display:'flex',alignItems:'center',paddingRight:4 },
  devBtn:     { flex:1,display:'flex',alignItems:'center',gap:4,padding:'4px 4px 4px 6px',border:'none',
                 background:'transparent',cursor:'pointer',fontFamily:'var(--font-body)',textAlign:'left',minWidth:0 },
  devType:    { fontSize:9,fontFamily:'var(--font-mono)',color:'var(--text-muted)',flexShrink:0,
                 background:'var(--surface-3)',padding:'1px 4px',borderRadius:3 },
  coreList:   { marginLeft:10,paddingBottom:4 },
  coreBtn:    { flex:1,display:'flex',alignItems:'center',gap:5,padding:'4px 6px 4px 8px',border:'none',
                 cursor:'pointer',fontFamily:'var(--font-body)',textAlign:'left',borderRadius:'0 4px 4px 0',
                 transition:'all 0.12s',minWidth:0 },
  coreKind:   { fontSize:8,fontFamily:'var(--font-mono)',color:'var(--text-muted)',flexShrink:0,
                 textTransform:'uppercase',letterSpacing:'0.04em' },
  iconBtn:    { background:'none',border:'none',cursor:'pointer',padding:'3px 3px',opacity:0.4,
                 transition:'opacity 0.12s',borderRadius:3,flexShrink:0 },
  addDashedBtn:{ background:'none',border:'1px dashed var(--border-2)',borderRadius:4,padding:'3px 8px',
                  cursor:'pointer',fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',
                  margin:'2px 0',transition:'all 0.12s',width:'100%',textAlign:'left' },
  addKindBtn: { background:'var(--accent-glow)',border:'1px solid var(--accent)',borderRadius:4,
                 padding:'2px 8px',cursor:'pointer',fontSize:10,color:'var(--accent)',fontFamily:'var(--font-mono)' },
  devTypeBtn: { background:'var(--surface-3)',border:'1px solid var(--border-2)',borderRadius:4,
                 padding:'2px 6px',cursor:'pointer',fontSize:9,color:'var(--text-dim)',fontFamily:'var(--font-mono)' },
};

// ── Required-input marks (calc/required.js) ───────────────────────────────
// CTSizer has no default values. A panel provides CTRequired's check of what
// it shows ({ fields, sections, lang }); FormRow field="key" and SectionCard
// section="id" read it and show a small mark on an input that is missing or
// out of range and on the card that holds it. The core is calculated only
// when nothing is marked (ctsizer-app.jsx).
const InputCheck = React.createContext(null);

// reason 'legacy' (CTRequired notes): a value a saved project never stored
// but is still calculated without; drawn as a hollow amber ring and never
// counted on the card or in the sidebar.
function MissingMark({ reason = 'missing', lang, count, testId = 'missing-mark' }) {
  const invalid = reason === 'invalid';
  const legacy = reason === 'legacy';
  const title = count != null
    ? T(lang, 'mark_section').replace('{n}', count)
    : T(lang, invalid ? 'mark_invalid' : legacy ? 'mark_legacy' : 'mark_missing');
  return (
    <span data-testid={testId} data-reason={reason} title={title} aria-label={title} role="img"
      style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
               marginLeft: 5, verticalAlign: 'middle', boxSizing: 'border-box',
               background: invalid ? 'var(--red)' : legacy ? 'transparent' : 'var(--amber)',
               border: legacy ? '2px solid var(--amber)' : undefined,
               boxShadow: `0 0 0 2px ${invalid ? 'var(--red-bg)' : 'var(--surface-3)'}` }}/>
  );
}

// ── InfoMark / InfoBox ─────────────────────────────────────────────────────
// A word in running text marked as an explanation: dotted underline and an
// "i" mark. Clicking it opens / closes its InfoBox, shown in the flow below
// (not floating: the cards clip overflow). The caller holds `open`.
function InfoMark({ label, open, onToggle, title, testId }) {
  return (
    <button type="button" data-testid={testId} aria-expanded={!!open} title={title} onClick={onToggle}
      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit',
               color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 3,
               textDecoration: 'underline dotted', textUnderlineOffset: 2 }}>
      {label}
      <span aria-hidden="true"
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 12, height: 12,
                 borderRadius: '50%', border: '1px solid currentColor', fontSize: 8, fontWeight: 700,
                 fontFamily: 'var(--font-mono)', lineHeight: 1, textDecoration: 'none' }}>i</span>
    </button>
  );
}

// The box an InfoMark opens: a title, the content, a close button; Esc closes
function InfoBox({ title, onClose, children, testId, closeLabel = 'Close' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div data-testid={testId} role="note"
      style={{ margin: '6px 0 4px', padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6,
               borderLeft: '3px solid var(--accent)', fontSize: 11, lineHeight: 1.45, color: 'var(--text-dim)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 12, color: 'var(--text)' }}>{title}</span>
        <button type="button" onClick={onClose} aria-label={closeLabel} title={closeLabel}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                   fontSize: 13, lineHeight: 1, padding: '0 2px' }}>✕</button>
      </div>
      {children}
    </div>
  );
}

// ── SectionCard ────────────────────────────────────────────────────────────
function SectionCard({ title, children, defaultOpen = true, accent = false, section }) {
  const [open, setOpen] = useState(defaultOpen);
  const chk = React.useContext(InputCheck);
  const missing = section && chk ? chk.sections[section] || 0 : 0;
  const invalid = missing > 0 && !!chk.invalidSections?.[section];
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 8, overflow: 'hidden',
                   boxShadow: '0 1px 6px rgba(0,0,0,0.1)', marginBottom: 12,
                   borderTop: `2px solid ${accent ? 'var(--accent)' : 'var(--border)'}` }}>
      <button style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}>
        <span style={{ fontFamily: 'var(--font-head)', fontSize: 13, fontWeight: 600, textAlign: 'left',
                         color: accent ? 'var(--accent)' : 'var(--text)' }}>
          {title}
          {missing > 0 && <MissingMark lang={chk.lang} count={missing} reason={invalid ? 'invalid' : 'missing'}
            testId="section-mark"/>}
        </span>
        <span style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s',
                        color: 'var(--text-muted)', display: 'inline-flex' }}>
          <Icon d={icons.chevron} size={13} />
        </span>
      </button>
      {open && <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>{children}</div>}
    </div>
  );
}

// ── WiringDiagram ─────────────────────────────────────────────────────────
// Help picture under the per-core Wiring select (PORTING_PLAN.md §9.8): the
// selected wiring between the three secondaries and their burdens, and k per
// current case read from the topology registry (R_lead = k · R_c).
// `resistor` (metering CT / VT core with an attached resistor): where it is
// drawn in each phase — 'series' (CT: in the loop; its place does not change
// the burden), 'vt' (VT: across the VT terminals, before the lead) or
// 'meter' (VT: across the meter, after the lead, so its current is in the lead).
const WIRING_SQRT3 = Math.sqrt(3);
function fmtWiringK(k) {
  return Math.abs(k - WIRING_SQRT3) < 1e-12 ? '√3 ≈ 1.73' : String(+k.toFixed(3));
}

function WiringDiagram({ lang, topology, calcType, resistor }) {
  const res = typeof CTCalc !== 'undefined' ? CTCalc.cableRes : null;
  const reg = res && Object.prototype.hasOwnProperty.call(res.topology, topology) ? res.topology[topology] : null;
  if (!reg) return null;
  const Tl = k => T(lang, k);
  const four = topology === 'four_wire';
  const src = calcType === 'vt' ? 'VT' : 'CT';
  const W = 300, H = 128;
  const xT = 34, xB = 256;              // secondary / burden centres
  const xS = xT + 7, xE = xB - 10;      // where the leads start / end
  const xN1 = 58, xN2 = 232, yN = 108;  // 4-wire star points and shared return
  const ys = [28, 56, 84];
  const go = 'var(--accent)', ret = 'var(--amber)', dim = 'var(--text-dim)', muted = 'var(--text-muted)';
  const title = `${Tl('lbl_cable_topology')}: ${lang === 'da' ? reg.label_da : reg.label_en}`;
  // The attached resistor: a shunt across go and return (VT) at x, inside the
  // VT's or the meter's end where both wires run in every wiring, or in
  // series in the go lead at the meter's end (CT)
  const rOn = resistor === 'vt' || resistor === 'meter' || resistor === 'series';
  const rX = resistor === 'vt' ? 50 : resistor === 'meter' ? 239 : 229;
  const rCol = 'var(--red)';
  const rLabel = calcType === 'vt' ? 'R_att' : 'R_res';

  return (
    <div data-testid="wiring-diagram" data-topology={topology}
         style={{ marginTop: 10, padding: '8px 8px 6px', background: 'var(--surface-2)',
                  border: '1px solid var(--border)', borderRadius: 6 }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}
           style={{ display: 'block', maxWidth: 360, margin: '0 auto', fontFamily: 'var(--font-mono)' }}>
        <title>{title}</title>
        <text x={xT} y={10} textAnchor="middle" fontSize="9" fill={muted}>{src}</text>
        <text x={xB} y={10} textAnchor="middle" fontSize="9" fill={muted}>{Tl('wiring_burden')}</text>
        <text x={(xS + xE) / 2} y={10} textAnchor="middle" fontSize="8" fill={muted}>{Tl('wiring_cable')}</text>
        <line x1={78} y1={14} x2={78} y2={yN + 4} stroke="var(--border-2)" strokeDasharray="2,3"/>
        <line x1={212} y1={14} x2={212} y2={yN + 4} stroke="var(--border-2)" strokeDasharray="2,3"/>
        {ys.map((y, i) => (
          <g key={i}>
            <text x={10} y={y + 3} fontSize="9" fill={dim}>{`L${i + 1}`}</text>
            <circle cx={xT} cy={y} r={8} fill="none" stroke={go} strokeWidth="1.5"/>
            <rect x={xE} y={y - 9} width={20} height={18} rx={2} fill="none" stroke={dim} strokeWidth="1.5"/>
            <line x1={xS} y1={y - 4} x2={xE} y2={y - 4} stroke={go} strokeWidth="1.6"/>
            {four
              ? <>
                  <line x1={xS} y1={y + 4} x2={xN1} y2={y + 4} stroke={ret} strokeWidth="1.6"/>
                  <line x1={xN2} y1={y + 4} x2={xE} y2={y + 4} stroke={ret} strokeWidth="1.6"/>
                  <circle cx={xN1} cy={y + 4} r={1.8} fill={ret}/>
                  <circle cx={xN2} cy={y + 4} r={1.8} fill={ret}/>
                </>
              : <line x1={xS} y1={y + 4} x2={xE} y2={y + 4} stroke={ret} strokeWidth="1.6"/>}
          </g>
        ))}
        <text x={(xS + xE) / 2} y={ys[0] - 7} textAnchor="middle" fontSize="8" fill={dim}>R_c</text>
        {rOn && (
          <g data-testid="wiring-resistor" data-at={resistor}>
            {ys.map((y, i) => resistor === 'series'
              ? <rect key={i} x={rX - 7} y={y - 6.5} width={14} height={5} fill="var(--surface-2)" stroke={rCol} strokeWidth="1.3"/>
              : <g key={i}>
                  <rect x={rX - 2.5} y={y - 4} width={5} height={8} fill="var(--surface-2)" stroke={rCol} strokeWidth="1.3"/>
                  <circle cx={rX} cy={y - 4} r={1.5} fill={rCol}/>
                  <circle cx={rX} cy={y + 4} r={1.5} fill={rCol}/>
                </g>)}
            <text x={rX} y={ys[0] - 8} textAnchor="middle" fontSize="8" fill={rCol}>{rLabel}</text>
          </g>
        )}
        {four
          ? <>
              <line x1={xN1} y1={ys[0] + 4} x2={xN1} y2={yN} stroke={ret} strokeWidth="1.6"/>
              <line x1={xN2} y1={ys[0] + 4} x2={xN2} y2={yN} stroke={ret} strokeWidth="1.6"/>
              <line x1={xN1} y1={yN} x2={xN2} y2={yN} stroke={ret} strokeWidth="2.6"/>
              <text x={(xN1 + xN2) / 2} y={yN - 4} textAnchor="middle" fontSize="8" fill={dim}>R_c</text>
              <text x={(xN1 + xN2) / 2} y={yN + 14} textAnchor="middle" fontSize="8" fill={muted}>
                {`${Tl('wiring_shared_return')}: I_L1 + I_L2 + I_L3`}
              </text>
            </>
          : <text x={(xS + xE) / 2} y={yN + 2} textAnchor="middle" fontSize="8" fill={muted}>
              {Tl('wiring_own_return')}
            </text>}
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 6,
                    fontFamily: 'var(--font-mono)', fontSize: 10, textAlign: 'center' }}>
        {res.CURRENT_CASES.map(cs => (
          <div key={cs} data-case={cs} style={{ padding: '3px 2px', borderRadius: 4, background: 'var(--surface-3)' }}>
            <div style={{ color: 'var(--text-muted)' }}>{Tl('wiring_case_' + cs)}</div>
            <div style={{ color: 'var(--text)', fontWeight: 600 }}>k = {fmtWiringK(reg.factors[cs])}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 5, fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--font-body)', lineHeight: 1.35 }}>
        {Tl('wiring_help')}
      </div>
      {rOn && (
        <div style={{ marginTop: 3, fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--font-body)', lineHeight: 1.35 }}>
          <span style={{ color: rCol }}>{rLabel}</span>: {Tl(`wiring_resistor_${resistor}`)}
        </div>
      )}
    </div>
  );
}

// ── FormRow ────────────────────────────────────────────────────────────────
// `wide` gives the input column room for text options (e.g. the cable R method).
// `field`: the input's key in the panel's InputCheck; marked when missing / invalid.
// A non-blocking note (chk.notes, e.g. 'legacy') shows only when the field
// has no missing / invalid mark, as data-note.
function FormRow({ label, children, unit, wide, field }) {
  const chk = React.useContext(InputCheck);
  const reason = field && chk ? chk.fields[field] : null;
  const note = !reason && field && chk && chk.notes ? chk.notes[field] : null;
  return (
    <div data-field={field} data-missing={reason || undefined} data-note={note || undefined}
      style={{ display: 'grid', gridTemplateColumns: wide ? '1fr 220px' : '1fr 148px', alignItems: 'center', gap: 8, marginTop: 9 }}>
      <label style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-body)', lineHeight: 1.3 }}>
        {label}
        {reason && <MissingMark reason={reason} lang={chk.lang}/>}
        {note && <MissingMark reason={note} lang={chk.lang} testId="note-mark"/>}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {children}
        {unit && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', minWidth: 22 }}>{unit}</span>}
      </div>
    </div>
  );
}

const inputSt = { background: 'var(--surface-2)', border: '1px solid var(--border-2)',
  color: 'var(--text)', borderRadius: 5, padding: '5px 8px',
  fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none', width: '100%' };

// readOnly: a value that comes from elsewhere (e.g. the relay database)
const readOnlySt = { ...inputSt, background: 'var(--surface-3)', color: 'var(--text-dim)', cursor: 'default' };

// No default: a blank field shows blank and gives null (the value is missing,
// CTRequired marks it), never 0.
function NumInput({ value, onChange, min, max, step = 'any', readOnly, placeholder }) {
  return <input type="number" value={value ?? ''} min={min} max={max} step={step} readOnly={readOnly}
    placeholder={placeholder}
    onChange={e => { const x = parseFloat(e.target.value); onChange(Number.isFinite(x) ? x : null); }}
    style={readOnly ? readOnlySt : inputSt} />;
}

// A number that may be left blank: blank shows `placeholder` and gives null
// (the field is not set, so the calculation uses its own default).
function OptNumInput({ value, onChange, min, max, step = 'any', placeholder, readOnly }) {
  return <input type="number" value={value ?? ''} min={min} max={max} step={step} placeholder={placeholder}
    readOnly={readOnly}
    onChange={e => { const x = parseFloat(e.target.value); onChange(Number.isFinite(x) ? x : null); }}
    style={readOnly ? readOnlySt : inputSt} />;
}

// Nothing is pre-selected: a value that is not one of the options (unset)
// shows the placeholder, which cannot be picked back.
function SelectInput({ value, onChange, options, placeholder }) {
  const chk = React.useContext(InputCheck);
  placeholder = placeholder ?? (chk ? T(chk.lang, 'select_ph') : '\u2014');
  const has = value != null && options.some(([v]) => String(v) === String(value));
  return <select value={has ? value : ''} onChange={e => onChange(e.target.value)} style={inputSt}>
    {!has && <option value="" disabled>{placeholder}</option>}
    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>;
}

function TextInput({ value, onChange, placeholder, mono }) {
  return <input type="text" value={value} onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    style={{ ...inputSt, fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)' }} />;
}

// ── MetricCard ─────────────────────────────────────────────────────────────
// `compact` is for text values (e.g. the cable R method) that would not fit the
// numeric font size.
function MetricCard({ label, value, unit, ok, highlight, compact }) {
  const col = ok === true ? 'var(--green)' : ok === false ? 'var(--red)' : highlight ? 'var(--accent)' : 'var(--text)';
  return (
    <div style={{ background: 'var(--surface-2)', border: `1px solid ${ok===true?'var(--green)':ok===false?'var(--red)':'var(--border)'}`,
                   borderRadius: 7, padding: '9px 13px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-body)',
                     textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: compact ? 13 : 21, fontFamily: 'var(--font-mono)', fontWeight: 500, color: col,
                     lineHeight: compact ? 1.25 : 1 }}>
        {value ?? '—'}
        {unit && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 3 }}>{unit}</span>}
      </div>
    </div>
  );
}

// ── ResultsBoundary ────────────────────────────────────────────────────────
// Catches an error thrown while rendering the results panel, so that panel
// shows the error instead of the whole app unmounting (§10.6 F-GEN-UI). A new
// `resetKey` (another core, a recalculated result) renders the panel again.
class ResultsBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div data-testid="results-error" style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 7,
                     padding: '12px 14px', color: 'var(--red)', fontFamily: 'var(--font-body)', fontSize: 13 }}>
        {CTSI18n.t(this.props.lang, 'results_error')}
        <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{String(error?.message ?? error)}</div>
      </div>
    );
  }
}

// ── StatusBadge ────────────────────────────────────────────────────────────
function StatusBadge({ is_ok, lang }) {
  if (is_ok === undefined || is_ok === null) return null;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 13px',
                   borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
                   letterSpacing: '0.07em',
                   background: is_ok ? 'var(--green-bg)' : 'var(--red-bg)',
                   color: is_ok ? 'var(--green)' : 'var(--red)',
                   border: `1px solid ${is_ok ? 'var(--green)' : 'var(--red)'}`,
                   boxShadow: `0 0 10px ${is_ok ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)'}` }}>
      <Icon d={is_ok ? icons.check : icons.x} size={12} />
      {T(lang, is_ok ? 'res_ok' : 'res_fail')}
    </div>
  );
}

// ── FormulaStep ────────────────────────────────────────────────────────────
function FormulaStep({ step, lang }) {
  const katexRef = useRef(null);
  const isConc = step.is_conclusion;
  const bg  = isConc ? (step.is_ok ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--surface-2)';
  const bdr = isConc ? (step.is_ok ? 'var(--green)'    : 'var(--red)')    : 'var(--border)';

  useEffect(() => {
    if (katexRef.current && window.katex && step.latex) {
      try {
        // trust:false rejects \href, \url, \includegraphics and \html* (no
        // links or raw HTML can come out of a formula); maxExpand caps macro
        // expansion — the engine's formulas use no macros.
        katexRef.current.innerHTML = window.katex.renderToString(step.latex,
          { displayMode: false, throwOnError: false, output: 'html', trust: false, maxExpand: 100 });
      } catch { katexRef.current.textContent = step.latex; }
    }
  }, [step.latex]);

  return (
    <div style={{ background: bg, border: `1px solid ${bdr}`, borderRadius: 7, padding: '9px 13px',
                   display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                       textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
          {lang === 'da' ? step.label_da : step.label_en}
        </div>
        <div ref={katexRef} style={{ fontSize: 13, color: 'var(--text-dim)' }}>{step.latex}</div>
        {isConc && step.comparison && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, marginTop: 5,
                         color: step.is_ok ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
            {step.comparison}
          </div>
        )}
      </div>
      {!isConc && step.result !== null && step.result !== undefined && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: 'var(--accent)' }}>
            {typeof step.result === 'number' ? step.result.toFixed(step.precision ?? 4) : CTSReport.stepResultText(lang, step)}
          </span>
          {step.unit && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 3 }}>{step.unit}</span>}
        </div>
      )}
      {isConc && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, flexShrink: 0,
                       color: step.is_ok ? 'var(--green)' : 'var(--red)', textTransform: 'uppercase',
                       letterSpacing: '0.06em' }}>
          {T(lang, step.is_ok ? 'step_ok' : 'step_fail')}
        </div>
      )}
    </div>
  );
}

// ── WaveformCanvas — static single fault ────────────────────────────────
function WaveformCanvas({ params, theme, lang }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    canvas.width  = Math.round(rect.width  * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.getContext('2d').scale(dpr, dpr);
    CTSDraw.drawFaultWaveform(canvas, params, theme, lang);
  }, [params, theme, lang]);
  return <canvas ref={canvasRef} style={{ width:'100%', height:340, display:'block', borderRadius:6 }}/>;
}

// ── ArWaveformCanvas — C-O-C-O dual subplot ───────────────────────────────
function ArWaveformCanvas({ arParams, theme, lang }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    canvas.width  = Math.round(rect.width  * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.getContext('2d').scale(dpr, dpr);
    CTSDraw.drawArWaveform(canvas, arParams, theme, lang);
  }, [arParams, theme, lang]);
  return <canvas ref={canvasRef} style={{ width:'100%', height:340, display:'block', borderRadius:6 }}/>;
}

// ── SaturationChart ────────────────────────────────────────────────────────
function SaturationChart({ result, lang }) {
  const W=500, H=250, pl=58, pr=20, pt=16, pb=44;
  const cW=W-pl-pr, cH=H-pt-pb;
  if (!result || !result.ALF_act) return (
    <div style={{ height:H, display:'flex', alignItems:'center', justifyContent:'center',
                   color:'var(--text-muted)', fontFamily:'var(--font-mono)', fontSize:12 }}>
      {T(lang,'no_result')}
    </div>
  );
  const pts = CTCalc.satCurve(result);
  const { ALF_act, ALF_req, Esat, Esat_req, is_ok } = result;
  const maxA = pts[pts.length-1].alf, curveMaxE = pts[pts.length-1].e;
  const dataMaxE = Math.max(curveMaxE, Esat, Esat_req);
  const maxE = dataMaxE * 1.1; // 10% headroom
  const toX = a => pl + (a/maxA)*cW, toY = e => pt+cH - (e/maxE)*cH;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const linePts = pts.map((p,i) => `${i?'L':'M'}${toX(p.alf).toFixed(1)},${toY(p.e).toFixed(1)}`).join(' ');
  const areaD = linePts + ` L${toX(maxA)},${toY(0)} L${toX(0)},${toY(0)} Z`;
  const opX=toX(ALF_act), opY=toY(Esat), reqX=toX(ALF_req), reqY=toY(Esat_req);
  const opLblX = clamp(opX+9, pl, pl+cW-30), opLblY = clamp(opY+4, pt, pt+cH);
  const reqLblX = clamp(reqX+8, pl, pl+cW-30), reqLblY = clamp(reqY-8, pt, pt+cH);
  const dc = is_ok ? 'var(--green)' : 'var(--red)';
  const ax = 'var(--text-muted)';
  const yTx = [0,.25,.5,.75,1].map(r=>({ e:r*maxE, y:toY(r*maxE), l:(r*maxE).toFixed(0) }));
  const xTx = [0,.25,.5,.75,1].map(r=>({ a:r*maxA, x:toX(r*maxA), l:(r*maxA).toFixed(0) }));
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ fontFamily:'var(--font-mono)', display:'block' }}>
      <defs>
        <linearGradient id="sg2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity=".16" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity=".01" />
        </linearGradient>
        <filter id="dg2"><feGaussianBlur stdDeviation="3" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      {yTx.map(t=><line key={t.e} x1={pl} y1={t.y} x2={pl+cW} y2={t.y} stroke="var(--border)" strokeWidth=".5"/>)}
      {xTx.map(t=><line key={t.a} x1={t.x} y1={pt} x2={t.x} y2={pt+cH} stroke="var(--border)" strokeWidth=".5"/>)}
      <path d={areaD} fill="url(#sg2)" />
      <path d={linePts} fill="none" stroke="var(--accent)" strokeWidth="2" />
      <line x1={reqX} y1={pt} x2={reqX} y2={pt+cH} stroke={ax} strokeWidth="1" strokeDasharray="5,4"/>
      <line x1={pl} y1={reqY} x2={pl+cW} y2={reqY} stroke={ax} strokeWidth="1" strokeDasharray="5,4"/>
      <circle cx={reqX} cy={reqY} r="5" fill="var(--surface)" stroke={ax} strokeWidth="1.5"/>
      <text x={reqLblX} y={reqLblY} fontSize="9" fill={ax}>{T(lang,'chart_req')}</text>
      <circle cx={opX} cy={opY} r="7" fill={dc} opacity=".2" filter="url(#dg2)"/>
      <circle cx={opX} cy={opY} r="5" fill={dc}/>
      <text x={opLblX} y={opLblY} fontSize="9" fill={dc}>{T(lang,'chart_op')}</text>
      <line x1={pl} y1={pt} x2={pl} y2={pt+cH} stroke={ax} strokeWidth="1"/>
      <line x1={pl} y1={pt+cH} x2={pl+cW} y2={pt+cH} stroke={ax} strokeWidth="1"/>
      {yTx.map(t=><g key={t.e}><line x1={pl-4} y1={t.y} x2={pl} y2={t.y} stroke={ax} strokeWidth="1"/>
        <text x={pl-7} y={t.y+4} textAnchor="end" fontSize="9" fill={ax}>{t.l}</text></g>)}
      {xTx.map(t=><g key={t.a}><line x1={t.x} y1={pt+cH} x2={t.x} y2={pt+cH+4} stroke={ax} strokeWidth="1"/>
        <text x={t.x} y={pt+cH+14} textAnchor="middle" fontSize="9" fill={ax}>{t.l}</text></g>)}
      <text x={pl+cW/2} y={H-4} textAnchor="middle" fontSize="10" fill={ax}>{T(lang,'chart_x')}</text>
      <text x="12" y={pt+cH/2} textAnchor="middle" fontSize="10" fill={ax}
            transform={`rotate(-90,12,${pt+cH/2})`}>{T(lang,'chart_y')}</text>
    </svg>
  );
}

Object.assign(window, {
  Icon, icons, InlineEdit, useMobile,
  TopBar, Sidebar3, SNavItem, NewFeederDialog, FEEDER_PURPOSES, DEVICE_TYPE_LIST,
  SectionCard, FormRow, NumInput, OptNumInput, SelectInput, TextInput, InputCheck, MissingMark,
  MetricCard, StatusBadge, FormulaStep,
  WaveformCanvas, ArWaveformCanvas, SaturationChart,
});
