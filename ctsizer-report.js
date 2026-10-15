'use strict';
// ctsizer-report.js — documentation report as an .rtf file ("Export RTF").
//
// Modelled on ctvt_dim's pdf/report_generator.py: a front page (company,
// station, report type, document control, standards), a results summary, the
// project's system data, nomenclature, methodology, then one section per bay →
// device → core with the core's input data, calculation steps, requirements
// overview, remarks and verdict.
//
// RTF rather than PDF: it opens in Word, LibreOffice and WordPad and can be
// edited before it is filed. Headings use Word's heading styles (outline
// levels), so the navigation pane and the table of contents field work.
//
// CTSReport.build(ctx) → { rtf, filename }. ctx:
//   lang, projName, system, feeders, settings, results (keyed
//   `${feeder.id}-${device.id}-${core.id}`, as the app's results memo),
//   meta    { title, doc_no, revision, rev_desc, date, client, prepared_by,
//             checked_by, approved_by, note }
//   options { steps, charts, nomenclature, methodology, feederIds (null = all) }
//   metrics (calc_type, result) → [{ label, value, unit }]   (optional)
//   charts  { [result key]: [{ title, caption?, warn?, img: { type:'png', data, w, h } }] }
//           (optional; the browser draws them, ctsizer-export.jsx)
//   now     Date (optional, for tests)
// The output is 7-bit ASCII (non-ASCII characters as \uN? escapes).

