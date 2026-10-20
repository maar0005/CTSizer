'use strict';
/**
 * local_rules/dk_elmaaling.js — Denmark: Elmåling – Elmålehåndbogen, 9th ed.
 * (Green Power Denmark, February 2024), section 3: TR 353, 9th ed.,
 * "Måleinstallationer for transformermåling" (December 2023). TR 353 covers
 * settlement metering with CTs (and VTs) at 0.4 kV and above; the other
 * sections of the handbook (direct-connected meters, remote reading,
 * in-service control) do not concern CT / VT dimensioning.
 *
 * What is checked from the inputs, with the clause:
 *   metering CT core
 *   - class 0.2S at every voltage level                       §6.2, table 5.1
 *   - the extended burden range down to 1 VA specified        §6.2
 *   - 1 VA ≤ S = Sm + Sl ≤ Sn                                 §6.2, §7.4.1
 *   - ≤ 1 kV: no extra burden in the metering circuit         §6.2
 *     (> 1 kV the burden is adapted with the leads: advice)
 *   - lead cross-section ≥ 1.5 mm²                            §6.2, §7.4.1
 *   - > 1 kV: a recommended primary current, 10 / 15 / 20 /
 *     30 / 50 / 75 A × 1, 10 or 100 (advice)                   §6.2
 *   - the meter class (MID or DS/EN) per voltage level        table 5.1, §6.4
 *   VT core
 *   - class 0.2 or better                                     §6.3
 *   - burden series I                                         §6.3
 *   - a standard series I rated burden 1 / 2.5 / 5 / 10 VA (advice)  §6.3
 *   - the lead voltage drop below 0.1 % of Us                 §7.4.2
 *   - lead cross-section ≥ 1.5 mm²                            §7.4.2
 *   - > 1 kV: Us of 100 V or 110 V (line) recommended (advice)  §6.3
 * The rest (sealing, short-circuit terminals, test protocols, the secondary
 * MCB, main and check meter cores, …) is listed as manual items.
 *
 * Remarks: the calculation's advice to add burden is replaced by what TR 353
 * allows — at ≤ 1 kV no extra burden at all (§6.2), above 1 kV only longer
 * leads or a smaller cross-section (§6.2), the extended burden range instead
 * of burden for S < Smin (§6.2), and a series I VT instead of burden for a
 * range II VT below 25 % (§6.3).
 *
 * Table 5.1 voltage levels have exclusive lower bounds (its note 1):
 * ≤ 0.4 kV, 0.4 – 1 kV, 1 – 100 kV, over 100 kV; the level is the station
 * voltage. TR 353 takes Us as the voltage across the circuit (the phase
 * voltage of star-connected VTs, e.g. 100/√3 V), as the VT calculation does,
 * so the calculated lead drop is TR 353's ε (formula 7.3).
 */

