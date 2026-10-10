// ctsizer-app.jsx — Station → Feeder → Device → Core hierarchy
const { useState, useEffect, useCallback, useMemo, useRef } = React;

// ── Defaults ──────────────────────────────────────────────────────────────
const DEFAULT_SYSTEM = {
  station_name:'', station_abbr:'', voltage:132, freq:'50',
  isc_sys:20, tp:100, tp_confirmed:false,
  // Project-wide cable resistance settings (PORTING_PLAN.md §9.4): every core uses them.
  cable_r_method:'iec60287', cable_temp:75,
};
const DEFAULT_OC = { Ip:2000,Is:1,rct:4,burden:30,relay_burden:0.05,alf:20,is_px:false,vk:null,
  cable_length:100,cable_cross:4,cable_mat:'cu' };
const DEFAULT_MT = { Ip:1000,Is:1,rct:2,burden:5,fs_factor:5,min_safety_factor:5,
  min_burden_percent:25,device_burden:0,attached_resistor:0,
  cable_length:100,cable_cross:4,cable_mat:'cu' };
const DEFAULT_BB = { Ip:2000,Is:1,rct:4,burden:30,alf:20,relay_burden:0.02,
  cable_length:100,cable_cross:4,cable_mat:'cu' };
// VT defaults follow ctvt_dim's ui/vt_widget.py (class 0.2, 10 VA, 50 VA thermal, 150 m Cu 4 mm²);
// the cable temperature is the project's (DEFAULT_SYSTEM.cable_temp).
const DEFAULT_VT = { secondary_voltage:100, vt_class:'0.2', burden:10, thermal_burden:50,
  device_resistance:100, attached_resistor:0,
  cable_length:150, cable_cross:4, cable_mat:'cu' };
const CALC_DEFAULTS = { overcurrent:DEFAULT_OC, metering:DEFAULT_MT, busbar:DEFAULT_BB, vt:DEFAULT_VT };
const DEFAULT_SETTINGS = {
  full_name:'',initials:'',company_name:'',department:'',
  address:'',postal_code:'',city:'',country:'',
};

// Device type definitions — correct calc_type per device
const DEVICE_DEFS = {
  distance:         { cores:[{kind:'ct',calc_type:'distance',name:'CT Core 1'},{kind:'vt',calc_type:'vt',name:'VT Core 1'}] },
  overcurrent:      { cores:[{kind:'ct',calc_type:'overcurrent',name:'CT Core 1'}] },
  transformer_diff: { cores:[{kind:'ct',calc_type:'transformer_diff',name:'CT Core HV'},{kind:'ct',calc_type:'transformer_diff',name:'CT Core LV'}] },
  line_diff:        { cores:[{kind:'ct',calc_type:'line_diff',name:'CT Core 1'}] },
  busbar:           { cores:[{kind:'ct',calc_type:'busbar',name:'CT Core 1'}] },
  metering:         { cores:[{kind:'ct',calc_type:'metering',name:'CT Core 1'}] },
  custom:           { cores:[] },
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "themeMode": "light",
  "lang": "en"
}/*EDITMODE-END*/;

// ── Helpers ───────────────────────────────────────────────────────────────
let _uid = 0;
const uid = () => `id${++_uid}_${Date.now()}`;

function defaultInputs(calc_type) {
  return { ...(CALC_DEFAULTS[calc_type] || CALC_DEFAULTS.overcurrent) };
}

function makeCore(def) {
  return { id:uid(), name:def.name, kind:def.kind, calc_type:def.calc_type,
           inputs: defaultInputs(def.calc_type) };
}

function makeDevice(device_type, name) {
  const def = DEVICE_DEFS[device_type] || DEVICE_DEFS.custom;
  return { id:uid(), name: name || devLabel('en', device_type),
           device_type, cores: def.cores.map(makeCore) };
}

function devLabel(lang, type) {
  return CTSI18n.t(lang, `dev_${type}`) || type;
}

// A new feeder has the purpose (feeder_type) the user picked first, and only
// the devices they ticked (NewFeederDialog) — possibly none.
function makeFeeder({ feeder_type, name, device_types }) {
  return { id:uid(), name, feeder_type, devices:(device_types||[]).map(dt => makeDevice(dt)) };
}

// A new project starts without any feeder.
const DEFAULT_FEEDERS = [];

// ── Auto theme hook ───────────────────────────────────────────────────────
function useAutoTheme(mode) {
  const [sysDark, setSysDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = e => setSysDark(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return mode === 'auto' ? (sysDark ? 'dark' : 'light') : mode;
}

function useDebounced(val, ms=160) {
  const [dv,setDv] = useState(val);
  useEffect(() => { const id=setTimeout(()=>setDv(val),ms); return ()=>clearTimeout(id); }, [val,ms]);
  return dv;
}

function load(key, def) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? def; } catch { return def; }
}

