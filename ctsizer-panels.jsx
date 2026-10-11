// ctsizer-panels.jsx
const { useState, useMemo } = React;
const Tp = (lang, k) => CTSI18n.t(lang, k);
const inputSt = { background:'var(--surface-2)', border:'1px solid var(--border-2)',
  color:'var(--text)', borderRadius:5, padding:'5px 8px',
  fontFamily:'var(--font-mono)', fontSize:12, outline:'none', width:'100%' };

// ── Shared cable section ──────────────────────────────────────────────────
// Per-core cable run and wiring. The method and the conductor temperature are
// project settings (SystemPanel, PORTING_PLAN.md §9.4). The wiring is per core
// (core.cable_topology, default from the calc type, §9.8), with a help picture.
function CableSection({ lang, v, set, calcType }) {
  const topology = CTCalc.cableRes.resolveTopology(v, calcType);
  return (
    <SectionCard title={Tp(lang,'section_cable')} defaultOpen={false}>
      <div style={{ paddingTop: 8 }}>
        <FormRow label={Tp(lang,'lbl_cable_length')} unit="m">
          <NumInput value={v.cable_length??100} onChange={x=>set('cable_length',x)} min={0} max={5000} step={1}/>
        </FormRow>
        <FormRow label={Tp(lang,'lbl_cable_cross')} unit="mm²">
          <SelectInput value={v.cable_cross??4} onChange={x=>set('cable_cross',parseFloat(x))}
            options={[['1.5','1.5'],['2.5','2.5'],['4','4'],['6','6'],['10','10'],['16','16'],['25','25'],['35','35'],['50','50']]}/>
        </FormRow>
        <FormRow label={Tp(lang,'lbl_cable_mat')}>
          <SelectInput value={v.cable_mat??'cu'} onChange={x=>set('cable_mat',x)}
            options={[['cu',Tp(lang,'lbl_cu')],['al',Tp(lang,'lbl_al')]]}/>
        </FormRow>
        <FormRow label={Tp(lang,'lbl_cable_topology')}>
          <SelectInput value={topology} onChange={x=>set('cable_topology',x)}
            options={CTCalc.cableRes.listTopologies().map(t=>[t.id, lang==='da'?t.label_da:t.label_en])}/>
        </FormRow>
        <WiringDiagram lang={lang} topology={topology} calcType={calcType}/>
      </div>
    </SectionCard>
  );
}

// ── CT Type selector tab bar ──────────────────────────────────────────────
function TypeSelector({ lang, type, setType }) {
  const types = [
    { id:'overcurrent',      label: Tp(lang,'ct_type_overcurrent'),      ready:true  },
    { id:'metering',         label: Tp(lang,'ct_type_metering'),         ready:true  },
    { id:'busbar',           label: Tp(lang,'ct_type_busbar'),           ready:true  },
    { id:'distance',         label: Tp(lang,'ct_type_distance'),         ready:true  },
    { id:'transformer_diff', label: Tp(lang,'ct_type_transformer_diff'), ready:true  },
    { id:'line_diff',        label: Tp(lang,'ct_type_line_diff'),        ready:true  },
  ];
  return (
    <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:12 }}>
      {types.map(t => (
        <button key={t.id} onClick={() => t.ready && setType(t.id)}
          style={{ padding:'4px 10px', borderRadius:5, border:'none', cursor: t.ready?'pointer':'default',
                   fontFamily:'var(--font-mono)', fontSize:11, fontWeight: type===t.id?700:400,
                   background: type===t.id ? 'var(--accent-glow)' : 'var(--surface-3)',
                   color: type===t.id ? 'var(--accent)' : t.ready ? 'var(--text-dim)' : 'var(--text-muted)',
                   opacity: t.ready?1:0.5,
                   boxShadow: type===t.id ? '0 0 0 1px var(--accent)' : 'none' }}>
          {t.label}{!t.ready && <span style={{fontSize:8,marginLeft:4,opacity:0.6}}>↗</span>}
        </button>
      ))}
    </div>
  );
}

// ── System Data Panel ────────────────────────────────────────────────────
function SystemPanel({ lang, v, onChange }) {
  const set = (k,x) => onChange({...v,[k]:x});
  return (
    <SectionCard title={Tp(lang,'section_system')} defaultOpen>
      <div style={{paddingTop:8}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <FormRow label={Tp(lang,'lbl_station_name')}>
            <input type="text" value={v.station_name||''} onChange={e=>set('station_name',e.target.value)}
              placeholder={Tp(lang,'placeholder_name')}
              style={{background:'var(--surface-2)',border:'1px solid var(--border-2)',color:'var(--text)',
                      borderRadius:5,padding:'5px 8px',fontFamily:'var(--font-body)',fontSize:12,width:'100%',outline:'none'}}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_station_abbr')}>
            <input type="text" value={v.station_abbr||''} maxLength={12}
              onChange={e=>set('station_abbr',e.target.value.toUpperCase())}
              placeholder={Tp(lang,'placeholder_abbr')}
              style={{background:'var(--surface-2)',border:'1px solid var(--border-2)',color:'var(--accent)',
                      borderRadius:5,padding:'5px 8px',fontFamily:'var(--font-mono)',fontSize:12,width:'100%',outline:'none',letterSpacing:'0.08em'}}/>
          </FormRow>
        </div>
        <FormRow label={Tp(lang,'lbl_voltage')} unit="kV">
          <NumInput value={v.voltage??132} onChange={x=>set('voltage',x)} min={0} max={1200}/>
        </FormRow>
        <FormRow label={Tp(lang,'lbl_freq')} unit="Hz">
          <SelectInput value={v.freq??'50'} onChange={x=>set('freq',x)} options={[['50','50 Hz'],['60','60 Hz']]}/>
        </FormRow>
        <FormRow label={Tp(lang,'lbl_isc_sys')} unit="kA">
          <NumInput value={v.isc_sys??20} onChange={x=>set('isc_sys',x)} min={0} max={200} step={0.1}/>
        </FormRow>
        <div style={{display:'flex',alignItems:'flex-end',gap:10}}>
          <div style={{flex:1}}>
            <FormRow label={Tp(lang,'lbl_tp')} unit="ms">
              <NumInput value={v.tp??100} onChange={x=>set('tp',x)} min={1} max={500} step={1}/>
            </FormRow>
          </div>
          <label style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',paddingBottom:7,flexShrink:0}}>
            <input type="checkbox" checked={!!v.tp_confirmed} onChange={e=>set('tp_confirmed',e.target.checked)}/>
            <span style={{fontSize:11,color:'var(--text-dim)'}}>{Tp(lang,'lbl_tp_confirm')}</span>
          </label>
        </div>
        <FormRow label={Tp(lang,'lbl_cable_r_method')} wide>
          <SelectInput value={CTCalc.cableRes.resolveMethod(v)} onChange={x=>set('cable_r_method',x)}
            options={CTCalc.cableRes.listMethods().map(m=>[m.id, lang==='da'?m.label_da:m.label_en])}/>
        </FormRow>
        <FormRow label={Tp(lang,'lbl_project_cable_temp')} unit="°C">
          <NumInput value={v.cable_temp??CTCalc.cableRes.DEFAULT_TEMP_C} onChange={x=>set('cable_temp',x)} min={-20} max={90} step={1}/>
        </FormRow>
      </div>
    </SectionCard>
  );
}

// ── Overcurrent Input Panel ──────────────────────────────────────────────
function OvercurrentInputs({ lang, v, set, onChange }) {
  return (
    <>
      <SectionCard title={Tp(lang,'section_ct')} defaultOpen accent>
        <div style={{paddingTop:8}}>
          <CTClassRow lang={lang} v={v} onChange={onChange}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <FormRow label={Tp(lang,'lbl_Ip')} unit="A">
              <NumInput value={v.Ip??2000} onChange={x=>set('Ip',x)} min={1} max={100000}/>
            </FormRow>
            <FormRow label={Tp(lang,'lbl_Is')} unit="A">
              <SelectInput value={v.Is??1} onChange={x=>set('Is',parseFloat(x))} options={[['1','1 A'],['5','5 A']]}/>
            </FormRow>
          </div>
          <FormRow label={Tp(lang,'lbl_rct')} unit="Ω">
            <NumInput value={v.rct??4} onChange={x=>set('rct',x)} min={0} max={100} step={0.01}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_burden')} unit="VA">
            <NumInput value={v.burden??30} onChange={x=>set('burden',x)} min={0} max={200} step={0.1}/>
          </FormRow>
          <div style={{marginTop:11,display:'flex',alignItems:'center',gap:7}}>
            <label style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer'}}>
              <input type="checkbox" checked={!!v.is_px} onChange={e=>set('is_px',e.target.checked)}/>
              <span style={{fontSize:12,color:'var(--text-dim)'}}>{Tp(lang,'lbl_is_px')}</span>
            </label>
          </div>
          {v.is_px
            ? <FormRow label={Tp(lang,'lbl_vk')} unit="V"><NumInput value={v.vk??200} onChange={x=>set('vk',x)} min={0} max={10000}/></FormRow>
            : <FormRow label={Tp(lang,'lbl_alf')}><NumInput value={ctAlfUsed(v)} onChange={x=>onChange(withAlf(v,x))} min={1} max={200} step={1}/></FormRow>
          }
          <div style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)',marginTop:6}}>Isc max: from Station Data (Ik max)</div>
        </div>
      </SectionCard>
      <RelaySection lang={lang} v={v} set={set} onChange={onChange} calcType="overcurrent"/>
      <CableSection lang={lang} calcType="overcurrent" v={v} set={(k,x)=>set(k,x)}/>
    </>
  );
}