(() => {
  const URL = 'https://elnet.dk/files/media/document/Elmaaling9udgavefebruar2024_.pdf';
  const T = 'TR 353';

  // Table 5.1: minimum meter classes (main and check meter alike) per level
  const LEVELS = ['0.4', '0.4-1', '1-100', '100+'];
  const LEVEL_TEXT = {
    '0.4':   { en: '≤ 0.4 kV',      da: '≤ 0,4 kV' },
    '0.4-1': { en: '0.4 – 1 kV',    da: '0,4 – 1 kV' },
    '1-100': { en: '1 – 100 kV',    da: '1 – 100 kV' },
    '100+':  { en: 'over 100 kV',   da: 'over 100 kV' },
  };
  // Classes from the lowest to the highest accuracy
  const METER_CLASSES = { mid: ['A', 'B', 'C'], dsen: ['2', '1', '0.5S', '0.2S'] };
  const METER_MIN = {
    dsen: { '0.4': '1', '0.4-1': '1', '1-100': '0.5S', '100+': '0.2S' },
    mid:  { '0.4': 'B', '0.4-1': 'B', '1-100': 'C',    '100+': null },
  };
  const STD_TEXT = { mid: 'MID', dsen: 'DS/EN' };

  // §6.2: typical primary currents for high-voltage metering (DS/EN 61869-2 5.201)
  const IPR_BASE = [10, 15, 20, 30, 50, 75];
  const IPR_VALUES = [1, 10, 100].flatMap((m) => IPR_BASE.map((b) => b * m));
  // §6.3: standard rated burdens of burden series I [VA]
  const VT_SERIES_I = [1, 2.5, 5, 10];
  const MIN_CROSS = 1.5;            // mm², §6.2, §7.4.1, §7.4.2
  const VT_LEAD_DROP_MAX = 0.1;     // % of Us, §7.4.2 (below)

  const num = (x) => (x === null || x === undefined || x === '' ? NaN : Number(x));
  const has = (x) => Number.isFinite(num(x));
  const near = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
  const f = (x, d = 2) => {
    const s = Number(x).toFixed(d);
    return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
  };
  const fda = (x, d = 2) => f(x, d).replace('.', ',');

  function level(system) {
    const u = num(system.voltage);
    if (!Number.isFinite(u)) return null;
    if (u <= 0.4) return '0.4';
    if (u <= 1) return '0.4-1';
    if (u <= 100) return '1-100';
    return '100+';
  }
  const hv = (system) => num(system.voltage) > 1;

  // A clause reference, in English and as TR 353 writes it in Danish
  const refs = (ref) => ({ ref: `${T} ${ref}`, ref_da: `${T} ${ref.replace(/table/g, 'tabel')}` });
  const item = (id, ref, status, en, da) => ({ id, ...refs(ref), status, en, da });

  // ── Metering CT core ──────────────────────────────────────────────────
  function checkMetering(v, r, system) {
    const out = [];
    const Sn = num(v.burden), S = num(r.S_total), U = num(system.voltage);

    // §6.2 / table 5.1: class 0.2S
    out.push(item('ct_class', '§6.2, table 5.1', v.mt_class === '0.2S' ? 'ok' : 'fail',
      `CT accuracy class 0.2S at every voltage level (entered: ${v.mt_class === 'custom' ? 'none' : v.mt_class}).`,
      `Strømtransformeren skal være klasse 0,2 S på alle spændingsniveauer (angivet: ${v.mt_class === 'custom' ? 'ingen' : String(v.mt_class).replace('.', ',')}).`));

    // §6.2: the extended burden range (1 VA – Sn) specified
    const extApplied = r.extended_burden_range === true;
    const extAsked = v.extended_burden_range === true;
    out.push(item('ct_extended_range', '§6.2', extApplied ? 'ok' : 'fail',
      extApplied ? 'The extended burden range is specified: the error limits apply from 1 VA to Sn.'
        : extAsked ? `The extended burden range is required, but IEC 61869-2 allows it only for Sn ≤ 15 VA (Sn = ${f(Sn)} VA).`
          : 'The extended burden range (accuracy from 1 VA to Sn) must be specified for the CT.',
      extApplied ? 'Udvidet byrdeområde er specificeret: fejlgrænserne gælder fra 1 VA til mærkebyrden.'
        : extAsked ? `Udvidet byrdeområde kræves, men DS/EN 61869-2 tillader det kun for Sn ≤ 15 VA (Sn = ${fda(Sn)} VA).`
          : 'Udvidelsen af byrden ned til 1 VA skal specificeres for strømtransformeren.'));

    // §6.2, §7.4.1: 1 VA ≤ Sm + Sl ≤ Sn
    const inRange = S >= 1 - 1e-9 && S <= Sn + 1e-9;
    out.push(item('ct_burden', '§6.2, §7.4.1', inRange ? 'ok' : 'fail',
      `Connected burden within 1 VA … Sn: 1 ≤ ${f(S, 3)} ≤ ${f(Sn)} VA.`,
      `Samlet byrde mellem 1 VA og mærkebyrden: 1 ≤ ${fda(S, 3)} ≤ ${fda(Sn)} VA.`));

    // §6.2: no extra burden ≤ 1 kV; above 1 kV the leads adapt the burden
    const Rres = has(v.attached_resistor) ? num(v.attached_resistor) : 0;
    if (Number.isFinite(U) && U <= 1) {
      out.push(item('ct_no_extra_burden', '§6.2', Rres > 0 ? 'fail' : 'ok',
        Rres > 0 ? `No extra burden may be added to the metering circuit at ≤ 1 kV (attached resistor ${f(Rres, 3)} Ω).`
          : 'No extra burden in the metering circuit (≤ 1 kV).',
        Rres > 0 ? `Der må ikke tilføjes ekstra byrde i målekredsen ved ≤ 1 kV (tilføjet modstand ${fda(Rres, 3)} Ω).`
          : 'Ingen ekstra byrde i målekredsen (≤ 1 kV).'));
    } else if (Rres > 0) {
      out.push(item('ct_extra_burden_hv', '§6.2', 'advice',
        `Above 1 kV TR 353 adapts the burden by longer leads and the cross-section (not below 1.5 mm²), not by a resistor (${f(Rres, 3)} Ω).`,
        `Over 1 kV tilpasses byrden ved at forlænge tilledningerne og ændre tværsnittet (ikke under 1,5 mm²), ikke med en modstand (${fda(Rres, 3)} Ω).`));
    }

    // §6.2, §7.4.1: lead cross-section ≥ 1.5 mm²
    out.push(crossItem('ct_cross', '§6.2, §7.4.1', v.cable_cross));

    // §6.2: recommended primary currents for high-voltage metering
    const Ip = num(v.Ip);
    if (hv(system) && Number.isFinite(Ip)) {
      const okIp = IPR_VALUES.some((x) => near(x, Ip));
      out.push(item('ct_primary', '§6.2', okIp ? 'ok' : 'advice',
        okIp ? `Primary current ${f(Ip)} A is one of the recommended values.`
          : `Recommended primary currents for high-voltage metering: 10, 15, 20, 30, 50 or 75 A, or 10 or 100 times these (entered ${f(Ip)} A).`,
        okIp ? `Primærstrømmen ${fda(Ip)} A er en af de anbefalede værdier.`
          : `Anbefalede primærstrømme ved højspændingsmåling: 10, 15, 20, 30, 50 eller 75 A, eller 10 eller 100 gange disse (angivet ${fda(Ip)} A).`));
    }

    out.push(...meterClassItems(v, system));
    return out;
  }

  // Table 5.1: the meter class for the voltage level
  function meterClassItems(v, system) {
    const lv = level(system);
    const std = v.meter_standard, cls = v.meter_class;
    const ref = 'table 5.1, §6.4';
    if (!METER_CLASSES[std] || !METER_CLASSES[std].includes(cls)) {
      return [item('meter_class', ref, 'missing',
        'Meter class not checked: enter the meter’s standard (MID or DS/EN) and class in the Meter card.',
        'Målerens klasse er ikke kontrolleret: angiv målerens standard (MID eller DS/EN) og klasse i Måler-kortet.')];
    }
    const lt = LEVEL_TEXT[lv];
    const min = METER_MIN[std][lv];
    if (!min) {
      return [item('meter_class', ref, 'fail',
        `Table 5.1 has no MID metering ${lt.en}: a DS/EN meter of class 0.2S is required.`,
        `Tabel 5.1 har ingen MID-måling ${lt.da}: der kræves en DS/EN-måler af klasse 0,2 S.`)];
    }
    const order = METER_CLASSES[std];
    const ok = order.indexOf(cls) >= order.indexOf(min);
    const out = [item('meter_class', ref, ok ? 'ok' : 'fail',
      `${STD_TEXT[std]} meter class ${cls} ${ok ? '≥' : '<'} the minimum ${min} for ${lt.en}.`,
      `${STD_TEXT[std]}-måler klasse ${cls.replace('.', ',')} ${ok ? '≥' : '<'} minimum ${min.replace('.', ',')} for ${lt.da}.`)];
    // Table 5.1 note 4: BEK 582 meters with VTs need class C
    if (std === 'mid' && lv === '0.4-1' && cls !== 'C') {
      out.push(item('meter_class_bek582', 'table 5.1 note 4', 'advice',
        'A meter covered by BEK 582 must be class C when voltage transformers are used.',
        'For målere omfattet af BEK 582 skal der anvendes klasse C, når der anvendes spændingstransformere.'));
    }
    return out;
  }

  function crossItem(id, ref, cross) {
    const q = num(cross);
    return item(id, ref, q >= MIN_CROSS ? 'ok' : 'fail',
      `Metering lead cross-section at least 1.5 mm² (${f(q)} mm²).`,
      `Måleledningens tværsnit mindst 1,5 mm² (${fda(q)} mm²).`);
  }

  // ── VT core ───────────────────────────────────────────────────────────
  function checkVt(v, r, system) {
    const out = [];
    const okClass = v.vt_class === '0.1' || v.vt_class === '0.2';
    out.push(item('vt_class', '§6.3', okClass ? 'ok' : 'fail',
      `VT accuracy class 0.2 or better in new installations (entered: ${v.vt_class}).`,
      `Spændingstransformeren skal være klasse 0,2 eller bedre ved nye måleinstallationer (angivet: ${String(v.vt_class).replace('.', ',')}).`));

    out.push(item('vt_series', '§6.3', v.vt_burden_range === 'I' ? 'ok' : 'fail',
      `Burden series I is required (entered: ${v.vt_burden_range}).`,
      `Der kræves byrdeserie I (angivet: ${v.vt_burden_range}).`));

    const Sn = num(v.burden);
    const std = VT_SERIES_I.some((x) => near(x, Sn));
    out.push(item('vt_rated_burden', '§6.3', std ? 'ok' : 'advice',
      std ? `Rated burden ${f(Sn)} VA is a standard value of series I.`
        : `Standard rated burdens of series I (cos φ = 1): 1, 2.5, 5 and 10 VA (entered ${f(Sn)} VA).`,
      std ? `Mærkebyrden ${fda(Sn)} VA er en standardværdi i byrdeserie I.`
        : `Standardmærkeværdier for byrdeserie I (cos φ = 1): 1, 2,5, 5 og 10 VA (angivet ${fda(Sn)} VA).`));

    const eps = num(r.voltage_drop_percent);
    if (Number.isFinite(eps)) {
      out.push(item('vt_lead_drop', '§7.4.2', eps < VT_LEAD_DROP_MAX ? 'ok' : 'fail',
        `Voltage drop in the metering lead below 0.1 % of Us: ${f(eps, 4)} %.`,
        `Spændingsfaldet i måleledningen skal være mindre end 0,1 % af Us: ${fda(eps, 4)} %.`));
    }

    out.push(crossItem('vt_cross', '§7.4.2', v.cable_cross));

    const Us = num(v.secondary_voltage);
    if (hv(system) && Number.isFinite(Us)) {
      const okUs = [100, 110].some((x) => near(Us, x) || Math.abs(Us - x / Math.sqrt(3)) < 0.05);
      out.push(item('vt_us', '§6.3', okUs ? 'ok' : 'advice',
        okUs ? `Secondary rated voltage ${f(Us, 1)} V follows the 100 V / 110 V recommendation.`
          : `A secondary rated voltage of 100 V or 110 V (line) is recommended for high voltage (entered ${f(Us, 1)} V).`,
        okUs ? `Sekundær mærkespænding ${fda(Us, 1)} V følger anbefalingen om 100 V / 110 V.`
          : `Ved højspænding anbefales en sekundær mærkespænding (yderspænding) på 100 V eller 110 V (angivet ${fda(Us, 1)} V).`));
    }
    return out;
  }

  // ── What TR 353 requires that CTSizer cannot check ──────────────────
  const m = (ref, en, da) => ({ ...refs(ref), en, da });
  function manual(type, system) {
    const U = num(system.voltage);
    const over1 = Number.isFinite(U) && U > 1;
    const upTo1 = Number.isFinite(U) && U <= 1;
    const out = [];
    if (type === 'metering') {
      if (over1) out.push(m('§6.2, §7.1',
        'Two metering CT cores per phase: one for the main meter, one for the check meter. Customer equipment goes on a separate (third) core.',
        'To strømtransformermålekerner i hver fase: én til hovedmåleren og én til kontrolmåleren. Kundens eget udstyr tilsluttes en særskilt (tredje) kerne.'));
      if (upTo1) out.push(m('§6.2',
        'Low voltage: the CT rating is the nearest value ≥ the supply capacity of the installation (Fællesregulativet).',
        'Lavspænding: strømværdien skal være den nærmeste værdi ≥ måleinstallationens leveringsomfang (Fællesregulativet).'));
      out.push(
        m('§6.2', 'The CT secondary can be short-circuited (extra terminals or a separate terminal block); terminals sealed or locked.',
          'Strømtransformeren kan kortsluttes på sekundærsiden (ekstra klemmer eller separat klemrække); klemmer plomberes eller aflåses.'),
        m('§6.2.1', 'Type-tested to DS/EN 61869-2 at an accredited laboratory, with a test protocol for the CT (each CT above 1 kV).',
          'Typetestet efter DS/EN 61869-2 på akkrediteret laboratorium, med prøveprotokol (for den enkelte strømtransformer over 1 kV).'),
        m('§7.4.1', 'One — and only one — earthing of the CT circuit, preferably at the star point next to the CTs.',
          'Én — og kun én — jording af strømtransformerkredsen, helst i stjernepunktet ved strømtransformerne.'),
        m('§7.4', 'Only settlement equipment on the main meter’s current and voltage circuits.',
          'Kun udstyr beregnet til afregning på hovedmålerens strøm- og spændingskredse.'),
        m('table 5.1', 'A metering point on the primary side of a transformer measured on its secondary side uses the classes of the primary voltage.',
          'Ligger målepunktet på primærsiden af en transformer, men måles på sekundærsiden, anvendes klasserne for den primære spænding.'),
      );
    } else if (type === 'vt') {
      out.push(
        m('§6.3', 'No fuses on the VT primary side.', 'Der må ikke installeres sikringer på primærsiden af spændingstransformeren.'),
        m('§6.3, §7.4.2', 'Secondary MCB close to the VT: 3 A, Z characteristic, breaking capacity ≥ 5 kA; it must trip for a short circuit at the far end of the lead.',
          'Automatsikring tæt ved spændingstransformeren: 3 A, Z-karakteristik, brydeevne mindst 5 kA; den skal udløse ved kortslutning i den fjerneste ende af måleledningen.'),
        m('§7.4.2', 'Total voltage drop from the VT terminals to the meter, the MCB included, at most 0.2 % of Us.',
          'Samlet spændingsfald fra spændingstransformerens klemmer til elmåleren, inkl. automatsikring, højst 0,2 % af Us.'),
        m('§6.3', 'An even ratio, e.g. 11000/110 V.', 'Et lige omsætningsforhold, fx 11000/110 V.'),
        m('§6.3.1', 'Type-tested to DS/EN 61869-3 at an accredited laboratory, with a test protocol.',
          'Typetestet efter DS/EN 61869-3 på akkrediteret laboratorium, med prøveprotokol.'),
        m('§7.4.2', 'The metering circuits are earthed close to the VTs; terminals sealed or locked.',
          'Målekredsene jordes tæt ved transformerne; klemmer plomberes eller aflåses.'),
      );
      if (over1) out.push(m('§6.3, §7.4',
        'Two secondary metering windings per phase: main and check meter each have their own sealed voltage circuit.',
        'To sekundære måleviklinger pr. fase: hoved- og kontrolmåler har hver sin plomberede spændingskreds.'));
    }
    return out;
  }

  // ── Remarks: no "add burden" advice that TR 353 does not allow ──────
  // [key, ...args] → the TR 353 remark (texts in CTSReport's remark table)
  function remarks(type, v, r, system, warnings) {
    const U = num(system.voltage);
    const lv = Number.isFinite(U) && U <= 1;
    return warnings.map((w) => {
      if (!Array.isArray(w)) return w;
      const [key, ...args] = w;
      if (type === 'metering' && key === 'hint_metering_add_burden') {
        return [lv ? 'hint_metering_add_burden_dk_lv' : 'hint_metering_add_burden_dk_hv', ...args];
      }
      if (type === 'metering' && key === 'hint_extended_burden_range') return ['hint_extended_burden_range_dk', ...args];
      if (type === 'vt' && key === 'warning_vt_range_ii_below_25') return ['warning_vt_range_ii_below_25_dk', ...args];
      return w;
    });
  }

  CTLocalRules.register({
    id: 'dk_elmaaling_9',
    country: 'DK',
    label_en: 'Denmark — Elmåling 9th ed. (TR 353)',
    label_da: 'Danmark — Elmåling 9. udg. (TR 353)',
    source_en: 'Elmåling – Elmålehåndbogen, 9th edition, February 2024 (Green Power Denmark), section 3: TR 353, 9th edition, December 2023',
    source_da: 'Elmåling – Elmålehåndbogen, 9. udgave, februar 2024 (Green Power Denmark), afsnit 3: TR 353, 9. udgave, december 2023',
    url: URL,
    appliesTo: ['metering', 'vt'],
    METER_CLASSES, METER_MIN, LEVELS, level,
    check(type, v, r, system) {
      if (type === 'metering') return checkMetering(v, r, system);
      if (type === 'vt') return checkVt(v, r, system);
      return [];
    },
    manual,
    remarks,
  });
})();
