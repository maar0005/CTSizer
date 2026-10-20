// ctsizer-panels.jsx
const { useState, useMemo, useEffect } = React;
const Tp = (lang, k) => CTSI18n.t(lang, k);
const inputSt = { background:'var(--surface-2)', border:'1px solid var(--border-2)',
  color:'var(--text)', borderRadius:5, padding:'5px 8px',
  fontFamily:'var(--font-mono)', fontSize:12, outline:'none', width:'100%' };

// ── Shared cable section ──────────────────────────────────────────────────
// Per-core cable run and wiring. The method and the conductor temperature are
// project settings (SystemPanel, PORTING_PLAN.md §9.4). The wiring is per core
// (core.cable_topology, chosen by the user, §9.8), with a help picture.
// `attached` (metering / VT): the attached resistor Rres, a part of the
// secondary circuit, is entered here too ({ label, max }). No default values:
// every field starts blank (calc/required.js).
function CableSection({ lang, v, set, calcType, attached }) {
  const topology = v.cable_topology;
  // The attached resistor in the wiring picture, once entered (and, on a VT,
  // once its place is picked)
  const rAt = !attached || !(Number(v.attached_resistor) > 0) ? null
    : attached.placement ? (v.vt_resistor_location === 'vt' || v.vt_resistor_location === 'meter' ? v.vt_resistor_location : null)
      : 'series';
  return (
    <SectionCard title={Tp(lang,'section_cable')} defaultOpen={false} section="cable">
      <div style={{ paddingTop: 8 }}>
        <FormRow label={Tp(lang,'lbl_cable_length')} unit="m" field="cable_length">
          <NumInput value={v.cable_length} onChange={x=>set('cable_length',x)} min={0} max={5000} step={1}/>
        </FormRow>
        <FormRow label={Tp(lang,'lbl_cable_cross')} unit="mm²" field="cable_cross">
          <SelectInput value={v.cable_cross} onChange={x=>set('cable_cross',parseFloat(x))}
            options={CTRequired.CABLE_CROSS.map(c=>[String(c),String(c)])}/>
        </FormRow>
        <FormRow label={Tp(lang,'lbl_cable_mat')} field="cable_mat">
          <SelectInput value={v.cable_mat} onChange={x=>set('cable_mat',x)}
            options={[['cu',Tp(lang,'lbl_cu')],['al',Tp(lang,'lbl_al')]]}/>
        </FormRow>
        <FormRow label={Tp(lang,'lbl_cable_topology')} field="cable_topology">
          <SelectInput value={topology} onChange={x=>set('cable_topology',x)}
            options={CTCalc.cableRes.listTopologies().map(t=>[t.id, lang==='da'?t.label_da:t.label_en])}/>
        </FormRow>
        {topology && <WiringDiagram lang={lang} topology={topology} calcType={calcType} resistor={rAt}/>}
        {attached && (
          <FormRow label={Tp(lang,attached.label)} unit="Ω" field="attached_resistor">
            <NumInput value={v.attached_resistor} onChange={x=>set('attached_resistor',x)} min={0} max={attached.max} step={0.01}/>
          </FormRow>
        )}
        {/* VT: where the resistor sits decides the current in the lead (CTVT.calculate) */}
        {attached && attached.placement && Number(v.attached_resistor) > 0 && <>
          <FormRow label={Tp(lang,'lbl_vt_resistor_at')} wide field="vt_resistor_location">
            <SelectInput value={v.vt_resistor_location} onChange={x=>set('vt_resistor_location',x)}
              options={[['vt', Tp(lang,'vt_resistor_at_vt')], ['meter', Tp(lang,'vt_resistor_at_meter')]]}/>
          </FormRow>
          <div style={noteSt}>{Tp(lang,'vt_resistor_at_note')}</div>
        </>}
        {attached && attached.note && <div style={noteSt}>{Tp(lang,attached.note)}</div>}
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
// No default values: every field starts blank and is marked until entered
// (CTRequired.system); no core is calculated before the station data is complete.
function SystemPanel({ lang, v, onChange }) {
  const set = (k,x) => onChange({...v,[k]:x});
  // Picking a method in a project saved before the ρ20 source existed makes
  // the source a required input (null), so only an untouched old project
  // keeps the IEC values without a pick (#132). Handlers write null, never
  // delete the key: an absent key means "saved before the choice".
  const setMethod = (x) => onChange({ ...v, cable_r_method: x,
    ...(v.cable_rho_mode === undefined ? { cable_rho_mode: null } : {}) });
  const setRhoMode = (x) => onChange({ ...v, cable_rho_mode: x,
    ...(x === 'iec' ? { cable_rho20_cu: null, cable_rho20_al: null } : {}) });
  const chk = useMemo(() => ({ ...CTRequired.system(v), lang }), [v, lang]);
  return (
    <InputCheck.Provider value={chk}>
    <SectionCard title={Tp(lang,'section_system')} defaultOpen section="station">
      <div style={{paddingTop:8}}>
        <div className="ctsizer-pair" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <FormRow label={Tp(lang,'lbl_station_name')} field="station_name">
            <input type="text" value={v.station_name||''} onChange={e=>set('station_name',e.target.value)}
              placeholder={Tp(lang,'placeholder_name')}
              style={{background:'var(--surface-2)',border:'1px solid var(--border-2)',color:'var(--text)',
                      borderRadius:5,padding:'5px 8px',fontFamily:'var(--font-body)',fontSize:12,width:'100%',outline:'none'}}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_station_abbr')} field="station_abbr">
            <input type="text" value={v.station_abbr||''} maxLength={12}
              onChange={e=>set('station_abbr',e.target.value.toUpperCase())}
              placeholder={Tp(lang,'placeholder_abbr')}
              style={{background:'var(--surface-2)',border:'1px solid var(--border-2)',color:'var(--accent)',
                      borderRadius:5,padding:'5px 8px',fontFamily:'var(--font-mono)',fontSize:12,width:'100%',outline:'none',letterSpacing:'0.08em'}}/>
          </FormRow>
        </div>
        <FormRow label={Tp(lang,'lbl_voltage')} unit="kV" field="voltage">
          <NumInput value={v.voltage} onChange={x=>set('voltage',x)} min={0} max={1200}/>
        </FormRow>
        <FormRow label={Tp(lang,'lbl_freq')} unit="Hz" field="freq">
          <SelectInput value={v.freq} onChange={x=>set('freq',x)} options={[['50','50 Hz'],['60','60 Hz']]}/>
        </FormRow>
        <FormRow label={Tp(lang,'lbl_isc_sys')} unit="kA" field="isc_sys">
          <NumInput value={v.isc_sys} onChange={x=>set('isc_sys',x)} min={0} max={200} step={0.1}/>
        </FormRow>
        <div style={{display:'flex',alignItems:'flex-end',gap:10}}>
          <div style={{flex:1}}>
            <FormRow label={Tp(lang,'lbl_tp')} unit="ms" field="tp">
              <NumInput value={v.tp} onChange={x=>set('tp',x)} min={1} max={500} step={1}/>
            </FormRow>
          </div>
          <label style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',paddingBottom:7,flexShrink:0}}>
            <input type="checkbox" checked={!!v.tp_confirmed} onChange={e=>set('tp_confirmed',e.target.checked)}/>
            <span style={{fontSize:11,color:'var(--text-dim)'}}>{Tp(lang,'lbl_tp_confirm')}</span>
          </label>
        </div>
        <FormRow label={Tp(lang,'lbl_cable_r_method')} wide field="cable_r_method">
          <SelectInput value={v.cable_r_method} onChange={setMethod}
            options={CTCalc.cableRes.listMethods().map(m=>[m.id, lang==='da'?m.label_da:m.label_en])}/>
        </FormRow>
        {v.cable_r_method === 'iec60287' && (<>
          <FormRow label={Tp(lang,'lbl_cable_rho_mode')} wide field="cable_rho_mode">
            <SelectInput value={v.cable_rho_mode} onChange={setRhoMode}
              options={[['iec', Tp(lang,'rho_mode_iec')], ['manual', Tp(lang,'rho_mode_manual')]]}/>
          </FormRow>
          {v.cable_rho_mode === 'manual' && (<>
            <FormRow label={Tp(lang,'lbl_cable_rho20_cu')} unit="Ω·mm²/m" field="cable_rho20_cu">
              <NumInput value={v.cable_rho20_cu} onChange={x=>set('cable_rho20_cu',x)} min={0.01} max={0.05}/>
            </FormRow>
            <FormRow label={Tp(lang,'lbl_cable_rho20_al')} unit="Ω·mm²/m" field="cable_rho20_al">
              <NumInput value={v.cable_rho20_al} onChange={x=>set('cable_rho20_al',x)} min={0.01} max={0.05}/>
            </FormRow>
          </>)}
        </>)}
        <FormRow label={Tp(lang,'lbl_project_cable_temp')} unit="°C" field="cable_temp">
          <NumInput value={v.cable_temp} onChange={x=>set('cable_temp',x)} min={-20} max={90} step={1}/>
        </FormRow>
        <CableRhoInfo lang={lang} v={v}/>
        {/* Optional: national metering rules (calc/local_rules/); blank is none */}
        <FormRow label={Tp(lang,'lbl_local_rules')} wide field="local_rules">
          <SelectInput value={v.local_rules || ''} onChange={x=>set('local_rules',x || null)}
            options={[['', Tp(lang,'local_rules_none')],
              ...CTLocalRules.list().map(r=>[r.id, CTLocalRules.label(r, lang)])]}/>
        </FormRow>
        <div style={noteSt}>{Tp(lang,'local_rules_note')}</div>
      </div>
    </SectionCard>
    </InputCheck.Provider>
  );
}

// ── Overcurrent Input Panel ──────────────────────────────────────────────
function OvercurrentInputs({ lang, v, set, onChange, systemVals }) {
  return (
    <>
      <SectionCard title={Tp(lang,'section_ct')} defaultOpen accent section="ct">
        <div style={{paddingTop:8}}>
          <CTClassRow lang={lang} v={v} onChange={onChange}/>
          <PrimarySecondaryRow lang={lang} v={v} set={set}/>
          <RctRow lang={lang} v={v} set={set} onChange={onChange} systemVals={systemVals} calcType="overcurrent"/>
          <FormRow label={Tp(lang,'lbl_burden')} unit="VA" field="burden">
            <NumInput value={v.burden} onChange={x=>set('burden',x)} min={0} max={200} step={0.1}/>
          </FormRow>
          <AlfVkRow lang={lang} v={v} set={set} onChange={onChange}/>
          <div style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)',marginTop:6}}>Isc max: from Station Data (Ik max)</div>
        </div>
      </SectionCard>
      <RelaySection lang={lang} v={v} set={set} onChange={onChange} calcType="overcurrent"/>
      <CableSection lang={lang} calcType="overcurrent" v={v} set={(k,x)=>set(k,x)}/>
    </>
  );
}

// ── Metering Input Panel ─────────────────────────────────────────────────
// Issue #125: each value in the card of the equipment it belongs to — the CT
// nameplate here (FS is a CT rating), the meter's burden and Fmin in the
// Meter / Relay / IED card, the attached resistor with the cable.
// The resistivity the cable method uses (#132), read-only under the method:
// ρ20, α20 and ρ(T) per metal for the formula method, the IEC 60228 note for
// the table method. Only entered / derived values are shown: no ρ before a
// source is picked, no ρ(T) before the cable temperature is entered.
function CableRhoInfo({ lang, v }) {
  const r = CTCalc.cableRes.resistivity(v);
  if (!r.method) return null;
  const metals = [['cu', r.cu], ['al', r.al]];
  if (!r.uses_rho) {
    return (
      <div data-testid="cable-rho-info" data-mode="table" style={noteSt}>
        <div>{Tp(lang,'rho_table_note')}</div>
        {metals.map(([k, m]) => <div key={k}>{Tp(lang,`rho_metal_${k}`)}: α20 = {m.alpha} 1/K</div>)}
      </div>
    );
  }
  if (!r.mode) return null;
  const src = r.legacy ? 'rho_src_legacy' : r.mode === 'manual' ? 'rho_src_manual' : 'rho_src_iec';
  return (
    <div data-testid="cable-rho-info" data-mode={r.legacy ? 'legacy' : r.mode} style={noteSt}>
      {metals.map(([k, m]) => (
        <div key={k} data-metal={k}>
          {Tp(lang,`rho_metal_${k}`)}:
          {m.rho20 != null && <> ρ20 = {CTCalc.cableRes.fmtRho(m.rho20)} Ω·mm²/m ·</>}
          {' '}α20 = {m.alpha} 1/K
          {m.rho_t != null && <> · ρ({r.temp_c} °C) = {m.rho_t.toFixed(6)} Ω·mm²/m</>}
        </div>
      ))}
      {r.temp_c == null && <div>{Tp(lang,'rho_info_temp')}</div>}
      <div>{Tp(lang, src)}</div>
    </div>
  );
}

const MT_CLASSES = CTRequired.MT_CLASSES;
const noteSt = { fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)', marginTop:6 };
function MeteringInputs({ lang, v, set, onChange, localRules, systemVals }) {
  const fromClass = MT_CLASSES.includes(v.mt_class);
  return (
    <>
      <SectionCard title={Tp(lang,'section_ct') + ' — ' + Tp(lang,'ct_type_metering')} defaultOpen accent section="ct">
        <div style={{paddingTop:8}}>
          <PrimarySecondaryRow lang={lang} v={v} set={set}/>
          <RctRow lang={lang} v={v} set={set} onChange={onChange} systemVals={systemVals} calcType="metering"/>
          <FormRow label={Tp(lang,'lbl_burden')} unit="VA" field="burden">
            <NumInput value={v.burden} onChange={x=>set('burden',x)} min={0} max={100} step={0.1}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_mt_class')} field="mt_class">
            <SelectInput value={v.mt_class} onChange={x=>set('mt_class',x)}
              options={[['custom', Tp(lang,'mt_class_custom')], ...MT_CLASSES.map(c=>[c,c])]}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_fs')} field="fs_factor">
            <NumInput value={v.fs_factor} onChange={x=>set('fs_factor',x)} min={1} max={50} step={1}/>
          </FormRow>
          <div style={noteSt}>{Tp(lang,'fs_note')}</div>
          <div style={{marginTop:11,display:'flex',alignItems:'center',gap:7}}>
            <label style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer'}}>
              <input type="checkbox" data-testid="mt-extended-range" checked={!!v.extended_burden_range}
                onChange={e=>set('extended_burden_range',e.target.checked)}/>
              <span style={{fontSize:12,color:'var(--text-dim)'}}>{Tp(lang,'lbl_extended_range')}</span>
            </label>
          </div>
          <div style={noteSt}>{Tp(lang,'extended_range_note')}</div>
          {!v.extended_burden_range && <>
            <FormRow label={Tp(lang,'lbl_min_burden_pct')} unit="%" field="min_burden_percent">
              <NumInput value={fromClass ? CTMetering.sminPercent(v) : v.min_burden_percent}
                onChange={x=>set('min_burden_percent',x)} min={0} max={100} step={1} readOnly={fromClass}/>
            </FormRow>
            {fromClass && <div style={noteSt}>{Tp(lang,'smin_from_class')}</div>}
          </>}
        </div>
      </SectionCard>
      <MeterSection lang={lang} v={v} set={set} onChange={onChange} calcType="metering" localRules={localRules}/>
      <CableSection lang={lang} calcType="metering" v={v} set={(k,x)=>set(k,x)}
        attached={{ label:'lbl_attached_r', max:100, note:'attached_r_ct_note' }}/>
    </>
  );
}

// ── Meter / Relay / IED section (metering CT and VT cores) ────────────────
// Issue #125. The same card position and look as RelaySection on the
// protection panels. A preset (CTMeterDB, calc/meters.js) fills the meter
// burden and, on a metering core, Fmin; unlike the relay database the values
// stay editable, and a changed value keeps the model with a "modified from
// preset" note. On a VT core the supply mode fills the burden (aux 0.1 VA,
// self-powered 6 VA per phase), also editable.
// No default values (calc/required.js): nothing is pre-picked. A picked
// preset fills the burden and Fmin (on a VT core for the supply mode, once
// that is picked); a meter without a preset is typed.
function MeterSection({ lang, v, set, onChange, calcType, localRules }) {
  const Tl = k => CTSI18n.t(lang, k);
  const fmt = (k, o) => Object.keys(o).reduce((t, x) => t.replace(`{${x}}`, o[x]), Tl(k));
  const isVt = calcType === 'vt';
  const mode = v.vt_supply_mode === 'aux' || v.vt_supply_mode === 'self' ? v.vt_supply_mode : null;
  const preset = CTMeterDB.byId(v.meter_model);
  const dbMfrs = CTMeterDB.manufacturers();
  const mfr = v.meter_manufacturer || '';
  const mfrs = [...new Set([...dbMfrs, ...(mfr ? [mfr] : []), 'Other'])];
  const models = mfr ? CTMeterDB.list(mfr) : [];
  const modified = CTMeterDB.modifiedFields(v, calcType);
  const presetFor = (id, m) => (!CTMeterDB.byId(id) || (isVt && !m)) ? {} : CTMeterDB.presetValues(id, calcType, m);
  const pickMfr = m => { const n = { ...v, meter_manufacturer:m }; delete n.meter_model; onChange(n); };
  const pickModel = id => {
    const n = { ...v };
    if (!id) { delete n.meter_model; onChange(n); return; }
    onChange({ ...n, meter_model:id, meter_manufacturer:CTMeterDB.byId(id).manufacturer, ...presetFor(id, mode) });
  };
  const pickMode = m => onChange({ ...v, vt_supply_mode:m, ...presetFor(v.meter_model, m) });
  const burden = isVt ? CTVT.migrateInputs(v).device_burden : v.device_burden;
  return (
    <SectionCard title={Tl('section_meter')} defaultOpen section="meter">
      <div data-testid="meter-section" style={{paddingTop:8}}>
        <FormRow label={Tl('lbl_meter_manufacturer')} field="meter_manufacturer">
          <SelectInput value={mfr} onChange={pickMfr} options={mfrs.map(m=>[m,m])}/>
        </FormRow>
        <FormRow label={Tl('lbl_meter_model')} wide>
          <SelectInput value={preset ? v.meter_model : ''} onChange={pickModel}
            options={[['', Tl('meter_custom')], ...models.map(m=>[m.id, m.model])]}/>
        </FormRow>
        {!preset && (
          <FormRow label={Tl('lbl_meter_type')}>
            <TextInput value={v.meter_type||''} onChange={x=>set('meter_type',x)} placeholder="e.g. Prometer 100"/>
          </FormRow>
        )}
        <FormRow label={Tl('lbl_meter_tag')}>
          <TextInput value={v.meter_tag||''} onChange={x=>set('meter_tag',x)} placeholder="e.g. M1"/>
        </FormRow>
        {isVt && (
          <FormRow label={Tl('lbl_vt_supply')} wide field="vt_supply_mode">
            <SelectInput value={mode} onChange={pickMode}
              options={[['aux', Tl('vt_supply_aux')], ['self', Tl('vt_supply_self')]]}/>
          </FormRow>
        )}
        <FormRow label={Tl('lbl_meter_burden')} unit="VA/ph" field="device_burden">
          <NumInput value={burden} onChange={x=>set('device_burden',x)} min={0} max={isVt ? 1000 : 100} step={0.1}/>
        </FormRow>
        {!isVt && <>
          <FormRow label={Tl('lbl_meter_fmin')} field="min_safety_factor">
            <NumInput value={v.min_safety_factor} onChange={x=>set('min_safety_factor',x)}
              min={1} max={100} step={1}/>
          </FormRow>
          <div style={noteSt}>{Tl('meter_fmin_note')}</div>
        </>}
        {!isVt && CTLocalRules.byId(localRules) && <MeterClassRows lang={lang} v={v} set={set} onChange={onChange}/>}
        {isVt && <div style={noteSt}>{Tl('vt_supply_note')}</div>}
        {preset && (
          <div data-testid={modified.length ? 'meter-modified' : 'meter-from-preset'} style={noteSt}>
            {fmt(modified.length ? 'meter_modified' : 'meter_preset_note', { model: `${preset.manufacturer} ${preset.model}` })}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ── Busbar Input Panel ───────────────────────────────────────────────────
function BusbarInputs({ lang, v, set, onChange, systemVals }) {
  return (
    <>
      <SectionCard title={Tp(lang,'section_ct') + ' — ' + Tp(lang,'ct_type_busbar')} defaultOpen accent section="ct">
        <div style={{paddingTop:8}}>
          <PrimarySecondaryRow lang={lang} v={v} set={set}/>
          <RctRow lang={lang} v={v} set={set} onChange={onChange} systemVals={systemVals} calcType="busbar"/>
          <FormRow label={Tp(lang,'lbl_burden')} unit="VA" field="burden">
            <NumInput value={v.burden} onChange={x=>set('burden',x)} min={0} max={200} step={0.1}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_alf')} field="alf">
            <NumInput value={v.alf} onChange={x=>set('alf',x)} min={1} max={200} step={1}/>
          </FormRow>
        </div>
      </SectionCard>
      <RelaySection lang={lang} v={v} set={set} onChange={onChange} calcType="busbar"/>
      <CableSection lang={lang} calcType="busbar" v={v} set={(k,x)=>set(k,x)}/>
    </>
  );
}

// ── CT Class selector ────────────────────────────────────────────────────
const CT_FAMILIES = CTRequired.CT_FAMILIES;
const CT_ALF_OPTS = [5,10,15,20,30,40,50];

// One ALF for the class row and the ALF field (issue #88): the core's alf,
// blank until entered (no default). Typing an ALF that is one of the select's
// options also sets ct_class_alf; any other ALF is added to the select, and
// the class label shows it.
const withAlf = (v, a) => CT_ALF_OPTS.includes(a) ? { ...v, alf:a, ct_class_alf:a } : { ...v, alf:a };

// The class decides how the core is specified (the Python tool's data_io.py): PX, TPX,
// TPY and TPZ by Vk (no ALF select; AlfVkRow shows the Vk field), so picking
// a class also sets is_px (PORTING_PLAN.md §10.6 F-TP-PX). A core stored
// without a class shows PX when is_px is set (CTRequired.ctFamily); otherwise
// no class is picked until the user picks one.
function CTClassRow({ lang, v, onChange }) {
  const chk = React.useContext(InputCheck);
  const family = CTRequired.ctFamily(v);
  const alfVal = v.alf ?? null;
  const alfOpts = alfVal == null || CT_ALF_OPTS.includes(alfVal) ? CT_ALF_OPTS : [...CT_ALF_OPTS, alfVal].sort((a,b)=>a-b);
  const isPxFamily = !!family && CTBaseClasses.isVkClass(family);
  const ph = CTSI18n.t(lang, 'select_ph');
  const famMark = chk?.fields.ct_class_family;
  const alfMark = !isPxFamily && chk?.fields.alf;
  return (
    <div data-field="ct_class_family" data-missing={famMark || undefined}
      style={{marginTop:10,padding:'8px 10px',background:'var(--surface-3)',borderRadius:6,
                  border:'1px solid var(--border)'}}>
      <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--text-muted)',
                     textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>
        CT Class
        {(famMark || alfMark) && <MissingMark reason={famMark === 'invalid' || alfMark === 'invalid' ? 'invalid' : 'missing'} lang={lang}/>}
      </div>
      <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
        <select value={family ?? ''} style={{...inputSt,width:'auto',minWidth:80}}
          onChange={e=>{
            const fam = e.target.value;
            onChange({...v, ct_class_family:fam, is_px:CTBaseClasses.isVkClass(fam)});
          }}>
          {!family && <option value="" disabled>{ph}</option>}
          {CT_FAMILIES.map(f=><option key={f} value={f}>{f}</option>)}
        </select>
        {family && !isPxFamily && (
          <select value={alfVal ?? ''} style={{...inputSt,width:'auto',minWidth:60}}
            onChange={e=>{
              const a = parseInt(e.target.value);
              onChange({...v, ct_class_alf:a, alf:a});
            }}>
            {alfVal == null && <option value="" disabled>ALF</option>}
            {alfOpts.map(a=><option key={a} value={a}>{a}</option>)}
          </select>
        )}
        {family && (
          <span data-testid="ct-class-label" style={{fontFamily:'var(--font-mono)',fontSize:13,fontWeight:700,color:'var(--accent)'}}>
            {isPxFamily ? family : `${family}${alfVal ?? ''}`}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Relay info section ────────────────────────────────────────────────────
// The one place for the relay data, on every calc type with a relay
// (CTRelayDB.supports: not metering / VT). Picking an IED from the Python tool's
// relay database (CTRelayDB, calc/relays.js) stores relay_model and fills the
// manufacturer, model, SR for the core's Isr and t_al; CoreInputPanel runs
// CTRelayDB.apply on every change, so a new Isr brings its burden. Those
// fields are then read-only; "Manual entry" (no relay_model) types them.
// An IED with operate times (CTRelayDB.operateTime) asks for the protection
// function (when it lists more than one for the calc type), inrush detection
// and network delay (when the function has them); t_al is then the
// function's time at the project's rated frequency plus those, blank until
// they are entered. An IED with no operate time for the calc type (7SS85
// busbar) leaves t_al to be typed.
// No default values: the manufacturer and SR start blank (calc/required.js);
// with auto-reclosure on, t_al (and the choices it needs) is required too.
const RELAY_MANUFACTURERS = ['Siemens','ABB','GE','SEL','Sprecher','Schweitzer','Areva','Other'];
const RELAY_TAL_TEXT = {
  distance:  ['relay_tal_ph_distance', 'relay_tal_note_distance'],
  line_diff: ['relay_tal_ph_ar',       'relay_tal_note_line_diff'],
};
function RelaySection({ lang, v, set, onChange, calcType }) {
  const Tl = k => CTSI18n.t(lang, k);
  const fmt = (k, o) => Object.keys(o).reduce((t, x) => t.replace(`{${x}}`, o[x]), Tl(k));
  const setOpt = (k,x) => { const n={...v}; if (x==null) delete n[k]; else n[k]=x; onChange(n); };
  const mfr = v.relay_manufacturer || '';
  const mfrs = [...new Set([...CTRelayDB.manufacturers(), ...RELAY_MANUFACTURERS, ...(mfr ? [mfr] : [])])];
  const ieds = mfr ? CTRelayDB.list(mfr, calcType) : [];
  const hit = CTRelayDB.lookup(v.relay_model, v.Is, calcType, null, v);
  const times = hit && hit.times;
  const fn = times && times.fn;
  const talDb = !!hit && hit.tal_db;
  const Is = v.Is ?? '\u2014';
  // The function's operate time as the manufacturer states it
  const fnMs = f => typeof f.ms === 'number' ? `${f.ms} ms`
    : Object.keys(f.ms).map(hz => `${f.ms[hz]} ms (${hz} Hz)`).join(' / ');
  const [talPh, talNote] = RELAY_TAL_TEXT[calcType] || ['relay_tal_ph_other', 'relay_tal_note_other'];
  const pickMfr = m => { const n = { ...v, relay_manufacturer:m }; delete n.relay_model; onChange(n); };
  const pickIed = name => {
    const n = { ...v };
    if (name) n.relay_model = name; else delete n.relay_model;
    onChange(n);
  };
  const note = { fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)', marginTop:6 };
  return (
    <SectionCard title={Tl('section_relay')} defaultOpen section="relay">
      <div style={{paddingTop:8}}>
        <FormRow label={Tl('lbl_relay_manufacturer')} field="relay_manufacturer">
          <SelectInput value={mfr} onChange={pickMfr} options={mfrs.map(m=>[m,m])}/>
        </FormRow>
        {!mfr ? null : ieds.length > 0 ? (
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
        <FormRow label={Tl('lbl_relay_burden')} unit="VA" field="relay_burden">
          <NumInput value={v.relay_burden} onChange={x=>set('relay_burden',x)}
            min={0} max={10} step={0.01} readOnly={!!hit && hit.burden_va != null}/>
        </FormRow>
        {times && times.functions.length > 1 && (
          <FormRow label={Tl('lbl_relay_function')} field="relay_function" wide>
            <SelectInput value={v.relay_function} onChange={x=>set('relay_function',x)}
              options={times.functions.map(f=>[f.function, `${Tl('relay_fn_'+f.function)} \u2014 ${fnMs(f)}`])}/>
          </FormRow>
        )}
        {fn && fn.inrush_ms != null && (
          <FormRow label={Tl('lbl_relay_inrush')} field="relay_inrush">
            <SelectInput value={v.relay_inrush} onChange={x=>set('relay_inrush',x==='true')}
              options={[['true', fmt('relay_inrush_yes', { ms: fn.inrush_ms })], ['false', Tl('relay_inrush_no')]]}/>
          </FormRow>
        )}
        {fn && fn.network_delay && (
          <FormRow label={Tl('lbl_relay_network_delay')} unit="ms" field="relay_network_delay">
            <OptNumInput value={v.relay_network_delay} onChange={x=>setOpt('relay_network_delay',x)} min={0} max={1000} step={1}/>
          </FormRow>
        )}
        <FormRow label={Tl('lbl_relay_tal')} unit="ms" field="relay_tal">
          <OptNumInput value={v.relay_tal} onChange={x=>setOpt('relay_tal',x)} min={1} max={500} step={5}
            placeholder={Tl(talPh)} readOnly={talDb}/>
        </FormRow>
        {fn && (
          <div data-testid="relay-operate-time" style={note}>
            {fmt('relay_operate_time', { fn: Tl('relay_fn_'+fn.function), ms: fnMs(fn) })}
            {fn.inrush_ms != null ? fmt('relay_operate_time_inrush', { ms: fn.inrush_ms }) : ''}
            {fn.network_delay ? Tl('relay_operate_time_network') : ''}
          </div>
        )}
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

// ── ALF or Vk, as the CT class row says ──────────────────────────────────
// PX, TPX, TPY and TPZ are specified by their knee point voltage (the Python tool's
// data_io.py: the Vk field, no ALF); the other classes by ALF. There is no
// separate "PX class CT" box: the class decides (PORTING_PLAN.md §10.6
// F-TP-PX). The Vk of a Vk class is required like the ALF of the others
// (calc/required.js); no class picked yet shows the ALF field.
function AlfVkRow({ lang, v, set, onChange }) {
  const Tl = k => CTSI18n.t(lang, k);
  const family = CTRequired.ctFamily(v);
  if (!family || !CTBaseClasses.isVkClass(family)) return (
    <FormRow label={Tl('lbl_alf')} field="alf">
      <NumInput value={v.alf} onChange={x=>onChange(withAlf(v,x))} min={1} max={200} step={1}/>
    </FormRow>
  );
  return (
    <FormRow label={Tl('lbl_vk')} unit="V" field="vk">
      <NumInput value={v.vk} onChange={x=>set('vk',x)} min={0} max={10000}/>
    </FormRow>
  );
}

// ── Shared CT primary / secondary row ─────────────────────────────────────
function PrimarySecondaryRow({ lang, v, set }) {
  const Tl = k => CTSI18n.t(lang, k);
  return (
    <div className="ctsizer-pair" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
      <FormRow label={Tl('lbl_Ip')} unit="A" field="Ip">
        <NumInput value={v.Ip} onChange={x=>set('Ip',x)} min={1} max={100000}/>
      </FormRow>
      <FormRow label={Tl('lbl_Is')} unit="A" field="Is">
        <SelectInput value={v.Is} onChange={x=>set('Is',parseFloat(x))} options={[['1','1 A'],['5','5 A']]}/>
      </FormRow>
    </div>
  );
}

// ── Shared Rct row ────────────────────────────────────────────────────────
// Rct typed, or estimated by rule of thumb (the "Estimate Rct" box,
// rct_estimate): Rct ≈ N · r_turn, N = Np · Ip / Is, with Np (rct_np, the
// primary turns) typed and r_turn from the station voltage (CTRctEstimate,
// applied by CTCalc.moduleCore). The estimate is shown read-only with its
// basis, range and the notes that apply. "rule of thumb" is an InfoMark: its
// box explains the estimate and shows the table, the core's cell highlighted
// (ticked or not). Ticking the box drops a typed rct; unticking drops Np and
// leaves Rct to type (no default). Not on generic, which has no Ip. Made for
// P, PR and metering cores; on a class whose Rct is a rated value (PX, PXR,
// TPX, TPY, TPZ) a warning says the estimate is very uncertain
// (CTRctEstimate.notes, also the RTF's remarks).
const RCT_BASIS_MARK = { data: 'd', limits: 'l', derived: 'x' };
function RctRow({ lang, v, onChange, set, systemVals, calcType }) {
  const [info, setInfo] = useState(false);
  const closeInfo = React.useCallback(() => setInfo(false), []);
  const Tl = k => CTSI18n.t(lang, k);
  const can = CTCalc.RCT_ESTIMATE_TYPES.includes(calcType);
  const est = can && CTCalc.rctEstimated(calcType, v);
  // the core's table cell (also unticked: the info table highlights it)
  const cellE = can ? CTRctEstimate.lookup(v, systemVals?.voltage) : null;
  const e = est ? CTRctEstimate.estimate(v, systemVals?.voltage) : null;
  const toggle = on => {
    const n = { ...v };
    if (on) { n.rct_estimate = true; delete n.rct; } else { delete n.rct_estimate; delete n.rct_np; }
    onChange(n);
  };
  const { BANDS, TABLE } = CTRctEstimate;
  const cell = { padding:'2px 5px', textAlign:'right', borderBottom:'1px solid var(--border)' };
  const txt = { fontSize:12, color:'var(--text-dim)' };
  const para = { margin:'0 0 6px' };
  const small = { fontSize:11, fontFamily:'var(--font-mono)', margin:'4px 0 2px' };
  const notes = CTRctEstimate.notes(e, calcType);
  return (
    <>
      <FormRow label={Tl('lbl_rct')} unit="Ω" field="rct">
        {est ? <NumInput value={e?.rct} readOnly/>
          : <NumInput value={v.rct} onChange={x=>set('rct',x)} min={0} max={100} step={0.01}/>}
      </FormRow>
      {can && (
        <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',marginTop:5}}>
          <label style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer'}}>
            <input type="checkbox" data-testid="rct-estimate" checked={est} onChange={x=>toggle(x.target.checked)}/>
            <span style={txt}>{Tl('rct_est_toggle')}&nbsp;(</span>
          </label>
          <span style={txt}>
            <InfoMark label={Tl('rct_est_rule')} open={info} onToggle={()=>setInfo(x=>!x)}
              title={Tl('rct_est_rule_title')} testId="rct-estimate-info-mark"/>)
          </span>
        </div>
      )}
      {est && (
        <FormRow label={Tl('lbl_rct_np')} field="rct_np">
          <NumInput value={v.rct_np} onChange={x=>set('rct_np',x)} min={1} max={100} step={1}/>
        </FormRow>
      )}
      {est && (
        <div data-testid="rct-estimate-basis" style={{...small,color:e?'var(--text-dim)':'var(--text-muted)'}}>
          {e ? Tl('rct_est_basis').replace('{n}', e.n).replace('{r}', e.rTurn).replace('{isn}', e.isn)
            .replace('{band}', e.band.label).replace('{min}', e.min.toFixed(1)).replace('{max}', e.max.toFixed(1))
            .replace('{rmin}', e.rctMin.toFixed(3)).replace('{rmax}', e.rctMax.toFixed(3))
            : Tl('rct_est_needs')}
        </div>
      )}
      {notes.map(({ key, level }) => (
        <div key={key} data-testid="rct-estimate-note" data-note-key={key} data-level={level}
          style={{...small,paddingLeft:8,
                  ...(level === 'warn'
                    ? { color:'var(--red)', fontWeight:600, borderLeft:'3px solid var(--red)', background:'var(--red-bg)', padding:'4px 6px 4px 8px' }
                    : { color:'var(--text-muted)', borderLeft:'2px solid var(--amber)' })}}>
          {level === 'warn' ? '⚠ ' : ''}{Tl(key)}
        </div>
      ))}
      {can && info && (
        <InfoBox title={Tl('rct_est_info_h')} onClose={closeInfo} testId="rct-estimate-info" closeLabel={Tl('close')}>
          <p style={para}>{Tl('rct_est_info_1')}</p>
          <div data-testid="rct-estimate-table" style={{overflowX:'auto',margin:'2px 0 4px'}}>
            <table style={{borderCollapse:'collapse',fontSize:10,width:'100%',fontFamily:'var(--font-mono)'}}>
              <thead>
                <tr>
                  <th style={{...cell,textAlign:'left'}}>{Tl('rct_est_th')}</th>
                  {BANDS.map((b,i)=><th key={b.label} style={{...cell,color:i===cellE?.bandIndex?'var(--accent)':undefined}}>{b.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {[1,5].map(isn=>{
                  const t = TABLE[isn], row = !!cellE && isn===cellE.isn;
                  return (
                    <tr key={isn}>
                      <td style={{...cell,textAlign:'left',color:row?'var(--accent)':undefined}}>{isn} A</td>
                      {t.r.map((r,bi)=>{
                        const on = row && bi===cellE.bandIndex;
                        return (
                          <td key={bi} data-active={on?'1':undefined}
                            style={{...cell,fontWeight:on?700:400,color:on?'var(--accent)':undefined,
                                    background:on?'var(--accent-glow)':undefined}}>
                            <span data-value>{r.toFixed(1)}</span><sup style={{color:'var(--text-muted)',fontWeight:400}}>{RCT_BASIS_MARK[t.basis[bi]]}</sup>
                            <br/><span style={{color:'var(--text-muted)',fontWeight:400,whiteSpace:'nowrap'}}>{t.min[bi].toFixed(1)}–{t.max[bi].toFixed(1)}</span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{...para,fontSize:10,color:'var(--text-muted)'}}>{Tl('rct_est_legend')}</p>
          <p style={para}>{Tl('rct_est_info_2')}</p>
          <p style={para}>{Tl('rct_est_info_3')}</p>
          <p style={{...para,marginBottom:0,fontSize:10,color:'var(--text-muted)'}}>{Tl('rct_est_sources')}</p>
        </InfoBox>
      )}
    </>
  );
}

// ── Distance Inputs ────────────────────────────────────────────────────────
// ── Shared C-O-C-O auto-reclosure section ─────────────────────────────────
// One AR card for the two calc types whose modules carry an AR check, both
// built on calc/auto_reclosure/ and reading the same core keys
// (auto_reclose_enabled, ar_t_prime, ar_tfr, ar_ts, ar_ktf_preset):
// distance/auto_reclosure_ext.js and line_diff/auto_reclosure_ext.js. The keys
// and defaults are those of the Python tool's ui/ct_widget/data_io.py. The Python tool's GUI
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
function ArSection({ lang, v, onChange, set, calcType, systemVals }) {
  const [showTsTable, setShowTsTable] = useState(false);
  const setOpt = (k,x) => { const n={...v}; if (x==null) delete n[k]; else n[k]=x; onChange(n); };
  const ar = !!v.auto_reclose_enabled;
  const tsMode = CTRequired.arTsMode(v);
  const family = CTRequired.ctFamily(v);
  const tsEst = family && systemVals?.voltage != null ? CTAutoReclosure.estimateTs(family, systemVals.voltage) : null;
  // No defaults (calc/required.js): enabling AR stores nothing else; t', tfr,
  // the Ts source and the Ktf preset are entered by the user (values already
  // stored are kept).
  const toggleAr = on => onChange({ ...v, auto_reclose_enabled:on });
  // Manual → table drops the typed ar_ts; table → manual leaves Ts to type.
  const setTsMode = mode => {
    const n = { ...v, ar_ts_mode:mode };
    if (mode === 'table') delete n.ar_ts;
    onChange(n);
  };
  const { BANDS, GROUPS } = CTAutoReclosure.TS_TABLE;
  const cell = { padding:'2px 5px', textAlign:'right', borderBottom:'1px solid var(--border)' };
  return (
    <SectionCard title="C-O-C-O Auto-Reclosure (IEC 61869-100)" defaultOpen={false} section="ar">
      <div style={{paddingTop:8}}>
        <div style={{fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)',marginBottom:8}}>
          {AR_NOTE[calcType]}
        </div>
        <label style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer'}}>
          <input type="checkbox" checked={ar} onChange={e=>toggleAr(e.target.checked)}/>
          <span style={{fontSize:12,color:'var(--text-dim)'}}>Enable auto-reclosure</span>
        </label>
        {ar && <>
          <FormRow label="t' — Fault clearing time (1st fault)" unit="s" field="ar_t_prime">
            <NumInput value={v.ar_t_prime} onChange={x=>set('ar_t_prime',x)} min={0} max={10} step={0.01}/>
          </FormRow>
          <FormRow label="tfr — AR dead time" unit="s" field="ar_tfr">
            <NumInput value={v.ar_tfr} onChange={x=>set('ar_tfr',x)} min={0} max={60} step={0.05}/>
          </FormRow>
          <FormRow label="Ts — Secondary time constant" field="ar_ts_mode">
            <SelectInput value={tsMode} onChange={setTsMode}
              options={[['table','From table (class, voltage)'],['manual','Manual']]}/>
          </FormRow>
          {tsMode == null ? null : tsMode === 'manual' ? (
            <FormRow label="Ts — manual value" unit="s" field="ar_ts">
              <OptNumInput value={v.ar_ts} onChange={x=>setOpt('ar_ts',x)} min={0.01} max={30} step={0.1}/>
            </FormRow>
          ) : !tsEst ? (
            <div data-testid="ar-ts-table" style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text-muted)',margin:'2px 0 8px'}}>
              {CTSI18n.t(lang,'ar_ts_table_needs')}
            </div>
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
                    Engineering estimate: 110–150 kV = the typical Ts per class. Closed cores: larger cores at higher voltage give a
                    longer Ts, each value at the upper end of the typical range (a longer Ts gives a larger C-O-C-O Ktd).
                    Gapped cores: the air gap sets Ts, flat 1 s from 110 kV. TPZ: 60 ms (IEC 61869-2).
                    Choose Manual to enter the CT's Ts.
                  </div>
                </div>
              )}
            </div>
          )}
          <FormRow label="Ktf curve preset" field="ar_ktf_preset">
            <SelectInput value={v.ar_ktf_preset} onChange={x=>set('ar_ktf_preset',x)}
              options={KTF_PRESET_NAMES.map(n=>[n,n])}/>
          </FormRow>
        </>}
      </div>
    </SectionCard>
  );
}

// The relay t_al (relay_tal, ms, in the Relay Information card): set →
// analytical Ktd, blank → the Tp lookup table, as the Python tool's
// calculate_distance_protection; it is also the C-O-C-O measurement window
// (CTCalc.moduleCore). Vka is always
// divided by 1.3 there (the Python tool's relay-DB factor lookup is dead code), so
// there is no Vka factor field; an old core's t_al / vka_factor reach nothing
// (PORTING_PLAN.md §10.6 F-DIST-UI).
function DistanceInputs({ lang, v, set, onChange, systemVals, bay, onEditBay }) {
  const Tl = k => CTSI18n.t(lang, k);
  const setOpt = (k,x) => { const n={...v}; if (x==null) delete n[k]; else n[k]=x; onChange(n); };
  return (
    <>
      <SectionCard title={`${Tl('section_ct')} — ${Tl('ct_type_distance')}`} defaultOpen accent section="ct">
        <div style={{paddingTop:8}}>
          <CTClassRow lang={lang} v={v} onChange={onChange}/>
          <PrimarySecondaryRow lang={lang} v={v} set={set}/>
          <RctRow lang={lang} v={v} set={set} onChange={onChange} systemVals={systemVals} calcType="distance"/>
          <FormRow label={Tl('lbl_burden')} unit="VA" field="burden">
            <NumInput value={v.burden} onChange={x=>set('burden',x)} min={0} max={200} step={0.1}/>
          </FormRow>
          <AlfVkRow lang={lang} v={v} set={set} onChange={onChange}/>
        </div>
      </SectionCard>
      <RelaySection lang={lang} v={v} set={set} onChange={onChange} calcType="distance"/>
      <LineDataSection lang={lang} v={v} setOpt={setOpt} bay={bay} onEditBay={onEditBay}/>
      <CableSection lang={lang} calcType="distance" v={v} set={(k,x)=>set(k,x)}/>
      <ArSection lang={lang} calcType="distance" v={v} onChange={onChange} set={set} systemVals={systemVals}/>
    </>
  );
} 
// Line data of the protected line (issue #86), read by calc/distance/data.js:
// R'L, X'L (primary Ω/km), lL (km) and the zone-1 factor Klim. No defaults:
// each is required (calc/required.js) and marked until entered. R'L, X'L and
// lL are the bay's (#133): shown read-only here, typed on the bay; Klim, a
// relay setting, is the core's.
const LINE_LIMITS = {
  r_per_km:      { min:0,    max:10,   step:0.0001 },
  x_per_km:      { min:0,    max:10,   step:0.001 },
  line_length:   { min:0.01, max:1000, step:0.1 },
  zone1_setting: { min:0.05, max:1,    step:0.01 },
};
function LineDataSection({ lang, v, setOpt, bay, onEditBay }) {
  const Tl = k => CTSI18n.t(lang, k);
  return (
    <SectionCard title={Tl('section_line_data')} defaultOpen section="line">
      <div style={{paddingTop:8}}>
        <BayValues lang={lang} bay={bay} part="line" keys={CTBay.LINE_KEYS} onEditBay={onEditBay}/>
        <FormRow label={Tl('lbl_zone1_setting')} field="zone1_setting">
          <OptNumInput value={v.zone1_setting} onChange={x=>setOpt('zone1_setting',x)} {...LINE_LIMITS.zone1_setting}/>
        </FormRow>
      </div>
    </SectionCard>
  );
}

// The bay values a core reads (#133), read-only, each with its mark (the
// core's InputCheck includes them), and the link to the bay card.
function BayValues({ lang, bay, part, keys, onEditBay }) {
  const Tl = k => CTSI18n.t(lang, k);
  const src = (bay && bay[part]) || {};
  return (
    <div data-testid={`bay-values-${part}`}>
      <div style={{...noteSt, marginTop:2, display:'flex', gap:8, alignItems:'baseline', flexWrap:'wrap'}}>
        <span>{Tl(part === 'line' ? 'bay_from_line' : 'bay_from_trafo').replace('{name}', bay ? bay.name : '')}</span>
        {onEditBay && <button type="button" data-testid="edit-on-bay" onClick={onEditBay}
          style={{background:'none',border:'none',padding:0,cursor:'pointer',color:'var(--accent)',fontFamily:'var(--font-mono)',fontSize:11}}>
          {Tl('bay_edit')}</button>}
      </div>
      {keys.map(k => {
        const f = CTSReport.bayField(lang, k);
        const x = src[k];
        return (
          <FormRow key={k} label={f.label} unit={f.unit || undefined} field={k}>
            <NumInput value={typeof x === 'number' ? x / f.scale : null} onChange={() => {}} readOnly/>
          </FormRow>
        );
      })}
    </div>
  );
}

// ── Differential zone card (#135): the sides of a transformer_diff device,
// the zone checks and the verdict (CTTransformerDiff.zone, the texts shared
// with the RTF via CTSReport.zone*)
function ZoneCard({ lang, zone }) {
  const Tl = k => CTSI18n.t(lang, k);
  if (!zone) return null;
  const tone = zone.status === 'OK' ? 'green' : zone.status === 'NOT_OK' ? 'red' : 'amber';
  const rows = CTSReport.zoneRows(lang, zone);
  const th = { textAlign:'left', padding:'4px 6px', fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-muted)', fontWeight:600 };
  const td = { padding:'4px 6px', fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text)' };
  return (
    <div data-testid="zone-card" data-status={zone.status}
      style={{background:'var(--surface)',border:`1px solid var(--${tone})`,borderRadius:9,padding:14,marginBottom:14}}>
      <div style={{fontFamily:'var(--font-head)',fontSize:15,fontWeight:700,color:'var(--text)',marginBottom:6}}>{Tl('zone_h_short')}</div>
      {zone.sref_mva != null && <div style={noteSt}>{Tl('zone_sref').replace('{v}', zone.sref_mva)}</div>}
      {rows.length > 0 && (
        <div style={{overflowX:'auto',marginTop:8}}>
          <table style={{borderCollapse:'collapse',width:'100%'}}>
            <thead><tr>{[Tl('zone_side'), Tl('zone_ct'), 'Ur kV', 'Isc,ext kA', 'ALFo', `${Tl('zone_req')} 1`, `${Tl('zone_req')} 2`, `${Tl('zone_req')} 3`, 'Fadap', Tl('zone_core')]
              .map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.core_id} data-side={r.side}>
                {[r.side, r.ct, r.ur, r.isc_ext, r.alf_o, r.r1, r.r2, r.r3, r.r4].map((x, i) => <td key={i} style={td}>{x}</td>)}
                <td style={{...td, fontWeight:700, color: r.core_ok == null ? 'var(--text-muted)' : r.core_ok ? 'var(--green)' : 'var(--red)'}}>{r.core}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {zone.fadap_ratio != null && (
        <div data-testid="zone-ratio" style={{...noteSt, marginTop:8}}>
          {Tl('zone_ratio').replace('{v}', zone.fadap_ratio.toFixed(3))} {zone.max_fadap_ratio != null
            ? Tl('zone_ratio_limit').replace('{v}', zone.max_fadap_ratio) : Tl('zone_ratio_info')}
        </div>
      )}
      {[['sides', 'zone_check_sides'], ['isr', 'zone_check_isr']].map(([id, key]) => {
        const c = zone.checks.find(x => x.id === id);
        return c && c.ok != null ? (
          <div key={id} data-testid={`zone-check-${id}`} style={{...noteSt, marginTop:4, color: c.ok ? 'var(--green)' : 'var(--red)'}}>
            {Tl(key)}: {c.ok ? 'OK' : Tl('zone_check_failed')}
          </div>
        ) : null;
      })}
      {zone.remarks.filter(r => r[0] !== 'zone_rm_ratio_info').map((r, i) => (
        <div key={i} data-testid="zone-remark" style={{fontSize:12,color:'var(--text-dim)',marginTop:4}}>• {CTSReport.zoneRemarkText(lang, r)}</div>
      ))}
      <div data-testid="zone-verdict" style={{marginTop:10,fontFamily:'var(--font-head)',fontSize:13,fontWeight:700,color:`var(--${tone})`}}>
        {CTSReport.zoneVerdictText(lang, zone)}
      </div>
    </div>
  );
}

// ── Bay data card (#133): the transformer / line data of a bay, typed once
// for every core below it (CTBay, calc/bay.js; CTRequired.bay). Shown while a
// core of the bay reads it or data is stored. Isc,max,int is typed in kA and
// stored in A.
function BayDataPanel({ lang, feeder, onChange, onDismiss }) {
  const Tl = k => CTSI18n.t(lang, k);
  const chk = useMemo(() => ({ ...CTRequired.bay(feeder), lang }), [feeder, lang]);
  const showT = CTBay.showsTransformer(feeder), showL = CTBay.showsLine(feeder);
  if (!showT && !showL && !(feeder.bay_notes || []).length) return null;
  const t = feeder.transformer || {}, l = feeder.line || {};
  const cur = CTBay.windingCurrents(feeder);   // derived, read-only (#134)
  const numRow = (key, src, lim) => {
    const f = CTSReport.bayField(lang, key);
    const x = src[key];
    return (
      <FormRow key={key} label={f.label} unit={f.unit || undefined} field={key}>
        <NumInput value={typeof x === 'number' ? x / f.scale : null}
          onChange={y => onChange(key, y == null ? null : (f.scale === 1 ? y : Math.round(y * f.scale)))} {...lim}/>
      </FormRow>
    );
  };
  return (
    <InputCheck.Provider value={chk}>
    <div data-testid="bay-data" style={{marginBottom:12}}>
      {showT && (
        <SectionCard title={Tl('section_bay_trafo')} defaultOpen section="trafo">
          <div data-testid="bay-trafo" style={{paddingTop:8}}>
            {numRow('sr_mva', t, { min:0.1, max:5000 })}
            {numRow('z_percent', t, { min:1, max:50 })}
            {numRow('inrush_factor', t, { min:1, max:20 })}
            <FormRow label={Tl('lbl_winding_count')} field="winding_count">
              <SelectInput value={t.winding_count} onChange={x => onChange('winding_count', x)}
                options={CTBay.WINDING_COUNTS.map(n => [n, Tl(`winding_count_${n}`)])}/>
            </FormRow>
            {CTBay.windings(feeder).map(w => (
              <React.Fragment key={w}>
                {numRow(`ur_kv_${w}`, t, { min:0.1, max:1200 })}
                {numRow(`isc_int_${w}`, t, { min:0, max:200 })}
                {cur[w] && (
                  <div data-testid={`bay-currents-${w}`} style={{...noteSt, marginTop:3}}>
                    {Tl('bay_ir_isc_ext').replace('{w}', w).replace('{ir}', cur[w].ir_a.toFixed(1))
                      .replace('{isc}', cur[w].isc_ext_a != null ? (cur[w].isc_ext_a / 1000).toFixed(3) : '—')}
                  </div>
                )}
              </React.Fragment>
            ))}
            <div style={noteSt}>{Tl('trafo_sr_note')}</div>
          </div>
        </SectionCard>
      )}
      {showL && (
        <SectionCard title={Tl('section_bay_line')} defaultOpen section="line">
          <div data-testid="bay-line" style={{paddingTop:8}}>
            {CTBay.LINE_KEYS.map(k => numRow(k, l, { min: LINE_LIMITS[k].min, max: LINE_LIMITS[k].max }))}
            <div style={noteSt}>{Tl('line_bay_note')}</div>
          </div>
        </SectionCard>
      )}
      {(feeder.bay_notes || []).length > 0 && (
        <div data-testid="bay-notes" style={{marginTop:8,padding:'10px 12px',border:'1px dashed var(--amber)',borderRadius:8,background:'var(--surface)'}}>
          <div style={{fontFamily:'var(--font-head)',fontSize:12,fontWeight:700,color:'var(--text)',marginBottom:6}}>{Tl('bay_notes_h')}</div>
          {feeder.bay_notes.map((n, i) => (
            <div key={i} data-testid="bay-note" data-kind={n.kind} style={{display:'flex',gap:8,alignItems:'flex-start',fontSize:12,color:'var(--text-dim)',marginTop:4}}>
              <span style={{flex:1}}>{CTSReport.bayNoteText(lang, n)}</span>
              <button type="button" onClick={() => onDismiss(i)} style={tplBtnSt}>{Tl('bay_note_dismiss')}</button>
            </div>
          ))}
        </div>
      )}
    </div>
    </InputCheck.Provider>
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


function TransformerDiffInputs({ lang, v, set, onChange, systemVals, bay, onEditBay }) {
  const Tl = k => CTSI18n.t(lang, k);
  const lw = CTBay.windingOptions(bay).includes(v.linked_winding) ? v.linked_winding : null;
  return (
    <>
      <SectionCard title={`${Tl('section_ct')} — ${Tl('ct_type_transformer_diff')}`} defaultOpen accent section="ct">
        <div style={{paddingTop:8}}>
          <CTClassRow lang={lang} v={v} onChange={onChange}/>
          <PrimarySecondaryRow lang={lang} v={v} set={set}/>
          <RctRow lang={lang} v={v} set={set} onChange={onChange} systemVals={systemVals} calcType="transformer_diff"/>
          <FormRow label={Tl('lbl_burden')} unit="VA" field="burden">
            <NumInput value={v.burden} onChange={x=>set('burden',x)} min={0} max={200} step={0.1}/>
          </FormRow>
          <AlfVkRow lang={lang} v={v} set={set} onChange={onChange}/>
        </div>
      </SectionCard>
      {/* The transformer is the bay's (#133): typed once on the bay card; the
          core keeps which winding its CT sits on and shows the values it reads. */}
      <SectionCard title={Tl('section_bay_trafo')} defaultOpen section="trafo">
        <div style={{paddingTop:8}}>
          <FormRow label={Tl('lbl_linked_winding')} field="linked_winding">
            <SelectInput value={v.linked_winding} onChange={x=>set('linked_winding',x)}
              options={CTBay.windingOptions(bay).map(w => [w, Tl(`opt_w_${w}`)])}/>
          </FormRow>
          <BayValues lang={lang} bay={bay} part="transformer" onEditBay={onEditBay}
            keys={['sr_mva', 'z_percent', 'inrush_factor', ...(lw ? [`ur_kv_${lw}`, `isc_int_${lw}`] : [])]}/>
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
      <SectionCard title={`${Tl('section_ct')} — ${Tl('ct_type_line_diff')}`} defaultOpen accent section="ct">
        <div style={{paddingTop:8}}>
          <CTClassRow lang={lang} v={v} onChange={onChange}/>
          <PrimarySecondaryRow lang={lang} v={v} set={set}/>
          <RctRow lang={lang} v={v} set={set} onChange={onChange} systemVals={systemVals} calcType="line_diff"/>
          <FormRow label={Tl('lbl_burden')} unit="VA" field="burden">
            <NumInput value={v.burden} onChange={x=>set('burden',x)} min={0} max={200} step={0.1}/>
          </FormRow>
          <AlfVkRow lang={lang} v={v} set={set} onChange={onChange}/>
        </div>
      </SectionCard>
      <RelaySection lang={lang} v={v} set={set} onChange={onChange} calcType="line_diff"/>
      <CableSection lang={lang} calcType="line_diff" v={v} set={(k,x)=>set(k,x)}/>
      <ArSection lang={lang} calcType="line_diff" v={v} onChange={onChange} set={set} systemVals={systemVals}/>
    </>
  );
}
// The meter's standard and class, read by a local rule set's meter-class
// check (e.g. Elmåling / TR 353 table 5.1). Shown on a metering core only
// when the project has local rules (Station Data); optional, with the class
// cleared when it does not belong to a newly picked standard.
function MeterClassRows({ lang, v, set, onChange }) {
  const Tl = k => CTSI18n.t(lang, k);
  const classes = CTRequired.METER_CLASSES[v.meter_standard] || [];
  const pickStd = x => {
    const n = { ...v, meter_standard: x };
    if (!(CTRequired.METER_CLASSES[x] || []).includes(n.meter_class)) delete n.meter_class;
    onChange(n);
  };
  return <>
    <FormRow label={Tl('lbl_meter_standard')} wide field="meter_standard">
      <SelectInput value={v.meter_standard} onChange={pickStd}
        options={CTRequired.METER_STANDARDS.map(x=>[x, Tl(`meter_std_${x}`)])}/>
    </FormRow>
    <FormRow label={Tl('lbl_meter_class')} field="meter_class">
      <SelectInput value={v.meter_class} onChange={x=>set('meter_class',x)}
        options={classes.map(c=>[c,c])}/>
    </FormRow>
    <div style={noteSt}>{Tl('meter_class_note')}</div>
  </>;
}

// ── Generic Input Panel (CTGeneric.calculate ← ct_generic.py) ────────────
// A generic core comes only from a project file (the fallback for a relay
// type without its own module). The inputs the module reads: Isr, Rct, Sn,
// the class with ALF or Vk, the cable; no Ip and no relay (§10.6 F-GEN-PANEL).
function GenericInputs({ lang, v, set, onChange, systemVals }) {
  return (
    <>
      <SectionCard title={Tp(lang,'section_ct') + ' — ' + Tp(lang,'ct_type_generic')} defaultOpen accent section="ct">
        <div style={{paddingTop:8}}>
          <CTClassRow lang={lang} v={v} onChange={onChange}/>
          <FormRow label={Tp(lang,'lbl_Is')} unit="A" field="Is">
            <SelectInput value={v.Is} onChange={x=>set('Is',parseFloat(x))} options={[['1','1 A'],['5','5 A']]}/>
          </FormRow>
          <RctRow lang={lang} v={v} set={set} onChange={onChange} systemVals={systemVals} calcType="generic"/>
          <FormRow label={Tp(lang,'lbl_burden')} unit="VA" field="burden">
            <NumInput value={v.burden} onChange={x=>set('burden',x)} min={0} max={200} step={0.1}/>
          </FormRow>
          <AlfVkRow lang={lang} v={v} set={set} onChange={onChange}/>
        </div>
      </SectionCard>
      <CableSection lang={lang} calcType="generic" v={v} set={set}/>
    </>
  );
}

// ── VT core inputs (CTVT.calculate ← vt_calculations/calculator.py) ─────────
// Issue #125: the connected device is entered in VA in the Meter / Relay /
// IED card; the attached resistor sits with the cable.
function VtInputs({ lang, v, set, onChange }) {
  return (
    <>
      <SectionCard title={Tp(lang,'section_vt')} defaultOpen accent section="vt">
        <div style={{paddingTop:8}}>
          <FormRow label={Tp(lang,'lbl_vt_us')} unit="V" field="secondary_voltage">
            <NumInput value={v.secondary_voltage} onChange={x=>set('secondary_voltage',x)} min={0} max={500} step={0.1}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_vt_class')} field="vt_class">
            <SelectInput value={v.vt_class} onChange={x=>set('vt_class',x)}
              options={CTRequired.VT_CLASSES.map(c=>[c,c])}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_vt_burden')} unit="VA" field="burden">
            <NumInput value={v.burden} onChange={x=>set('burden',x)} min={0} max={1000} step={0.1}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_vt_thermal')} unit="VA" field="thermal_burden">
            <NumInput value={v.thermal_burden} onChange={x=>set('thermal_burden',x)} min={0} max={5000} step={0.1}/>
          </FormRow>
          <FormRow label={Tp(lang,'lbl_vt_range')} wide field="vt_burden_range">
            <SelectInput value={v.vt_burden_range} onChange={x=>set('vt_burden_range',x)}
              options={[['I', Tp(lang,'vt_range_I')], ['II', Tp(lang,'vt_range_II')]]}/>
          </FormRow>
          <div style={noteSt}>{Tp(lang,'vt_range_note')}</div>
        </div>
      </SectionCard>
      <MeterSection lang={lang} v={v} set={set} onChange={onChange} calcType="vt"/>
      <CableSection lang={lang} calcType="vt" v={v} set={set}
        attached={{ label:'lbl_vt_attached_r', max:1000000, placement:true }}/>
    </>
  );
}

// ── Core Input Panel (dispatcher) ────────────────────────────────────────
function CoreInputPanel({ lang, core, systemVals, bay, onEditBay, onChange: store, onSaveCTTpl, onLoadCTTpl }) {
  // Every change passes the relay database: a picked IED keeps its SR (for
  // the current Isr) and t_al (for the calc type and rated frequency;
  // RelaySection)
  const freq = systemVals?.freq;
  const onChange = n => store(CTRelayDB.apply(n, core.calc_type, freq));
  // A core opened with a stored t_al the database now gives otherwise (a
  // corrected IED row) takes the database value
  useEffect(() => {
    const n = CTRelayDB.apply(core.inputs, core.calc_type, freq);
    if (n !== core.inputs) store(n);
  }, [core.id, core.calc_type, freq]);
  const set = (k,x) => onChange({...core.inputs,[k]:x});
  const type = core.calc_type;
  const v    = core.inputs;
  const [showTpl, setShowTpl] = useState(false);
  const [tplName, setTplName] = useState('');
  const ctTpls = typeof getTpls !== 'undefined' ? getTpls('ct') : [];
  const Tl = k => CTSI18n.t(lang, k);
  // What is missing or invalid, for the marks on the inputs and cards
  const chk = useMemo(() => ({ ...CTRequired.core(core, bay), lang }), [core, bay, lang]);

  return (
    <InputCheck.Provider value={chk}>
    <div data-testid="core-inputs" data-core={core.id} data-complete={chk.ok ? '1' : '0'}>
      {/* Read-only type badge — type is set by device, not editable here */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
        <span data-testid="core-type-chip" style={{fontFamily:'var(--font-mono)',fontSize:11,fontWeight:700,
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

      {core.kind === 'vt' ? <VtInputs lang={lang} v={v} set={set} onChange={onChange}/> : <>
        {type === 'overcurrent'      && <OvercurrentInputs lang={lang} v={v} set={set} onChange={onChange} systemVals={systemVals}/>}
        {type === 'metering'         && <MeteringInputs    lang={lang} v={v} set={set} onChange={onChange} localRules={systemVals?.local_rules} systemVals={systemVals}/>}
        {type === 'busbar'           && <BusbarInputs      lang={lang} v={v} set={set} onChange={onChange} systemVals={systemVals}/>}
        {type === 'distance'         && <DistanceInputs       lang={lang} v={v} set={set} onChange={onChange} systemVals={systemVals} bay={bay} onEditBay={onEditBay}/>}
        {type === 'transformer_diff' && <TransformerDiffInputs lang={lang} v={v} set={set} onChange={onChange} systemVals={systemVals} bay={bay} onEditBay={onEditBay}/>}
        {type === 'line_diff'        && <LineDiffInputs       lang={lang} v={v} set={set} onChange={onChange} systemVals={systemVals}/>}
        {type === 'generic'          && <GenericInputs        lang={lang} v={v} set={set} onChange={onChange} systemVals={systemVals}/>}
        {type === 'vt'               && <VtInputs lang={lang} v={v} set={set} onChange={onChange}/>}
      </>}
    </div>
    </InputCheck.Provider>
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
// no ODE check (no rated ALF, as the Python tool): the trace is drawn without ALFo.
// Line diff (§10.6 F-LD-AR-UI): the verdict is the module's ar_is_adequate
// (proposed Vk ≥ EAL_AR); there is no ODE check and no ALFo, so the trace is
// drawn from the C-O-C-O Ktd's own inputs and defaults (line_diff/data.js:
// Ts 0.05 s, t_al 0.2 s) with its Kssc, and no verdict of its own.
// The measurement windows are the core's relay t_al (its IED's measurement
// time, CTCalc.moduleCore). A core is calculated only with t_al set when AR
// is on (CTRequired), so the ?? fallbacks of the windows below (the module
// defaults) are not reached from the app (§10.7 W7).
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

// No result because inputs are missing (CTRequired): what is missing, per card.
const REQ_SECTIONS = ['station', 'ct', 'relay', 'line', 'trafo', 'meter', 'vt', 'cable', 'ar'];
function IncompleteNotice({ lang, core, systemVals, bay, onEditBay }) {
  const Tl = k => CTSI18n.t(lang, k);
  const sys = CTRequired.system(systemVals);
  const cc = CTRequired.core(core, bay);
  const counts = { ...cc.sections, ...(sys.count ? { station: sys.count } : {}) };
  const rows = REQ_SECTIONS.filter(k => counts[k]);
  return (
    <div data-testid="results-incomplete" style={{display:'flex',flexDirection:'column',gap:10,padding:'18px 20px',
                  background:'var(--surface)',border:'1px dashed var(--amber)',borderRadius:10}}>
      <div style={{display:'flex',alignItems:'center',gap:8,fontFamily:'var(--font-head)',fontSize:15,fontWeight:700,color:'var(--text)'}}>
        <MissingMark lang={lang} count={sys.count + cc.count}/>
        {Tl('res_incomplete_h')}
      </div>
      <p style={{fontFamily:'var(--font-body)',fontSize:13,lineHeight:1.5,color:'var(--text-dim)'}}>{Tl('res_incomplete')}</p>
      <ul style={{margin:0,paddingLeft:18,fontFamily:'var(--font-mono)',fontSize:12,color:'var(--text-dim)'}}>
        {rows.map(k => (
          <li key={k} data-section={k}>{Tl(`req_sec_${k}`)}: {Tl('mark_section').replace('{n}', counts[k])}</li>
        ))}
      </ul>
      {onEditBay && Object.keys(cc.fields).some(k => CTBay.TRAFO_KEYS.includes(k) || CTBay.LINE_KEYS.includes(k)) ? (
        <button type="button" data-testid="incomplete-edit-on-bay" onClick={onEditBay}
          style={{...tplBtnSt, alignSelf:'flex-start'}}>{Tl('bay_edit')}</button>
      ) : null}
    </div>
  );
}

function ResultsPanel({ lang, result, core, systemVals, bay, onEditBay, theme }) {
  const [tab, setTab] = useState('summary');
  const Tl = k => CTSI18n.t(lang, k);
  const type = core?.calc_type;

  const faultParams = useMemo(() => chartFaultParams(result, systemVals, core), [result, systemVals, core]);
  const ar = useMemo(() => chartArData(type, core, result, systemVals), [type, core?.inputs, result, systemVals]);
  const arResult = ar?.arResult ?? null;
  const arCanvasParams = ar?.canvasParams ?? null;
  // The project's national metering rules on this core (null: none / n.a.)
  const local = useMemo(() => CTLocalRules.evaluate(systemVals?.local_rules, core, result, systemVals),
    [systemVals, core, result]);

  if (!result && core && !CTRequired.ready(core, systemVals, bay)) return (
    <IncompleteNotice lang={lang} core={core} systemVals={systemVals} bay={bay} onEditBay={onEditBay}/>
  );
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
  const mStr    = result.isc_int_missing || result.isc_ext_missing ? '\u2014' : (margin >= 0 ? '+' : '') + margin.toFixed(1) + '%';
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
        {local && <LocalBadge lang={lang} local={local}/>}
      </div>

      {(type === 'metering' || type === 'vt') && <ResultRemarks lang={lang} result={result} core={core} systemVals={systemVals}/>}
      {local && <LocalRulesCard lang={lang} local={local}/>}

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
        <div className="ctsizer-metrics" style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
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
                    ? 'No IEC 61869-100 ODE check: line differential has none (no ALFo). The verdict is EAL_AR ≤ proposed Vk.'
                    : 'No IEC 61869-100 ODE check: a PX core has no rated ALF (ALFo). The verdict is EAL_AR ≤ Vk.'}
                </div>
              )}
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}


// The module's remarks on a metering / VT core (issue #125): why it fails and
// what to change (cond. 2 cannot be met, the burden missing, the burden range),
// in the words of the report (CTSReport.warningText). With local metering
// rules picked, as the rule set words them (no advice its rules forbid).
function ResultRemarks({ lang, result, core, systemVals }) {
  const ws = CTLocalRules.remarks(systemVals?.local_rules, core, result, systemVals);
  if (!ws.length) return null;
  return (
    <div data-testid="result-remarks" style={{padding:'6px 9px',borderRadius:5,fontSize:11,
          fontFamily:'var(--font-mono)',background:'var(--surface-3)',border:'1px solid var(--border-2)',
          color:'var(--text-dim)'}}>
      <div style={{fontWeight:700,marginBottom:3}}>{Tp(lang,'res_remarks')}</div>
      {ws.map((w, i) => <div key={i} style={{marginTop:2}}>• {CTSReport.warningText(lang, w)}</div>)}
    </div>
  );
}

// ── Local metering rules (calc/local_rules/) ─────────────────────────────
// The project's national rule set on a metering CT / VT core: each check with
// its clause and status, then what the rules require that CTSizer cannot
// check. Kept apart from the IEC verdict (StatusBadge), which it never changes.
const LOCAL_COLORS = {
  ok:      ['var(--green)', 'var(--green-bg)'],
  fail:    ['var(--red)',   'var(--red-bg)'],
  advice:  ['var(--amber)', 'var(--amber-bg)'],
  missing: ['var(--text-muted)', 'var(--surface-3)'],
};
const LOCAL_VERDICT = { ok: 'ok', fail: 'fail', incomplete: 'missing' };

function LocalBadge({ lang, local }) {
  const [fg, bg] = LOCAL_COLORS[LOCAL_VERDICT[local.verdict]];
  return (
    <span data-testid="local-badge" data-verdict={local.verdict}
      style={{fontFamily:'var(--font-mono)',fontSize:10,padding:'2px 8px',borderRadius:4,
              background:bg,color:fg,border:`1px solid ${fg}`}}>
      {local.set.country} {Tp(lang,'res_local')}: {Tp(lang,`res_local_${local.verdict}`)}
    </span>
  );
}

function LocalRulesCard({ lang, local }) {
  const { set, items, manual } = local;
  const txt = x => (lang === 'da' ? x.da : x.en);
  return (
    <div data-testid="local-rules" data-verdict={local.verdict}>
      <SectionCard title={`${Tp(lang,'res_local')} \u2014 ${CTLocalRules.label(set, lang)}`} defaultOpen>
        <div style={{paddingTop:6,display:'flex',flexDirection:'column',gap:5}}>
          {items.map(it => {
            const [fg, bg] = LOCAL_COLORS[it.status];
            return (
              <div key={it.id} data-rule={it.id} data-status={it.status}
                style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:8,alignItems:'start',
                        padding:'6px 9px',borderRadius:5,background:'var(--surface-2)',borderLeft:`3px solid ${fg}`}}>
                <div style={{fontSize:12,lineHeight:1.4,color:'var(--text)',fontFamily:'var(--font-body)'}}>
                  {txt(it)}
                  <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',marginTop:2}}>{CTLocalRules.refText(it, lang)}</div>
                </div>
                <span style={{fontFamily:'var(--font-mono)',fontSize:10,fontWeight:700,padding:'2px 6px',borderRadius:4,
                              whiteSpace:'nowrap',color:fg,background:bg,border:`1px solid ${fg}`}}>
                  {Tp(lang,`local_status_${it.status}`)}
                </span>
              </div>
            );
          })}
          {manual.length > 0 && (
            <div style={{marginTop:6}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--text-dim)',fontFamily:'var(--font-body)'}}>{Tp(lang,'local_manual_h')}</div>
              <ul style={{margin:'4px 0 0',paddingLeft:18,fontSize:11,lineHeight:1.45,color:'var(--text-dim)',fontFamily:'var(--font-body)'}}>
                {manual.map((x, i) => <li key={i}>{txt(x)} <span style={{color:'var(--text-muted)',fontFamily:'var(--font-mono)',fontSize:10}}>({CTLocalRules.refText(x, lang)})</span></li>)}
              </ul>
            </div>
          )}
          <div style={noteSt}>{Tp(lang,'local_note')}</div>
          <div style={{...noteSt,marginTop:2}}>{Tp(lang,'local_source')}: {lang === 'da' ? set.source_da : set.source_en}</div>
        </div>
      </SectionCard>
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
    { label: 'S min', value: r.S_min?.toFixed(4), unit: 'VA', ok: r.cond1 },
    { label: 'S in',  value: r.S_in?.toFixed(4),  unit: 'VA' },
    { label: Tp(lang,'res_s_req'), value: Number.isFinite(r.S_req) ? r.S_req.toFixed(4) : undefined, unit: 'VA' },
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
  if (type === 'transformer_diff' && r.isc_ext_missing) return [
    { label:'Isc,max,ext', value:Tp(lang,'metric_isc_ext_missing'), ok:false, compact:true },
  ];
  if (type === 'transformer_diff' && r.isc_int_missing) return [
    { label:'Isc,max,int', value:Tp(lang,'metric_isc_int_missing'), ok:false, compact:true },
    { label: Tp(lang,'res_cable_r'), value: r.Rc?.toFixed(4), unit: 'Ω' },
  ];
  // The winding's rated current and maximum external (through) fault current
  // (#134: Ir / (Z%/100), from the bay's transformer data)
  const tdCurrents = type === 'transformer_diff' && r.trafo_it_max != null ? [
    { label:'Ir', value:(r.i_rated * 1000).toFixed(1), unit:'A' },
    { label:'Isc,max,ext', value:(r.trafo_it_max / 1000).toFixed(3), unit:'kA' },
  ] : [];
  // A Vk core (PX, TPX, TPY, TPZ with a Vk) has no operating ALF: the IEC and
  // Ziegler ALF methods do not apply (§10.6 F-TP-PX), so it shows the E.m.f.
  // method's cards, as a PX busbar core
  if (type === 'transformer_diff' && r.is_px) return [
    { label:'Vk',           value:r.EALF?.toFixed(1),    unit:'V', ok:r.is_ok },
    { label:'Vk required',  value:r.Vk_req?.toFixed(1),  unit:'V', highlight:true },
    { label:'EMF check',    value:r.emf_ok?'PASS':'FAIL', ok:r.emf_ok },
    { label: Tp(lang,'res_cable_r'), value: r.Rc?.toFixed(4), unit: 'Ω' },
    { label: Tp(lang,'res_margin'),  value: (r.margin??0).toFixed(1), unit: '%', ok: r.is_ok },
    ...tdCurrents,
  ];
  if (type === 'transformer_diff') return [
    { label:'EALF offered', value:r.EALF?.toFixed(1),    unit:'V', ok:r.is_ok },
    { label:'Vk required',  value:r.Vk_req?.toFixed(1),  unit:'V', highlight:true },
    { label:'EMF check',    value:r.emf_ok?'PASS':'FAIL', ok:r.emf_ok },
    { label:'Ziegler check',value:r.ziegler_ok?'PASS':'FAIL', ok:r.ziegler_ok },
    { label:'ALF operating',value:r.alf_o?.toFixed(2) },
    { label:'ALF Ziegler',  value:r.ALF_ziegler?.toFixed(2), highlight:true },
    ...tdCurrents,
  ];
  if (type === 'vt') return [
    { label: Tp(lang,'res_vt_burden_util'),   value: r.burden_utilization?.toFixed(1),  unit: '%', ok: r.burden_ok },
    { label: Tp(lang,'res_vt_thermal_util'),  value: r.thermal_utilization?.toFixed(1), unit: '%', ok: r.thermal_ok },
    { label: Tp(lang,'res_vt_actual_burden'), value: r.actual_burden_va?.toFixed(2),    unit: 'VA', highlight: true },
    { label: Tp(lang,'res_vt_actual_current'),value: r.actual_current != null ? (r.actual_current*1000).toFixed(2) : undefined, unit: 'mA' },
    { label: Tp(lang,'res_vt_voltage_drop'),  value: r.voltage_drop_percent?.toFixed(3), unit: '%', ok: r.vdrop_ok },
    { label: Tp(lang,'res_cable_r'),          value: r.Rc?.toFixed(4),                  unit: 'Ω' },
    { label: Tp(lang,'res_vt_range'),         value: r.burden_range_label, ok: r.range_ok, compact: true },
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
        <div className="ctsizer-pair" style={{paddingTop:8,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <FormRow label={Tp(lang,'settings_full_name')}>
            <TextInput value={settings.full_name||''} onChange={v=>set('full_name',v)}/>
          </FormRow>
          <FormRow label={Tp(lang,'settings_initials')}>
            <TextInput value={settings.initials||''} onChange={v=>set('initials',v.toUpperCase())} mono/>
          </FormRow>
        </div>
      </SectionCard>

      <SectionCard title={Tp(lang,'section_settings_company')}>
        <div className="ctsizer-pair" style={{paddingTop:8,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
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