// ── Template helpers ──────────────────────────────────────────────────────
function tplKey(kind) { return `ctsizer_tpl_${kind}`; }

function getTpls(kind)  { try { return JSON.parse(localStorage.getItem(tplKey(kind))||'[]'); } catch { return []; } }

function saveTpl(kind, name, data) {
  const tpls = getTpls(kind).filter(t => t.name !== name);
  tpls.unshift({ id:uid(), name, data, ts: Date.now() });
  localStorage.setItem(tplKey(kind), JSON.stringify(tpls.slice(0,20)));
}

function deleteTpl(kind, id) {
  localStorage.setItem(tplKey(kind), JSON.stringify(getTpls(kind).filter(t=>t.id!==id)));
}

// ── File API ──────────────────────────────────────────────────────────────
function doSave(state) {
  const blob = new Blob([JSON.stringify({version:'2.1',...state},null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${state.system.station_abbr||'project'}.ctvt`;
  a.click(); URL.revokeObjectURL(a.href);
}

function doOpen(file, cb) {
  const r = new FileReader();
  r.onload = e => { try { cb(JSON.parse(e.target.result)); } catch { alert('Invalid .ctvt file'); } };
  r.readAsText(file);
}

// ── App ───────────────────────────────────────────────────────────────────
// ctl (ctsizer-projects.jsx ProjectsGate): { projectId, toList, newProject, importFile }
function App({ ctl }) {
  const [themeMode, setThemeMode] = useState(() => load('ctsizer_theme', TWEAK_DEFAULTS.themeMode));
  const [lang,      setLang]      = useState(() => load('ctsizer_lang',  TWEAK_DEFAULTS.lang));
  const [system,    setSystem]    = useState(() => load('ctsizer_system', DEFAULT_SYSTEM));
  const [feeders,   setFeeders]   = useState(() => {
    const saved = load('ctsizer_feeders', null);
    // Migrate: old format had cores directly on feeders (no devices layer)
    if (!Array.isArray(saved) || (saved.length && !saved[0]?.devices)) return DEFAULT_FEEDERS;
    // Migrate: fix calc_type mismatch (cores created before DEVICE_DEFS fix)
    const typeMap = { distance:'distance', transformer_diff:'transformer_diff',
                      line_diff:'line_diff', busbar:'busbar', metering:'metering' };
    return saved.map(f => ({
      ...f,
      devices: f.devices.map(d => ({
        ...d,
        cores: d.cores.map(c => {
          const expected = typeMap[d.device_type];
          if (expected && c.calc_type === 'overcurrent' && d.device_type !== 'overcurrent') {
            return { ...c, calc_type: expected,
                     inputs: { ...defaultInputs(expected), ...c.inputs } };
          }
          return c;
        })
      }))
    }));
  });
  const [settings,  setSettings]  = useState(() => load('ctsizer_settings', DEFAULT_SETTINGS));
  const [projName,  setProjName]  = useState(() => load('ctsizer_projname', 'Untitled Project'));
  // Report document fields (doc no., revision, checked by …), ctsizer-export.jsx
  const [report,    setReport]    = useState(() => load('ctsizer_report', {}));

  // Selection: { feederId, deviceId, coreId } — null values = higher-level selection
  const [sel, setSel] = useState({ feederId: feeders[0]?.id,
    deviceId: feeders[0]?.devices?.[0]?.id, coreId: feeders[0]?.devices?.[0]?.cores?.[0]?.id });
  const [navActive, setNavActive] = useState('ct');
  const [showTweaks,setShowTweaks]= useState(false);
  const [showFeedback,setShowFeedback] = useState(false);
  const [showExport,setShowExport] = useState(false);
  const [showNewFeeder,setShowNewFeeder] = useState(false);

  const theme = useAutoTheme(themeMode);

  // ── Persist ──
  useEffect(()=>{ localStorage.setItem('ctsizer_theme',    JSON.stringify(themeMode)); },[themeMode]);
  useEffect(()=>{ localStorage.setItem('ctsizer_lang',     JSON.stringify(lang));      },[lang]);
  useEffect(()=>{ localStorage.setItem('ctsizer_system',   JSON.stringify(system));    },[system]);
  useEffect(()=>{ localStorage.setItem('ctsizer_feeders',  JSON.stringify(feeders));   },[feeders]);
  useEffect(()=>{ localStorage.setItem('ctsizer_settings', JSON.stringify(settings));  },[settings]);
  useEffect(()=>{ localStorage.setItem('ctsizer_projname', JSON.stringify(projName));  },[projName]);
  useEffect(()=>{ localStorage.setItem('ctsizer_report',   JSON.stringify(report));    },[report]);
  useEffect(()=>{ document.documentElement.setAttribute('data-theme', theme);     },[theme]);

  // ── Activity log for "Give feedback" (ctsizer-activity.js) ──
  // Every state change is diffed against the previous state, so each edit is
  // logged without instrumenting the individual handlers. Opening a project
  // replaces the whole state; that is logged once instead of as a diff.
  const prevState = useRef({ system, feeders });
  const skipDiff  = useRef(false);
  useEffect(() => {
    if (!skipDiff.current) {
      CTSActivity.diffSystem(prevState.current.system, system);
      CTSActivity.diffFeeders(prevState.current.feeders, feeders);
    }
    skipDiff.current = false;
    prevState.current = { system, feeders };
  }, [system, feeders]);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    CTSActivity.log('settings', 'Language / theme', { key: 'lang_theme', to: `${lang} / ${themeMode}` });
  }, [lang, themeMode]);

  // ── Tweaks bridge ──
  useEffect(() => {
    const h = e => {
      if (e.data?.type==='__activate_edit_mode')   setShowTweaks(true);
      if (e.data?.type==='__deactivate_edit_mode') setShowTweaks(false);
    };
    window.addEventListener('message', h);
    window.parent?.postMessage({type:'__edit_mode_available'},'*');
    return () => window.removeEventListener('message', h);
  }, []);
  useEffect(()=>{ window.parent?.postMessage({type:'__edit_mode_set_keys',edits:{themeMode,lang}},'*'); },[themeMode,lang]);

  // ── Feeder management ──
  // spec: { tpl } (bay template) or { feeder_type, name, device_types } (NewFeederDialog)
  const addFeeder = spec => {
    const f = spec.tpl ? { ...spec.tpl.data, id:uid(), feeder_type: spec.tpl.data.feeder_type || 'line',
      devices: spec.tpl.data.devices.map(d=>({...d, id:uid(),
        cores:d.cores.map(c=>({...c,id:uid()}))})) }
      : makeFeeder(spec);
    setFeeders(fs=>[...fs,f]);
    setSel({ feederId:f.id, deviceId:f.devices[0]?.id, coreId:f.devices[0]?.cores[0]?.id });
    setNavActive('ct');
    setShowNewFeeder(false);
  };

  const removeFeeder = fid => {
    setFeeders(fs=>fs.filter(f=>f.id!==fid));
    if (sel.feederId===fid) setSel({});
  };

  const saveFeederTpl = (fid, name) => {
    const f = feeders.find(f=>f.id===fid);
    if (f) saveTpl('feeders', name, f);
  };

  // ── Rename ──
  const renameFeeder = useCallback((fid, name) => {
    setFeeders(fs=>fs.map(f=> f.id!==fid ? f : {...f, name}));
  }, []);

  const setFeederType = useCallback((fid, feeder_type) => {
    setFeeders(fs=>fs.map(f=> f.id!==fid ? f : {...f, feeder_type}));
  }, []);

  const renameDevice = useCallback((fid, did, name) => {
    setFeeders(fs=>fs.map(f=> f.id!==fid ? f : {
      ...f, devices:f.devices.map(d=> d.id!==did ? d : {...d, name})
    }));
  }, []);

  const renameCore = useCallback((fid, did, cid, name) => {
    setFeeders(fs=>fs.map(f=> f.id!==fid ? f : {
      ...f, devices:f.devices.map(d=> d.id!==did ? d : {
        ...d, cores:d.cores.map(c=> c.id!==cid ? c : {...c, name})
      })
    }));
  }, []);

  // ── Device management ──
  const addDevice = (fid, device_type) => {
    const d = makeDevice(device_type);
    setFeeders(fs=>fs.map(f=> f.id!==fid ? f : {...f, devices:[...f.devices,d]}));
    setSel({ feederId:fid, deviceId:d.id, coreId:d.cores[0]?.id });
  };

  const removeDevice = (fid, did) => {
    setFeeders(fs=>fs.map(f=> f.id!==fid ? f : {...f, devices:f.devices.filter(d=>d.id!==did)}));
    if (sel.deviceId===did) setSel({feederId:fid});
  };

  // ── Core management ──
  const addCore = (fid, did, kind) => {
    const calc_type = kind==='vt' ? 'vt' : 'overcurrent';
    const c = makeCore({ kind, calc_type, name: kind==='vt'?'VT Core':'CT Core' });
    setFeeders(fs=>fs.map(f=> f.id!==fid ? f : {
      ...f, devices:f.devices.map(d=> d.id!==did ? d : {...d, cores:[...d.cores,c]})
    }));
    setSel({ feederId:fid, deviceId:did, coreId:c.id });
  };

  const removeCore = (fid, did, cid) => {
    setFeeders(fs=>fs.map(f=> f.id!==fid ? f : {
      ...f, devices:f.devices.map(d=> d.id!==did ? d : {
        ...d, cores:d.cores.filter(c=>c.id!==cid) })
    }));
    if (sel.coreId===cid) setSel({feederId:fid,deviceId:did});
  };

  const updateCore = useCallback((fid, did, cid, newInputs, newCalcType) => {
    setFeeders(fs=>fs.map(f=> f.id!==fid ? f : {
      ...f, devices:f.devices.map(d=> d.id!==did ? d : {
        ...d, cores:d.cores.map(c=> c.id!==cid ? c : {
          ...c,
          calc_type: newCalcType ?? c.calc_type,
          inputs: newCalcType ? defaultInputs(newCalcType) : newInputs,
        })
      })
    }));
  }, []);

  const saveCTTpl = (name, calc_type, inputs) => saveTpl('ct', name, { calc_type, inputs });

  const loadCTTpl = useCallback((fid, did, cid, tpl) => {
    setFeeders(fs=>fs.map(f=> f.id!==fid ? f : {
      ...f, devices:f.devices.map(d=> d.id!==did ? d : {
        ...d, cores:d.cores.map(c=> c.id!==cid ? c : {
          ...c, calc_type:tpl.data.calc_type, inputs:{...tpl.data.inputs}
        })
      })
    }));
  }, []);

  // ── Active objects ──
  const activeFeeder = feeders.find(f=>f.id===sel.feederId);
  const activeDevice = activeFeeder?.devices.find(d=>d.id===sel.deviceId);
  const activeCore   = activeDevice?.cores.find(c=>c.id===sel.coreId);

  // ── Calculations (all cores) ──
  const dFeeders = useDebounced(feeders);
  const dSystem  = useDebounced(system);

  const results = useMemo(() => {
    const out={};
    dFeeders.forEach(f=>f.devices.forEach(d=>d.cores.forEach(c=>{
      const key=`${f.id}-${d.id}-${c.id}`;
      out[key] = CTCalc.calculate(c.calc_type, c.inputs, dSystem);
    })));
    return out;
  }, [dFeeders, dSystem]);

  const activeResult = activeCore
    ? results[`${sel.feederId}-${sel.deviceId}-${sel.coreId}`] : null;

  const selectionText = () => {
    if (navActive==='station')  return 'Station Data';
    if (navActive==='settings') return 'Settings';
    const parts = [activeFeeder?.name, activeDevice?.name,
                   activeCore && `${activeCore.name} (${activeCore.calc_type})`].filter(Boolean);
    return parts.length ? parts.join(' › ') : null;
  };
  useEffect(() => {
    const s = selectionText();
    if (s) CTSActivity.log('nav', `Viewing ${s}`);
  }, [navActive, sel.feederId, sel.deviceId, sel.coreId]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Context handed to the feedback report (never the personal `settings`).
  const feedbackContext = () => ({
    lang, theme, projName, system, feeders, selection: selectionText(),
    summary: feeders.flatMap(f => f.devices.flatMap(d => d.cores.map(c => {
      const r = results[`${f.id}-${d.id}-${c.id}`];
      return { feeder:f.name, device:d.name, core:c.name, calc_type:c.calc_type,
               status: r ? (r.is_ok ? 'OK' : 'FAIL') : 'no result',
               metric: getCoreKeyMetric(c.calc_type, r, 'en') };
    }))),
  });

  // ── File ops ──
  const handleSave = () => {
    CTSActivity.log('file', `Saved project "${projName}"`);
    doSave({system,feeders,settings,projName,report});
  };
  // Opening a file adds it to the project list as a new project and switches to it.
  const handleOpen = file => doOpen(file, data => {
    CTSActivity.log('file', `Opened project file "${file.name}" (version ${data.version ?? '—'}, ` +
      `${data.feeders?.length ?? 0} bays)`);
    if (!ctl.importFile(data, file.name)) alert('Invalid .ctvt file');
  });

  const T = k => CTSI18n.t(lang, k);

  // ── View logic ──
  const isStation  = navActive==='station';
  const isSettings = navActive==='settings';
  const showCore   = !isStation && !isSettings && !!activeCore;
  const showDevice = !isStation && !isSettings && !activeCore && !!activeDevice;
  const showFeeder = !isStation && !isSettings && !activeCore && !activeDevice && !!activeFeeder;

  return (
    <div style={{height:'100vh',display:'flex',flexDirection:'column',background:'var(--bg)',overflow:'hidden'}}>
      <TopBar lang={lang} setLang={setLang} themeMode={themeMode} setThemeMode={setThemeMode}
        projectName={projName} setProjectName={setProjName} onSave={handleSave} onOpen={handleOpen}
        onProjects={() => ctl.toList()}
        onNew={() => { CTSActivity.log('file', 'New project'); ctl.newProject(); }}
        onExport={() => { CTSActivity.log('file', 'Opened RTF export dialog'); setShowExport(true); }}
        onFeedback={() => { CTSActivity.log('feedback', 'Opened feedback dialog'); setShowFeedback(true); }}/>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        <Sidebar3
          lang={lang} navActive={navActive} setNavActive={setNavActive}
          feeders={feeders} sel={sel}
          onNavSelect={nav => { setNavActive(nav); setSel({}); }}
          onCoreSelect={s  => { setSel(s); setNavActive('ct'); }}
          onAddFeeder={() => setShowNewFeeder(true)} removeFeeder={removeFeeder} saveFeederTpl={saveFeederTpl}
          addDevice={addDevice} removeDevice={removeDevice}
          addCore={addCore} removeCore={removeCore}
          renameFeeder={renameFeeder} renameDevice={renameDevice} renameCore={renameCore}
          setFeederType={setFeederType}
          results={results}
        />

        <main style={{flex:1,overflow:'auto',padding:20}}>

          {isStation && (
            <div style={{maxWidth:600}}>
              <SystemPanel lang={lang} v={system} onChange={setSystem}/>
            </div>
          )}

          {isSettings && (
            <SettingsPanel lang={lang} setLang={setLang} themeMode={themeMode}
              setThemeMode={setThemeMode} settings={settings} setSettings={setSettings}/>
          )}

          {showFeeder && (
            <FeederOverview lang={lang} feeder={activeFeeder} results={results}
              sel={sel} setSel={s=>{ setSel(s); setNavActive('ct'); }}
              setFeederType={setFeederType} addDevice={addDevice}/>
          )}

          {showDevice && (
            <DeviceOverview lang={lang} device={activeDevice} feeder={activeFeeder}
              results={results} sel={sel} setSel={s=>{ setSel(s); setNavActive('ct'); }}/>
          )}

          {showCore && (
            <div style={{display:'grid',gridTemplateColumns:'400px 1fr',gap:20,maxWidth:1300,margin:'0 auto'}}>
              <CoreInputPanel
                lang={lang} core={activeCore} systemVals={system}
                onChange={(inp,ct)=>updateCore(sel.feederId,sel.deviceId,sel.coreId,inp,ct)}
                onSaveCTTpl={(name)=>saveCTTpl(name, activeCore.calc_type, activeCore.inputs)}
                onLoadCTTpl={(tpl)=>loadCTTpl(sel.feederId,sel.deviceId,sel.coreId,tpl)}
              />
              <ResultsBoundary lang={lang} resetKey={activeResult}>
                <ResultsPanel lang={lang} result={activeResult} core={activeCore}
                  systemVals={system} theme={theme}/>
              </ResultsBoundary>
            </div>
          )}

          {!isStation && !isSettings && feeders.length===0 && (
            <EmptyProject lang={lang} onAddFeeder={() => setShowNewFeeder(true)}
              onStation={() => { setNavActive('station'); setSel({}); }}/>
          )}

          {!isStation && !isSettings && feeders.length>0 && !showCore && !showDevice && !showFeeder && (
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',
                          color:'var(--text-muted)',fontFamily:'var(--font-mono)',fontSize:13}}>
              Select a bay or core from the sidebar
            </div>
          )}
        </main>
      </div>

      {showNewFeeder && (
        <NewFeederDialog lang={lang} feeders={feeders} onCreate={addFeeder}
          onCancel={() => setShowNewFeeder(false)}/>
      )}

      {showFeedback && (
        <FeedbackDialog lang={lang} onClose={() => setShowFeedback(false)} getContext={feedbackContext}/>
      )}

      {showExport && (
        <ExportDialog lang={lang} onClose={() => setShowExport(false)}
          report={report} setReport={setReport} settings={settings} system={system}
          feeders={feeders} results={results} projName={projName}
          metrics={(type, r, l) => withCableMethod(buildMetrics(type, r, l) || [], r, l)}
          onOpenSettings={() => { setShowExport(false); setNavActive('settings'); setSel({}); }}/>
      )}

      {/* Tweaks */}
      {showTweaks && (
        <div style={{position:'fixed',bottom:24,right:24,width:220,background:'var(--surface)',
                      border:'1px solid var(--border-2)',borderRadius:10,padding:16,zIndex:9999,
                      boxShadow:'0 8px 32px rgba(0,0,0,0.25)',display:'flex',flexDirection:'column',gap:14}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontFamily:'var(--font-head)',fontWeight:700,fontSize:13,color:'var(--text)'}}>Tweaks</span>
            <button style={{background:'none',border:'none',color:'var(--text-muted)',fontSize:18,
                              cursor:'pointer',lineHeight:1}} onClick={()=>setShowTweaks(false)}>×</button>
          </div>
          {[{label:'Theme',opts:['light','dark','auto'],val:themeMode,set:setThemeMode},
            {label:'Language',opts:['en','da'],val:lang,set:setLang}].map(row=>(
            <div key={row.label} style={{display:'flex',flexDirection:'column',gap:5}}>
              <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)',
                             textTransform:'uppercase',letterSpacing:'0.06em'}}>{row.label}</div>
              <div style={{display:'flex',gap:5}}>
                {row.opts.map(o=>(
                  <button key={o} onClick={()=>row.set(o)}
                    style={{flex:1,padding:'4px 0',borderRadius:5,cursor:'pointer',fontSize:11,
                              fontFamily:'var(--font-mono)',fontWeight:600,
                              background:row.val===o?'var(--accent-glow)':'var(--surface-2)',
                              color:row.val===o?'var(--accent)':'var(--text-muted)',
                              border:`1px solid ${row.val===o?'var(--accent)':'var(--border-2)'}`,
                              transition:'all 0.15s'}}>{o}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Feeder overview ────────────────────────────────────────────────────────
function FeederOverview({ lang, feeder, results, sel, setSel, setFeederType, addDevice }) {
  const T = k => CTSI18n.t(lang, k);
  const FEEDER_TYPES = FEEDER_PURPOSES.map(p => p.id);
  const ft = feeder.feeder_type || 'line';
  const scheme = typeof CTSDraw !== 'undefined' ? CTSDraw.SCHEMES[ft] : '';

  // Aggregate status across all devices
  const allCores = feeder.devices.flatMap(d => d.cores.map(c => ({...c,deviceId:d.id,deviceName:d.name})));
  const totalCores = allCores.length;
  const okCores = allCores.filter(c => results[`${sel.feederId}-${c.deviceId}-${c.id}`]?.is_ok).length;
  const overallOk = totalCores > 0 && okCores === totalCores;

  return (
    <div style={{maxWidth:860,display:'grid',gridTemplateColumns:'200px 1fr',gap:20,alignItems:'start'}}>
      {/* Left: Protection scheme diagram */}
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:14}}>
        <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)',
                       textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>
          {T('bay_purpose')}
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
          {FEEDER_TYPES.map(ft2 => (
            <button key={ft2} onClick={()=>setFeederType(feeder.id,ft2)}
              style={{padding:'3px 8px',borderRadius:4,border:'none',cursor:'pointer',fontSize:10,
                       fontFamily:'var(--font-mono)',fontWeight:ft===ft2?700:400,textTransform:'uppercase',
                       background:ft===ft2?'var(--accent-glow)':'var(--surface-3)',
                       color:ft===ft2?'var(--accent)':'var(--text-muted)',
                       boxShadow:ft===ft2?'0 0 0 1px var(--accent)':'none'}}>
              {T(`purpose_${ft2}`)}
            </button>
          ))}
        </div>
        {scheme && (
          <svg width="200" height={ft==='transformer'?140:110} viewBox={`0 0 200 ${ft==='transformer'?140:110}`}
               style={{display:'block'}} dangerouslySetInnerHTML={{__html:scheme}}/>
        )}
      </div>

      {/* Right: Device + core summaries */}
      <div>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
          <h2 style={{fontFamily:'var(--font-head)',fontSize:20,fontWeight:700,color:'var(--text)'}}>{feeder.name}</h2>
          {totalCores > 0 && <div style={{fontFamily:'var(--font-mono)',fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:5,
                         background:overallOk?'var(--green-bg)':'var(--red-bg)',
                         color:overallOk?'var(--green)':'var(--red)',
                         border:`1px solid ${overallOk?'var(--green)':'var(--red)'}`}}>
            {okCores}/{totalCores} {T('res_ok')}
          </div>}
        </div>

        {feeder.devices.length===0 && (
          <div style={{background:'var(--surface)',border:'1px dashed var(--border-2)',borderRadius:8,padding:14}}>
            <div style={{fontSize:13,color:'var(--text-dim)',marginBottom:10}}>{T('empty_bay')}</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {purposeDevices(ft).map(({type, rec}) => (
                <button key={type} onClick={()=>addDevice(feeder.id, type)}
                  style={{padding:'5px 10px',borderRadius:5,cursor:'pointer',fontSize:11,fontFamily:'var(--font-mono)',
                           background:rec?'var(--accent-glow)':'var(--surface-3)',color:rec?'var(--accent)':'var(--text-dim)',
                           border:`1px solid ${rec?'var(--accent)':'var(--border-2)'}`}}>
                  + {T(`dev_${type}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        {feeder.devices.map(d => {
          const dCores = d.cores.map(c => ({ ...c, res: results[`${sel.feederId}-${d.id}-${c.id}`] }));
          const dOk = dCores.every(c => c.res?.is_ok);
          const dAny = dCores.some(c => c.res);
          return (
            <div key={d.id} style={{background:'var(--surface)',border:`1px solid ${dAny?(dOk?'var(--green)':'var(--red)'):'var(--border)'}`,
                                      borderRadius:8,padding:14,marginBottom:10}}>
              {/* Device header */}
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                <span style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)',
                               background:'var(--surface-3)',padding:'2px 7px',borderRadius:4}}>
                  {T(`dev_${d.device_type}`)}
                </span>
                <span style={{fontFamily:'var(--font-head)',fontSize:14,fontWeight:600,color:'var(--text)'}}>{d.name}</span>
                {dAny && (
                  <span style={{marginLeft:'auto',fontFamily:'var(--font-mono)',fontSize:10,fontWeight:700,
                                 color:dOk?'var(--green)':'var(--red)'}}>
                    {dOk?'✓ PASS':'✗ FAIL'}
                  </span>
                )}
              </div>
              {/* Core cards */}
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {dCores.map(c => {
                  const dc = c.res ? (c.res.is_ok?'var(--green)':'var(--red)') : 'var(--border-2)';
                  const key_metric = getCoreKeyMetric(c.calc_type, c.res, lang);
                  return (
                    <button key={c.id}
                      onClick={()=>setSel({feederId:sel.feederId,deviceId:d.id,coreId:c.id})}
                      style={{display:'flex',flexDirection:'column',gap:4,padding:'10px 14px',borderRadius:7,
                               background:'var(--surface-2)',border:`1px solid ${dc}`,cursor:'pointer',
                               minWidth:140,textAlign:'left'}}>
                      <div style={{fontFamily:'var(--font-mono)',fontSize:9,color:'var(--text-muted)',textTransform:'uppercase'}}>
                        {c.kind==='vt'?'VT Core':'CT Core'} · {c.calc_type}
                      </div>
                      <div style={{fontFamily:'var(--font-head)',fontSize:13,fontWeight:600,color:'var(--text)'}}>{c.name}</div>
                      {key_metric && (
                        <div style={{fontFamily:'var(--font-mono)',fontSize:11,color:dc,fontWeight:600}}>{key_metric}</div>
                      )}
                      <div style={{fontFamily:'var(--font-mono)',fontSize:10,fontWeight:700,
                                     color:dc,textTransform:'uppercase'}}>
                        {c.res ? (c.res.is_ok ? T('res_ok') : T('res_fail')) : '—'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Empty project: no feeder yet ───────────────────────────────────────────
function EmptyProject({ lang, onAddFeeder, onStation }) {
  const T = k => CTSI18n.t(lang, k);
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'60vh'}}>
      <div style={{maxWidth:520,textAlign:'center',display:'flex',flexDirection:'column',gap:14,alignItems:'center',
                   background:'var(--surface)',border:'1px dashed var(--border-2)',borderRadius:12,padding:'32px 28px'}}>
        <h2 style={{fontFamily:'var(--font-head)',fontSize:20,fontWeight:700,color:'var(--text)'}}>{T('empty_project_h')}</h2>
        <p style={{fontSize:13,lineHeight:1.6,color:'var(--text-dim)'}}>{T('empty_project')}</p>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',justifyContent:'center'}}>
          <button onClick={onAddFeeder}
            style={{padding:'8px 18px',borderRadius:6,border:'none',cursor:'pointer',background:'var(--accent)',
                     color:'#fff',fontFamily:'var(--font-head)',fontSize:13,fontWeight:600}}>
            {T('add_feeder')}
          </button>
          <button onClick={onStation}
            style={{padding:'8px 18px',borderRadius:6,border:'1px solid var(--border-2)',cursor:'pointer',
                     background:'var(--surface-2)',color:'var(--text-dim)',fontFamily:'var(--font-head)',fontSize:13,fontWeight:600}}>
            {T('empty_project_station')}
          </button>
        </div>
      </div>
    </div>
  );
}

function getCoreKeyMetric(calc_type, res, lang) {
  if (!res) return null;
  const T = k => CTSI18n.t(lang, k);
  if (calc_type==='overcurrent')      return `ALF ${res.ALF_act?.toFixed(2)} / ${res.ALF_req?.toFixed(2)} req`;
  if (calc_type==='metering')         return `Fsa ${res.Fsa?.toFixed(2)} / Fmin req`;
  if (calc_type==='busbar' && res.is_px) return `Vk ${res.vk?.toFixed(1)}V / ${res.vk_required?.toFixed(1)}V req`;
  if (calc_type==='busbar')           return `Fa ${res.f_a?.toFixed(2)} / ${res.fault_ratio?.toFixed(2)} req`;
  if (calc_type==='distance')         return `${res.EALF?.toFixed(1)}V / ${res.Vk_req?.toFixed(1)}V req`;
  if (calc_type==='transformer_diff' && res.isc_int_missing) return T('metric_isc_int_missing');
  if (calc_type==='transformer_diff') return `${res.EALF?.toFixed(1)}V / ${res.Vk_req?.toFixed(1)}V req`;
  if (calc_type==='line_diff')        return `${res.EALF?.toFixed(1)}V / ${res.Vk_req?.toFixed(1)}V req`;
  return null;
}

// ── Device overview ────────────────────────────────────────────────────────
function DeviceOverview({ lang, device, feeder, results, sel, setSel }) {
  const T = k => CTSI18n.t(lang, k);
  const dCores = device.cores.map(c => ({...c, res: results[`${sel.feederId}-${device.id}-${c.id}`]}));
  const allOk = dCores.every(c => c.res?.is_ok);
  const anyRes = dCores.some(c => c.res);

  return (
    <div style={{maxWidth:700}}>
      <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text-muted)',marginBottom:4}}>
        {feeder.name} · {T(`dev_${device.device_type}`)}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:18}}>
        <h2 style={{fontFamily:'var(--font-head)',fontSize:20,fontWeight:700,color:'var(--text)'}}>{device.name}</h2>
        {anyRes && (
          <span style={{fontFamily:'var(--font-mono)',fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:5,
                         background:allOk?'var(--green-bg)':'var(--red-bg)',
                         color:allOk?'var(--green)':'var(--red)',
                         border:`1px solid ${allOk?'var(--green)':'var(--red)'}`}}>
            {allOk?'✓ ALL PASS':'✗ ISSUES'}
          </span>
        )}
      </div>
      <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
        {dCores.length===0 && (
          <p style={{color:'var(--text-muted)',fontFamily:'var(--font-body)',fontSize:13}}>{T('overview_no_cores')}</p>
        )}
        {dCores.map(c => {
          const dc = c.res ? (c.res.is_ok?'var(--green)':'var(--red)') : 'var(--border-2)';
          const km = getCoreKeyMetric(c.calc_type, c.res, lang);
          return (
            <button key={c.id} onClick={()=>setSel({feederId:sel.feederId,deviceId:device.id,coreId:c.id})}
              style={{display:'flex',flexDirection:'column',gap:5,padding:'14px 18px',borderRadius:9,
                       background:'var(--surface)',border:`1px solid ${dc}`,cursor:'pointer',minWidth:160,textAlign:'left'}}>
              <span style={{fontFamily:'var(--font-mono)',fontSize:9,color:'var(--text-muted)',textTransform:'uppercase'}}>
                {c.kind==='vt'?'VT Core':'CT Core'} · {c.calc_type}
              </span>
              <span style={{fontFamily:'var(--font-head)',fontSize:15,fontWeight:600,color:'var(--text)'}}>{c.name}</span>
              {km && <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--text-dim)'}}>{km}</span>}
              <span style={{fontFamily:'var(--font-mono)',fontSize:11,fontWeight:700,color:dc,textTransform:'uppercase'}}>
                {c.res?(c.res.is_ok?T('res_ok'):T('res_fail')):'—'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Export FeederOverview, DeviceOverview for ctsizer-components to use
Object.assign(window, { FeederOverview, DeviceOverview, DEVICE_DEFS, makeDevice, devLabel,
  getTpls, saveTpl, deleteTpl, defaultInputs });

// Landing page → Terms and Conditions → project list → the chosen project.
ReactDOM.createRoot(document.getElementById('root')).render(
  <LandingGate>
    <TermsGate>
      <ProjectsGate render={ctl => <App key={ctl.mountKey} ctl={ctl}/>}/>
    </TermsGate>
  </LandingGate>
);