// ── Metering Input Panel ─────────────────────────────────────────────────
function MeteringInputs({ lang, v, set }) {
  return (
    <>
      <SectionCard title={Tp(lang,'section_ct') + ' — ' + Tp(lang,'ct_type_metering')} defaultOpen accent>
        <div style={{paddingTop:8}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <FormRow label={Tp(lang,'lbl_Ip')} unit="A">
              <NumInput value={v.Ip??1000} onChange={x=>set('Ip',x)} min={1} max={100000}/>
            </FormRow>
            <FormRow label={Tp(lang,'lbl_Is')} unit="A">
              <SelectInput value={v.Is??1} onChange={x=>set('Is',parseFloat(x))} options={[['1','1 A'],['5','5 A']]}/>
            </FormRow>
          </div>
          <FormRow label={Tp(lang,'lbl_rct')} unit="Ω">
            <NumInput value={v.rct??2} onChange={x=>set('rct',x)} min={0} max={100} step={0.01}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_burden')} unit="VA">
            <NumInput value={v.burden??5} onChange={x=>set('burden',x)} min={0} max={100} step={0.1}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_fs')}>
            <NumInput value={v.fs_factor??5} onChange={x=>set('fs_factor',x)} min={1} max={50} step={1}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_fmin')}>
            <NumInput value={v.min_safety_factor??5} onChange={x=>set('min_safety_factor',x)} min={1} max={50} step={1}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_min_burden_pct')} unit="%">
            <NumInput value={v.min_burden_percent??25} onChange={x=>set('min_burden_percent',x)} min={0} max={100} step={1}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_device_burden')} unit="VA">
            <NumInput value={v.device_burden??0} onChange={x=>set('device_burden',x)} min={0} max={100} step={0.1}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_attached_r')} unit="Ω">
            <NumInput value={v.attached_resistor??0} onChange={x=>set('attached_resistor',x)} min={0} max={100} step={0.01}/>
          </FormRow>
        </div>
      </SectionCard>
      <CableSection lang={lang} calcType="metering" v={v} set={(k,x)=>set(k,x)}/>
    </>
  );
}

// ── Busbar Input Panel ───────────────────────────────────────────────────
function BusbarInputs({ lang, v, set, onChange }) {
  return (
    <>
      <SectionCard title={Tp(lang,'section_ct') + ' — ' + Tp(lang,'ct_type_busbar')} defaultOpen accent>
        <div style={{paddingTop:8}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <FormRow label={Tp(lang,'lbl_Ip')} unit="A">
              <NumInput value={v.Ip??2000} onChange={x=>set('Ip',x)} min={1} max={100000}/>
            </FormRow>
            <FormRow label={Tp(lang,'lbl_Is')} unit="A">
              <SelectInput value={v.Is??1} onChange={x=>set('Is',parseFloat(x))} options={[['1','1 A'],['5','5 A']]}/>
            </FormRow>
          </div>
          <FormRow label={Tp(lang,'lbl_rct')} unit="Ω">
            <NumInput value={v.rct??4} onChange={x=>set('rct',x)} min={0} max={100} step={0.01}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_burden')} unit="VA">
            <NumInput value={v.burden??30} onChange={x=>set('burden',x)} min={0} max={200} step={0.1}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_alf')}>
            <NumInput value={v.alf??20} onChange={x=>set('alf',x)} min={1} max={200} step={1}/>
          </FormRow>
        </div>
      </SectionCard>
      <RelaySection lang={lang} v={v} set={set} onChange={onChange} calcType="busbar"/>
      <CableSection lang={lang} calcType="busbar" v={v} set={(k,x)=>set(k,x)}/>
    </>
  );
}

// ── CT Class selector ────────────────────────────────────────────────────
const CT_FAMILIES = ['5P','5PR','10P','10PR','PX','TPX','TPY','TPZ'];
const CT_ALF_OPTS = [5,10,15,20,30,40,50];

// One ALF for the class row and the ALF field (issue #88): the ALF the
// calculation uses (CTBase.getAlfOrVk: the core's alf, else its default 30).
// Typing an ALF that is one of the select's options also sets ct_class_alf;
// any other ALF is added to the select, and the class label shows it.
const ctAlfUsed = v => CTBase.getAlfOrVk({ ...v, is_px:false }).alf;
const withAlf = (v, a) => CT_ALF_OPTS.includes(a) ? { ...v, alf:a, ct_class_alf:a } : { ...v, alf:a };

function CTClassRow({ lang, v, onChange }) {
  const family = v.ct_class_family || '5P';
  const alfVal = ctAlfUsed(v);
  const alfOpts = CT_ALF_OPTS.includes(alfVal) ? CT_ALF_OPTS : [...CT_ALF_OPTS, alfVal].sort((a,b)=>a-b);
  const isPxFamily = ['PX','TPX','TPY','TPZ'].includes(family);
  return (
    <div style={{marginTop:10,padding:'8px 10px',background:'var(--surface-3)',borderRadius:6,
                  border:'1px solid var(--border)'}}>
      <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)',
                     textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>
        CT Class
      </div>
      <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
        <select value={family} style={{...inputSt,width:'auto',minWidth:80}}
          onChange={e=>{
            const fam = e.target.value;
            onChange({...v, ct_class_family:fam, is_px:fam==='PX'});
          }}>
          {CT_FAMILIES.map(f=><option key={f} value={f}>{f}</option>)}
        </select>
        {!isPxFamily && (
          <select value={alfVal} style={{...inputSt,width:'auto',minWidth:60}}
            onChange={e=>{
              const a = parseInt(e.target.value);
              onChange({...v, ct_class_alf:a, alf:a});
            }}>
            {alfOpts.map(a=><option key={a} value={a}>{a}</option>)}
          </select>
        )}
        <span data-testid="ct-class-label" style={{fontFamily:'var(--font-mono)',fontSize:13,fontWeight:700,color:'var(--accent)'}}>
          {isPxFamily ? family : `${family}${alfVal}`}
        </span>
      </div>
    </div>
  );
}

// ── Relay info section ────────────────────────────────────────────────────
// The one place for the relay data, on every calc type with a relay
// (CTRelayDB.supports: not metering / VT). Picking an IED from ctvt_dim's
// relay database (CTRelayDB, calc/relays.js) stores relay_model and fills the
// manufacturer, model, SR for the core's Isr and t_al; CoreInputPanel runs
// CTRelayDB.apply on every change, so a new Isr brings its burden. Those
// fields are then read-only; "Manual entry" (no relay_model) types them.
// SR defaults per calc type are the module defaults the panels always showed.
const RELAY_MANUFACTURERS = ['Siemens','ABB','GE','SEL','Sprecher','Schweitzer','Areva','Other'];
const RELAY_BURDEN_DEFAULT = { overcurrent:0.05, busbar:0.02 };
const relayBurdenDefault = calcType => RELAY_BURDEN_DEFAULT[calcType] ?? 0.1;
const RELAY_TAL_TEXT = {
  distance:  ['relay_tal_ph_distance', 'relay_tal_note_distance'],
  line_diff: ['relay_tal_ph_ar',       'relay_tal_note_line_diff'],
};
function RelaySection({ lang, v, set, onChange, calcType }) {
  const Tl = k => CTSI18n.t(lang, k);
  const fmt = (k, o) => Object.keys(o).reduce((t, x) => t.replace(`{${x}}`, o[x]), Tl(k));
  const setOpt = (k,x) => { const n={...v}; if (x==null) delete n[k]; else n[k]=x; onChange(n); };
  const mfr = v.relay_manufacturer || 'Siemens';
  const mfrs = [...new Set([...CTRelayDB.manufacturers(), ...RELAY_MANUFACTURERS])];
  const ieds = CTRelayDB.list(mfr, calcType);
  const hit = CTRelayDB.lookup(v.relay_model, v.Is);
  const Is = Number(v.Is ?? 1);
  const [talPh, talNote] = RELAY_TAL_TEXT[calcType] || ['relay_tal_ph_other', 'relay_tal_note_other'];
  const pickMfr = m => { const n = { ...v, relay_manufacturer:m }; delete n.relay_model; onChange(n); };
  const pickIed = name => {
    const n = { ...v };
    if (name) n.relay_model = name; else delete n.relay_model;
    onChange(n);
  };
  const note = { fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)', marginTop:6 };
  return (
    <SectionCard title={Tl('section_relay')} defaultOpen>
      <div style={{paddingTop:8}}>
        <FormRow label={Tl('lbl_relay_manufacturer')}>
          <SelectInput value={mfr} onChange={pickMfr} options={mfrs.map(m=>[m,m])}/>
        </FormRow>
        {ieds.length > 0 ? (
          <FormRow label={Tl('lbl_relay_ied')} wide>
            <SelectInput value={hit ? v.relay_model : ''} onChange={pickIed}
              options={[['', Tl('relay_ied_manual')], ...ieds.map(r=>[r.name, r.name])]}/>
          </FormRow>
        ) : (
          <div data-testid="relay-db-none" style={note}>{fmt('relay_db_none', { mfr })}</div>
        )}
        {!hit && (
          <FormRow label={Tl('lbl_relay_type')}>
            <TextInput value={v.relay_type||''} onChange={x=>set('relay_type',x)}
              placeholder="e.g. 7SA87, RET670, SEL-411L"/>
          </FormRow>
        )}
        <FormRow label={Tl('lbl_relay_tag')}>
          <TextInput value={v.relay_tag||''} onChange={x=>set('relay_tag',x)} placeholder="e.g. P1-21"/>
        </FormRow>
        <FormRow label={Tl('lbl_relay_burden')} unit="VA">
          <NumInput value={v.relay_burden ?? relayBurdenDefault(calcType)} onChange={x=>set('relay_burden',x)}
            min={0} max={10} step={0.01} readOnly={!!hit && hit.burden_va != null}/>
        </FormRow>
        <FormRow label={Tl('lbl_relay_tal')} unit="ms">
          <OptNumInput value={v.relay_tal} onChange={x=>setOpt('relay_tal',x)} min={10} max={500} step={5}
            placeholder={Tl(talPh)} readOnly={!!hit}/>
        </FormRow>
        {hit && (
          <div data-testid="relay-from-db" style={note}>
            {hit.burden_va != null
              ? fmt('relay_from_db', { ied: hit.relay.name, is: Is })
              : fmt('relay_db_no_burden', { ied: hit.relay.name, is: Is })}
          </div>
        )}
        <div style={note}>{Tl(talNote)}</div>
      </div>
    </SectionCard>
  );
}

// ── Shared PX / ALF toggle ───────────────────────────────────────────────
function PxAlfRow({ lang, v, set, onChange }) {
  const Tl = k => CTSI18n.t(lang, k);
  return (
    <>
      <div style={{marginTop:11,display:'flex',alignItems:'center',gap:7}}>
        <label style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer'}}>
          <input type="checkbox" checked={!!v.is_px} onChange={e=>set('is_px',e.target.checked)}/>
          <span style={{fontSize:12,color:'var(--text-dim)'}}>{Tl('lbl_is_px')}</span>
        </label>
      </div>
      {v.is_px
        ? <FormRow label={Tl('lbl_vk')} unit="V">
            <NumInput value={v.vk??200} onChange={x=>set('vk',x)} min={0} max={10000}/>
          </FormRow>
        : <FormRow label={Tl('lbl_alf')}>
            <NumInput value={ctAlfUsed(v)} onChange={x=>onChange(withAlf(v,x))} min={1} max={200} step={1}/>
          </FormRow>
      }
    </>
  );
}

// ── Shared CT primary / secondary row ─────────────────────────────────────
function PrimarySecondaryRow({ lang, v, set }) {
  const Tl = k => CTSI18n.t(lang, k);
  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
      <FormRow label={Tl('lbl_Ip')} unit="A">
        <NumInput value={v.Ip??2000} onChange={x=>set('Ip',x)} min={1} max={100000}/>
      </FormRow>
      <FormRow label={Tl('lbl_Is')} unit="A">
        <SelectInput value={v.Is??1} onChange={x=>set('Is',parseFloat(x))} options={[['1','1 A'],['5','5 A']]}/>
      </FormRow>
    </div>
  );
}