const CTSReport = (() => {

  // ── Report text ────────────────────────────────────────────────────────
  const S = {
    en: {
      report_title_ct: 'CT Dimensioning Report', report_title_vt: 'VT Dimensioning Report',
      report_title_ct_vt: 'CT/VT Dimensioning Report',
      project: 'Project', client: 'Client', doc_no: 'Document no.', revision: 'Revision', date: 'Date',
      prepared_by: 'Prepared by', checked_by: 'Checked by', approved_by: 'Approved by',
      company: 'Company', address: 'Address', note: 'Note',
      doc_control: 'Document control', rev: 'Rev.', description: 'Description',
      rev_first: 'First issue',
      calculations_performed: 'Calculations performed according to:',
      std_61869_1: 'IEC 61869-1: Instrument transformers — General requirements',
      std_61869_2: 'IEC 61869-2: Additional requirements for current transformers',
      std_61869_3: 'IEC 61869-3: Additional requirements for inductive voltage transformers',
      std_61869_100: 'IEC TR 61869-100: Guidance for application of current transformers in power system protection',
      std_60287: 'IEC 60287 / IEC 60228: Conductor resistance of cables',
      beta_footer: 'Beta version, still under development \u2014 do not rely 100% on all calculations; verify every result independently.',
      fingerprint: 'Project fingerprint',
      fingerprint_note: 'SHA-256 of the project content; the same value is saved in the project file (.ctvt).',
      disclaimer: 'Generated with CTSizer. The results are the responsibility of the user and must be verified by a qualified engineer before use.',
      toc: 'Table of contents',
      toc_hint: 'Right-click here and choose "Update field" (or press F9) to build the table of contents.',
      summary: 'Summary of results', section: 'Section', bay: 'Bay', device: 'Device', core: 'Core',
      application: 'Application', key_result: 'Key result', conclusion: 'Conclusion',
      approved: 'Approved', rejected: 'Rejected', no_result: 'No result',
      cores_ok: '{ok} of {n} cores correctly dimensioned.',
      system_data: 'Station and system data',
      station_name: 'Station name', station_abbr: 'Abbreviation', un: 'Un — Nominal voltage',
      fr: 'fr — Frequency', ik: 'Ik max — System fault current', tp: 'Tp — Primary time constant',
      tp_confirmed: 'Tp confirmed', yes: 'Yes', no: 'No',
      cable_method: 'Cable resistance method', cable_temp: 'Cable temperature (all cores)',
      nomenclature: 'Nomenclature', ct_nomenclature: 'CT nomenclature', vt_nomenclature: 'VT nomenclature',
      symbol: 'Symbol', unit: 'Unit',
      methodology: 'Methodology and standards',
      meth_base: 'The calculations in this report follow the IEC 61869 series. Lead resistances are calculated with the project\u2019s cable resistance method at the project cable temperature. Each core is checked against the requirements of its application; a core is correctly dimensioned when every requirement is met.',
      meth_overcurrent: 'Overcurrent: the actual accuracy limit factor with the connected burden (ALFact) must reach the required factor ALFreq = Ik,max / Ipr (IEC 61869-2).',
      meth_metering: 'Metering: the connected burden must lie between the minimum burden and the rated burden, and the instrument security factor at the connected burden (Fsa) must not exceed the required maximum (IEC 61869-2).',
      meth_busbar: 'Busbar: the burden, the accuracy limit factor at the actual burden (Fa) against the fault current ratio, and the manufacturer\u2019s minimum Fa are checked.',
      meth_distance: 'Distance protection: the required knee point voltage follows from the transient dimensioning factors Ktd for close-in and zone-1 faults (IEC TR 61869-100). The offered EALF must reach Vk,req. With auto-reclosure the C-O-C-O duty cycle is checked as well.',
      meth_line_diff: 'Line differential: the required knee point voltage is the largest e.m.f. for internal and through faults (three- and single-phase) with the loop resistance of each case.',
      meth_transformer_diff: 'Transformer differential: the E.M.F. method, the IEC 61869 ALF requirements and the G. Ziegler (Siemens) method are applied. Stability factors come from relay manufacturer guidance and are not normative IEC requirements.',
      meth_vt: 'Voltage transformer: the connected burden, the thermal burden and the voltage drop in the secondary cable are checked (IEC 61869-3).',
      bay_type: 'Bay type', bay_line: 'Line', bay_transformer: 'Transformer', bay_cable: 'Cable', bay_busbar: 'Busbar',
      bay_overview: 'Requirements overview',
      ct: 'Current transformer', vt: 'Voltage transformer',
      input_data: 'Input data', parameter: 'Parameter', value: 'Value',
      key_results: 'Key results', calculation: 'Calculation', step: 'Step', formula: 'Formula', result: 'Result',
      requirements: 'Requirements', requirement: 'Requirement', check: 'Check', status: 'Status',
      ok: 'OK', not_ok: 'NOT OK', remarks: 'Remarks',
      ct_ok: 'CT CORRECTLY DIMENSIONED', ct_not_ok: 'CT NOT CORRECTLY DIMENSIONED',
      vt_ok: 'VT CORRECTLY DIMENSIONED', vt_not_ok: 'VT NOT CORRECTLY DIMENSIONED',
      no_calc: 'No calculation result for this core (check the inputs).',
      ct_ratio: 'CT ratio', ct_class: 'CT class', page: 'Page', of: 'of',
      relay_manufacturer: 'Relay manufacturer', relay_type: 'Relay type / model', relay_tag: 'Relay serial / tag',
      relay_ied: 'IED (relay database)',
      relay_tal: 't_al — Relay time to accuracy limit',
      trafo_power: 'Transformer rated power', trafo_voltage: 'Winding voltage (this CT)',
      trafo_z: 'Short-circuit impedance', inrush: 'Inrush factor k', linked_winding: 'Linked winding',
      ar: 'C-O-C-O auto-reclosure', ar_t_prime: "t' — Fault clearing time (1st fault)",
      ar_tfr: 'tfr — AR dead time', ar_ts: 'Ts — Secondary time constant', ar_ts_table: 'from table',
      ar_ktf: 'Ktf curve preset', enabled: 'Enabled',
      charts: 'Charts', figure: 'Figure',
      chart_sat: 'Saturation curve: secondary e.m.f. against ALF, with the operating and the required point',
      chart_fault: 'Single fault waveform (Tp = {tp} ms)',
      chart_ar: 'C-O-C-O auto-reclosure \u2014 IEC 61869-100 transient analysis',
      chart_sat_warn: 'CT will saturate \u2014 increase ALF or reduce burden',
      chart_no_ode: 'No IEC 61869-100 ODE check: a PX core has no rated ALF (ALFo). The verdict is EAL_AR \u2264 Vk.',
      chart_no_ode_ld: 'No IEC 61869-100 ODE check: line differential has none (no ALFo). The verdict is EAL_AR \u2264 proposed Vk.',
    },
    da: {
      report_title_ct: 'CT Dimensioneringsrapport', report_title_vt: 'VT Dimensioneringsrapport',
      report_title_ct_vt: 'CT/VT Dimensioneringsrapport',
      project: 'Projekt', client: 'Kunde', doc_no: 'Dokumentnr.', revision: 'Revision', date: 'Dato',
      prepared_by: 'Udarbejdet af', checked_by: 'Kontrolleret af', approved_by: 'Godkendt af',
      company: 'Virksomhed', address: 'Adresse', note: 'Bemærkning',
      doc_control: 'Dokumentstyring', rev: 'Rev.', description: 'Beskrivelse',
      rev_first: 'Første udgave',
      calculations_performed: 'Beregninger udført i henhold til:',
      std_61869_1: 'IEC 61869-1: Instrumenttransformere — Generelle krav',
      std_61869_2: 'IEC 61869-2: Supplerende krav til strømtransformere',
      std_61869_3: 'IEC 61869-3: Supplerende krav til induktive spændingstransformere',
      std_61869_100: 'IEC TR 61869-100: Vejledning i anvendelse af strømtransformere til beskyttelse',
      std_60287: 'IEC 60287 / IEC 60228: Lederresistans i kabler',
      beta_footer: 'Betaversion, stadig under udvikling \u2014 stol ikke 100 % på alle beregninger; kontrollér alle resultater uafhængigt.',
      fingerprint: 'Projektets fingeraftryk',
      fingerprint_note: 'SHA-256 af projektets indhold; samme værdi gemmes i projektfilen (.ctvt).',
      disclaimer: 'Udarbejdet med CTSizer. Resultaterne er brugerens ansvar og skal verificeres af en kvalificeret ingeniør før brug.',
      toc: 'Indholdsfortegnelse',
      toc_hint: 'Højreklik her og vælg "Opdater felt" (eller tryk F9) for at opbygge indholdsfortegnelsen.',
      summary: 'Resultatoversigt', section: 'Afsnit', bay: 'Felt', device: 'Enhed', core: 'Kerne',
      application: 'Applikation', key_result: 'Nøgleresultat', conclusion: 'Konklusion',
      approved: 'Godkendt', rejected: 'Afvist', no_result: 'Intet resultat',
      cores_ok: '{ok} af {n} kerner korrekt dimensioneret.',
      system_data: 'Station- og systemdata',
      station_name: 'Stationsnavn', station_abbr: 'Forkortelse', un: 'Un — Nominel spænding',
      fr: 'fr — Frekvens', ik: 'Ik max — Systemets kortslutningsstrøm', tp: 'Tp — Primær tidskonstant',
      tp_confirmed: 'Tp bekræftet', yes: 'Ja', no: 'Nej',
      cable_method: 'Metode for kabelmodstand', cable_temp: 'Kabeltemperatur (alle kerner)',
      nomenclature: 'Nomenklatur', ct_nomenclature: 'CT nomenklatur', vt_nomenclature: 'VT nomenklatur',
      symbol: 'Symbol', unit: 'Enhed',
      methodology: 'Metode og standarder',
      meth_base: 'Beregningerne i denne rapport følger IEC 61869-serien. Ledningsmodstande beregnes med projektets metode for kabelmodstand ved projektets kabeltemperatur. Hver kerne kontrolleres mod kravene for dens applikation; en kerne er korrekt dimensioneret, når alle krav er opfyldt.',
      meth_overcurrent: 'Overstrøm: den aktuelle nøjagtighedsgrænsefaktor ved den tilsluttede byrde (ALFact) skal nå den krævede faktor ALFreq = Ik,max / Ipr (IEC 61869-2).',
      meth_metering: 'Måling: den tilsluttede byrde skal ligge mellem minimumsbyrden og mærkebyrden, og sikkerhedsfaktoren ved den tilsluttede byrde (Fsa) må ikke overstige det krævede maksimum (IEC 61869-2).',
      meth_busbar: 'Samleskinne: byrden, nøjagtighedsgrænsefaktoren ved den aktuelle byrde (Fa) mod fejlstrømsforholdet og producentens minimum for Fa kontrolleres.',
      meth_distance: 'Distancebeskyttelse: den krævede knæpunktsspænding følger af de transiente dimensioneringsfaktorer Ktd for nærfejl og zone-1-fejl (IEC TR 61869-100). Den tilbudte EALF skal nå Vk,req. Med genindkobling kontrolleres C-O-C-O-cyklussen også.',
      meth_line_diff: 'Linjedifferential: den krævede knæpunktsspænding er den største e.m.k. for interne og gennemgående fejl (tre- og enfasede) med sløjfemodstanden for hvert tilfælde.',
      meth_transformer_diff: 'Transformatordifferential: E.M.F.-metoden, IEC 61869 ALF-kravene og G. Ziegler (Siemens)-metoden anvendes. Stabilitetsfaktorer stammer fra relæproducentens vejledning og er ikke normative IEC-krav.',
      meth_vt: 'Spændingstransformer: den tilsluttede byrde, den termiske byrde og spændingsfaldet i sekundærkablet kontrolleres (IEC 61869-3).',
      bay_type: 'Felttype', bay_line: 'Linje', bay_transformer: 'Transformer', bay_cable: 'Kabel', bay_busbar: 'Samleskinne',
      bay_overview: 'Kravsoversigt',
      ct: 'Strømtransformer', vt: 'Spændingstransformer',
      input_data: 'Inputdata', parameter: 'Parameter', value: 'Værdi',
      key_results: 'Nøgleresultater', calculation: 'Beregning', step: 'Trin', formula: 'Formel', result: 'Resultat',
      requirements: 'Krav', requirement: 'Krav', check: 'Kontrol', status: 'Status',
      ok: 'OK', not_ok: 'IKKE OK', remarks: 'Bemærkninger',
      ct_ok: 'CT KORREKT DIMENSIONERET', ct_not_ok: 'CT IKKE KORREKT DIMENSIONERET',
      vt_ok: 'VT KORREKT DIMENSIONERET', vt_not_ok: 'VT IKKE KORREKT DIMENSIONERET',
      no_calc: 'Intet beregningsresultat for denne kerne (kontrollér input).',
      ct_ratio: 'CT omsætning', ct_class: 'CT klasse', page: 'Side', of: 'af',
      relay_manufacturer: 'Relæproducent', relay_type: 'Relætype / model', relay_tag: 'Relæ serienr. / tag',
      relay_ied: 'IED (relædatabase)',
      relay_tal: 't_al — Relætid til nøjagtighedsgrænse',
      trafo_power: 'Transformerens mærkeeffekt', trafo_voltage: 'Viklingsspænding (denne CT)',
      trafo_z: 'Kortslutningsimpedans', inrush: 'Inrush-faktor k', linked_winding: 'Tilknyttet vikling',
      ar: 'C-O-C-O genindkobling', ar_t_prime: "t' — Fejlbortkoblingstid (1. fejl)",
      ar_tfr: 'tfr — Pausetid', ar_ts: 'Ts — Sekundær tidskonstant', ar_ts_table: 'fra tabel',
      ar_ktf: 'Ktf kurve', enabled: 'Aktiveret',
      charts: 'Grafer', figure: 'Figur',
      chart_sat: 'Mætningskurve: sekundær e.m.k. mod ALF med drifts- og kravpunkt',
      chart_fault: 'Enkeltfejl-kurveform (Tp = {tp} ms)',
      chart_ar: 'C-O-C-O genindkobling \u2014 IEC 61869-100 transient analyse',
      chart_sat_warn: 'CT vil gå i mætning \u2014 øg ALF eller reducér byrden',
      chart_no_ode: 'Ingen IEC 61869-100 ODE-kontrol: en PX-kerne har ingen mærke-ALF (ALFo). Konklusionen er EAL_AR \u2264 Vk.',
      chart_no_ode_ld: 'Ingen IEC 61869-100 ODE-kontrol: linjedifferential har ingen (ingen ALFo). Konklusionen er EAL_AR \u2264 foreslået Vk.',
    },
  };
  const L = (lang, k) => (S[lang] || S.en)[k] ?? S.en[k] ?? k;
  // The app's UI strings (input labels, device names), when loaded.
  const UI = (lang, k) => (typeof CTSI18n !== 'undefined' ? CTSI18n.t(lang, k) : k);

  // Nomenclature as ctvt_dim's report (pdf/locales nom_ct_* / nom_vt_*).
  const NOM_CT = [
    ['Un', 'kV', 'Nominal system voltage', 'Nominel systemspænding'],
    ['fr', 'Hz', 'System frequency', 'Systemfrekvens'],
    ['Ik max', 'kA', 'Maximum three-phase short circuit current', 'Maksimal trefaset kortslutningsstrøm'],
    ['Ike max', 'kA', 'Maximum single-phase short circuit current', 'Maksimal enfaset kortslutningsstrøm'],
    ['Tp', 'ms', 'Primary time constant', 'Primær tidskonstant'],
    ['Ts', 's', 'Secondary time constant', 'Sekundær tidskonstant'],
    ['Ipr', 'A', 'Rated primary current', 'Primær mærkestrøm'],
    ['Isr', 'A', 'Rated secondary current', 'Sekundær mærkestrøm'],
    ['Sn', 'VA', 'Rated burden', 'Mærkebyrde'],
    ['SR', 'VA', 'Relay burden', 'Relæbyrde'],
    ['Rct', '\u03a9', 'Secondary winding DC resistance', 'Sekundær viklings DC-resistans'],
    ['Rlead', '\u03a9', 'Lead (cable) resistance', 'Kabelresistans'],
    ['ALF', '-', 'Accuracy limit factor', 'Nøjagtighedsgrænsefaktor'],
    ['Vk', 'V', 'Knee point voltage', 'Knæpunktsspænding'],
    ['EALF', 'V', 'Secondary limiting e.m.f.', 'Sekundær grænse-e.m.k.'],
    ['Ktd', '-', 'Transient dimensioning factor', 'Transient dimensioneringsfaktor'],
    ["K'ssc", '-', 'Symmetrical short circuit current factor', 'Symmetrisk kortslutningsstrømfaktor'],
    ['Fs', '-', 'Instrument security factor', 'Instrumentsikkerhedsfaktor'],
  ];
  const NOM_VT = [
    ['Us', 'V', 'Rated secondary voltage', 'VT sekundærspænding'],
    ['Sn', 'VA', 'Rated burden', 'Mærkebyrde'],
    ['Sth', 'VA', 'Thermal burden', 'Termisk byrde'],
    ['Rcable', '\u03a9', 'Cable resistance per conductor', 'Kabelresistans pr. leder'],
    ['Sactual', 'VA', 'Actual connected burden', 'Aktuel tilsluttet byrde'],
    ['\u0394U', 'V', 'Voltage drop in the secondary cable', 'Spændingsfald i sekundærkablet'],
  ];

  // Remarks: the calc modules give [key, ...args] (ctvt_dim's translation
  // keys) or a ready string.
  const WARN = {
    en: {
      info_ktd_lookup_table_assumption: 'Ktd from the lookup table: this assumes an implicit t_al \u2248 {0} ms (close-in) and {1} ms (zone 1). Verify against the relay requirements (IEC TR 61869-100).',
      warning_ktd_analytical_deviation: 'Analytical Ktd ({0}, {1}) deviates significantly from the lookup table ({2}, {3}). The table assumes t_al \u2248 {4} ms; verify that the relay requires t_al = {5} ms.',
      warning_numerical_precision_reactance: 'Numerical precision limit in the source reactance (Zs = {0} \u03a9, Rs = {1} \u03a9, Xs\u00b2 = {2}).',
      warning_burden_condition_not_met: 'Burden condition not met: Sn = {0} VA, S = {1} VA, Smin = {2} VA.',
      warning_safety_factor_condition_not_met: 'Instrument security factor condition not met: Fmin = {0}, Fsa = {1}.',
      warning_fs_not_below_fmin: 'Cond. 2 cannot be met with this CT and meter: FS = {0} is not below the meter\u2019s Fmin = {1} (it would need S \u2265 {2} VA, Sn = {3} VA). Choose a CT with a lower FS or a meter with a higher overcurrent withstand.',
      hint_metering_add_burden: 'Cond. 2 needs a total burden of at least {1} VA: add {0} VA (e.g. a resistor in the secondary circuit) or choose a meter with a higher Fmin.',
      hint_lead_burden_above_sn: 'The cable burden alone ({0} VA) exceeds Sn = {1} VA: use a larger cross-section, a shorter cable, a 1 A secondary or a higher rated output.',
      hint_extended_burden_range: 'S = {0} VA is below Smin = {1} VA. A CT with the extended burden range (IEC 61869-2 5.6.201.4, 1 VA \u2013 Sn) meets cond. 1; otherwise add burden.',
      warning_extended_range_sn_above_15: 'The extended burden range is only defined for Sn \u2264 {1} VA (IEC 61869-2 5.6.201.4); Sn = {0} VA uses the standard range.',
      warning_vt_range_ii_below_25: 'Burden range II: the burden utilization {0} % is below 25 % of the rated burden (IEC 61869-3 5.6.301.3). Add burden or specify a range I VT.',
      // The same remarks under Elmåling / TR 353 (calc/local_rules/dk_elmaaling.js), without the "add burden" advice it does not allow
      hint_metering_add_burden_dk_lv: 'Cond. 2 needs a total burden of at least {1} VA ({0} VA more), but Elmåling (TR 353 \u00a76.2) allows no extra burden in the metering circuit at \u2264 1 kV: choose a meter with a higher Fmin, a CT with a lower FS or a lower rated burden Sn (not below S).',
      hint_metering_add_burden_dk_hv: 'Cond. 2 needs a total burden of at least {1} VA: add {0} VA with longer leads or a smaller cross-section (not below 1.5 mm\u00b2, Elmåling TR 353 \u00a76.2; not with a resistor), or choose a meter with a higher Fmin.',
      hint_extended_burden_range_dk: 'S = {0} VA is below Smin = {1} VA. Elmåling (TR 353 \u00a76.2) requires the extended burden range (IEC 61869-2 5.6.201.4, 1 VA \u2013 Sn): specify it for the CT.',
      warning_vt_range_ii_below_25_dk: 'Burden range II: the burden utilization {0} % is below 25 % of the rated burden (IEC 61869-3 5.6.301.3). Elmåling (TR 353 \u00a76.3) requires burden series I: specify a series I VT.',
      warning_vt_range_nonstandard: 'Rated burden {1} VA is not a standard value for burden range {0} (IEC 61869-3 5.5.301; allowed by NOTE 301).',
      warning_burden_inadequate: 'Burden inadequate: Sn = {0} VA, Sa = {1} VA.',
      warning_fault_current_ratio_exceeded: 'Fault current ratio not met: Fa = {0}, If,max / Ipr = {1}.',
      warning_manufacturer_fa_minimum: 'Manufacturer minimum not met: Fa = {0} < {1}.',
      warning_z_percent_out_of_range: 'Transformer short-circuit impedance {0} % is outside the typical range {1}\u2013{2} %.',
      warning_iec_req_1_not_met: 'IEC requirement 1 not met: ALFo = {0} < ALFreq,ext = {1}.',
      warning_iec_req_2_not_met: 'IEC requirement 2 not met: ALFo = {0} < ALFreq,int = {1}.',
      warning_iec_req_3_not_met: 'IEC requirement 3 not met: ALFo = {0} < {1}.',
      warning_iec_req_4_not_met: 'IEC requirement 4 not met: Fadap = {0} is outside the permitted range.',
      warning_ziegler_not_met: 'G. Ziegler requirement not met: ALFo = {0} < {1}.',
      warning_ied_no_input_data: "IED {0}: the relay database has no input ratings for Isr = {1} A; the IED input rating is not checked.",
      warning_ied_no_fault_current: "No maximum fault current: the IED input rating is not checked.",
      warning_ied_measuring_range_exceeded: "IED {0}: the secondary peak current {1} A exceeds the measuring range {2} A (peak). The IED measurement clips.",
      warning_ied_dynamic_capacity_exceeded: "IED {0}: the secondary peak current {1} A exceeds the dynamic (half-cycle) withstand {2} A.",
      warning_ied_thermal_short_time_exceeded: "IED {0}: the secondary current {1} A exceeds the short-time thermal limit {2} A for the advised fault duration.",
      warning_ied_requirement_exceeded: "IED {0}: requirement {1} not met ({2} A > {3} A).",
      warning_ied_not_evaluated_no_thermal_duration: "IED {0}: {1} not evaluated: the relay database has no manufacturer-advised fault duration.",
      warning_ied_not_evaluated_no_thermal_rating: "IED {0}: {1} not evaluated: no thermal rating in the relay database.",
      warning_ied_not_evaluated_unknown_kind: "IED {0}: requirement {1} not evaluated: unknown requirement kind.",
      warning_ied_not_evaluated_unknown_limit_unit: "IED {0}: requirement {1} not evaluated: unknown limit unit.",
      warning_isc_int_missing: 'No short-circuit level: no project Ik max and no Isc,max,int on the core. The transformer differential core is not calculated.',
      warning_emf_insufficient: 'E.m.f. insufficient: {0} = {1} V < Vk,req = {2} V.',
      warning_knee_point_voltage_insufficient: 'Knee point voltage insufficient: {0} = {1} V < Vk,req = {2} V.',
      warning_auto_reclosure_eal_below_vk: 'Auto-reclosure: EAL,AR = {0} V exceeds the proposed Vk = {1} V.',
      warning_total_resistance_capped: 'Total resistance {0} \u03a9 capped at {1} \u03a9.',
      warning_alf_insufficient: 'ALF insufficient: ALF offered = {0} < ALF required = {1}.',
      warning_ar_eal_insufficient: 'Auto-reclosure: the C-O-C-O EAL,AR = {1} V exceeds the offered EALF = {0} V \u2014 the CT cannot handle the duty cycle.',
      warning_ik1_higher_than_ik3: 'Single-phase fault current (Ik1 = {ik1}) is higher than three-phase (Ik3 = {ik3}). This is normal for solidly earthed EHV systems; the CT is dimensioned for Ik1.',
      info_ik1_higher_design: 'Three-phase fault current (Ik3 = {ik3}) is lower than single-phase (Ik1 = {ik1}); the CT is dimensioned for Ik1.',
      note_worst_case_inception_angle: 'The transient waveforms are calculated for the worst-case fault inception angle (\u03b8 = 0\u00b0), which gives the maximum DC offset. A fault near the voltage zero crossing gives a fully asymmetric current whose DC component, decaying with Tp, drives the core towards saturation; since the inception angle cannot be predicted, the dimensioning covers the worst case. This is why Ktd can be much larger than 1.',
      note_iec61869_ar_overhead_disclaimer: 'Per IEC TR 61869-100, the requirements for auto-reclosure (C-O-C-O) duty cycles can be more stringent for overhead lines and other applications with high remanence or long primary time constants. Actual performance depends on network topology, fault scenario and the core\u2019s magnetic properties; verification against the specific network conditions is recommended.',
    },
    da: {
      info_ktd_lookup_table_assumption: 'Ktd fra opslagstabel: dette antager implicit t_al \u2248 {0} ms (nærfejl) og {1} ms (zone 1). Verificér mod relækravene (IEC TR 61869-100).',
      warning_ktd_analytical_deviation: 'Analytisk Ktd ({0}, {1}) afviger betydeligt fra opslagstabellen ({2}, {3}). Tabellen antager t_al \u2248 {4} ms; verificér at relæet kræver t_al = {5} ms.',
      warning_numerical_precision_reactance: 'Numerisk præcisionsgrænse i kildereaktansen (Zs = {0} \u03a9, Rs = {1} \u03a9, Xs\u00b2 = {2}).',
      warning_burden_condition_not_met: 'Byrdebetingelse ikke opfyldt: Sn = {0} VA, S = {1} VA, Smin = {2} VA.',
      warning_safety_factor_condition_not_met: 'Sikkerhedsfaktorbetingelse ikke opfyldt: Fmin = {0}, Fsa = {1}.',
      warning_fs_not_below_fmin: 'Bet. 2 kan ikke opfyldes med denne CT og måler: FS = {0} er ikke under målerens Fmin = {1} (det kræver S \u2265 {2} VA, Sn = {3} VA). Vælg en CT med lavere FS eller en måler med højere overstrømsholdbarhed.',
      hint_metering_add_burden: 'Bet. 2 kræver en samlet byrde på mindst {1} VA: tilføj {0} VA (f.eks. en modstand i sekundærkredsen) eller vælg en måler med højere Fmin.',
      hint_lead_burden_above_sn: 'Kabelbyrden alene ({0} VA) overstiger Sn = {1} VA: brug et større tværsnit, et kortere kabel, 1 A sekundær eller en højere mærkebyrde.',
      hint_extended_burden_range: 'S = {0} VA er under Smin = {1} VA. En CT med udvidet byrdeområde (IEC 61869-2 5.6.201.4, 1 VA \u2013 Sn) opfylder bet. 1; ellers tilføj byrde.',
      warning_extended_range_sn_above_15: 'Det udvidede byrdeområde er kun defineret for Sn \u2264 {1} VA (IEC 61869-2 5.6.201.4); Sn = {0} VA bruger standardområdet.',
      warning_vt_range_ii_below_25: 'Byrdeområde II: byrdeudnyttelsen {0} % er under 25 % af mærkebyrden (IEC 61869-3 5.6.301.3). Tilføj byrde eller specificér en VT med område I.',
      hint_metering_add_burden_dk_lv: 'Bet. 2 kræver en samlet byrde på mindst {1} VA ({0} VA mere), men Elmåling (TR 353 \u00a76.2) tillader ikke ekstra byrde i målekredsen ved \u2264 1 kV: vælg en måler med højere Fmin, en CT med lavere FS eller en lavere mærkebyrde Sn (ikke under S).',
      hint_metering_add_burden_dk_hv: 'Bet. 2 kræver en samlet byrde på mindst {1} VA: tilføj {0} VA med længere tilledninger eller et mindre tværsnit (ikke under 1,5 mm\u00b2, Elmåling TR 353 \u00a76.2; ikke med en modstand), eller vælg en måler med højere Fmin.',
      hint_extended_burden_range_dk: 'S = {0} VA er under Smin = {1} VA. Elmåling (TR 353 \u00a76.2) kræver udvidet byrdeområde (IEC 61869-2 5.6.201.4, 1 VA \u2013 Sn): specificér det for CT\u2019en.',
      warning_vt_range_ii_below_25_dk: 'Byrdeområde II: byrdeudnyttelsen {0} % er under 25 % af mærkebyrden (IEC 61869-3 5.6.301.3). Elmåling (TR 353 \u00a76.3) kræver byrdeserie I: specificér en VT med byrdeserie I.',
      warning_vt_range_nonstandard: 'Mærkebyrden {1} VA er ikke en standardværdi for byrdeområde {0} (IEC 61869-3 5.5.301; tilladt jf. NOTE 301).',
      warning_burden_inadequate: 'Utilstrækkelig byrde: Sn = {0} VA, Sa = {1} VA.',
      warning_fault_current_ratio_exceeded: 'Fejlstrømsforhold ikke opfyldt: Fa = {0}, If,max / Ipr = {1}.',
      warning_manufacturer_fa_minimum: 'Producentens minimum ikke opfyldt: Fa = {0} < {1}.',
      warning_z_percent_out_of_range: 'Transformerens kortslutningsimpedans {0} % er uden for det typiske område {1}\u2013{2} %.',
      warning_iec_req_1_not_met: 'IEC krav 1 ikke opfyldt: ALFo = {0} < ALFreq,ext = {1}.',
      warning_iec_req_2_not_met: 'IEC krav 2 ikke opfyldt: ALFo = {0} < ALFreq,int = {1}.',
      warning_iec_req_3_not_met: 'IEC krav 3 ikke opfyldt: ALFo = {0} < {1}.',
      warning_iec_req_4_not_met: 'IEC krav 4 ikke opfyldt: Fadap = {0} er uden for det tilladte område.',
      warning_ziegler_not_met: 'G. Ziegler-krav ikke opfyldt: ALFo = {0} < {1}.',
      warning_ied_no_input_data: "IED {0}: relædatabasen har ingen indgangsdata for Isr = {1} A; IED-indgangen kontrolleres ikke.",
      warning_ied_no_fault_current: "Ingen maksimal fejlstrøm: IED-indgangen kontrolleres ikke.",
      warning_ied_measuring_range_exceeded: "IED {0}: den sekundære spidsstrøm {1} A overstiger måleområdet {2} A (spidsværdi). IED'ens måling klipper.",
      warning_ied_dynamic_capacity_exceeded: "IED {0}: den sekundære spidsstrøm {1} A overstiger den dynamiske (halvperiode) holdbarhed {2} A.",
      warning_ied_thermal_short_time_exceeded: "IED {0}: sekundærstrømmen {1} A overstiger korttids termisk grænse {2} A for den anbefalede fejlvarighed.",
      warning_ied_requirement_exceeded: "IED {0}: krav {1} ikke opfyldt ({2} A > {3} A).",
      warning_ied_not_evaluated_no_thermal_duration: "IED {0}: {1} ikke vurderet: relædatabasen har ingen fejlvarighed anbefalet af fabrikanten.",
      warning_ied_not_evaluated_no_thermal_rating: "IED {0}: {1} ikke vurderet: ingen termisk mærkning i relædatabasen.",
      warning_ied_not_evaluated_unknown_kind: "IED {0}: krav {1} ikke vurderet: ukendt kravtype.",
      warning_ied_not_evaluated_unknown_limit_unit: "IED {0}: krav {1} ikke vurderet: ukendt grænseenhed.",
      warning_isc_int_missing: 'Intet kortslutningsniveau: hverken projektets Ik max eller Isc,max,int på kernen er angivet. Transformerdifferentialkernen beregnes ikke.',
      warning_emf_insufficient: 'E.m.k. utilstrækkelig: {0} = {1} V < Vk,req = {2} V.',
      warning_knee_point_voltage_insufficient: 'Knæpunktsspænding utilstrækkelig: {0} = {1} V < Vk,req = {2} V.',
      warning_auto_reclosure_eal_below_vk: 'Genindkobling: EAL,AR = {0} V overstiger den foreslåede Vk = {1} V.',
      warning_total_resistance_capped: 'Total modstand {0} \u03a9 begrænset til {1} \u03a9.',
      warning_alf_insufficient: 'ALF utilstrækkelig: ALF tilbudt = {0} < ALF krævet = {1}.',
      warning_ar_eal_insufficient: 'Genindkobling: C-O-C-O EAL,AR = {1} V overstiger den tilbudte EALF = {0} V \u2014 CT\u2019en kan ikke håndtere cyklussen.',
      warning_ik1_higher_than_ik3: '1-faset kortslutningsstrøm (Ik1 = {ik1}) er højere end 3-faset (Ik3 = {ik3}). Det er normalt for direkte jordede EHV-net; CT\u2019en dimensioneres for Ik1.',
      info_ik1_higher_design: '3-faset kortslutningsstrøm (Ik3 = {ik3}) er lavere end 1-faset (Ik1 = {ik1}); CT\u2019en dimensioneres for Ik1.',
      note_worst_case_inception_angle: 'De transiente kurveformer er beregnet for den værst tænkelige fejlindkoblingsvinkel (\u03b8 = 0\u00b0), som giver maksimal DC-offset. En fejl nær spændingens nulgennemgang giver en fuldt asymmetrisk strøm, hvis DC-komponent, der henfalder med Tp, driver kernen mod mætning; da vinklen ikke kan forudsiges, dækker dimensioneringen det værste tilfælde. Derfor kan Ktd være meget større end 1.',
      note_iec61869_ar_overhead_disclaimer: 'Iht. IEC TR 61869-100 kan kravene ved genindkobling (C-O-C-O) være strengere for luftledninger og andre anvendelser med høj remanens eller lange primære tidskonstanter. Den faktiske ydelse afhænger af nettopologi, fejlscenarie og kernens magnetiske egenskaber; verifikation mod de konkrete netforhold anbefales.',
    },
  };

  // ── Number formatting ──────────────────────────────────────────────────
  function fmtAuto(v) {
    if (typeof v !== 'number' || !isFinite(v)) return v == null ? '' : String(v);
    const a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 1000) return v.toFixed(0);
    if (a >= 100) return v.toFixed(1);
    if (a >= 1) return String(+v.toFixed(3));
    return String(+v.toPrecision(3));
  }

  // w: [key, ...args], a bare key, a ready sentence, or { message_key, …named args }.
  function warningText(lang, w) {
    const tplOf = (key) => (WARN[lang] || WARN.en)[key] ?? WARN.en[key];
    if (typeof w === 'string') return tplOf(w) ?? w;
    if (w && !Array.isArray(w) && typeof w === 'object') {
      const tpl = tplOf(w.message_key);
      if (!tpl) return w.message_key || JSON.stringify(w);
      return tpl.replace(/\{([a-z0-9_]+)\}/gi, (m, k) => fmtAuto(w[k]));
    }
    if (!Array.isArray(w) || !w.length) return String(w);
    const [key, ...args] = w;
    const tpl = tplOf(key);
    if (!tpl) return `${key}${args.length ? ': ' + args.map(fmtAuto).join(', ') : ''}`;
    return tpl.replace(/\{(\d+)\}/g, (m, i) => fmtAuto(args[+i]));
  }

  // ── RTF primitives ─────────────────────────────────────────────────────
  // Text → RTF: escape \ { }, non-ASCII as \uN? (UTF-16 units, signed),
  // newlines as \line.
  function esc(s) {
    s = s == null ? '' : String(s);
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      const ch = s[i];
      if (ch === '\\' || ch === '{' || ch === '}') out += '\\' + ch;
      else if (ch === '\n') out += '\\line ';
      else if (ch === '\r') { /* dropped */ }
      else if (ch === '\t') out += '\\tab ';
      else if (c < 32) { /* dropped */ }
      else if (c < 128) out += ch;
      else out += `\\u${c > 32767 ? c - 65536 : c}?`;
    }
    return out;
  }

  // ── LaTeX → RTF ────────────────────────────────────────────────────────
  // Covers the subset the calc modules emit: \frac, \sqrt, sub/superscripts,
  // \text/\mathrm, \left/\right, Greek letters and relations. Subscripts and
  // superscripts become RTF \sub / \super runs, so I_{sr}^2 reads as in the app.
  const SYM = {
    cdot: '\u00b7', times: '\u00d7', div: '\u00f7', pm: '\u00b1', mp: '\u2213',
    geq: '\u2265', ge: '\u2265', leq: '\u2264', le: '\u2264', neq: '\u2260', ne: '\u2260',
    approx: '\u2248', equiv: '\u2261', propto: '\u221d',
    wedge: '\u2227', land: '\u2227', vee: '\u2228', lor: '\u2228', neg: '\u00ac',
    parallel: '\u2225', rightarrow: '\u2192', to: '\u2192', Rightarrow: '\u21d2', leftarrow: '\u2190',
    infty: '\u221e', degree: '\u00b0', circ: '\u00b0', ldots: '\u2026', cdots: '\u22ef', dots: '\u2026',
    alpha: '\u03b1', beta: '\u03b2', gamma: '\u03b3', delta: '\u03b4', epsilon: '\u03b5', varepsilon: '\u03b5',
    zeta: '\u03b6', eta: '\u03b7', theta: '\u03b8', kappa: '\u03ba', lambda: '\u03bb', mu: '\u03bc',
    nu: '\u03bd', xi: '\u03be', pi: '\u03c0', rho: '\u03c1', sigma: '\u03c3', tau: '\u03c4',
    phi: '\u03c6', varphi: '\u03c6', chi: '\u03c7', psi: '\u03c8', omega: '\u03c9',
    Gamma: '\u0393', Delta: '\u0394', Theta: '\u0398', Lambda: '\u039b', Pi: '\u03a0', Sigma: '\u03a3',
    Phi: '\u03a6', Psi: '\u03a8', Omega: '\u03a9',
    '%': '%', '{': '{', '}': '}', '_': '_', '&': '&', '#': '#', '$': '$',
  };
  const FUNCS = new Set(['max', 'min', 'ln', 'log', 'exp', 'sin', 'cos', 'tan', 'arctan', 'sqrt']);
  const SPACED = new Set(['=', '<', '>', '\u2265', '\u2264', '\u2260', '\u2248', '\u2261', '\u2192', '\u21d2',
    '\u2227', '\u2228', '\u00b7', '\u00d7', '+', '\u2212', '\u00b1', '\u2225']);
  const TEXT_CMDS = new Set(['text', 'mathrm', 'textrm', 'mathit', 'textit', 'mathbf', 'textbf', 'operatorname', 'mbox', 'mathsf']);
  const IGNORED = new Set(['left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'displaystyle', 'limits', 'nolimits']);

  function latexToRtf(src) {
    const s = String(src ?? '');
    let i = 0;

    // Parses until `}` (inGroup) or the end. Returns { rtf, complex } where
    // `complex` says the run holds a top-level operator (so a \frac part
    // needs parentheses).
    function seq(inGroup, script) {
      let out = '';
      let complex = false;
      let space = false;        // a space is pending
      let empty = true;
      const put = (r) => {
        if (space && !empty) out += ' ';
        space = false; out += r; empty = false;
      };
      const op = (ch) => {
        if (script) { put(esc(ch)); return; }
        // A leading sign or one after '(' stays tight.
        if ((ch === '+' || ch === '\u2212') && (empty || /\($/.test(out))) { space = false; out += esc(ch); empty = false; return; }
        space = true; put(esc(ch)); space = true; complex = true;
      };
      while (i < s.length) {
        const ch = s[i];
        if (ch === '}') { if (inGroup) { i++; break; } i++; continue; }
        if (ch === '{') { i++; const g = seq(true, script); if (g.complex) complex = true; put(g.rtf); continue; }
        if (ch === '\n') { i++; out += '\\line '; space = false; empty = true; continue; }
        if (/\s/.test(ch)) { i++; space = true; continue; }
        if (ch === '_' || ch === '^') {
          i++;
          const a = arg(true);
          space = false;
          out += `{${ch === '_' ? '\\sub' : '\\super'} ${a.rtf}}`;
          empty = false;
          continue;
        }
        if (ch === '\\') {
          i++;
          // \\ line break, \, \; \: \! \  spacing
          const c1 = s[i];
          if (c1 === '\\') { i++; out += '\\line '; space = false; empty = true; continue; }
          if (c1 === ',' || c1 === ';' || c1 === ':' || c1 === ' ') { i++; space = true; continue; }
          if (c1 === '!') { i++; continue; }
          if (c1 && !/[A-Za-z]/.test(c1)) { i++; put(esc(SYM[c1] ?? c1)); continue; }
          let name = '';
          while (i < s.length && /[A-Za-z]/.test(s[i])) name += s[i++];
          if (IGNORED.has(name)) continue;
          if (name === 'quad' || name === 'qquad') { space = true; continue; }
          if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
            const a = arg(false), b = arg(false);
            const wrap = (x) => (x.complex ? `(${x.rtf})` : x.rtf);
            if (script) put(`${wrap(a)}/${wrap(b)}`);
            else { put(wrap(a)); space = true; put('/'); space = true; put(wrap(b)); complex = true; }
            continue;
          }
          if (name === 'sqrt') {
            let index = '';
            // An unclosed [ is left as text: indexOf -1 would rewind i to 0 and
            // re-parse the string, which blows up exponentially on nested \sqrt[.
            if (s[i] === '[') { const j = s.indexOf(']', i); if (j >= 0) { index = s.slice(i + 1, j); i = j + 1; } }
            const a = arg(false);
            put(`${index ? `{\\super ${esc(index)}}` : ''}\\u8730?${a.complex || a.long ? `(${a.rtf})` : a.rtf}`);
            continue;
          }
          if (TEXT_CMDS.has(name)) {
            skipWs();
            if (s[i] === '{') {
              i++;
              let depth = 1, t = '';
              while (i < s.length) {
                if (s[i] === '\\' && i + 1 < s.length) {
                  const n = s[i + 1];
                  if (n === ',' || n === ' ' || n === ';') { t += ' '; i += 2; continue; }
                  if (SYM[n] && !/[A-Za-z]/.test(n)) { t += SYM[n]; i += 2; continue; }
                }
                if (s[i] === '{') depth++;
                if (s[i] === '}' && --depth === 0) { i++; break; }
                t += s[i++];
              }
              put(esc(t));
            }
            continue;
          }
          if (FUNCS.has(name)) { put(esc(name)); continue; }
          if (name in SYM) {
            const sym = SYM[name];
            if (SPACED.has(sym)) op(sym); else put(esc(sym));
            continue;
          }
          put(esc(name));
          continue;
        }
        // <= and >= written out
        if ((ch === '<' || ch === '>') && s[i + 1] === '=') { i += 2; op(ch === '<' ? '\u2264' : '\u2265'); continue; }
        if (ch === '-' && s[i + 1] === '>') { i += 2; op('\u2192'); continue; }
        if (ch === '-') { i++; op('\u2212'); continue; }
        if ('=<>+'.includes(ch)) { i++; op(ch); continue; }
        if (ch === ',' && !script) { i++; space = false; out += ','; empty = false; space = true; continue; }
        if (ch === '/') { i++; if (!script) complex = true; put('/'); continue; }
        if (ch === '~') { i++; space = true; continue; }
        i++;
        put(esc(ch));
      }
      return { rtf: out, complex };
    }

    function skipWs() { while (i < s.length && /[ \t]/.test(s[i])) i++; }

    // One argument: a {group}, a \command (with its own arguments), or one character.
    function arg(script) {
      skipWs();
      if (s[i] === '{') {
        i++;
        const start = i;
        const g = seq(true, script);
        g.long = (i - start) > 4;
        return g;
      }
      if (s[i] === '\\') {
        // Parse just this command by running seq over a bounded copy.
        const startI = i;
        i++;
        let name = '';
        while (i < s.length && /[A-Za-z]/.test(s[i])) name += s[i++];
        if (!name && i < s.length) i++;
        const piece = s.slice(startI, i);
        return { rtf: latexToRtf(piece), complex: false };
      }
      const ch = s[i++] ?? '';
      return { rtf: esc(ch), complex: false };
    }

    // A trailing space that ends a control word (\line ) is kept: the result is
    // embedded in other runs, and the next letters would extend the word.
    return seq(false, false).rtf.replace(/ +/g, ' ').replace(/^ /, '').replace(/(?<!\\[a-z]+) $/, '');
  }

  // Plain text of a LaTeX string (used where RTF runs cannot go, e.g. tests).
  function rtfToPlain(r) {
    const lit = ['\u0001', '\u0002', '\u0003'];
    return r.replace(/\\\\/g, lit[0]).replace(/\\\{/g, lit[1]).replace(/\\\}/g, lit[2])
      .replace(/\\u(-?\d+)\?/g, (m, n) => String.fromCharCode(+n < 0 ? +n + 65536 : +n))
      .replace(/\\line ?/g, '\n').replace(/\{\\(sub|super) /g, '').replace(/[{}]/g, '')
      .replace(/[\u0001-\u0003]/g, (c) => '\\{}'[lit.indexOf(c)]);
  }

  // ── Layout constants (twips) ───────────────────────────────────────────
  const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1134;   // A4, 2 cm margins
  const TEXT_W = PAGE_W - 2 * MARGIN;                   // 9638
  // Colour table indices
  const C = { text: 1, muted: 2, green: 3, red: 4, headFill: 5, border: 6, greenFill: 7, redFill: 8, accent: 9, lightFill: 10, watermark: 11, amber: 12 };
  const COLORTBL = '{\\colortbl;' + [
    [33, 37, 41], [100, 110, 120], [30, 123, 52], [180, 35, 24], [233, 236, 239],
    [191, 197, 204], [212, 237, 218], [248, 215, 218], [2, 100, 160], [245, 247, 250],
    [214, 219, 225], [176, 112, 0],
  ].map(([r, g, b]) => `\\red${r}\\green${g}\\blue${b};`).join('') + '}';

  const FONTTBL = '{\\fonttbl{\\f0\\fswiss\\fcharset0 Calibri{\\*\\falt Arial};}' +
    '{\\f1\\froman\\fcharset0 Cambria Math{\\*\\falt Times New Roman};}' +
    '{\\f2\\fmodern\\fcharset0 Consolas{\\*\\falt Courier New};}}';

  const BASE = `\\f0\\fs20\\cf${C.text}`;
  const H = {
    1: `\\s1\\sb360\\sa160\\keepn\\outlinelevel0\\b\\fs32\\cf${C.accent}`,
    2: `\\s2\\sb280\\sa120\\keepn\\outlinelevel1\\b\\fs26\\cf${C.accent}`,
    3: `\\s3\\sb200\\sa80\\keepn\\outlinelevel2\\b\\fs22\\cf${C.text}`,
  };
  const STYLESHEET = '{\\stylesheet' +
    `{\\s0\\ql\\sa100${BASE} Normal;}` +
    `{${H[1]}\\f0 heading 1;}{${H[2]}\\f0 heading 2;}{${H[3]}\\f0 heading 3;}` +
    `{\\s20\\ql\\fs18\\f0\\cf${C.muted} Table Text;}` +
    '{\\*\\cs10 Default Paragraph Font;}}';

  const para = (rtf, fmt = '') => `\\pard\\plain\\s0\\ql\\sa100${BASE}${fmt} ${rtf}\\par\n`;
  const heading = (lvl, text) => `\\pard\\plain${H[lvl]}\\f0 ${esc(text)}\\par\n`;
  const spacer = (tw = 200) => `\\pard\\plain\\sb0\\sa0\\sl-${tw}\\slmult0\\fs4 \\par\n`;
  const pageBreak = () => '\\pard\\plain\\page\n';

  // Table: rows = [{ cells: [cell], header, bold, fill }], cell = string (RTF)
  // or { rtf, fill, color, bold, align: 'l'|'c'|'r', span }. widths in twips.
  function table(rows, widths, { border = true, fontSize = 18, pad = 70, keep = true } = {}) {
    let out = '';
    const brd = border
      ? `\\clbrdrt\\brdrs\\brdrw8\\brdrcf${C.border}\\clbrdrl\\brdrs\\brdrw8\\brdrcf${C.border}` +
        `\\clbrdrb\\brdrs\\brdrw8\\brdrcf${C.border}\\clbrdrr\\brdrs\\brdrw8\\brdrcf${C.border}`
      : '';
    rows.forEach((row, ri) => {
      const cells = row.cells.map((c) => (typeof c === 'object' && c !== null ? c : { rtf: c ?? '' }));
      let def = `\\trowd\\trgaph${pad}\\trleft0\\trpaddl${pad}\\trpaddr${pad}\\trpaddt40\\trpaddb40` +
        `\\trpaddfl3\\trpaddfr3\\trpaddft3\\trpaddfb3${row.header ? '\\trhdr' : ''}${keep ? '\\trkeep' : ''}`;
      let x = 0, wi = 0;
      cells.forEach((c) => {
        const span = c.span || 1;
        let w = 0;
        for (let k = 0; k < span; k++) w += widths[wi++] ?? 0;
        x += w;
        const fill = c.fill ?? row.fill ?? (row.header ? C.headFill : null);
        def += `${brd}${fill ? `\\clcbpat${fill}` : ''}\\clvertalc\\cellx${x}`;
      });
      out += def + '\n';
      cells.forEach((c) => {
        const align = { l: '\\ql', c: '\\qc', r: '\\qr' }[c.align || 'l'];
        const bold = c.bold ?? row.bold ?? row.header;
        const color = c.color ?? (row.header ? C.text : C.text);
        out += `\\pard\\plain\\intbl${align}\\sa0\\sb0\\f0\\fs${fontSize}\\cf${color}${bold ? '\\b' : ''} ${c.rtf}\\cell\n`;
      });
      out += `\\row${ri === rows.length - 1 ? '\\pard' : ''}\n`;
    });
    return out;
  }

  // Embedded picture (PNG/JPEG) from base64, scaled to fit max w × h (twips).
  function picture(img, maxW, maxH) {
    if (!img || !img.data || !img.w || !img.h) return '';
    const type = img.type === 'jpeg' || img.type === 'jpg' ? 'jpegblip' : img.type === 'png' ? 'pngblip' : null;
    if (!type) return '';
    let bin;
    try {
      bin = typeof atob === 'function' ? atob(img.data) : Buffer.from(img.data, 'base64').toString('binary');
    } catch { return ''; }
    let hex = '';
    for (let k = 0; k < bin.length; k++) {
      hex += bin.charCodeAt(k).toString(16).padStart(2, '0');
      if (k % 64 === 63) hex += '\n';
    }
    const tw = 15; // twips per px at 96 dpi
    const scale = Math.min(1, maxW / (img.w * tw), maxH / (img.h * tw));
    const gw = Math.round(img.w * tw * scale), gh = Math.round(img.h * tw * scale);
    return `{\\pict\\${type}\\picw${img.w}\\pich${img.h}\\picwgoal${gw}\\pichgoal${gh}\n${hex}}`;
  }

  const field = (inst, result) => `{\\field{\\*\\fldinst ${inst}}{\\fldrslt ${result}}}`;

  // ── Project helpers ────────────────────────────────────────────────────
  function resultKey(f, d, c) { return `${f.id}-${d.id}-${c.id}`; }

  function calcTypeName(lang, t) {
    const k = `ct_type_${t}`;
    const v = UI(lang, k);
    return v === k ? t : v;
  }
  function deviceTypeName(lang, t) {
    const k = `dev_${t}`;
    const v = UI(lang, k);
    return v === k ? t : v;
  }

  function reportTitle(lang, feeders) {
    const cores = feeders.flatMap((f) => f.devices.flatMap((d) => d.cores));
    const ct = cores.some((c) => c.kind !== 'vt');
    const vt = cores.some((c) => c.kind === 'vt');
    return L(lang, ct && vt ? 'report_title_ct_vt' : vt ? 'report_title_vt' : 'report_title_ct');
  }

  const isFilled = (v) => v !== undefined && v !== null && v !== '';

  // The calc types whose panel has a CT class row, and the ALF / Vk the
  // calculation uses for a core (CTBase.getAlfOrVk; the core's own without it).
  // On those the class decides Vk or ALF (CTCalc.ctClassFamily: PX, TPX, TPY,
  // TPZ are Vk classes, PORTING_PLAN.md §10.6 F-TP-PX); elsewhere is_px.
  const CLASS_ROW_TYPES = ['overcurrent', 'distance', 'transformer_diff', 'line_diff'];
  const VK_CLASSES = ['PX', 'TPX', 'TPY', 'TPZ'];
  // The class the core's class row shows, or null when none is picked (no
  // default class: calc/required.js CTRequired.ctFamily)
  function classFamily(v) {
    if (v.ct_class_family != null && v.ct_class_family !== '') return v.ct_class_family;
    return v.is_px === true || v.is_px_class === true ? 'PX' : null;
  }

  // Distance line data (issue #86): the value the calculation uses for each
  // field (calc/distance/data.js, the core's own or LINE_DEFAULTS) and
  // whether it is the default. Also used by the panel (ctsizer-panels.jsx).
  const LINE_FIELDS = [
    ['r_per_km', 'lbl_r_per_km', "R'L", '\u03a9/km'],
    ['x_per_km', 'lbl_x_per_km', "X'L", '\u03a9/km'],
    ['line_length', 'lbl_line_length', 'lL', 'km'],
    ['zone1_setting', 'lbl_zone1_setting', 'Klim', ''],
  ];
  function lineData(inputs, system) {
    const D = typeof CTDistance !== 'undefined' && CTDistance.data;
    if (!D || !D.LINE_DEFAULTS) return [];
    const def = new Set(D.lineDataDefaulted(inputs || {}, system || {}));
    const remote = (system || {}).remote_end || {};
    const remoteKey = { r_per_km: 'R_L_per_km', x_per_km: 'X_L_per_km', line_length: 'lL' };
    return LINE_FIELDS.map(([key, label, symbol, unit]) => ({
      key, label, symbol, unit, defaulted: def.has(key),
      value: def.has(key) ? D.LINE_DEFAULTS[key] : (remote[remoteKey[key]] ?? (inputs || {})[key]),
    }));
  }
  // The warning for a distance core whose line data falls back to a default
  // (null when every field is set).
  function lineDataWarning(lang, inputs, system) {
    const list = lineData(inputs, system).filter((f) => f.defaulted)
      .map((f) => `${f.symbol} = ${f.value}${f.unit ? ` ${f.unit}` : ''}`);
    return list.length ? UI(lang, 'warn_line_defaults').replace('{list}', list.join(', ')) : null;
  }

  // Transformer differential internal fault current (issue #85): the value the
  // calculation uses in kA (calc/transformer_diff/data.js — the core's
  // Isc,max,int, else the project Ik max) and its source ('core' | 'project' |
  // null = none, not calculated). Also used by the panel (ctsizer-panels.jsx).
  function iscInt(inputs, system) {
    const D = typeof CTTransformerDiff !== 'undefined' && CTTransformerDiff.data;
    if (!D || !D.internalFaultCurrentSource) return null;
    const v = inputs || {};
    const source = D.internalFaultCurrentSource(v, system || {});
    const a = source === 'core' ? v.trafo_ik_max : source === 'project' ? D.projectInternalFaultCurrent(system || {}) : null;
    return { source, ka: a == null ? null : a / 1000 };
  }
  // The warning for a transformer differential core with no internal fault
  // current (null when there is one).
  function iscIntWarning(lang, inputs, system) {
    const i = iscInt(inputs, system);
    return i && i.source == null ? UI(lang, 'warn_isc_int_missing') : null;
  }

  // Input data rows for a core: [label, value, unit].
  function inputRows(lang, core, system) {
    const v = core.inputs || {};
    const t = core.calc_type;
    const rows = [];
    const add = (label, value, unit = '') => { if (isFilled(value)) rows.push([label, String(value), unit]); };
    const ui = (k) => UI(lang, k);

    // The Meter / Relay / IED card of a metering or VT core (ctsizer-panels.jsx
    // MeterSection, issue #125) under its own sub-heading
    const meterRows = (vals) => {
      rows.push([ui('section_meter'), '', '', true]);
      const preset = typeof CTMeterDB !== 'undefined' ? CTMeterDB.byId(vals.meter_model) : null;
      add(ui('lbl_meter_manufacturer'), vals.meter_manufacturer);
      add(ui('lbl_meter_model'), preset ? preset.model : vals.meter_type);
      add(ui('lbl_meter_tag'), vals.meter_tag);
      if (t === 'vt') add(ui('lbl_vt_supply'), ui(vals.vt_supply_mode === 'self' ? 'vt_supply_self' : 'vt_supply_aux'));
      add(ui('lbl_meter_burden'), vals.device_burden, 'VA/ph');
      if (t === 'metering') add(ui('lbl_meter_fmin'), vals.min_safety_factor);
      // the meter's standard and class (local metering rules), when entered
      if (t === 'metering' && isFilled(vals.meter_standard)) add(ui('lbl_meter_standard'), ui(`meter_std_${vals.meter_standard}`));
      if (t === 'metering') add(ui('lbl_meter_class'), vals.meter_class);
    };

    if (t === 'vt') {
      add(ui('lbl_vt_us'), v.secondary_voltage, 'V');
      add(ui('lbl_vt_class'), v.vt_class);
      add(ui('lbl_vt_burden'), v.burden, 'VA');
      add(ui('lbl_vt_thermal'), v.thermal_burden, 'VA');
      // Only what the user entered: CTSizer has no default values (calc/required.js)
      const range = v.vt_burden_range === 'I' || v.vt_burden_range === 'II' ? v.vt_burden_range : null;
      if (range) add(ui('lbl_vt_range'), ui(`vt_range_${range}`));
      // an unmigrated core (device_resistance in Ω) shows its burden in VA
      meterRows(typeof CTVT !== 'undefined' ? CTVT.migrateInputs(v) : v);
    } else {
      // CT class for every type with a class row (ctsizer-panels.jsx
      // CTClassRow), with the core's ALF, not ct_class_alf: issue #88. Only
      // what the user entered: no class or ALF is assumed (calc/required.js).
      const classRow = CLASS_ROW_TYPES.includes(t);
      const family = classFamily(v);
      const vkClass = classRow ? VK_CLASSES.includes(family) : !!v.is_px;
      const used = { alf: v.alf ?? null, vk: v.vk ?? null };
      if (classRow && family) {
        add(L(lang, 'ct_class'), vkClass || used.alf == null ? family : `${family}${used.alf}`);
      }
      add(ui('lbl_Ip'), v.Ip, 'A');
      add(ui('lbl_Is'), v.Is, 'A');
      if (isFilled(v.Ip) && isFilled(v.Is)) add(L(lang, 'ct_ratio'), `${v.Ip}/${v.Is}`, 'A');
      add(ui('lbl_rct'), v.rct, '\u03a9');
      add(ui('lbl_burden'), v.burden, 'VA');
      if (t === 'metering') {
        if (v.mt_class !== 'custom') add(ui('lbl_mt_class'), v.mt_class);
        add(ui('lbl_fs'), v.fs_factor);
        if (v.extended_burden_range) add(ui('lbl_extended_range'), '\u2713');
        else add(ui('lbl_min_burden_pct'), typeof CTMetering !== 'undefined' ? CTMetering.sminPercent(v) : v.min_burden_percent, '%');
        meterRows(v);
      } else {
        if (vkClass) add(ui('lbl_vk'), v.vk, 'V');
        else add(ui('lbl_alf'), v.alf);
      }
      if (t === 'distance') {
        // Tp and the line data as calc/distance/data.js reads them
        add(L(lang, 'tp'), v.tp ?? system?.tp, 'ms');
        lineData(v, system).forEach((f) => { if (!f.defaulted) add(ui(f.label), f.value, f.unit); });
      }
      if (t === 'transformer_diff') {
        add(L(lang, 'trafo_power'), v.trafo_power_mva, 'MVA');
        add(L(lang, 'trafo_voltage'), v.trafo_voltage_kv, 'kV');
        add(L(lang, 'trafo_z'), v.trafo_z_percent, '%');
        add(L(lang, 'inrush'), v.inrush_factor);
        add(L(lang, 'linked_winding'), v.linked_winding);
        // Isc,max,int as entered on the core (required, calc/required.js)
        if (v.trafo_ik_max != null) add(ui('lbl_isc_int'), v.trafo_ik_max / 1000, 'kA');
      }
      // The Relay Information card (ctsizer-panels.jsx RelaySection), every
      // calc type with a relay: the IED from the relay database, SR and t_al
      if (CTRelayDB.supports(t)) {
        add(L(lang, 'relay_manufacturer'), v.relay_manufacturer);
        if (CTRelayDB.byName(v.relay_model)) add(L(lang, 'relay_ied'), v.relay_model);
        add(L(lang, 'relay_type'), v.relay_type);
        add(L(lang, 'relay_tag'), v.relay_tag);
        add(ui('lbl_relay_burden'), v.relay_burden, 'VA');
        add(L(lang, 'relay_tal'), v.relay_tal, 'ms');
      }
    }

    // Cable
    add(ui('lbl_cable_length'), v.cable_length, 'm');
    add(ui('lbl_cable_cross'), v.cable_cross, 'mm\u00b2');
    if (isFilled(v.cable_mat)) add(ui('lbl_cable_mat'), v.cable_mat === 'al' ? ui('lbl_al') : ui('lbl_cu'));
    if (typeof CTCalc !== 'undefined' && CTCalc.cableRes?.resolveTopology) {
      try {
        const topo = v.cable_topology;
        const def = CTCalc.cableRes.listTopologies().find((x) => x.id === topo);
        if (def) add(ui('lbl_cable_topology'), lang === 'da' ? def.label_da : def.label_en);
      } catch { /* topology label is optional */ }
    }
    // The attached resistor sits with the cable in the secondary circuit (issue #125)
    if (t === 'metering') add(ui('lbl_attached_r'), v.attached_resistor, '\u03a9');
    if (t === 'vt') add(ui('lbl_vt_attached_r'), v.attached_resistor, '\u03a9');
    if (t === 'vt' && Number(v.attached_resistor) > 0 && isFilled(v.vt_resistor_location)) {
      add(ui('lbl_vt_resistor_at'), ui(v.vt_resistor_location === 'vt' ? 'vt_resistor_at_vt' : 'vt_resistor_at_meter'));
    }

    // C-O-C-O auto-reclosure
    if ((t === 'distance' || t === 'line_diff') && v.auto_reclose_enabled) {
      add(L(lang, 'ar'), L(lang, 'enabled'));
      add(L(lang, 'ar_t_prime'), v.ar_t_prime, 's');
      add(L(lang, 'ar_tfr'), v.ar_tfr, 's');
      if (v.ar_ts_mode === 'table' && typeof CTAutoReclosure !== 'undefined' && CTAutoReclosure.estimateTs) {
        try {
          if (!v.ct_class_family || system?.voltage == null) throw new Error('no class or voltage');
          const e = CTAutoReclosure.estimateTs(v.ct_class_family, system.voltage);
          add(L(lang, 'ar_ts'), `${e.ts} (${L(lang, 'ar_ts_table')})`, 's');
        } catch { /* fall through */ }
      } else add(L(lang, 'ar_ts'), v.ar_ts, 's');
      add(L(lang, 'ar_ktf'), v.ar_ktf_preset);
    }
    return rows;
  }

  // A step's text result in the report / UI language (issue #89). The
  // transformer diff IEC Req. 1–4 results are built in Danish by
  // calc/transformer_diff/methods/iec61869.js ("Krav 1: ALFo (248.5) >= 15.5
  // → OK", kept as is for the goldens); in English they read "Req. 1: ALFo
  // (248.5) ≥ 15.5 → OK". Danish and every other result are unchanged.
  function stepResultText(lang, step) {
    const r = step?.result;
    if (lang === 'da' || typeof r !== 'string' || !/^iec_requirement_\d+$/.test(step.key || '')) return r;
    const m = r.match(/^Krav (\d+): (.*) \u2192 (OK|IKKE OK)$/);
    if (!m) return r;
    return `Req. ${m[1]}: ${m[2].replace(/>=/g, '\u2265').replace(/<=/g, '\u2264')} \u2192 ${m[3] === 'OK' ? 'OK' : 'NOT OK'}`;
  }

  function stepResult(step, lang) {
    let r = '';
    if (typeof step.result === 'number' && isFinite(step.result)) r = step.result.toFixed(step.precision ?? 4);
    else if (step.result != null && step.result !== '') r = String(stepResultText(lang, step));
    else if (step.result_text) r = String(step.result_text);
    if (r && step.unit) r += ` ${step.unit}`;
    if (typeof step.percent === 'number' && isFinite(step.percent) && step.unit !== '%') {
      r += ` (${step.percent.toFixed(step.percent_precision ?? 2)} %)`;
    }
    return r;
  }

  const stepLabel = (lang, s) => (lang === 'da' ? s.label_da || s.label_en : s.label_en || s.label_da) || s.key || '';

  // Watermark: a narrow text box in the left margin of the page, text
  // running bottom-to-top, no border or fill, behind the text. Put in the
  // page header so it is on every page; `id` must differ per shape.
  function watermark(text, id) {
    const w = 320, h = PAGE_H - 2 * MARGIN;
    const left = Math.round((MARGIN - w) / 2), top = MARGIN;
    const sp = (n, v) => `{\\sp{\\sn ${n}}{\\sv ${v}}}`;
    return `{\\shp{\\*\\shpinst\\shpleft${left}\\shptop${top}\\shpright${left + w}\\shpbottom${top + h}` +
      `\\shpfhdr1\\shpbxpage\\shpbxignore\\shpbypage\\shpbyignore\\shpwr3\\shpwrk0\\shpfblwtxt1\\shpz0\\shplid${id}` +
      sp('shapeType', 202) + sp('posrelh', 1) + sp('posrelv', 1) + sp('fLine', 0) + sp('fFilled', 0) +
      sp('fBehindDocument', 1) + sp('fLayoutInCell', 1) + sp('fAllowOverlap', 1) + sp('txflTextFlow', 2) +
      sp('dxTextLeft', 0) + sp('dxTextRight', 0) + sp('dyTextTop', 0) + sp('dyTextBottom', 0) +
      `{\\shptxt\\pard\\plain\\qc\\f2\\fs13\\cf${C.watermark} ${esc(text)}\\par}}}`;
  }

  // ── Sections ───────────────────────────────────────────────────────────
  function frontPage(ctx, title, cores) {
    const { lang, system = {}, settings = {}, meta = {}, projName } = ctx;
    const st = (k) => L(lang, k);
    let out = '';

    // Company block (left) + logo (right)
    const company = settings.company_name || '';
    const dept = settings.department || '';
    const addr = [settings.address, [settings.postal_code, settings.city].filter(Boolean).join(' '), settings.country]
      .filter(Boolean).join(', ');
    const logo = picture(settings.logo, 3400, 1300);
    let compRtf = company ? `{\\b\\fs28 ${esc(company)}}` : '';
    if (dept) compRtf += `${compRtf ? '\\line ' : ''}{\\fs20 ${esc(dept)}}`;
    if (addr) compRtf += `${compRtf ? '\\line ' : ''}{\\fs18\\cf${C.muted} ${esc(addr)}}`;
    if (compRtf || logo) {
      out += table([{ cells: [{ rtf: compRtf }, { rtf: logo, align: 'r' }] }],
        [TEXT_W - 3800, 3800], { border: false, fontSize: 20 });
    }
    out += spacer(1800);

    // Station + report type
    const stationLine = [system.station_name, isFilled(system.voltage) ? `${system.voltage} kV` : ''].filter(Boolean).join(' ');
    if (stationLine) out += `\\pard\\plain\\qc\\sa80\\f0\\fs48\\b\\cf${C.text} ${esc(stationLine)}\\par\n`;
    if (system.station_abbr) out += `\\pard\\plain\\qc\\sa80\\f0\\fs28\\cf${C.muted} ${esc(system.station_abbr)}\\par\n`;
    out += spacer(500);
    out += `\\pard\\plain\\qc\\sa80\\f0\\fs36\\b\\cf${C.accent} ${esc(meta.title || title)}\\par\n`;
    if (projName) out += `\\pard\\plain\\qc\\sa80\\f0\\fs22\\cf${C.muted} ${esc(projName)}\\par\n`;
    out += spacer(1200);

    // Info box
    const kv = (k, v) => ({ rtf: `{\\b ${esc(st(k))}:} ${esc(v || '\u2014')}` });
    const prepared = meta.prepared_by || [settings.full_name, settings.initials ? `(${settings.initials})` : ''].filter(Boolean).join(' ');
    const info = [
      { cells: [kv('project', projName), kv('doc_no', meta.doc_no)] },
      { cells: [kv('client', meta.client), kv('revision', meta.revision)] },
      { cells: [kv('prepared_by', prepared), kv('date', meta.date)] },
    ];
    if (company || dept) info.push({ cells: [{ ...kv('company', [company, dept].filter(Boolean).join(' \u2014 ')), span: 2 }] });
    if (addr) info.push({ cells: [{ ...kv('address', addr), span: 2 }] });
    if (meta.note) info.push({ cells: [{ rtf: `{\\i ${esc(meta.note)}}`, span: 2 }] });
    if (ctx.fingerprint) info.push({ cells: [{ rtf: `{\\b ${esc(st('fingerprint'))}:} {\\f2\\fs16 ${esc(ctx.fingerprint)}}\\line {\\i\\fs16\\cf${C.muted} ${esc(st('fingerprint_note'))}}`, span: 2 }] });
    out += table(info.map((r) => ({ ...r, fill: C.lightFill })), [TEXT_W / 2, TEXT_W / 2], { fontSize: 20, pad: 140 });
    out += spacer(500);

    // Document control (revision block)
    out += `\\pard\\plain\\sa80\\keepn\\f0\\fs20\\b\\cf${C.text} ${esc(st('doc_control'))}\\par\n`;
    const w = [900, 1500, TEXT_W - 900 - 1500 - 3 * 1500, 1500, 1500, 1500];
    out += table([
      { header: true, cells: [st('rev'), st('date'), st('description'), st('prepared_by'), st('checked_by'), st('approved_by')].map(esc) },
      { cells: [meta.revision, meta.date, meta.rev_desc || st('rev_first'), prepared, meta.checked_by, meta.approved_by].map((x) => esc(x || '')) },
    ], w, { fontSize: 17 });
    out += spacer(500);

    // Standards
    const hasCt = cores.some((c) => c.kind !== 'vt');
    const hasVt = cores.some((c) => c.kind === 'vt');
    const trans = cores.some((c) => ['distance', 'line_diff', 'transformer_diff'].includes(c.calc_type));
    const stds = ['std_61869_1'];
    if (hasCt) stds.push('std_61869_2');
    if (hasVt) stds.push('std_61869_3');
    if (trans) stds.push('std_61869_100');
    stds.push('std_60287');
    out += `\\pard\\plain\\qc\\sa60\\f0\\fs18\\b\\cf${C.muted} ${esc(st('calculations_performed'))}\\par\n`;
    stds.forEach((k) => { out += `\\pard\\plain\\qc\\sa20\\f0\\fs17\\cf${C.muted} ${esc(st(k))}\\par\n`; });
    out += spacer(300);
    out += `\\pard\\plain\\qc\\sa0\\f0\\fs15\\i\\cf${C.muted} ${esc(st('disclaimer'))}\\par\n`;
    return out;
  }

  function summarySection(ctx, bays) {
    const { lang } = ctx;
    const st = (k) => L(lang, k);
    let out = heading(1, st('summary'));
    const rows = [{ header: true, cells: [st('section'), st('bay'), st('device'), st('core'), st('application'), st('key_result'), st('conclusion')].map(esc) }];
    let n = 0, ok = 0;
    bays.forEach((b) => b.devices.forEach((d) => d.cores.forEach((c) => {
      n++; if (c.result?.is_ok) ok++;
      const metric = keyMetric(ctx, c);
      rows.push({ cells: [
        { rtf: esc(c.num), align: 'c' }, esc(b.feeder.name), esc(d.device.name), esc(c.core.name),
        esc(calcTypeName(lang, c.core.calc_type)), esc(metric),
        verdictCell(lang, c.result),
      ] });
    })));
    out += table(rows, [800, 1500, 1700, 1300, 1500, 1638, 1200], { fontSize: 17 });
    out += spacer(120);
    out += para(esc(st('cores_ok').replace('{ok}', ok).replace('{n}', n)), '\\b');
    return out;
  }

  function verdictCell(lang, r) {
    if (!r) return { rtf: esc(L(lang, 'no_result')), color: C.muted, align: 'c' };
    return { rtf: esc(L(lang, r.is_ok ? 'approved' : 'rejected')), color: r.is_ok ? C.green : C.red, bold: true, align: 'c' };
  }

  // A one-line key figure, from the metrics callback (the app's Summary cards).
  function keyMetric(ctx, c) {
    if (!c.result || typeof ctx.metrics !== 'function') return '';
    try {
      const m = (ctx.metrics(c.core.calc_type, c.result) || []).filter((x) => isFilled(x.value));
      return m.slice(0, 2).map((x) => `${x.label} ${x.value}${x.unit ? ' ' + x.unit : ''}`).join('; ');
    } catch { return ''; }
  }

  // The project's national metering rule set (calc/local_rules/), if picked
  function localRulesSet(system) {
    return typeof CTLocalRules !== 'undefined' && system ? CTLocalRules.byId(system.local_rules) : null;
  }

  // Local metering rules on a core: each check with its clause and status,
  // what the rules require that CTSizer cannot check, and the source. Kept
  // apart from the IEC verdict, which it never changes.
  const LOCAL_COLOR = { ok: C.green, fail: C.red, advice: C.amber, missing: C.muted };
  function localRulesSection(ctx, c) {
    const { lang, system } = ctx;
    if (!localRulesSet(system)) return '';
    const local = CTLocalRules.evaluate(system.local_rules, c.core, c.result, system);
    if (!local) return '';
    const txt = (x) => (lang === 'da' ? x.da : x.en);
    const ui = (k) => UI(lang, k);
    let out = spacer(120) + para(`{\\b ${esc(`${ui('res_local')} — ${CTLocalRules.label(local.set, lang)}`)}}`, '\\keepn\\sb120');
    out += table([
      { header: true, cells: [esc(L(lang, 'requirement')), esc('Ref.'), { rtf: esc(L(lang, 'status')), align: 'c' }] },
      ...local.items.map((it) => ({ cells: [esc(txt(it)), esc(CTLocalRules.refText(it, lang)),
        { rtf: esc(ui(`local_status_${it.status}`)), align: 'c', bold: true, color: LOCAL_COLOR[it.status] }] })),
    ], [TEXT_W - 2000 - 1700, 2000, 1700], { fontSize: 17 });
    if (local.manual.length) {
      out += para(`{\\b ${esc(ui('local_manual_h'))}}`, '\\keepn\\sb120');
      local.manual.forEach((x) => {
        out += `\\pard\\plain\\s0\\ql\\sa60\\fi-240\\li240${BASE}\\fs18 \\u8226?\\tab ${esc(`${txt(x)} (${CTLocalRules.refText(x, lang)})`)}\\par\n`;
      });
    }
    out += para(`{\\i ${esc(ui('local_note'))}}`, `\\sb60\\fs17\\cf${C.muted}`);
    out += para(`{\\i ${esc(`${ui('local_source')}: ${lang === 'da' ? local.set.source_da : local.set.source_en}`)}}`, `\\fs17\\cf${C.muted}`);
    return out;
  }

  function systemSection(ctx) {
    const { lang, system = {} } = ctx;
    const st = (k) => L(lang, k);
    // only the method entered (no default method, calc/required.js)
    let method = system.cable_r_method;
    if (isFilled(method) && typeof CTCalc !== 'undefined' && CTCalc.cableRes?.listMethods) {
      try {
        const id = method;
        const m = CTCalc.cableRes.listMethods().find((x) => x.id === id);
        method = m ? (lang === 'da' ? m.label_da : m.label_en) : id;
      } catch { /* keep the raw id */ }
    }
    const rows = [
      [st('station_name'), system.station_name, ''],
      [st('station_abbr'), system.station_abbr, ''],
      [st('un'), system.voltage, 'kV'],
      [st('fr'), system.freq, 'Hz'],
      [st('ik'), system.isc_sys, 'kA'],
      [st('tp'), system.tp, 'ms'],
      [st('tp_confirmed'), system.tp_confirmed ? st('yes') : st('no'), ''],
      [st('cable_method'), method, ''],
      [st('cable_temp'), system.cable_temp, '\u00b0C'],
      [UI(lang, 'lbl_local_rules'), localRulesSet(system) ? CTLocalRules.label(localRulesSet(system), lang) : '', ''],
    ].filter((r) => isFilled(r[1]));
    return heading(1, st('system_data')) + kvTable(lang, rows);
  }

  function kvTable(lang, rows) {
    const st = (k) => L(lang, k);
    return table([
      { header: true, cells: [esc(st('parameter')), { rtf: esc(st('value')), align: 'r' }, esc(st('unit'))] },
      // a row with a 4th element true is a sub-heading (e.g. the Meter / Relay / IED card)
      ...rows.map(([l, v, u, sub]) => ({ cells: sub ? [{ rtf: esc(l), bold: true }, '', '']
        : [esc(l), { rtf: esc(v), align: 'r' }, esc(u)] })),
    ], [TEXT_W - 2600 - 1200, 2600, 1200]);
  }

  function nomenclatureSection(ctx, cores) {
    const { lang } = ctx;
    const st = (k) => L(lang, k);
    let out = heading(1, st('nomenclature'));
    const block = (title, list) => {
      out += heading(3, title);
      out += table([
        { header: true, cells: [st('symbol'), st('description'), st('unit')].map(esc) },
        ...list.map(([sym, unit, en, da]) => ({ cells: [{ rtf: esc(sym), bold: true }, esc(lang === 'da' ? da : en), { rtf: esc(unit), align: 'c' }] })),
      ], [1600, TEXT_W - 1600 - 1200, 1200], { fontSize: 17 });
    };
    if (cores.some((c) => c.kind !== 'vt')) block(st('ct_nomenclature'), NOM_CT);
    if (cores.some((c) => c.kind === 'vt')) block(st('vt_nomenclature'), NOM_VT);
    return out;
  }

  function methodologySection(ctx, cores) {
    const { lang } = ctx;
    const st = (k) => L(lang, k);
    let out = heading(1, st('methodology')) + para(esc(st('meth_base')));
    const types = [...new Set(cores.map((c) => c.calc_type))];
    ['overcurrent', 'metering', 'busbar', 'distance', 'line_diff', 'transformer_diff', 'vt']
      .filter((t) => types.includes(t))
      .forEach((t) => { out += `\\pard\\plain\\s0\\ql\\sa80\\fi-240\\li240${BASE} \\u8226?\\tab ${esc(st('meth_' + t))}\\par\n`; });
    return out;
  }

  function baySection(ctx, bay) {
    const { lang } = ctx;
    const st = (k) => L(lang, k);
    const f = bay.feeder;
    let out = heading(1, `${bay.num}  ${f.name}`);
    const ft = f.feeder_type || 'line';
    out += para(`{\\b ${esc(st('bay_type'))}:} ${esc(st('bay_' + ft))}`);
    out += heading(3, st('bay_overview'));
    const rows = [{ header: true, cells: [st('section'), st('device'), st('core'), st('application'), st('key_result'), st('conclusion')].map(esc) }];
    bay.devices.forEach((d) => d.cores.forEach((c) => {
      rows.push({ cells: [{ rtf: esc(c.num), align: 'c' }, esc(d.device.name), esc(c.core.name),
        esc(calcTypeName(lang, c.core.calc_type)), esc(keyMetric(ctx, c)), verdictCell(lang, c.result)] });
    }));
    out += table(rows, [900, 1900, 1500, 1700, 2238, 1400], { fontSize: 17 });

    bay.devices.forEach((d, di) => {
      out += heading(2, `${d.num}  ${d.device.name} \u2014 ${deviceTypeName(lang, d.device.device_type)}`);
      d.cores.forEach((c, ci) => {
        if (ctx.options?.steps !== false && (di > 0 || ci > 0)) out += pageBreak();
        out += coreSection(ctx, c);
      });
    });
    return out;
  }

  function coreSection(ctx, c) {
    const { lang, system } = ctx;
    const st = (k) => L(lang, k);
    const core = c.core, r = c.result;
    const isVt = core.kind === 'vt';
    let out = heading(3, `${c.num}  ${st(isVt ? 'vt' : 'ct')}: ${core.name}`);
    out += para(`{\\b ${esc(st('application'))}:} ${esc(calcTypeName(lang, core.calc_type))}`);

    // Input data
    out += para(`{\\b ${esc(st('input_data'))}}`, '\\keepn\\sb120');
    out += kvTable(lang, inputRows(lang, core, system));

    if (!r) {
      out += spacer(120) + para(`{\\i ${esc(st('no_calc'))}}`, `\\cf${C.red}`);
      return out;
    }

    // Key results (the app's Summary cards)
    if (typeof ctx.metrics === 'function') {
      let m = [];
      try { m = (ctx.metrics(core.calc_type, r) || []).filter((x) => isFilled(x.value)); } catch { m = []; }
      if (m.length) {
        out += spacer(120) + para(`{\\b ${esc(st('key_results'))}}`, '\\keepn\\sb120');
        out += kvTable(lang, m.map((x) => [x.label, x.value, x.unit || '']));
      }
    }

    // Calculation steps
    const steps = Array.isArray(r.steps) ? r.steps : [];
    if (ctx.options?.steps !== false && steps.length) {
      out += spacer(120) + para(`{\\b ${esc(st('calculation'))}}`, '\\keepn\\sb120');
      const rows = [{ header: true, cells: ['#', st('step'), st('formula'), { rtf: esc(st('result')), align: 'r' }].map((x) => (typeof x === 'string' ? esc(x) : x)) }];
      steps.forEach((s, k) => {
        const formula = s.latex ? `\\f1 ${latexToRtf(s.latex)}` : '';
        let res;
        if (s.is_conclusion) {
          const txt = [s.comparison, L(lang, s.is_ok ? 'ok' : 'not_ok')].filter(Boolean).join('  ');
          res = { rtf: esc(txt), align: 'r', bold: true, color: s.is_ok ? C.green : C.red };
        } else res = { rtf: esc(stepResult(s, lang)), align: 'r' };
        const extra = s.substitution ? `\\line {\\fs15\\cf${C.muted} ${esc(s.substitution)}}` : '';
        rows.push({ fill: s.is_conclusion ? (s.is_ok ? C.greenFill : C.redFill) : null, cells: [
          { rtf: String(k + 1), align: 'c' }, esc(stepLabel(lang, s)), formula + extra, res,
        ] });
      });
      out += table(rows, [450, 3300, 3588, 2300], { fontSize: 17, keep: true });
    }

    // Charts (drawn by the app, embedded as PNG)
    const charts = ctx.options?.charts !== false && ctx.charts ? (ctx.charts[c.key] || []).filter((x) => x && x.img) : [];
    if (charts.length) {
      out += spacer(120) + para(`{\\b ${esc(st('charts'))}}`, '\\keepn\\sb120');
      charts.forEach((ch, k) => {
        const pict = picture(ch.img, TEXT_W, 7400);
        if (!pict) return;
        out += `\\pard\\plain\\qc\\keepn\\sb60\\sa40${BASE} ${pict}\\par\n`;
        out += `\\pard\\plain\\qc\\sa${ch.caption || ch.warn ? 20 : 160}\\f0\\fs17\\cf${C.muted} {\\b ${esc(st('figure'))} ${esc(c.num)}.${k + 1}:} ${esc(ch.title)}\\par\n`;
        if (ch.caption) out += `\\pard\\plain\\qc\\sa${ch.warn ? 20 : 160}\\f2\\fs16\\cf${C.muted} ${esc(ch.caption)}\\par\n`;
        if (ch.warn) out += `\\pard\\plain\\qc\\sa160\\f0\\fs17\\b\\cf${C.red} ${esc(ch.warn)}\\par\n`;
      });
    }

    // Requirements overview: the conclusion steps
    const reqs = steps.filter((s) => s.is_conclusion);
    if (reqs.length) {
      out += spacer(120) + para(`{\\b ${esc(st('requirements'))}}`, '\\keepn\\sb120');
      out += table([
        { header: true, cells: [esc(st('requirement')), esc(st('check')), { rtf: esc(st('status')), align: 'c' }] },
        ...reqs.map((s) => ({ cells: [esc(stepLabel(lang, s)), (s.latex ? `\\f1 ${latexToRtf(s.latex)}` : '') +
          (s.comparison ? `${s.latex ? '\\line ' : ''}\\f0 ${esc(s.comparison)}` : ''),
          { rtf: esc(L(lang, s.is_ok ? 'ok' : 'not_ok')), align: 'c', bold: true, color: s.is_ok ? C.green : C.red }] })),
      ], [3600, TEXT_W - 3600 - 1300, 1300], { fontSize: 17 });
    }

    // Remarks, as the project's local metering rules word them (unchanged
    // when none is picked)
    const warns = typeof CTLocalRules !== 'undefined'
      ? [...CTLocalRules.remarks(system && system.local_rules, core, r, system)]
      : (Array.isArray(r.warnings) ? [...r.warnings] : []);
    if (c.core.calc_type === 'distance') {
      const lw = lineDataWarning(lang, c.core.inputs, ctx.system);
      if (lw) warns.unshift(lw);
    }
    if (warns.length) {
      out += spacer(120) + para(`{\\b ${esc(st('remarks'))}}`, '\\keepn\\sb120');
      warns.forEach((w) => {
        out += `\\pard\\plain\\s0\\ql\\sa60\\fi-240\\li240${BASE}\\fs18 \\u8226?\\tab ${esc(warningText(lang, w))}\\par\n`;
      });
    }

    // Local metering rules (calc/local_rules/), apart from the IEC verdict
    out += localRulesSection(ctx, c);

    // Verdict
    out += spacer(160);
    const vk = isVt ? (r.is_ok ? 'vt_ok' : 'vt_not_ok') : (r.is_ok ? 'ct_ok' : 'ct_not_ok');
    out += table([{ cells: [{ rtf: esc(st(vk)), align: 'c', bold: true, color: r.is_ok ? C.green : C.red, fill: r.is_ok ? C.greenFill : C.redFill }] }],
      [TEXT_W], { fontSize: 24, pad: 160 });
    return out;
  }

  // ── Document ───────────────────────────────────────────────────────────
  function sanitizeFile(s) {
    return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  }

  function fileName(ctx) {
    const { system = {}, meta = {}, projName } = ctx;
    const base = [system.station_abbr || projName || 'CTSizer', meta.doc_no, meta.revision ? `rev${meta.revision}` : '']
      .map(sanitizeFile).filter(Boolean).join('_');
    return `${base || 'CTSizer_report'}.rtf`;
  }

  function build(ctx) {
    const lang = ctx.lang === 'da' ? 'da' : 'en';
    ctx = { ...ctx, lang, meta: ctx.meta || {}, settings: ctx.settings || {}, system: ctx.system || {}, options: ctx.options || {} };
    const { meta, settings, system, options, results = {} } = ctx;
    const st = (k) => L(lang, k);
    const now = ctx.now || new Date();

    // Bays → devices → cores, numbered, with their results.
    const feeders = (ctx.feeders || []).filter((f) => !options.feederIds || options.feederIds.includes(f.id));
    const bays = feeders.map((f, fi) => ({
      feeder: f, num: `${fi + 1}`,
      devices: (f.devices || []).map((d, di) => ({
        device: d, num: `${fi + 1}.${di + 1}`,
        cores: (d.cores || []).map((c, ci) => ({ core: c, key: resultKey(f, d, c), num: `${fi + 1}.${di + 1}.${ci + 1}`, result: results[resultKey(f, d, c)] || null })),
      })),
    }));
    const cores = bays.flatMap((b) => b.devices.flatMap((d) => d.cores.map((c) => c.core)));
    const title = meta.title || reportTitle(lang, feeders);

    // Document info (File → Properties)
    const p2 = (n) => String(n).padStart(2, '0');
    const created = `\\yr${now.getFullYear()}\\mo${now.getMonth() + 1}\\dy${now.getDate()}\\hr${now.getHours()}\\min${now.getMinutes()}`;
    const author = meta.prepared_by || settings.full_name || '';
    const info = '{\\info' +
      `{\\title ${esc(title)}}` +
      `{\\subject ${esc([system.station_name, ctx.projName].filter(Boolean).join(' \u2014 '))}}` +
      (author ? `{\\author ${esc(author)}}` : '') +
      (settings.company_name ? `{\\company ${esc(settings.company_name)}}` : '') +
      (meta.doc_no ? `{\\doccomm ${esc(`${st('doc_no')} ${meta.doc_no}${meta.revision ? `, ${st('revision')} ${meta.revision}` : ''}`)}}` : '') +
      `{\\creatim${created}}{\\*\\generator CTSizer;}}`;

    // Running header / footer (not on the front page: \titlepg)
    const hdrLeft = [settings.company_name, settings.department].filter(Boolean).join(' \u2014 ');
    const hdrRight = [system.station_abbr || system.station_name, meta.doc_no].filter(Boolean).join(' \u00b7 ');
    // The fingerprint as a watermark in the left margin of every page
    const wmText = ctx.fingerprint ? `${st('fingerprint')}: ${ctx.fingerprint}` : '';
    const header = `{\\header\\pard\\plain\\ql\\tqr\\tx${TEXT_W}\\brdrb\\brdrs\\brdrw8\\brdrcf${C.border}\\brsp40\\f0\\fs16\\cf${C.muted} ` +
      `${wmText ? watermark(wmText, 1025) : ''}${esc(hdrLeft)}\\tab ${esc(title)}${hdrRight ? esc(' \u2014 ' + hdrRight) : ''}\\par}`;
    const headerFirst = `{\\headerf\\pard\\plain ${wmText ? watermark(wmText, 1026) : ''}\\par}`;
    const footLeft = [meta.doc_no, meta.revision ? `${st('rev')} ${meta.revision}` : '', meta.date].filter(Boolean).join('  \u00b7  ');
    // Version print on every page, front page included (ctsizer-version.js)
    const V = typeof CTSVersion !== 'undefined' ? CTSVersion : null;
    const verLine = V ? [V.full(), V.isBeta ? st('beta_footer') : ''].filter(Boolean).join(' \u2014 ') : '';
    const verPar = verLine ? `\\pard\\plain\\ql\\sb40\\f0\\fs14\\i\\cf${C.muted} ${esc(verLine)}\\par` : '';
    const footer = `{\\footer\\pard\\plain\\ql\\tqr\\tx${TEXT_W}\\brdrt\\brdrs\\brdrw8\\brdrcf${C.border}\\brsp40\\f0\\fs16\\cf${C.muted} ` +
      `${esc(footLeft)}\\tab ${esc(st('page'))} ${field('PAGE', '1')} ${esc(st('of'))} ${field('NUMPAGES', '1')}\\par${verPar}}`;
    const footerFirst = `{\\footerf${verPar || '\\pard\\plain\\par'}}`;

    let body = '';
    body += frontPage(ctx, title, cores);

    // Table of contents (a Word field: updated with F9)
    body += pageBreak();
    body += `\\pard\\plain\\sb0\\sa200\\f0\\fs32\\b\\cf${C.accent} ${esc(st('toc'))}\\par\n`;
    body += `\\pard\\plain\\s0\\ql\\sa100${BASE} ${field('TOC \\\\o "1-3" \\\\h \\\\z \\\\u', `{\\i\\cf${C.muted} ${esc(st('toc_hint'))}}`)}\\par\n`;

    body += pageBreak() + summarySection(ctx, bays);
    body += systemSection(ctx);
    if (options.nomenclature !== false && cores.length) body += pageBreak() + nomenclatureSection(ctx, cores);
    if (options.methodology !== false && cores.length) body += methodologySection(ctx, cores);
    bays.forEach((b) => { body += pageBreak() + baySection(ctx, b); });

    const rtf = '{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1\n' +
      FONTTBL + '\n' + COLORTBL + '\n' + STYLESHEET + '\n' + info + '\n' +
      `\\paperw${PAGE_W}\\paperh${PAGE_H}\\margl${MARGIN}\\margr${MARGIN}\\margt${MARGIN}\\margb${MARGIN}` +
      `\\headery567\\footery567\\deflang${lang === 'da' ? 1030 : 2057}\\widowctrl\\viewkind1\n` +
      `\\sectd\\titlepg\\pgwsxn${PAGE_W}\\pghsxn${PAGE_H}\n` +
      header + '\n' + footer + '\n' + headerFirst + footerFirst + '\n' +
      body + '}';
    return { rtf, filename: fileName(ctx), title, cores: cores.length };
  }

  return { build, text: L, esc, latexToRtf, rtfToPlain, warningText, fileName, reportTitle, inputRows, lineData, lineDataWarning, stepResultText,
    iscInt, iscIntWarning };
})();