// ── Distance Inputs ────────────────────────────────────────────────────────
// ── Shared C-O-C-O auto-reclosure section ─────────────────────────────────
// One AR card for the two calc types whose modules carry an AR check, both
// built on calc/auto_reclosure/ and reading the same core keys
// (auto_reclose_enabled, ar_t_prime, ar_tfr, ar_ts, ar_ktf_preset):
// distance/auto_reclosure_ext.js and line_diff/auto_reclosure_ext.js. The keys
// and defaults are those of ctvt_dim's ui/ct_widget/data_io.py. ctvt_dim's GUI
// has AR only for distance; line diff AR from the panel goes beyond it
// (PORTING_PLAN.md §10.6). Per calc type: the note describes that module's
// check, and the Ts placeholder names the module default a blank Ts falls to.
// Ts (most users do not know it): "From table" (ar_ts_mode 'table', the
// default) takes the typical Ts for the class and the project voltage
// (CTAutoReclosure.estimateTs, applied by CTCalc.moduleCore), shown with its
// table; "Manual" uses the typed ar_ts. A core with ar_ts and no mode (older
// cores) is manual.
const KTF_PRESET_NAMES = Object.keys(CTAutoReclosure.KTF_PRESETS);
const AR_NOTE = {
  distance: 'EAL_AR = Kssc·Ktd(C-O-C-O)·(Rct+Rb)·Isr ≤ EALF, and the IEC 61869-100 ODE check '
    + 'against ALFo. A failed check sets the core NOT OK.',
  line_diff: 'EAL_AR = Kssc·Ktd(C-O-C-O)·(Rct+Rb)·Isr, Kssc = It,max / Ipn (through fault). '
    + 'Proposed Vk (EALF, or Vk for PX) < EAL_AR sets the core NOT OK. No ODE check.',
};
const AR_TS_PLACEHOLDER = {
  distance: 'blank: 0.05 (Ktd) / 1.0 (ODE)',
  line_diff: 'blank: 0.05 (Ktd)',
};
function ArSection({ lang, v, onChange, set, calcType, systemVals }) {
  const [showTsTable, setShowTsTable] = useState(false);
  const setOpt = (k,x) => { const n={...v}; if (x==null) delete n[k]; else n[k]=x; onChange(n); };
  const ar = !!v.auto_reclose_enabled;
  const tsMode = v.ar_ts_mode === 'table' ? 'table' : 'manual';
  const tsEst = CTAutoReclosure.estimateTs(v.ct_class_family || '5P', systemVals?.voltage);
  // Enabling AR stores the AR inputs as ctvt_dim's GUI does: t' 0.1 s,
  // tfr 0.4 s, Ktf preset iec_default, and Ts from the table (a core that
  // already has an ar_ts keeps it, manual); values already stored are kept.
  const toggleAr = on => onChange(on
    ? { ar_t_prime:0.1, ar_tfr:0.4, ar_ktf_preset:'iec_default',
        ar_ts_mode: v.ar_ts != null ? 'manual' : 'table', ...v, auto_reclose_enabled:true }
    : { ...v, auto_reclose_enabled:false });
  // Table → manual starts from the table value; manual → table drops ar_ts.
  const setTsMode = mode => {
    const n = { ...v, ar_ts_mode:mode };
    if (mode === 'manual') n.ar_ts = tsEst.ts; else delete n.ar_ts;
    onChange(n);
  };
  const { BANDS, GROUPS } = CTAutoReclosure.TS_TABLE;
  const cell = { padding:'2px 5px', textAlign:'right', borderBottom:'1px solid var(--border)' };
  return (
    <SectionCard title="C-O-C-O Auto-Reclosure (IEC 61869-100)" defaultOpen={false}>
      <div style={{paddingTop:8}}>
        <div style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)',marginBottom:8}}>
          {AR_NOTE[calcType]}
        </div>
        <label style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer'}}>
          <input type="checkbox" checked={ar} onChange={e=>toggleAr(e.target.checked)}/>
          <span style={{fontSize:12,color:'var(--text-dim)'}}>Enable auto-reclosure</span>
        </label>
        {ar && <>
          <FormRow label="t' — Fault clearing time (1st fault)" unit="s">
            <NumInput value={v.ar_t_prime??0.1} onChange={x=>set('ar_t_prime',x)} min={0} max={10} step={0.01}/>
          </FormRow>
          <FormRow label="tfr — AR dead time" unit="s">
            <NumInput value={v.ar_tfr??0.4} onChange={x=>set('ar_tfr',x)} min={0} max={60} step={0.05}/>
          </FormRow>
          <FormRow label="Ts — Secondary time constant">
            <SelectInput value={tsMode} onChange={setTsMode}
              options={[['table','From table (class, voltage)'],['manual','Manual']]}/>
          </FormRow>
          {tsMode === 'manual' ? (
            <FormRow label="Ts — manual value" unit="s">
              <OptNumInput value={v.ar_ts} onChange={x=>setOpt('ar_ts',x)} min={0.01} max={30} step={0.1}
                placeholder={AR_TS_PLACEHOLDER[calcType]}/>
            </FormRow>
          ) : (
            <div data-testid="ar-ts-table" style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text-dim)',margin:'2px 0 8px'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                <span data-testid="ar-ts-value">Ts = {tsEst.ts} s</span>
                <span style={{color:'var(--text-muted)'}}>({tsEst.group.label}, {tsEst.band.label})</span>
                <button type="button" onClick={()=>setShowTsTable(x=>!x)}
                  style={{marginLeft:'auto',background:'none',border:'1px solid var(--border-2)',borderRadius:4,
                          color:'var(--accent)',cursor:'pointer',fontFamily:'var(--font-mono)',fontSize:10,padding:'1px 6px'}}>
                  {showTsTable ? 'Hide table' : 'Show table'}
                </button>
              </div>
              {showTsTable && (
                <div style={{marginTop:6,overflowX:'auto'}}>
                  <table style={{borderCollapse:'collapse',fontSize:10,width:'100%'}}>
                    <thead>
                      <tr>
                        <th style={{...cell,textAlign:'left'}}>Ts (s)</th>
                        {BANDS.map((b,i)=><th key={b.label} style={{...cell,color:i===tsEst.bandIndex?'var(--accent)':undefined}}>{b.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {GROUPS.map((g,gi)=>(
                        <tr key={g.id}>
                          <td style={{...cell,textAlign:'left',color:gi===tsEst.groupIndex?'var(--accent)':undefined}}>
                            {g.label}<br/><span style={{color:'var(--text-muted)'}}>{g.classes.join(', ')}</span>
                          </td>
                          {g.ts.map((t,bi)=>{
                            const on = gi===tsEst.groupIndex && bi===tsEst.bandIndex;
                            return <td key={bi} data-active={on?'1':undefined}
                              style={{...cell,fontWeight:on?700:400,color:on?'var(--accent)':undefined,
                                      background:on?'var(--accent-glow)':undefined}}>{t}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{marginTop:4,color:'var(--text-muted)'}}>
                    Engineering estimate: 110–150 kV = ctvt_dim's typical Ts. Closed cores: larger cores at higher voltage give a
                    longer Ts, each value at the upper end of the typical range (a longer Ts gives a larger C-O-C-O Ktd).
                    Gapped cores: the air gap sets Ts, flat 1 s from 110 kV. TPZ: 60 ms (IEC 61869-2).
                    Choose Manual to enter the CT's Ts.
                  </div>
                </div>
              )}
            </div>
          )}
          <FormRow label="Ktf curve preset">
            <SelectInput value={v.ar_ktf_preset??'iec_default'} onChange={x=>set('ar_ktf_preset',x)}
              options={KTF_PRESET_NAMES.map(n=>[n,n])}/>
          </FormRow>
        </>}
      </div>
    </SectionCard>
  );
}

// The relay t_al (relay_tal, ms, in the Relay Information card): set →
// analytical Ktd, blank → the Tp lookup table, as ctvt_dim's
// calculate_distance_protection; it is also the C-O-C-O measurement window
// (CTCalc.moduleCore). Vka is always
// divided by 1.3 there (ctvt_dim's relay-DB factor lookup is dead code), so
// there is no Vka factor field; an old core's t_al / vka_factor reach nothing
// (PORTING_PLAN.md §10.6 F-DIST-UI).
function DistanceInputs({ lang, v, set, onChange, systemVals }) {
  const Tl = k => CTSI18n.t(lang, k);
  const setOpt = (k,x) => { const n={...v}; if (x==null) delete n[k]; else n[k]=x; onChange(n); };
  return (
    <>
      <SectionCard title={`${Tl('section_ct')} — ${Tl('ct_type_distance')}`} defaultOpen accent>
        <div style={{paddingTop:8}}>
          <CTClassRow lang={lang} v={v} onChange={onChange}/>
          <PrimarySecondaryRow lang={lang} v={v} set={set}/>
          <FormRow label={Tl('lbl_rct')} unit="Ω">
            <NumInput value={v.rct??4} onChange={x=>set('rct',x)} min={0} max={100} step={0.01}/>
          </FormRow>
          <FormRow label={Tl('lbl_burden')} unit="VA">
            <NumInput value={v.burden??30} onChange={x=>set('burden',x)} min={0} max={200} step={0.1}/>
          </FormRow>
          <PxAlfRow lang={lang} v={v} set={set} onChange={onChange}/>
        </div>
      </SectionCard>
      <RelaySection lang={lang} v={v} set={set} onChange={onChange} calcType="distance"/>
      <LineDataSection lang={lang} v={v} setOpt={setOpt} systemVals={systemVals}/>
      <CableSection lang={lang} calcType="distance" v={v} set={(k,x)=>set(k,x)}/>
      <ArSection lang={lang} calcType="distance" v={v} onChange={onChange} set={set} systemVals={systemVals}/>
    </>
  );
} 
// Line data of the protected line (issue #86), read by calc/distance/data.js:
// R'L, X'L (primary Ω/km), lL (km) and the zone-1 factor Klim. A blank field
// is not stored and the calculation uses its default (LINE_DEFAULTS), which
// the placeholder shows and LineDataWarning flags.
const LINE_LIMITS = {
  r_per_km:      { min:0,    max:10,   step:0.0001 },
  x_per_km:      { min:0,    max:10,   step:0.001 },
  line_length:   { min:0.01, max:1000, step:0.1 },
  zone1_setting: { min:0.05, max:1,    step:0.01 },
};
function LineDataSection({ lang, v, setOpt, systemVals }) {
  const Tl = k => CTSI18n.t(lang, k);
  const fields = CTSReport.lineData(v, systemVals);
  return (
    <SectionCard title={Tl('section_line_data')} defaultOpen>
      <div style={{paddingTop:8}}>
        {fields.map(f => (
          <FormRow key={f.key} label={Tl(f.label)} unit={f.unit || undefined}>
            <OptNumInput value={v[f.key]} onChange={x=>setOpt(f.key,x)} {...LINE_LIMITS[f.key]}
              placeholder={Tl('line_default_ph').replace('{v}', CTDistance.data.LINE_DEFAULTS[f.key])}/>
          </FormRow>
        ))}
        <LineDataWarning lang={lang} v={v} systemVals={systemVals}/>
      </div>
    </SectionCard>
  );
}

// IED input rating (CTIedRating, calc/ied_rating.js): the secondary peak
// current against the picked IED's input ratings. Shown when an IED from the
// relay database is picked; the tooltip lists every check.
function IedBadge({ ied }) {
  if (!ied) return null;
  const tone = ied.status === 'OK' ? 'green' : ied.status === 'NOT_OK' ? 'red' : 'text-muted';
  const text = ied.status === 'OK' ? '✓ PASS' : ied.status === 'NOT_OK' ? '✗ FAIL' : 'not checked';
  const peak = ied.i_sec_peak != null ? ` · i_pk ${ied.i_sec_peak.toFixed(1)} A` : '';
  const title = (ied.checks || []).map(c => c.ok == null
    ? `${c.id}: not evaluated (${c.reason})`
    : `${c.id}: ${c.value.toFixed(2)} A ${c.ok ? '≤' : '>'} ${c.limit.toFixed(2)} A`).join('\n') || ied.relay_name;
  return (
    <span data-testid="ied-badge" title={title}
          style={{fontFamily:'var(--font-mono)',fontSize:10,padding:'2px 8px',borderRadius:4,
                  background:tone==='text-muted'?'var(--surface-3)':`var(--${tone}-bg)`,
                  color:`var(--${tone})`,border:`1px solid var(--${tone==='text-muted'?'border-2':tone})`}}>
      IED: {text}{peak}
    </span>
  );
}

function LineDataWarning({ lang, v, systemVals }) {
  const text = CTSReport.lineDataWarning(lang, v, systemVals);
  if (!text) return null;
  return (
    <div data-testid="line-data-warning" style={{marginTop:8,padding:'6px 9px',borderRadius:5,fontSize:11,
                  fontFamily:'var(--font-mono)',color:'var(--amber)',background:'var(--surface-3)',
                  border:'1px solid var(--amber)'}}>
      ⚠ {text}
    </div>
  );
}

// Isc,max,int — the internal (in-zone) fault current (issue #85). Entered in kA,
// stored on the core as trafo_ik_max in A (the ctvt_dim key the calc reads).
// Blank = not stored: the calc uses the project Ik max, which the placeholder
// shows; with no project Ik max either, the core is not calculated and
// IscIntWarning says so.
function IscIntRow({ lang, v, setOpt, systemVals }) {
  const Tl = k => CTSI18n.t(lang, k);
  const proj = CTTransformerDiff.data.projectInternalFaultCurrent(systemVals || {});
  return (
    <FormRow label={Tl('lbl_isc_int')} unit="kA">
      <OptNumInput value={v.trafo_ik_max != null ? v.trafo_ik_max / 1000 : null}
        onChange={x=>setOpt('trafo_ik_max', x == null ? null : Math.round(x * 1000))}
        min={0} max={200} step={0.1}
        placeholder={proj != null ? Tl('isc_int_project_ph').replace('{v}', proj / 1000) : Tl('isc_int_required_ph')}/>
    </FormRow>
  );
}
function IscIntWarning({ lang, v, systemVals }) {
  const text = CTSReport.iscIntWarning(lang, v, systemVals);
  if (!text) return null;
  return (
    <div data-testid="isc-int-warning" style={{marginTop:8,padding:'6px 9px',borderRadius:5,fontSize:11,
                  fontFamily:'var(--font-mono)',color:'var(--amber)',background:'var(--surface-3)',
                  border:'1px solid var(--amber)'}}>
      ⚠ {text}
    </div>
  );
}

function TransformerDiffInputs({ lang, v, set, onChange, systemVals }) {
  const Tl = k => CTSI18n.t(lang, k);
  const setOpt = (k,x) => { const n={...v}; if (x==null) delete n[k]; else n[k]=x; onChange(n); };
  return (
    <>
      <SectionCard title={`${Tl('section_ct')} — ${Tl('ct_type_transformer_diff')}`} defaultOpen accent>
        <div style={{paddingTop:8}}>
          <CTClassRow lang={lang} v={v} onChange={onChange}/>
          <PrimarySecondaryRow lang={lang} v={v} set={set}/>
          <FormRow label={Tl('lbl_rct')} unit="Ω">
            <NumInput value={v.rct??4} onChange={x=>set('rct',x)} min={0} max={100} step={0.01}/>
          </FormRow>
          <FormRow label={Tl('lbl_burden')} unit="VA">
            <NumInput value={v.burden??30} onChange={x=>set('burden',x)} min={0} max={200} step={0.1}/>
          </FormRow>
          <PxAlfRow lang={lang} v={v} set={set} onChange={onChange}/>
        </div>
      </SectionCard>
      {/* An unset field shows the value the calc uses for it
          (transformer_diff/data.js applyBackwardsCompatibility, = ctvt_dim
          data.py): 160 MVA, the project voltage, 14 %, inrush 8. */}
      <SectionCard title="Transformer Data" defaultOpen>
        <div style={{paddingTop:8}}>
          <FormRow label="Rated power" unit="MVA">
            <NumInput value={v.trafo_power_mva??160} onChange={x=>set('trafo_power_mva',x)} min={0.1} max={5000} step={1}/>
          </FormRow>
          <FormRow label="Winding voltage (this CT)" unit="kV">
            <NumInput value={v.trafo_voltage_kv??systemVals?.voltage??150} onChange={x=>set('trafo_voltage_kv',x)} min={0.1} max={1200} step={1}/>
          </FormRow>
          <FormRow label="Short-circuit impedance" unit="%">
            <NumInput value={v.trafo_z_percent??14} onChange={x=>set('trafo_z_percent',x)} min={1} max={50} step={0.1}/>
          </FormRow>
          <FormRow label="Inrush factor k">
            <NumInput value={v.inrush_factor??8} onChange={x=>set('inrush_factor',x)} min={1} max={20} step={0.5}/>
          </FormRow>
          <FormRow label="Linked winding">
            <SelectInput value={v.linked_winding||'HV'} onChange={x=>set('linked_winding',x)}
              options={[['HV','HV — High Voltage'],['LV','LV — Low Voltage'],['TV','TV — Tertiary']]}/>
          </FormRow>
          <IscIntRow lang={lang} v={v} setOpt={setOpt} systemVals={systemVals}/>
          <IscIntWarning lang={lang} v={v} systemVals={systemVals}/>
        </div>
      </SectionCard>
      <RelaySection lang={lang} v={v} set={set} onChange={onChange} calcType="transformer_diff"/>
      <CableSection lang={lang} calcType="transformer_diff" v={v} set={(k,x)=>set(k,x)}/>
    </>
  );
}

// ── Line Differential Inputs ──────────────────────────────────────────────
function LineDiffInputs({ lang, v, set, onChange, systemVals }) {
  const Tl = k => CTSI18n.t(lang, k);
  return (
    <>
      <SectionCard title={`${Tl('section_ct')} — ${Tl('ct_type_line_diff')}`} defaultOpen accent>
        <div style={{paddingTop:8}}>
          <CTClassRow lang={lang} v={v} onChange={onChange}/>
          <PrimarySecondaryRow lang={lang} v={v} set={set}/>
          <FormRow label={Tl('lbl_rct')} unit="Ω">
            <NumInput value={v.rct??4} onChange={x=>set('rct',x)} min={0} max={100} step={0.01}/>
          </FormRow>
          <FormRow label={Tl('lbl_burden')} unit="VA">
            <NumInput value={v.burden??30} onChange={x=>set('burden',x)} min={0} max={200} step={0.1}/>
          </FormRow>
          <PxAlfRow lang={lang} v={v} set={set} onChange={onChange}/>
        </div>
      </SectionCard>
      <RelaySection lang={lang} v={v} set={set} onChange={onChange} calcType="line_diff"/>
      <CableSection lang={lang} calcType="line_diff" v={v} set={(k,x)=>set(k,x)}/>
      <ArSection lang={lang} calcType="line_diff" v={v} onChange={onChange} set={set} systemVals={systemVals}/>
    </>
  );
}
// ── VT core inputs (CTVT.calculate ← vt_calculations/calculator.py) ─────────
function VtInputs({ lang, v, set }) {
  return (
    <>
      <SectionCard title={Tp(lang,'section_vt')} defaultOpen accent>
        <div style={{paddingTop:8}}>
          <FormRow label={Tp(lang,'lbl_vt_us')} unit="V">
            <NumInput value={v.secondary_voltage??100} onChange={x=>set('secondary_voltage',x)} min={0} max={500} step={0.1}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_vt_class')}>
            <SelectInput value={v.vt_class??'0.2'} onChange={x=>set('vt_class',x)}
              options={[['0.1','0.1'],['0.2','0.2'],['0.5','0.5'],['1.0','1.0'],['3P','3P']]}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_vt_burden')} unit="VA">
            <NumInput value={v.burden??10} onChange={x=>set('burden',x)} min={0} max={1000} step={0.1}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_vt_thermal')} unit="VA">
            <NumInput value={v.thermal_burden??50} onChange={x=>set('thermal_burden',x)} min={0} max={5000} step={0.1}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_vt_device_r')} unit="Ω">
            <NumInput value={v.device_resistance??100} onChange={x=>set('device_resistance',x)} min={0} max={1000000} step={0.1}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_vt_attached_r')} unit="Ω">
            <NumInput value={v.attached_resistor??0} onChange={x=>set('attached_resistor',x)} min={0} max={1000000} step={0.1}/>
          </FormRow>
        </div>
      </SectionCard>
      <CableSection lang={lang} calcType="vt" v={{cable_length:150,...v}} set={set}/>
    </>
  );
}

// ── Core Input Panel (dispatcher) ────────────────────────────────────────
function CoreInputPanel({ lang, core, systemVals, onChange: store, onSaveCTTpl, onLoadCTTpl }) {
  // Every change passes the relay database: a picked IED keeps its SR (for
  // the current Isr) and t_al (RelaySection)
  const onChange = n => store(CTRelayDB.apply(n));
  const set = (k,x) => onChange({...core.inputs,[k]:x});
  const type = core.calc_type;
  const v    = core.inputs;
  const [showTpl, setShowTpl] = useState(false);
  const [tplName, setTplName] = useState('');
  const ctTpls = typeof getTpls !== 'undefined' ? getTpls('ct') : [];
  const Tl = k => CTSI18n.t(lang, k);

  return (
    <div>
      {/* Read-only type badge — type is set by device, not editable here */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
        <span style={{fontFamily:'var(--font-mono)',fontSize:11,fontWeight:700,
                       background:'var(--accent-glow)',color:'var(--accent)',
                       border:'1px solid var(--accent)',borderRadius:5,
                       padding:'3px 10px',letterSpacing:'0.05em',textTransform:'uppercase'}}>
          {Tl(`ct_type_${type}`)}
        </span>
        <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--text-muted)',
                       background:'var(--surface-3)',border:'1px solid var(--border-2)',
                       borderRadius:4,padding:'2px 7px',textTransform:'uppercase'}}>
          {core.kind === 'vt' ? 'VT Core' : 'CT Core'}
        </span>
      </div>

      {/* Template row */}
      <div style={{display:'flex',gap:6,marginBottom:10,flexWrap:'wrap'}}>
        <button style={tplBtnSt} onClick={()=>setShowTpl(s=>!s)}>{Tl('tpl_save_ct')}</button>
        {ctTpls.length > 0 && (
          <select style={{...tplBtnSt,cursor:'pointer'}} defaultValue=""
            onChange={e=>{ const t=ctTpls.find(t=>t.id===e.target.value); if(t) onLoadCTTpl(t); e.target.value=''; }}>
            <option value="" disabled>{Tl('tpl_load')}</option>
            {ctTpls.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>
      {showTpl && (
        <div style={{display:'flex',gap:6,marginBottom:10}}>
          <input type="text" value={tplName} onChange={e=>setTplName(e.target.value)}
            placeholder={Tl('tpl_name_prompt')}
            style={{flex:1,background:'var(--surface-2)',border:'1px solid var(--border-2)',color:'var(--text)',
                     borderRadius:5,padding:'4px 8px',fontFamily:'var(--font-body)',fontSize:12,outline:'none'}}
            onKeyDown={e=>{if(e.key==='Enter'&&tplName){onSaveCTTpl(tplName);setTplName('');setShowTpl(false);}}}/>
          <button style={{...tplBtnSt,background:'var(--accent)',color:'#fff',border:'none'}}
            onClick={()=>{if(tplName){onSaveCTTpl(tplName);setTplName('');setShowTpl(false);}}}>Save</button>
        </div>
      )}

      {core.kind === 'vt' ? <VtInputs lang={lang} v={v} set={set}/> : <>
        {type === 'overcurrent'      && <OvercurrentInputs lang={lang} v={v} set={set} onChange={onChange}/>}
        {type === 'metering'         && <MeteringInputs    lang={lang} v={v} set={set}/>}
        {type === 'busbar'           && <BusbarInputs      lang={lang} v={v} set={set} onChange={onChange}/>}
        {type === 'distance'         && <DistanceInputs       lang={lang} v={v} set={set} onChange={onChange} systemVals={systemVals}/>}
        {type === 'transformer_diff' && <TransformerDiffInputs lang={lang} v={v} set={set} onChange={onChange} systemVals={systemVals}/>}
        {type === 'line_diff'        && <LineDiffInputs       lang={lang} v={v} set={set} onChange={onChange} systemVals={systemVals}/>}
        {type === 'vt'               && <VtInputs lang={lang} v={v} set={set}/>}
      </>}
    </div>
  );
}

const tplBtnSt = {
  background:'var(--surface-3)',border:'1px solid var(--border-2)',borderRadius:5,
  padding:'4px 10px',cursor:'pointer',fontSize:10,color:'var(--text-dim)',
  fontFamily:'var(--font-mono)',transition:'all 0.12s',
};

// ── Results Panel — tabbed: Summary | Steps | Charts ───────────────────
// ── Chart inputs (shared by the Charts tab and the RTF report) ───────────
// Single fault waveform: the system Tp and the core's offered / required
// ratio (< 1 draws a saturating secondary), from each module's own verdict
// figures — only overcurrent returns ALF_act / ALF_req:
//   overcurrent ALF_act/ALF_req · generic alf_actual (≥ 1) · busbar Vk/Vk,req
//   (PX) or Fa/(If,max/Ipr) · distance / line diff EALF/Vk,req · transformer
//   diff the lowest of EMF EALF/Vk,req, Ziegler ALFo/ALF,req and IEC Req. 1–2.
// Metering has none: a metering core is meant to saturate (FS).
function chartSatRatio(type, result) {
  if (!result) return null;
  const q = (a, b) => (a != null && b != null && b > 0 ? a / b : null);
  let ratios;
  switch (type) {
    case 'overcurrent': ratios = [q(result.ALF_act, result.ALF_req)]; break;
    case 'generic':     ratios = [result.alf_actual]; break;
    case 'busbar':      ratios = [result.is_px ? q(result.vk, result.vk_required)
                                               : q(result.f_a, result.fault_ratio)]; break;
    case 'distance':
    case 'line_diff':   ratios = [q(result.EALF, result.Vk_req)]; break;
    case 'transformer_diff':
      ratios = [q(result.EALF, result.Vk_req)];
      if (result.alf_o != null) {
        ratios.push(q(result.alf_o, result.siemens_alf_required));
        if (result.iec_method_applicable) ratios.push(
          q(result.alf_o, result.alf_ext_required), q(result.alf_o, result.alf_int_required));
      }
      break;
    default: return null;
  }
  ratios = ratios.filter(r => r != null && Number.isFinite(r));
  return ratios.length ? Math.min(...ratios) : null;
}

function chartFaultParams(result, systemVals, core) {
  return {
    tp_ms:   systemVals?.tp ?? 100,
    ALF_act: result?.ALF_act,
    ALF_req: result?.ALF_req,
    ratio:   chartSatRatio(core?.calc_type, result),
    t_al_ms: core?.inputs?.relay_tal ?? null,
  };
}

// C-O-C-O auto-reclosure (PORTING_PLAN.md §10.6 F-AR): shown only for a core
// with auto_reclose_enabled, and every value comes from the verified result
// (CTDistance.calculate → distance/auto_reclosure_ext.js): the EAL_AR check
// (eal_ar, is_adequate) and the IEC 61869-100 ODE check (ode_is_ok, ALFo
// from its step). Both flip result.status, so the badge needs both.
// The canvas draws the ODE check's own flux trace: the same inputs and
// defaults as calculateOdeSaturationCheck (ar_* timings, Tp, and ct_class
// from CTCalc.moduleCore), its Kssc and ALFo, and its verdict. A PX core has
// no ODE check (no rated ALF, as ctvt_dim): the trace is drawn without ALFo.
// Line diff (§10.6 F-LD-AR-UI): the verdict is the module's ar_is_adequate
// (proposed Vk ≥ EAL_AR); there is no ODE check and no ALFo, so the trace is
// drawn from the C-O-C-O Ktd's own inputs and defaults (line_diff/data.js:
// Ts 0.05 s, t_al 0.2 s) with its Kssc, and no verdict of its own.
// → { arResult, canvasParams } or null.
function chartArData(type, core, result, systemVals) {
  if (type !== 'distance' && type !== 'line_diff') return null;
  if (!core?.inputs?.auto_reclose_enabled) return null;
  if (!result || result.eal_ar == null) return null;
  if (type === 'line_diff') return chartArDataLineDiff(core, result, systemVals);
  const alfoStep = result.steps.find(s => s.key === 'auto_reclosure_operating_alf');
  const arResult = {
    is_ok:  result.is_adequate === true && result.ode_is_ok !== false,
    ode_is_ok: result.ode_is_ok,
    EALF:   result.ealf,
    EAL_AR: result.eal_ar,
    Ktd:    result.ar_ktd,
    Kssc:   result.kssc_ar,
    ALFo:   alfoStep ? alfoStep.result : null,
  };
  const inp = CTCalc.moduleCore('distance', core?.inputs ?? {}, systemVals);
  const t_prime = inp.ar_t_prime ?? 0.1;
  const canvasParams = {
    tp_ms:         inp.tp ?? systemVals?.tp ?? 100,
    ts_s:          inp.ar_ts ?? 1.0,
    t_prime_s:     t_prime,
    tfr_s:         inp.ar_tfr ?? 0.4,
    t_double_al_s: inp.ar_t_double_al ?? t_prime,
    t_al_ms:       (inp.ar_t_al ?? 0.025) * 1000,
    kssc:          arResult.Kssc,
    alfo:          arResult.ALFo,
    is_ok:         arResult.ode_is_ok,
    ct_class:      inp.ct_class ?? '5P',   // the ODE default
    amplitude: 1.0,
  };
  return { arResult, canvasParams };
}

function chartArDataLineDiff(core, result, systemVals) {
  const arResult = {
    is_ok:  result.ar_is_adequate === true,
    ode_is_ok: null,
    no_ode: 'line_diff',
    EALF:   result.proposed_vk,
    EAL_AR: result.eal_ar,
    Ktd:    result.ktd_ar,
    Kssc:   result.kssc_ar,
    ALFo:   null,
  };
  const inp = CTCalc.moduleCore('line_diff', core?.inputs ?? {}, systemVals);
  const t_prime = inp.ar_t_prime ?? 0.1;
  const canvasParams = {
    tp_ms:         systemVals?.tp ?? 100,
    ts_s:          inp.ar_ts ?? 0.05,
    t_prime_s:     t_prime,
    tfr_s:         inp.ar_tfr ?? 0.4,
    t_double_al_s: inp.ar_t_double_al ?? t_prime,
    t_al_ms:       (inp.ar_t_al ?? 0.2) * 1000,
    kssc:          arResult.Kssc,
    alfo:          null,
    is_ok:         null,
    ct_class:      inp.ct_class ?? '5P',
    amplitude: 1.0,
  };
  return { arResult, canvasParams };
}

function ResultsPanel({ lang, result, core, systemVals, theme }) {
  const [tab, setTab] = useState('summary');
  const Tl = k => CTSI18n.t(lang, k);
  const type = core?.calc_type;

  const faultParams = useMemo(() => chartFaultParams(result, systemVals, core), [result, systemVals, core]);
  const ar = useMemo(() => chartArData(type, core, result, systemVals), [type, core?.inputs, result, systemVals]);
  const arResult = ar?.arResult ?? null;
  const arCanvasParams = ar?.canvasParams ?? null;

  if (!result) return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',
                  justifyContent:'center',height:280,gap:12,color:'var(--text-muted)'}}>
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
        <circle cx="22" cy="22" r="19" stroke="var(--border-2)" strokeWidth="1.5"/>
        <path d="M12 22l8 8 12-14" stroke="var(--text-muted)" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" opacity="0.35"/>
      </svg>
      <p style={{fontFamily:'var(--font-body)',fontSize:13}}>{Tl('no_result')}</p>
    </div>
  );

  const margin  = result.margin ?? 0;
  // A transformer diff core with no Isc,max,int is not calculated (issue #85): no margin
  const mStr    = result.isc_int_missing ? '\u2014' : (margin >= 0 ? '+' : '') + margin.toFixed(1) + '%';
  const metrics = withCableMethod(buildMetrics(type, result, lang), result, lang);
  // The charts (saturation / fault waveform) are CT-only.
  const TABS    = type === 'vt' ? ['summary','steps'] : ['summary','steps','charts'];
  const TLABEL  = {summary:'Summary', steps:'Formula Steps', charts:'Charts'};

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>

      {/* Status row */}
      <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <StatusBadge is_ok={result.is_ok} lang={lang}/>
        <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--text-muted)'}}>
          {Tl('res_margin')}: <span style={{color:result.is_ok?'var(--green)':'var(--red)',fontWeight:600}}>{mStr}</span>
        </span>
        {arResult && (
          <span data-testid="ar-badge" style={{fontFamily:'var(--font-mono)',fontSize:10,padding:'2px 8px',borderRadius:4,
                         background:arResult.is_ok?'var(--green-bg)':'var(--red-bg)',
                         color:arResult.is_ok?'var(--green)':'var(--red)',
                         border:`1px solid ${arResult.is_ok?'var(--green)':'var(--red)'}`}}>
            AR C-O-C-O: {arResult.is_ok?'✓ PASS':'✗ FAIL'}
          </span>
        )}
        <IedBadge ied={result.ied_rating}/>
      </div>

      {type === 'distance' && <LineDataWarning lang={lang} v={core?.inputs ?? {}} systemVals={systemVals}/>}
      {type === 'transformer_diff' && <IscIntWarning lang={lang} v={core?.inputs ?? {}} systemVals={systemVals}/>}

      {/* Tab bar */}
      <div style={{display:'flex',gap:4}}>
        {TABS.map(t => (
          <button key={t} onClick={()=>setTab(t)}
            style={{padding:'5px 12px',borderRadius:5,border:'none',cursor:'pointer',
                     fontFamily:'var(--font-mono)',fontSize:11,fontWeight:tab===t?700:400,
                     background:tab===t?'var(--accent-glow)':'var(--surface-3)',
                     color:tab===t?'var(--accent)':'var(--text-muted)',
                     boxShadow:tab===t?'0 0 0 1px var(--accent)':'none',transition:'all 0.12s'}}>
            {TLABEL[t]}
          </button>
        ))}
      </div>

      {/* SUMMARY */}
      {tab === 'summary' && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
          {metrics.map(m => <MetricCard key={m.label} {...m}/>)}
        </div>
      )}

      {/* STEPS */}
      {tab === 'steps' && (
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {result.steps.map(s => <FormulaStep key={s.key} step={s} lang={lang}/>)}
        </div>
      )}

      {/* CHARTS */}
      {tab === 'charts' && (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {type === 'overcurrent' && (
            <SectionCard title="Saturation Curve" defaultOpen>
              <div style={{paddingTop:8,background:'var(--surface-2)',borderRadius:6,overflow:'hidden'}}>
                <SaturationChart result={result} lang={lang}/>
              </div>
            </SectionCard>
          )}
          <SectionCard title={`Single Fault Waveform (Tp=${systemVals?.tp??100}ms)`} defaultOpen>
            <div style={{paddingTop:8,borderRadius:6,overflow:'hidden',
                          background:theme==='dark'?'#050b14':'#f4f7fb'}}>
              <WaveformCanvas params={faultParams} theme={theme} lang={lang}/>
            </div>
            {faultParams.ratio != null && faultParams.ratio < 1 && (
              <div style={{marginTop:6,fontFamily:'var(--font-mono)',fontSize:11,color:'var(--red)'}}>
                ⚠ CT will saturate — increase ALF or reduce burden
              </div>
            )}
          </SectionCard>
          {arResult && (
            <SectionCard title="C-O-C-O AR — IEC 61869-100 Transient Analysis" defaultOpen>
              <div data-testid="ar-verdict" style={{display:'flex',alignItems:'center',gap:10,margin:'6px 0',flexWrap:'wrap'}}>
                <span style={{fontFamily:'var(--font-mono)',fontSize:10,fontWeight:700,
                               padding:'2px 8px',borderRadius:4,
                               background:arResult.is_ok?'var(--green-bg)':'var(--red-bg)',
                               color:arResult.is_ok?'var(--green)':'var(--red)',
                               border:`1px solid ${arResult.is_ok?'var(--green)':'var(--red)'}`}}>
                  {arResult.is_ok?'✓ PASS':'✗ FAIL'}
                </span>
                <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--text-muted)'}}>
                  EALF={arResult.EALF.toFixed(1)}V / EAL_AR={arResult.EAL_AR.toFixed(1)}V req | Ktd={arResult.Ktd.toFixed(3)} | Kssc={arResult.Kssc.toFixed(2)}{arResult.ALFo != null && ` | ALFo=${arResult.ALFo.toFixed(1)}`}
                </span>
              </div>
              {arCanvasParams && (
                <div style={{borderRadius:6,overflow:'hidden',background:theme==='dark'?'#050b14':'#f4f7fb'}}>
                  <ArWaveformCanvas arParams={arCanvasParams} theme={theme} lang={lang}/>
                </div>
              )}
              {arResult.ode_is_ok == null && (
                <div data-testid="ar-no-ode" style={{marginTop:6,fontFamily:'var(--font-mono)',fontSize:11,color:'var(--text-muted)'}}>
                  {arResult.no_ode === 'line_diff'
                    ? 'No IEC 61869-100 ODE check: line differential has none (no ALFo), as in ctvt_dim. The verdict is EAL_AR ≤ proposed Vk.'
                    : 'No IEC 61869-100 ODE check: a PX core has no rated ALF (ALFo), as in ctvt_dim. The verdict is EAL_AR ≤ Vk.'}
                </div>
              )}
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}


// "Cable R method" summary row (PORTING_PLAN.md §9.4), read from the module's
// `cable_res`. Placed right after the (last) Cable R row, or last where a type
// has none. Shows "—" if the result has no cable_res.
function withCableMethod(metrics, r, lang) {
  if (!metrics) return metrics;
  const cr = r?.cable_res;
  let value;
  if (cr) {
    const m = CTCalc.cableRes.listMethods().find(x => x.id === cr.method);
    value = m ? (lang === 'da' ? m.label_da : m.label_en) : cr.method;
    if (cr.source === 'iec60287_fallback') value += ' ' + Tp(lang,'res_cable_r_fallback');
  }
  const row = { label: Tp(lang,'res_cable_r_method'), value, compact: true };
  const cableLabels = ['res_cable_r', 'res_cable_r_3ph', 'res_cable_r_1ph'].map(k => Tp(lang,k));
  const i = metrics.reduce((last, m, k) => cableLabels.includes(m.label) ? k : last, -1);
  const out = [...metrics];
  out.splice(i < 0 ? out.length : i + 1, 0, row);
  return out;
}

function buildMetrics(type, r, lang) {
  if (type === 'overcurrent') return [
    { label: Tp(lang,'res_alf_act'), value: r.ALF_act?.toFixed(2), ok: r.is_ok },
    { label: Tp(lang,'res_alf_req'), value: r.ALF_req?.toFixed(2), highlight: true },
    { label: Tp(lang,'res_esat'),    value: r.Esat?.toFixed(1),    unit: 'V' },
    { label: Tp(lang,'res_total_r'), value: r.Rt?.toFixed(4),      unit: 'Ω' },
    { label: Tp(lang,'res_cable_r'), value: r.Rc?.toFixed(4),      unit: 'Ω' },
    { label: Tp(lang,'res_esat_req'),value: r.Esat_req?.toFixed(1),unit: 'V' },
  ];
  if (type === 'metering') return [
    { label: Tp(lang,'res_fsa'),    value: r.Fsa?.toFixed(3),    ok: r.cond2 },
    { label: Tp(lang,'res_fmin'),   value: r.min_safety_factor != null ? String(r.min_safety_factor) : '—', highlight: true },
    { label: Tp(lang,'res_s_total'),value: r.S_total?.toFixed(4), unit: 'VA' },
    { label: Tp(lang,'res_cable_r'),value: r.Rc?.toFixed(4),      unit: 'Ω' },
    { label: 'S min', value: r.S_min?.toFixed(4), unit: 'VA' },
    { label: 'S in',  value: r.S_in?.toFixed(4),  unit: 'VA' },
  ];
  // PX busbar (busbar.js calculatePxClass): E.M.F.s and Vk, no ALF (§10.6 F-SUM)
  if (type === 'busbar' && r.is_px) return [
    { label:'EMF internal', value:r.e_internal?.toFixed(1),  unit:'V' },
    { label:'EMF through',  value:r.e_through?.toFixed(1),   unit:'V' },
    { label:'Vk required',  value:r.vk_required?.toFixed(1), unit:'V', highlight:true },
    { label:'Vk',           value:r.vk?.toFixed(1),          unit:'V', ok:r.is_ok },
    { label: Tp(lang,'res_cable_r'), value: r.Rc?.toFixed(4), unit: 'Ω' },
    { label: Tp(lang,'res_margin'),  value: (r.margin??0).toFixed(1), unit: '%', ok: r.is_ok },
  ];
  if (type === 'busbar') return [
    { label: Tp(lang,'res_f_a'),         value: r.f_a?.toFixed(3),        ok: r.check2 },
    { label: Tp(lang,'res_fault_ratio'), value: r.fault_ratio?.toFixed(2), highlight: true },
    { label: 'S in',   value: r.S_in?.toFixed(4),  unit: 'VA' },
    { label: 'S a',    value: r.S_a?.toFixed(4),   unit: 'VA' },
    { label: Tp(lang,'res_cable_r'), value: r.Rc?.toFixed(4), unit: 'Ω' },
    { label: Tp(lang,'res_margin'),  value: (r.margin??0).toFixed(1), unit: '%', ok: r.is_ok },
  ];
  if (type === 'distance') return [
    { label:'EALF offered', value:r.EALF?.toFixed(1), unit:'V', ok:r.is_ok },
    { label:'Vk required',  value:r.Vk_req?.toFixed(1), unit:'V', highlight:true },
    { label:'Vka',          value:r.Vka?.toFixed(1),    unit:'V' },
    { label:'Vkb',          value:r.Vkb?.toFixed(1),    unit:'V' },
    { label:'Ktd',          value:r.Ktd_a?.toFixed(3) },
    { label:'ωTp',          value:r.omega_Tp?.toFixed(2) },
  ];
  // No internal fault current (issue #85): nothing was calculated, so no
  // PASS / FAIL cards — only the reason.
  if (type === 'transformer_diff' && r.isc_int_missing) return [
    { label:'Isc,max,int', value:Tp(lang,'metric_isc_int_missing'), ok:false, compact:true },
    { label: Tp(lang,'res_cable_r'), value: r.Rc?.toFixed(4), unit: 'Ω' },
  ];
  if (type === 'transformer_diff') return [
    { label:'EALF offered', value:r.EALF?.toFixed(1),    unit:'V', ok:r.is_ok },
    { label:'Vk required',  value:r.Vk_req?.toFixed(1),  unit:'V', highlight:true },
    { label:'EMF check',    value:r.emf_ok?'PASS':'FAIL', ok:r.emf_ok },
    { label:'Ziegler check',value:r.ziegler_ok?'PASS':'FAIL', ok:r.ziegler_ok },
    { label:'ALF operating',value:r.alf_o?.toFixed(2) },
    { label:'ALF Ziegler',  value:r.ALF_ziegler?.toFixed(2), highlight:true },
  ];
  if (type === 'vt') return [
    { label: Tp(lang,'res_vt_burden_util'),   value: r.burden_utilization?.toFixed(1),  unit: '%', ok: r.burden_ok },
    { label: Tp(lang,'res_vt_thermal_util'),  value: r.thermal_utilization?.toFixed(1), unit: '%', ok: r.thermal_ok },
    { label: Tp(lang,'res_vt_actual_burden'), value: r.actual_burden_va?.toFixed(2),    unit: 'VA', highlight: true },
    { label: Tp(lang,'res_vt_actual_current'),value: r.actual_current != null ? (r.actual_current*1000).toFixed(2) : undefined, unit: 'mA' },
    { label: Tp(lang,'res_vt_voltage_drop'),  value: r.voltage_drop_percent?.toFixed(3), unit: '%', ok: r.vdrop_ok },
    { label: Tp(lang,'res_cable_r'),          value: r.Rc?.toFixed(4),                  unit: 'Ω' },
  ];
  // Generic fallback (ct_generic.py): the ALF verdict ALF_act ≥ 1 — ALF eq
  // from Vk on the module's PX path — and the lead resistance (§10.6 F-GEN-UI)
  if (type === 'generic') return [
    { label: r.is_px && r.vk != null ? 'ALF eq' : Tp(lang,'res_alf_act'), value: r.alf_actual?.toFixed(2), ok: r.is_ok },
    { label: Tp(lang,'res_cable_r'), value: r.Rc?.toFixed(4), unit: 'Ω' },
  ];
  if (type === 'line_diff') return [
    { label:'EALF offered', value:r.EALF?.toFixed(1),      unit:'V', ok:r.is_ok },
    { label:'Vk required',  value:r.Vk_req?.toFixed(1),    unit:'V', highlight:true },
    { label:'EMF internal', value:r.E_internal?.toFixed(1), unit:'V' },
    { label:'EMF through',  value:r.E_through?.toFixed(1),  unit:'V' },
    // One lead resistance per scenario case (3-phase / 1-phase faults, §9.8)
    { label:Tp(lang,'res_cable_r_3ph'), value:r.Rc_3ph?.toFixed(4), unit:'Ω' },
    { label:Tp(lang,'res_cable_r_1ph'), value:r.Rc_1ph?.toFixed(4), unit:'Ω' },
  ];
}

// ── Company logo (Settings) ──────────────────────────────────────────────
// Stored as { type:'png'|'jpeg', data:<base64>, w, h } and embedded in the RTF
// report's front page (ctsizer-report.js). Never part of the feedback report.
function LogoPicker({ lang, logo, onChange }) {
  const ref = React.useRef(null);
  const [err, setErr] = useState(null);
  const pick = file => {
    setErr(null);
    const type = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpeg' : null;
    if (!type || file.size > 1024 * 1024) { setErr(Tp(lang,'settings_logo_bad')); return; }
    const r = new FileReader();
    r.onload = () => {
      const url = String(r.result);
      const img = new Image();
      img.onload = () => onChange({ type, data: url.slice(url.indexOf(',') + 1), w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => setErr(Tp(lang,'settings_logo_bad'));
      img.src = url;
    };
    r.readAsDataURL(file);
  };
  return (
    <div style={{marginTop:10}}>
      <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:6}}>{Tp(lang,'settings_logo')}</div>
      <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        {logo?.data && (
          <img data-testid="settings-logo" src={`data:image/${logo.type};base64,${logo.data}`} alt=""
            style={{maxWidth:140,maxHeight:50,objectFit:'contain',background:'#fff',borderRadius:4,padding:3,
                    border:'1px solid var(--border-2)'}}/>
        )}
        <button onClick={()=>ref.current?.click()} style={tplBtnSt}>{Tp(lang,'settings_logo_choose')}</button>
        {logo?.data && <button onClick={()=>onChange(null)} style={tplBtnSt}>{Tp(lang,'settings_logo_remove')}</button>}
        <input ref={ref} type="file" accept="image/png,image/jpeg" style={{display:'none'}}
          onChange={e=>{ if (e.target.files[0]) pick(e.target.files[0]); e.target.value=''; }}/>
      </div>
      {err && <div style={{marginTop:6,fontSize:11,color:'var(--red)'}}>{err}</div>}
    </div>
  );
}

// ── Settings Panel ───────────────────────────────────────────────────────
function SettingsPanel({ lang, setLang, themeMode, setThemeMode, settings, setSettings }) {
  const set = (k,v) => setSettings(s => ({...s,[k]:v}));
  const [saved, setSaved] = useState(false);
  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const themes = ['light','dark','auto'];
  const langs  = [['en','English'],['da','Dansk']];

  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const terms = CTSTerms.getAcceptance();
  const withdrawTerms = () => {
    if (!window.confirm(Tp(lang,'terms_withdraw_confirm'))) return;
    CTSTerms.revokeAcceptance();
    window.location.reload();
  };

  return (
    <div style={{maxWidth:640,margin:'0 auto',display:'flex',flexDirection:'column',gap:14}}>

      <SectionCard title={Tp(lang,'section_settings_user')}>
        <div style={{paddingTop:8,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <FormRow label={Tp(lang,'settings_full_name')}>
            <TextInput value={settings.full_name||''} onChange={v=>set('full_name',v)}/>
          </FormRow>
          <FormRow label={Tp(lang,'settings_initials')}>
            <TextInput value={settings.initials||''} onChange={v=>set('initials',v.toUpperCase())} mono/>
          </FormRow>
        </div>
      </SectionCard>

      <SectionCard title={Tp(lang,'section_settings_company')}>
        <div style={{paddingTop:8,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <FormRow label={Tp(lang,'settings_company')}>
            <TextInput value={settings.company_name||''} onChange={v=>set('company_name',v)}/>
          </FormRow>
          <FormRow label={Tp(lang,'settings_department')}>
            <TextInput value={settings.department||''} onChange={v=>set('department',v)}/>
          </FormRow>
          <FormRow label={Tp(lang,'settings_address')}>
            <TextInput value={settings.address||''} onChange={v=>set('address',v)}/>
          </FormRow>
          <FormRow label={Tp(lang,'settings_postal')}>
            <TextInput value={settings.postal_code||''} onChange={v=>set('postal_code',v)}/>
          </FormRow>
          <FormRow label={Tp(lang,'settings_city')}>
            <TextInput value={settings.city||''} onChange={v=>set('city',v)}/>
          </FormRow>
          <FormRow label={Tp(lang,'settings_country')}>
            <TextInput value={settings.country||''} onChange={v=>set('country',v)}/>
          </FormRow>
        </div>
        <LogoPicker lang={lang} logo={settings.logo} onChange={v=>set('logo',v)}/>
      </SectionCard>

      <SectionCard title={Tp(lang,'section_settings_prefs')}>
        <div style={{paddingTop:12,display:'flex',flexDirection:'column',gap:14}}>
          <div>
            <div style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)',
                          textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:7}}>
              {Tp(lang,'settings_lang')}
            </div>
            <div style={{display:'flex',gap:7}}>
              {langs.map(([l,label]) => (
                <button key={l} onClick={()=>setLang(l)}
                  style={{padding:'6px 16px',borderRadius:6,border:'none',cursor:'pointer',
                           fontFamily:'var(--font-mono)',fontSize:12,fontWeight:lang===l?700:400,
                           background:lang===l?'var(--accent-glow)':'var(--surface-3)',
                           color:lang===l?'var(--accent)':'var(--text-dim)',
                           boxShadow:lang===l?'0 0 0 1px var(--accent)':'none'}}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)',
                          textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:7}}>
              {Tp(lang,'settings_theme')}
            </div>
            <div style={{display:'flex',gap:7}}>
              {themes.map(t => (
                <button key={t} onClick={()=>setThemeMode(t)}
                  style={{padding:'6px 16px',borderRadius:6,border:'none',cursor:'pointer',
                           fontFamily:'var(--font-mono)',fontSize:12,fontWeight:themeMode===t?700:400,
                           background:themeMode===t?'var(--accent-glow)':'var(--surface-3)',
                           color:themeMode===t?'var(--accent)':'var(--text-dim)',
                           boxShadow:themeMode===t?'0 0 0 1px var(--accent)':'none'}}>
                  {Tp(lang,`settings_theme_${t}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={Tp(lang,'section_settings_terms')}>
        <div style={{paddingTop:12,display:'flex',flexDirection:'column',gap:10}}>
          {terms && (
            <div style={{fontSize:12,color:'var(--text-dim)',fontFamily:'var(--font-mono)'}}>
              {Tp(lang,'terms_accepted').replace('{v}',terms.version)
                .replace('{d}',new Date(terms.acceptedAt).toLocaleString(lang==='da'?'da-DK':'en-GB'))}
            </div>
          )}
          <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
            <button onClick={()=>setShowTerms(true)}
              style={{padding:'6px 16px',borderRadius:6,border:'none',cursor:'pointer',fontFamily:'var(--font-mono)',
                       fontSize:12,background:'var(--surface-3)',color:'var(--text-dim)'}}>
              {Tp(lang,'terms_view')}
            </button>
            <button onClick={()=>setShowPrivacy(true)}
              style={{padding:'6px 16px',borderRadius:6,border:'none',cursor:'pointer',fontFamily:'var(--font-mono)',
                       fontSize:12,background:'var(--surface-3)',color:'var(--text-dim)'}}>
              {Tp(lang,'privacy_view')}
            </button>
            <button onClick={withdrawTerms}
              style={{padding:'6px 16px',borderRadius:6,border:'1px solid var(--red)',cursor:'pointer',
                       fontFamily:'var(--font-mono)',fontSize:12,background:'var(--red-bg)',color:'var(--red)'}}>
              {Tp(lang,'terms_withdraw')}
            </button>
          </div>
        </div>
      </SectionCard>
      {showTerms && <TermsViewer lang={lang} onClose={()=>setShowTerms(false)}/>}
      {showPrivacy && <PrivacyViewer lang={lang} onClose={()=>setShowPrivacy(false)}/>}

      <div style={{display:'flex',justifyContent:'flex-end',alignItems:'center',gap:12}}>
        {saved && <span style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--green)'}}>{Tp(lang,'settings_saved')} ✓</span>}
        <button onClick={save}
          style={{padding:'8px 20px',borderRadius:6,background:'var(--accent)',color:'#fff',
                   border:'none',cursor:'pointer',fontFamily:'var(--font-head)',fontSize:13,fontWeight:600}}>
          Save
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { SystemPanel, CoreInputPanel, ResultsPanel, SettingsPanel });
