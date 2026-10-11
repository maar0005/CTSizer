'use strict';
/**
 * tests.js — Test suite for CTCalc submodules
 *
 * Runs automatically when loaded. Tests are based on:
 * - ct_verification_input.xlsx reference cases from the Python project
 * - IEC 61869-2 example calculations
 * - Cross-checked against Python golden regression tests
 *
 * To view results: open browser console and look for [CTTest] lines,
 * or call CTTests.run() and inspect the returned results object.
 */

const CTTests = (() => {

  const TOLERANCE = 0.005; // 0.5% numerical tolerance

  function approx(a, b, tol = TOLERANCE) {
    if (b === 0) return Math.abs(a) < 1e-10;
    return Math.abs((a - b) / b) < tol;
  }

  function assert(name, condition, actual, expected, unit = '') {
    const pass = condition;
    const status = pass ? '✓ PASS' : '✗ FAIL';
    const msg = `[CTTest] ${status} — ${name}: got ${
      typeof actual === 'number' ? actual.toFixed(4) : actual
    }${unit} expected ${
      typeof expected === 'number' ? expected.toFixed(4) : expected
    }${unit}`;
    if (!pass) console.warn(msg);
    return { name, pass, actual, expected };
  }

  // Recursive structural match against a golden fixture: numbers compare
  // with `approx`, arrays compare element-wise, objects require every key
  // *present in `expected`* to match (extra keys on `actual`, e.g. class_info
  // lookups not golden-pinned here, are ignored).
  function matchesExpected(actual, expected) {
    if (typeof expected === 'number') return typeof actual === 'number' && approx(actual, expected);
    if (Array.isArray(expected)) {
      return Array.isArray(actual) && actual.length === expected.length &&
        expected.every((e, i) => matchesExpected(actual[i], e));
    }
    if (expected !== null && typeof expected === 'object') {
      return actual !== null && typeof actual === 'object' &&
        Object.keys(expected).every((k) => matchesExpected(actual[k], expected[k]));
    }
    return actual === expected;
  }

  // ── MATERIALS ─────────────────────────────────────────────────────────
  function testMaterials() {
    const results = [];

    // Copper 4mm² at 20°C, 100m one-way → R = 2 × ρ₂₀ × L / A
    // ρ₂₀ = 0.017241 Ω·mm²/m → R_one = 0.017241 × 100 / 4 = 0.431025 Ω → R_wire = 0.86205 Ω
    const R_cu = CTMaterials.calcWireResistance('Kobber (Cu)', 20, 100, 4).r_wire;
    results.push(assert('Cu 4mm² 100m 20°C', approx(R_cu, 0.86205), R_cu, 0.86205, ' Ω'));

    // Aluminium 4mm² at 20°C
    const R_al = CTMaterials.calcWireResistance('Aluminium (Al)', 20, 100, 4).r_wire;
    const expected_al = 2 * 0.02826 * 100 / 4;
    results.push(assert('Al 4mm² 100m 20°C', approx(R_al, expected_al), R_al, expected_al, ' Ω'));

    // Temperature correction: Cu 4mm² at 75°C
    const R_cu75 = CTMaterials.calcWireResistance('Kobber (Cu)', 75, 100, 4).r_wire;
    const rho75 = 0.017241 * (1 + 0.00393 * (75 - 20));
    const expected_cu75 = 2 * rho75 * 100 / 4;
    results.push(assert('Cu 4mm² 100m 75°C', approx(R_cu75, expected_cu75), R_cu75, expected_cu75, ' Ω'));

    // ── Golden-vector backed (calc/golden/materials.json ← materials.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.materials)
      ? CT_GOLDEN.materials : null;
    if (!G) return results;

    (G.is_copper_material || []).forEach((c, i) => {
      const got = CTMaterials.isCopperMaterial(c.input[0]);
      results.push(assert(`mat.isCopper #${i}`, got === c.expected, got, c.expected));
    });
    (G.is_aluminum_material || []).forEach((c, i) => {
      const got = CTMaterials.isAluminumMaterial(c.input[0]);
      results.push(assert(`mat.isAluminum #${i}`, got === c.expected, got, c.expected));
    });
    (G.get_material_properties || []).forEach((c, i) => {
      const got = CTMaterials.getMaterialProps(c.input);
      results.push(assert(`mat.props #${i}`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });
    (G.get_dc_resistance_per_km || []).forEach((c, i) => {
      const got = CTMaterials.getDcResistancePerKm(c.input[0], c.input[1]);
      results.push(assert(`mat.dcResistancePerKm #${i}`, approx(got, c.expected), got, c.expected, ' Ω/km'));
    });
    (G.get_wiring_factor || []).forEach((c, i) => {
      const got = CTMaterials.getWiringFactor();
      results.push(assert(`mat.wiringFactor #${i}`, got === c.expected, got, c.expected));
    });
    (G.calculate_resistivity_at_temp || []).forEach((c, i) => {
      const got = CTMaterials.calcResistivityAtTemp(c.input[0], c.input[1]);
      results.push(assert(`mat.resistivityAtTemp #${i}`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });
    (G.calculate_resistance_at_temp || []).forEach((c, i) => {
      const got = CTMaterials.calcResistanceAtTemp(c.input[0], c.input[1], c.input[2]);
      results.push(assert(`mat.resistanceAtTemp #${i}`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });
    (G.calculate_single_conductor_resistance || []).forEach((c, i) => {
      const got = CTMaterials.calcSingleConductorResistance(c.input[0], c.input[1], c.input[2], c.input[3]);
      results.push(assert(`mat.singleConductorR #${i}`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });
    (G.calculate_wire_resistance || []).forEach((c, i) => {
      const got = CTMaterials.calcWireResistance(c.input[0], c.input[1], c.input[2], c.input[3]);
      results.push(assert(`mat.wireR #${i}`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });
    (G.calculate_cable_burden || []).forEach((c, i) => {
      const got = CTMaterials.calcCableBurden(c.input[0], c.input[1], c.input[2], c.input[3], c.input[4]);
      results.push(assert(`mat.cableBurden #${i}`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });
    (G.validate_cable_resistivity || []).forEach((c, i) => {
      const got = CTMaterials.validateCableResistivity(c.input[0], c.input[1], c.input[2]);
      results.push(assert(`mat.validate #${i}`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    return results;
  }

  // ── CABLE-RESISTANCE TOOLBOX — core (PORTING_PLAN.md §9.6 9A) ─────────
  // Namespace, normalisation, guards, shared law, topology, registries and
  // the resolve* helpers. Methods are tested in their own suites; here a
  // temporary probe method (formula R′20) exercises calculate()/lead().
  function testCableResCore() {
    const results = [];
    const R = CTCableRes;

    function throws(fn, Ctor, msgPart) {
      try { fn(); } catch (e) {
        return e instanceof Ctor && (!msgPart || String(e.message).includes(msgPart));
      }
      return false;
    }
    const keysOf = (steps) => steps.map((s) => s.key).join(',');

    // Defaults
    results.push(assert('cres.DEFAULT_METHOD', R.DEFAULT_METHOD === 'iec60287', R.DEFAULT_METHOD, 'iec60287'));
    results.push(assert('cres.DEFAULT_TEMP_C', R.DEFAULT_TEMP_C === 75, R.DEFAULT_TEMP_C, 75));
    results.push(assert('cres.DEFAULT_TOPOLOGY', R.DEFAULT_TOPOLOGY === 'six_wire', R.DEFAULT_TOPOLOGY, 'six_wire'));

    // Material normalisation — every accepted spelling (§9.5)
    const CU = 'Kobber (Cu)', AL = 'Aluminium (Al)';
    [
      ['cu', CU], ['CU', CU], [' al ', AL], ['al', AL],
      ['Kobber (Cu)', CU], ['Copper (Cu)', CU], ['kobber', CU],
      ['Aluminium (Al)', AL], ['Aluminum (Al)', AL], ['aluminium', AL],
      ['', CU], [null, CU], [undefined, CU], ['ukendt', CU],
    ].forEach(([m, exp]) => {
      const got = R.normaliseMaterial(m);
      results.push(assert(`cres.material ${JSON.stringify(m)}`, got === exp, got, exp));
    });
    results.push(assert('cres.material non-string → TypeError',
      throws(() => R.normaliseMaterial(5), TypeError), 'no throw', 'TypeError'));

    // normaliseParams guards
    const ok = { material: 'cu', cross_section_mm2: 4, length_m: 65, temp_c: 75 };
    const np = R.normaliseParams(ok);
    results.push(assert('cres.normalise material', np.material === CU && np.material_name === 'Kobber',
      `${np.material}/${np.material_name}`, `${CU}/Kobber`));
    results.push(assert('cres.normalise alpha Cu', np.alpha === CTMaterials.COPPER_TEMP_COEFFICIENT,
      np.alpha, CTMaterials.COPPER_TEMP_COEFFICIENT));
    const npAl = R.normaliseParams({ ...ok, material: 'Aluminium (Al)' });
    results.push(assert('cres.normalise alpha Al', npAl.alpha === CTMaterials.ALUMINUM_TEMP_COEFFICIENT,
      npAl.alpha, CTMaterials.ALUMINUM_TEMP_COEFFICIENT));
    [
      ['A = 0', { cross_section_mm2: 0 }], ['A < 0', { cross_section_mm2: -4 }],
      ['A NaN', { cross_section_mm2: NaN }], ['A string', { cross_section_mm2: '4' }],
      ['A missing', { cross_section_mm2: undefined }],
      ['L < 0', { length_m: -1 }], ['L Infinity', { length_m: Infinity }],
      ['T NaN', { temp_c: NaN }], ['T null', { temp_c: null }],
    ].forEach(([name, patch]) => {
      results.push(assert(`cres.guard ${name} → RangeError`,
        throws(() => R.normaliseParams({ ...ok, ...patch }), RangeError), 'no throw', 'RangeError'));
    });
    const np0 = R.normaliseParams({ ...ok, length_m: 0 });
    results.push(assert('cres.guard L = 0 valid', np0.length_m === 0, np0.length_m, 0));

    // formulaR20 = ρ20/A·1000
    const fCu = R.formulaR20('cu', 4), eCu = CTMaterials.COPPER_RESISTIVITY_20C / 4 * 1000;
    results.push(assert('cres.formulaR20 Cu 4', fCu === eCu, fCu, eCu, ' Ω/km'));
    const fAl = R.formulaR20('al', 6), eAl = CTMaterials.ALUMINUM_RESISTIVITY_20C / 6 * 1000;
    results.push(assert('cres.formulaR20 Al 6', fAl === eAl, fAl, eAl, ' Ω/km'));

    // Shared law: R′_T = R′20·(1+α(T−20)), R_c = R′_T·L/1000
    const law = R.conductorAtTemp(np, fCu);
    const eRT = fCu * (1 + CTMaterials.COPPER_TEMP_COEFFICIENT * 55);
    results.push(assert('cres.law R′_T', approx(law.r_per_km_at_temp, eRT), law.r_per_km_at_temp, eRT, ' Ω/km'));
    results.push(assert('cres.law R_c = R′_T·L/1000',
      approx(law.r_conductor, law.r_per_km_at_temp * 65 / 1000), law.r_conductor,
      law.r_per_km_at_temp * 65 / 1000, ' Ω'));
    results.push(assert('cres.law step keys',
      keysOf(law.steps) === 'cable_resistance_at_temp,cable_r_conductor',
      keysOf(law.steps), 'cable_resistance_at_temp,cable_r_conductor'));
    results.push(assert('cres.law steps bilingual',
      law.steps.every((s) => s.label_en && s.label_da && s.latex), 'missing', 'labels+latex'));
    const law20 = R.conductorAtTemp(R.normaliseParams({ ...ok, temp_c: 20 }), fCu);
    results.push(assert('cres.law T = 20 → R′_T = R′20', law20.r_per_km_at_temp === fCu,
      law20.r_per_km_at_temp, fCu));
    results.push(assert('cres.law L = 0 → 0 Ω', R.conductorAtTemp(np0, fCu).r_conductor === 0,
      R.conductorAtTemp(np0, fCu).r_conductor, 0));

    // calculate(): unknown method id (checked before the params)
    results.push(assert('cres.calculate unknown id → Error',
      throws(() => R.calculate('nope', ok), Error, 'unknown cable resistance method: nope'),
      'no throw', 'Error'));
    results.push(assert('cres.calculate "toString" → Error',
      throws(() => R.calculate('toString', ok), Error, 'unknown cable resistance method'),
      'no throw', 'Error'));

    // resolveMethod: unknown / missing ids → default
    [undefined, null, {}, { cable_r_method: 'nope' }, { cable_r_method: 'toString' },
      { cable_r_method: 42 }].forEach((cd, i) => {
      const got = R.resolveMethod(cd);
      results.push(assert(`cres.resolveMethod default #${i}`, got === R.DEFAULT_METHOD, got, R.DEFAULT_METHOD));
    });

    // Probe method: calculate()/lead()/registries/resolveMethod with a
    // registered id. Removed again in `finally` so the registry is untouched.
    const PROBE = '__probe';
    R.methods[PROBE] = {
      id: PROBE, label_en: 'Probe', label_da: 'Probe',
      calculate(p) {
        const r20_per_km = R.formulaR20(p.material, p.cross_section_mm2);
        const lawR = R.conductorAtTemp(p, r20_per_km);
        return {
          source: 'probe', r20_per_km,
          r_per_km_at_temp: lawR.r_per_km_at_temp, r_conductor: lawR.r_conductor,
          warnings: ['probe warning'], steps: lawR.steps,
        };
      },
    };
    try {
      const c = R.calculate(PROBE, { material: 'al', cross_section_mm2: 6, length_m: 150, temp_c: 90 });
      results.push(assert('cres.calculate stamps method', c.method === PROBE && c.source === 'probe',
        `${c.method}/${c.source}`, `${PROBE}/probe`));
      results.push(assert('cres.calculate material', c.material === AL && c.material_name === 'Aluminium',
        `${c.material}/${c.material_name}`, `${AL}/Aluminium`));
      results.push(assert('cres.calculate contract r_conductor = R′_T·L/1000',
        approx(c.r_conductor, c.r_per_km_at_temp * 150 / 1000), c.r_conductor,
        c.r_per_km_at_temp * 150 / 1000, ' Ω'));
      results.push(assert('cres.calculate warnings', c.warnings.length === 1, c.warnings.length, 1));
      results.push(assert('cres.calculate bad params → RangeError',
        throws(() => R.calculate(PROBE, { ...ok, length_m: -5 }), RangeError), 'no throw', 'RangeError'));

      const ld = R.lead(PROBE, { material: 'al', cross_section_mm2: 6, length_m: 150, temp_c: 90 },
        'six_wire', 'single_phase');
      results.push(assert('cres.lead r_loop = 2·r_conductor', ld.r_loop === 2 * ld.r_conductor,
        ld.r_loop, 2 * ld.r_conductor, ' Ω'));
      results.push(assert('cres.lead fields',
        ld.topology === 'six_wire' && ld.current_case === 'single_phase' && ld.factor === 2 && ld.method === PROBE,
        `${ld.topology}/${ld.current_case}/${ld.factor}/${ld.method}`, `six_wire/single_phase/2/${PROBE}`));
      const eKeys = 'cable_resistance_at_temp,cable_r_conductor,total_cable_resistance';
      results.push(assert('cres.lead step keys', keysOf(ld.steps) === eKeys, keysOf(ld.steps), eKeys));
      results.push(assert('cres.lead does not mutate calculate steps',
        keysOf(c.steps) === 'cable_resistance_at_temp,cable_r_conductor', keysOf(c.steps), 'two steps'));
      const ldDef = R.lead(PROBE, ok, undefined, 'three_phase');
      results.push(assert('cres.lead default topology', ldDef.topology === R.DEFAULT_TOPOLOGY,
        ldDef.topology, R.DEFAULT_TOPOLOGY));

      const got = R.resolveMethod({ cable_r_method: PROBE });
      results.push(assert('cres.resolveMethod registered id', got === PROBE, got, PROBE));
      const lm = R.listMethods();
      const probeRow = lm.find((m) => m.id === PROBE);
      results.push(assert('cres.listMethods includes registered',
        !!probeRow && probeRow.label_en === 'Probe' && probeRow.label_da === 'Probe',
        JSON.stringify(probeRow), 'probe row'));
      results.push(assert('cres.listMethods matches registry', lm.length === Object.keys(R.methods).length,
        lm.length, Object.keys(R.methods).length));
      if (R.methods[R.DEFAULT_METHOD]) {
        results.push(assert('cres.listMethods default first', lm[0].id === R.DEFAULT_METHOD, lm[0].id, R.DEFAULT_METHOD));
      }
    } finally {
      delete R.methods[PROBE];
    }
    const after = R.resolveMethod({ cable_r_method: PROBE });
    results.push(assert('cres.resolveMethod after unregister', after === R.DEFAULT_METHOD, after, R.DEFAULT_METHOD));

    // resolveParams: core cable fields, project temperature, module defaults
    const rp = R.resolveParams({ cable_length: 100, cable_cross: 4, cable_mat: 'al', cable_temp: 20 }, {});
    results.push(assert('cres.resolveParams core fields',
      rp.material === 'al' && rp.cross_section_mm2 === 4 && rp.length_m === 100,
      JSON.stringify(rp), 'al/4/100'));
    results.push(assert('cres.resolveParams ignores core.cable_temp', rp.temp_c === 75, rp.temp_c, 75, ' °C'));
    const rpT = R.resolveParams({ cable_temp: 75 }, { cable_temp: 20 }, { cross_section_mm2: 4, length_m: 65 });
    results.push(assert('cres.resolveParams project temp', rpT.temp_c === 20, rpT.temp_c, 20, ' °C'));
    results.push(assert('cres.resolveParams module defaults',
      rpT.cross_section_mm2 === 4 && rpT.length_m === 65 && rpT.material === CU,
      JSON.stringify(rpT), `4/65/${CU}`));
    const rpP = R.resolveParams(
      { cable_material: 'Aluminium (Al)', cable_mat: 'cu', cable_cross_section: 6, cable_cross: 4 }, null);
    results.push(assert('cres.resolveParams precedence',
      rpP.material === 'Aluminium (Al)' && rpP.cross_section_mm2 === 6 && rpP.temp_c === 75,
      JSON.stringify(rpP), 'Al/6/75'));
    const rpN = R.resolveParams(null, undefined, { material: 'al', cross_section_mm2: 2.5, length_m: 150 });
    results.push(assert('cres.resolveParams null core',
      rpN.material === 'al' && rpN.cross_section_mm2 === 2.5 && rpN.length_m === 150 && rpN.temp_c === 75,
      JSON.stringify(rpN), 'al/2.5/150/75'));

    // Topology: guards, registry, step
    const rc = { r_conductor: 0.5 };
    results.push(assert('cres.topology unknown → Error',
      throws(() => R.applyTopology(rc, 'three_wire', 'three_phase'), Error, 'unknown cable topology: three_wire'),
      'no throw', 'Error'));
    results.push(assert('cres.topology unknown case → Error',
      throws(() => R.applyTopology(rc, 'six_wire', 'earth'), Error, 'unknown current case: earth'),
      'no throw', 'Error'));
    results.push(assert('cres.topology missing case → Error',
      throws(() => R.applyTopology(rc, 'six_wire'), Error, 'unknown current case'), 'no throw', 'Error'));
    results.push(assert('cres.topology bad r_conductor → RangeError',
      throws(() => R.applyTopology({ r_conductor: -1 }, 'six_wire', 'three_phase'), RangeError),
      'no throw', 'RangeError'));
    const tDef = R.applyTopology(rc, undefined, 'two_phase');
    results.push(assert('cres.topology default six_wire', tDef.topology === 'six_wire' && tDef.factor === 2,
      `${tDef.topology}/${tDef.factor}`, 'six_wire/2'));
    const st = tDef.steps[0];
    results.push(assert('cres.topology step', tDef.steps.length === 1 && st.key === 'total_cable_resistance' &&
      st.result === 1 && st.unit === 'Ω' && st.label_en && st.label_da && st.latex,
      JSON.stringify(st), 'total_cable_resistance = 1 Ω'));
    const lt = R.listTopologies();
    const six = lt.find((t) => t.id === 'six_wire');
    results.push(assert('cres.listTopologies six_wire',
      !!six && six.factor === 2 && six.label_en === '6-wire' && six.label_da === '6-leder',
      JSON.stringify(six), 'six_wire ×2'));
    results.push(assert('cres.CURRENT_CASES', R.CURRENT_CASES.join(',') === 'three_phase,two_phase,single_phase',
      R.CURRENT_CASES.join(','), 'three_phase,two_phase,single_phase'));

    // ── Golden-vector backed (calc/golden/cable_resistance.json › topology
    //    ← materials.get_wiring_factor) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.cable_resistance)
      ? CT_GOLDEN.cable_resistance : null;
    if (!G) return results;
    (G.topology || []).forEach((c, i) => {
      const got = R.applyTopology({ r_conductor: c.input.r_conductor }, c.input.topology, c.input.current_case);
      results.push(assert(`cres.topology golden #${i} factor`, got.factor === c.expected.factor,
        got.factor, c.expected.factor));
      results.push(assert(`cres.topology golden #${i} r_loop`, approx(got.r_loop, c.expected.r_loop),
        got.r_loop, c.expected.r_loop, ' Ω'));
      results.push(assert(`cres.topology golden #${i} step`, got.steps[0].result === got.r_loop,
        got.steps[0].result, got.r_loop, ' Ω'));
    });

    return results;
  }

  // ── CABLE-RESISTANCE TOOLBOX — `table` method (IEC 60228) ─────────────
  function testCableResTable() {
    const results = [];
    const R = CTCableRes;
    const keysOf = (steps) => steps.map((s) => s.key).join(',');
    const KEYS = 'cable_r20,cable_resistance_at_temp,cable_r_conductor';
    const CU = 'Kobber (Cu)', AL = 'Aluminium (Al)';

    // Registry + D7 labels
    const m = R.methods.table;
    results.push(assert('cres.table registered',
      !!m && m.id === 'table' && m.label_en === 'IEC 60228 (table)' && m.label_da === 'IEC 60228 (tabel)',
      m && `${m.id}/${m.label_en}/${m.label_da}`, 'table/IEC 60228 (table)/IEC 60228 (tabel)'));
    const row = R.listMethods().find((x) => x.id === 'table');
    results.push(assert('cres.table listMethods row', !!row && row.label_en === 'IEC 60228 (table)',
      JSON.stringify(row), 'table row'));
    const rm = R.resolveMethod({ cable_r_method: 'table' });
    results.push(assert('cres.table resolveMethod', rm === 'table', rm, 'table'));

    // Table value, not the formula: Cu 4 mm² → 4.61 Ω/km exactly
    const t4 = R.calculate('table', { material: 'cu', cross_section_mm2: 4, length_m: 65, temp_c: 75 });
    results.push(assert('cres.table Cu 4 R′20 = 4.61', t4.r20_per_km === 4.61, t4.r20_per_km, 4.61, ' Ω/km'));
    results.push(assert('cres.table Cu 4 method/source',
      t4.method === 'table' && t4.source === 'iec60228_table' && t4.material === CU,
      `${t4.method}/${t4.source}/${t4.material}`, `table/iec60228_table/${CU}`));
    results.push(assert('cres.table Cu 4 no warning', t4.warnings.length === 0, t4.warnings.length, 0));
    const eRT = 4.61 * (1 + CTMaterials.COPPER_TEMP_COEFFICIENT * 55);
    results.push(assert('cres.table Cu 4 R′_T', approx(t4.r_per_km_at_temp, eRT), t4.r_per_km_at_temp, eRT, ' Ω/km'));
    results.push(assert('cres.table Cu 4 R_c', approx(t4.r_conductor, eRT * 65 / 1000),
      t4.r_conductor, eRT * 65 / 1000, ' Ω'));
    results.push(assert('cres.table step keys', keysOf(t4.steps) === KEYS, keysOf(t4.steps), KEYS));
    results.push(assert('cres.table steps bilingual + latex',
      t4.steps.every((s) => s.label_en && s.label_da && s.latex), 'missing', 'labels+latex'));
    results.push(assert('cres.table cable_r20 step',
      t4.steps[0].result === 4.61 && t4.steps[0].unit === 'Ω/km' && t4.steps[0].source === 'iec60228_table' &&
      t4.steps[0].label_en.includes('IEC 60228 table') && t4.steps[0].label_da.includes('IEC 60228-tabel'),
      JSON.stringify(t4.steps[0]), 'R′20 = 4.61 from the table'));
    const f50 = R.formulaR20('cu', 50);
    const t50 = R.calculate('table', { material: 'Kobber (Cu)', cross_section_mm2: 50, length_m: 100, temp_c: 20 });
    results.push(assert('cres.table Cu 50 ≠ formula (+12 %)',
      t50.r20_per_km === 0.387 && approx(t50.r20_per_km / f50, 1.122, 0.001),
      t50.r20_per_km / f50, 1.122));

    // Aluminium column, incl. the US spelling
    const tAl = R.calculate('table', { material: 'Aluminum (Al)', cross_section_mm2: 6, length_m: 150, temp_c: 90 });
    results.push(assert('cres.table Al 6 R′20 = 4.61', tAl.r20_per_km === 4.61 && tAl.material === AL &&
      tAl.alpha === CTMaterials.ALUMINUM_TEMP_COEFFICIENT, `${tAl.r20_per_km}/${tAl.material}`, `4.61/${AL}`));
    const tCu1 = R.calculate('table', { material: 'cu', cross_section_mm2: 1.0, length_m: 10, temp_c: 20 });
    results.push(assert('cres.table Cu 1.0 in table', tCu1.r20_per_km === 18.1 && tCu1.source === 'iec60228_table',
      `${tCu1.r20_per_km}/${tCu1.source}`, '18.1/iec60228_table'));

    // Fallback: size not in IEC 60228 (Cu 5 mm²), Al column empty (Al 1.0 mm²),
    // and a size that only nearly matches a table key.
    [
      ['Cu 5 mm²', 'cu', 5, 'copper', 'kobber'],
      ['Al 1.0 mm²', 'al', 1.0, 'aluminium', 'aluminium'],
      ['Cu 1.5000001 mm²', 'Copper (Cu)', 1.5000001, 'copper', 'kobber'],
    ].forEach(([name, mat, A, en, da]) => {
      const r = R.calculate('table', { material: mat, cross_section_mm2: A, length_m: 65, temp_c: 75 });
      const eR20 = R.formulaR20(mat, A);
      results.push(assert(`cres.table fallback ${name} R′20 = formula`, r.r20_per_km === eR20,
        r.r20_per_km, eR20, ' Ω/km'));
      results.push(assert(`cres.table fallback ${name} source`, r.source === 'iec60287_fallback',
        r.source, 'iec60287_fallback'));
      results.push(assert(`cres.table fallback ${name} warning`,
        r.warnings.length === 1 && typeof r.warnings[0] === 'string' &&
        r.warnings[0].includes(`${A} mm²`) && r.warnings[0].includes(en) && r.warnings[0].includes('IEC 60287'),
        JSON.stringify(r.warnings), 'one warning naming size, material and IEC 60287'));
      const s0 = r.steps[0];
      results.push(assert(`cres.table fallback ${name} cable_r20 step`,
        keysOf(r.steps) === KEYS && s0.result === eR20 && s0.source === 'iec60287_fallback' &&
        s0.label_en.includes('not in IEC 60228') && s0.label_en.includes('IEC 60287 formula') &&
        s0.label_en.includes(en) &&
        s0.label_da.includes('findes ikke i IEC 60228') && s0.label_da.includes('IEC 60287-formel') &&
        s0.label_da.includes(da),
        JSON.stringify(s0), 'fallback step EN + DA'));
    });

    // lead(): topology on top of the table result
    const ld = R.lead('table', { material: 'cu', cross_section_mm2: 4, length_m: 65, temp_c: 75 },
      'six_wire', 'single_phase');
    results.push(assert('cres.table lead r_loop = 2·R_c', ld.r_loop === 2 * ld.r_conductor && ld.method === 'table',
      ld.r_loop, 2 * ld.r_conductor, ' Ω'));
    results.push(assert('cres.table lead step keys', keysOf(ld.steps) === `${KEYS},total_cable_resistance`,
      keysOf(ld.steps), `${KEYS},total_cable_resistance`));

    // Guards still apply through the method
    let threw = false;
    try { R.calculate('table', { material: 'cu', cross_section_mm2: 0, length_m: 65, temp_c: 75 }); }
    catch (e) { threw = e instanceof RangeError; }
    results.push(assert('cres.table A = 0 → RangeError', threw, 'no throw', 'RangeError'));

    // ── Golden-vector backed (calc/golden/cable_resistance.json › table
    //    ← materials.get_dc_resistance_per_km + calculate_resistance_at_temp) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.cable_resistance)
      ? CT_GOLDEN.cable_resistance : null;
    if (!G) return results;
    (G.table || []).forEach((c, i) => {
      const r = R.calculate('table', c.input);
      const e = c.expected;
      const tag = `cres.table golden #${i} (${JSON.stringify(c.input.material)} ${c.input.cross_section_mm2} mm² ` +
        `${c.input.temp_c} °C ${c.input.length_m} m)`;
      results.push(assert(`${tag} values`,
        r.material === e.material && r.alpha === e.alpha &&
        approx(r.r20_per_km, e.r20_per_km) && approx(r.r_per_km_at_temp, e.r_per_km_at_temp) &&
        approx(r.r_conductor, e.r_conductor) &&
        approx(r.r_conductor, r.r_per_km_at_temp * c.input.length_m / 1000),
        r.r_conductor, e.r_conductor, ' Ω'));
      const eSource = e.in_table ? 'iec60228_table' : 'iec60287_fallback';
      results.push(assert(`${tag} source/warning/steps`,
        r.source === eSource && r.warnings.length === (e.in_table ? 0 : 1) &&
        keysOf(r.steps) === KEYS && r.steps[0].result === r.r20_per_km && r.steps[2].result === r.r_conductor,
        `${r.source}/${r.warnings.length}`, `${eSource}/${e.in_table ? 0 : 1}`));
    });

    return results;
  }

  // ── CABLE-RESISTANCE TOOLBOX — wiring topology (PORTING_PLAN.md §9.6 9E, §9.8)
  // ctvt_dim only has ×2, so the four_wire factors are asserted literally
  // against the §9.8 table; six_wire is also golden-pinned in testCableResCore.
  function testCableResTopology() {
    const results = [];
    const R = CTCableRes;
    const SQRT3 = 1.7320508075688772;   // √3, |2 + e^{−j120°}|

    // Every factor of the §9.8 table, through applyTopology (exact)
    const TABLE = {
      four_wire: { three_phase: 1, two_phase: SQRT3, single_phase: 2 },
      six_wire:  { three_phase: 2, two_phase: 2,     single_phase: 2 },
    };
    const rc = { r_conductor: 0.37 };
    Object.keys(TABLE).forEach((topo) => {
      Object.keys(TABLE[topo]).forEach((cs) => {
        const k = TABLE[topo][cs];
        const t = R.applyTopology(rc, topo, cs);
        results.push(assert(`ctopo ${topo}/${cs} factor`, t.factor === k, t.factor, k));
        results.push(assert(`ctopo ${topo}/${cs} r_loop = k·R_c`, t.r_loop === k * 0.37, t.r_loop, k * 0.37, ' Ω'));
        results.push(assert(`ctopo ${topo}/${cs} echo`, t.topology === topo && t.current_case === cs,
          `${t.topology}/${t.current_case}`, `${topo}/${cs}`));
        const st = t.steps[0];
        results.push(assert(`ctopo ${topo}/${cs} step`,
          t.steps.length === 1 && st.key === 'total_cable_resistance' && st.result === t.r_loop
            && st.variables.k === k && st.variables.R_c === 0.37 && st.unit === 'Ω',
          JSON.stringify(st), `total_cable_resistance k = ${k}`));
      });
    });
    results.push(assert('ctopo √3 literal', SQRT3 === Math.sqrt(3), Math.sqrt(3), SQRT3));
    // √3 from the phasors: |I_own + I_return| for two currents 120° apart
    const ph = 2 * Math.PI / 3;
    const kPhasor = Math.hypot(2 + Math.cos(-ph), Math.sin(-ph));
    results.push(assert('ctopo four_wire 2-phase = |2 + e^{−j120°}|',
      approx(R.topology.four_wire.factors.two_phase, kPhasor, 1e-12), R.topology.four_wire.factors.two_phase, kPhasor));
    results.push(assert('ctopo registry has exactly four_wire + six_wire',
      Object.keys(R.topology).sort().join(',') === 'four_wire,six_wire',
      Object.keys(R.topology).join(','), 'four_wire,six_wire'));
    Object.values(R.topology).forEach((t) => {
      results.push(assert(`ctopo ${t.id} covers every current case`,
        Object.keys(t.factors).sort().join(',') === [...R.CURRENT_CASES].sort().join(','),
        Object.keys(t.factors).join(','), R.CURRENT_CASES.join(',')));
    });

    // Step labels and the registry listing
    const s4 = R.applyTopology(rc, 'four_wire', 'single_phase').steps[0];
    results.push(assert('ctopo four_wire step labels',
      s4.label_en === 'Total cable resistance (4-wire)' && s4.label_da === 'Total kabelmodstand (4-leder)',
      `${s4.label_en} / ${s4.label_da}`, '(4-wire) / (4-leder)'));
    const lt = R.listTopologies();
    const four = lt.find((t) => t.id === 'four_wire');
    results.push(assert('ctopo listTopologies four_wire',
      !!four && four.factor === 2 && four.label_en === '4-wire' && four.label_da === '4-leder'
        && four.factors.three_phase === 1 && four.factors.two_phase === SQRT3 && four.factors.single_phase === 2,
      JSON.stringify(four), 'four_wire, worst case ×2'));
    results.push(assert('ctopo listTopologies two entries', lt.length === 2, lt.length, 2));
    four.factors.three_phase = 99;   // a copy, not the registry
    results.push(assert('ctopo listTopologies returns copies', R.topology.four_wire.factors.three_phase === 1,
      R.topology.four_wire.factors.three_phase, 1));

    // lead(): four_wire on top of a method result
    const params = { material: 'cu', cross_section_mm2: 4, length_m: 150, temp_c: 75 };
    const base = R.calculate('iec60287', params);
    [['three_phase', 1], ['two_phase', SQRT3], ['single_phase', 2]].forEach(([cs, k]) => {
      const ld = R.lead('iec60287', params, 'four_wire', cs);
      results.push(assert(`ctopo lead four_wire/${cs}`,
        ld.topology === 'four_wire' && ld.current_case === cs && ld.factor === k
          && ld.r_conductor === base.r_conductor && ld.r_loop === k * base.r_conductor,
        `${ld.factor}/${ld.r_loop}`, `${k}/${k * base.r_conductor}`, ' Ω'));
    });

    // defaultTopology(calcType): six_wire for metering, four_wire for the rest (§9.8, D3)
    const CALC_TYPES = ['metering', 'overcurrent', 'busbar', 'generic', 'distance',
      'transformer_diff', 'line_diff', 'vt'];
    CALC_TYPES.forEach((ct) => {
      const exp = ct === 'metering' ? 'six_wire' : 'four_wire';
      results.push(assert(`ctopo defaultTopology(${ct})`, R.defaultTopology(ct) === exp, R.defaultTopology(ct), exp));
    });
    [undefined, null, '', 'Metering', 'unknown'].forEach((ct) => {
      results.push(assert(`ctopo defaultTopology(${JSON.stringify(ct)})`, R.defaultTopology(ct) === 'four_wire',
        R.defaultTopology(ct), 'four_wire'));
    });

    // resolveTopology(core, calcType): the core's wiring if known, else the calc type's default
    [
      [{ cable_topology: 'four_wire' }, 'metering', 'four_wire'],
      [{ cable_topology: 'six_wire' }, 'distance', 'six_wire'],
      [{ cable_topology: 'six_wire' }, 'vt', 'six_wire'],
      [{}, 'metering', 'six_wire'],
      [{}, 'vt', 'four_wire'],
      [{}, 'line_diff', 'four_wire'],
      [null, 'metering', 'six_wire'],
      [undefined, 'overcurrent', 'four_wire'],
      [{ cable_topology: 'three_wire' }, 'metering', 'six_wire'],
      [{ cable_topology: 'three_wire' }, 'busbar', 'four_wire'],
      [{ cable_topology: '' }, 'generic', 'four_wire'],
      [{ cable_topology: 'toString' }, 'metering', 'six_wire'],
      [{ cable_topology: 4 }, 'transformer_diff', 'four_wire'],
      [{ cable_topology: 'Four_Wire' }, 'metering', 'six_wire'],
    ].forEach(([core, ct, exp]) => {
      const got = R.resolveTopology(core, ct);
      results.push(assert(`ctopo resolveTopology(${JSON.stringify(core)}, ${ct})`, got === exp, got, exp));
    });
    results.push(assert('ctopo resolveTopology ignores commonData',
      R.resolveTopology({}, 'distance', { cable_topology: 'six_wire' }) === 'four_wire',
      R.resolveTopology({}, 'distance', { cable_topology: 'six_wire' }), 'four_wire'));

    // DEFAULT_TOPOLOGY stays six_wire: it is only applyTopology's fallback for a call
    // without a wiring; the modules pass resolveTopology(core, calcType) (§9.6 9E).
    results.push(assert('ctopo DEFAULT_TOPOLOGY six_wire (applyTopology fallback)', R.DEFAULT_TOPOLOGY === 'six_wire'
      && R.applyTopology(rc, undefined, 'three_phase').factor === 2, R.DEFAULT_TOPOLOGY, 'six_wire'));

    return results;
  }

  // ── CABLE-RESISTANCE TOOLBOX — `iec60287` method (calculation, default) ──
  function testCableResIec60287() {
    const results = [];
    const R = CTCableRes;
    const keysOf = (steps) => steps.map((s) => s.key).join(',');
    const KEYS = 'cable_r20,cable_resistance_at_temp,cable_r_conductor';
    const CU = 'Kobber (Cu)', AL = 'Aluminium (Al)';

    // Registry + D7 labels; the default method is listed first
    const m = R.methods.iec60287;
    results.push(assert('cres.iec registered',
      !!m && m.id === 'iec60287' && m.label_en === 'IEC 60287 (calculation)' && m.label_da === 'IEC 60287 (beregning)',
      m && `${m.id}/${m.label_en}/${m.label_da}`, 'iec60287/IEC 60287 (calculation)/IEC 60287 (beregning)'));
    const lm = R.listMethods();
    results.push(assert('cres.iec listMethods first (default)', lm[0].id === 'iec60287' &&
      lm[0].label_en === 'IEC 60287 (calculation)' && lm[0].label_da === 'IEC 60287 (beregning)',
      JSON.stringify(lm[0]), 'iec60287 row first'));
    const ids = lm.map((x) => x.id).join(',');
    results.push(assert('cres.iec listMethods ids', ids === 'iec60287,table', ids, 'iec60287,table'));
    [[{ cable_r_method: 'iec60287' }, 'iec60287'], [{}, 'iec60287'], [{ cable_r_method: 'nope' }, 'iec60287'],
      [{ cable_r_method: 'table' }, 'table']].forEach(([cd, exp]) => {
      const got = R.resolveMethod(cd);
      results.push(assert(`cres.iec resolveMethod ${JSON.stringify(cd)}`, got === exp, got, exp));
    });

    // R′20 = ρ20/A·1000 — the formula, not the table: Cu 4 mm² → 4.31025 (table 4.61)
    const c4 = R.calculate('iec60287', { material: 'cu', cross_section_mm2: 4, length_m: 65, temp_c: 75 });
    const eR20 = CTMaterials.COPPER_RESISTIVITY_20C / 4 * 1000;
    results.push(assert('cres.iec Cu 4 R′20 = ρ20/A·1000', c4.r20_per_km === eR20 && approx(eR20, 4.31025),
      c4.r20_per_km, 4.31025, ' Ω/km'));
    results.push(assert('cres.iec Cu 4 method/source/material',
      c4.method === 'iec60287' && c4.source === 'iec60287_formula' && c4.material === CU &&
      c4.material_name === 'Kobber' && c4.alpha === CTMaterials.COPPER_TEMP_COEFFICIENT,
      `${c4.method}/${c4.source}/${c4.material}`, `iec60287/iec60287_formula/${CU}`));
    results.push(assert('cres.iec Cu 4 no warning', c4.warnings.length === 0, c4.warnings.length, 0));
    const eRT = eR20 * (1 + CTMaterials.COPPER_TEMP_COEFFICIENT * 55);
    results.push(assert('cres.iec Cu 4 R′_T', approx(c4.r_per_km_at_temp, eRT), c4.r_per_km_at_temp, eRT, ' Ω/km'));
    // Same value as today's P1 one-conductor formula ρ20·(1+α(T−20))·L/A (Q-T1: within TOLERANCE)
    const eP1 = CTMaterials.COPPER_RESISTIVITY_20C * (1 + CTMaterials.COPPER_TEMP_COEFFICIENT * 55) * 65 / 4;
    results.push(assert('cres.iec Cu 4 R_c = ρ(T)·L/A', approx(c4.r_conductor, eP1), c4.r_conductor, eP1, ' Ω'));
    results.push(assert('cres.iec step keys', keysOf(c4.steps) === KEYS, keysOf(c4.steps), KEYS));
    results.push(assert('cres.iec steps bilingual + latex',
      c4.steps.every((s) => s.label_en && s.label_da && s.latex), 'missing', 'labels+latex'));
    const s0 = c4.steps[0];
    results.push(assert('cres.iec cable_r20 step',
      s0.result === eR20 && s0.unit === 'Ω/km' && s0.source === 'iec60287_formula' &&
      s0.label_en.includes('IEC 60287 formula') && s0.label_en.includes('copper') && s0.label_en.includes('4 mm²') &&
      s0.label_da.includes('IEC 60287-formel') && s0.label_da.includes('kobber'),
      JSON.stringify(s0), 'R′20 from the IEC 60287 formula'));

    // Aluminium (US spelling) and sizes the table lacks: always the formula, never a fallback
    [
      ['Al 6 mm²', 'Aluminum (Al)', 6, AL, CTMaterials.ALUMINUM_RESISTIVITY_20C, 'aluminium'],
      ['Al 1.0 mm²', 'al', 1.0, AL, CTMaterials.ALUMINUM_RESISTIVITY_20C, 'aluminium'],
      ['Cu 5 mm²', 'Copper (Cu)', 5, CU, CTMaterials.COPPER_RESISTIVITY_20C, 'copper'],
      ['Cu 300 mm²', '', 300, CU, CTMaterials.COPPER_RESISTIVITY_20C, 'copper'],
    ].forEach(([name, mat, A, eMat, rho20, en]) => {
      const r = R.calculate('iec60287', { material: mat, cross_section_mm2: A, length_m: 150, temp_c: 90 });
      const e = rho20 / A * 1000;
      results.push(assert(`cres.iec ${name}`,
        r.r20_per_km === e && r.material === eMat && r.source === 'iec60287_formula' &&
        r.warnings.length === 0 && r.steps[0].label_en.includes(en),
        `${r.r20_per_km}/${r.material}/${r.source}/${r.warnings.length}`, `${e}/${eMat}/iec60287_formula/0`));
    });

    // Differs from the table where the table has a value (Cu 50: table is +12.2 %)
    const i50 = R.calculate('iec60287', { material: 'cu', cross_section_mm2: 50, length_m: 100, temp_c: 20 });
    const t50 = R.calculate('table', { material: 'cu', cross_section_mm2: 50, length_m: 100, temp_c: 20 });
    results.push(assert('cres.iec Cu 50 vs table', approx(t50.r20_per_km / i50.r20_per_km, 1.122, 0.001),
      t50.r20_per_km / i50.r20_per_km, 1.122));
    // …and equals the table's formula fallback where the table has none (Cu 5)
    const i5 = R.calculate('iec60287', { material: 'cu', cross_section_mm2: 5, length_m: 65, temp_c: 75 });
    const t5 = R.calculate('table', { material: 'cu', cross_section_mm2: 5, length_m: 65, temp_c: 75 });
    results.push(assert('cres.iec Cu 5 = table fallback', i5.r_conductor === t5.r_conductor &&
      t5.source === 'iec60287_fallback', i5.r_conductor, t5.r_conductor, ' Ω'));

    // L = 0 → 0 Ω; T = 20 → R′_T = R′20
    const z = R.calculate('iec60287', { material: 'cu', cross_section_mm2: 4, length_m: 0, temp_c: 75 });
    results.push(assert('cres.iec L = 0 → 0 Ω', z.r_conductor === 0, z.r_conductor, 0, ' Ω'));
    const t20 = R.calculate('iec60287', { material: 'cu', cross_section_mm2: 4, length_m: 65, temp_c: 20 });
    results.push(assert('cres.iec T = 20 → R′_T = R′20', t20.r_per_km_at_temp === t20.r20_per_km,
      t20.r_per_km_at_temp, t20.r20_per_km));

    // lead(): topology on top, and the P1 loop (CTMaterials.calcWireResistance) within TOLERANCE
    const ld = R.lead('iec60287', { material: 'cu', cross_section_mm2: 4, length_m: 65, temp_c: 75 },
      'six_wire', 'three_phase');
    results.push(assert('cres.iec lead r_loop = 2·R_c', ld.r_loop === 2 * ld.r_conductor && ld.method === 'iec60287',
      ld.r_loop, 2 * ld.r_conductor, ' Ω'));
    results.push(assert('cres.iec lead step keys', keysOf(ld.steps) === `${KEYS},total_cable_resistance`,
      keysOf(ld.steps), `${KEYS},total_cable_resistance`));
    const p1 = CTMaterials.calcWireResistance('Kobber (Cu)', 75, 65, 4).r_wire;
    results.push(assert('cres.iec lead ≈ today\'s P1', approx(ld.r_loop, p1), ld.r_loop, p1, ' Ω'));

    // Guards still apply through the method
    let threw = false;
    try { R.calculate('iec60287', { material: 'cu', cross_section_mm2: 4, length_m: -1, temp_c: 75 }); }
    catch (e) { threw = e instanceof RangeError; }
    results.push(assert('cres.iec L < 0 → RangeError', threw, 'no throw', 'RangeError'));

    // ── Golden-vector backed (calc/golden/cable_resistance.json › iec60287
    //    ← materials.calculate_single_conductor_resistance) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.cable_resistance)
      ? CT_GOLDEN.cable_resistance : null;
    if (!G) return results;
    (G.iec60287 || []).forEach((c, i) => {
      const r = R.calculate('iec60287', c.input);
      const e = c.expected;
      const tag = `cres.iec golden #${i} (${JSON.stringify(c.input.material)} ${c.input.cross_section_mm2} mm² ` +
        `${c.input.temp_c} °C ${c.input.length_m} m)`;
      results.push(assert(`${tag} values`,
        r.material === e.material && r.alpha === e.alpha &&
        approx(r.r20_per_km, e.r20_per_km) && approx(r.r_per_km_at_temp, e.r_per_km_at_temp) &&
        approx(r.r_conductor, e.r_conductor) &&
        approx(r.r_conductor, r.r_per_km_at_temp * c.input.length_m / 1000),
        r.r_conductor, e.r_conductor, ' Ω'));
      results.push(assert(`${tag} source/warning/steps`,
        r.source === 'iec60287_formula' && r.warnings.length === 0 &&
        keysOf(r.steps) === KEYS && r.steps[0].result === r.r20_per_km && r.steps[2].result === r.r_conductor,
        `${r.source}/${r.warnings.length}`, 'iec60287_formula/0'));
    });

    return results;
  }

  // ── Modules on the cable-resistance toolbox (PORTING_PLAN.md §9.6 9C / 9E) ──
  // Hand checks shared by every migrated module. `calc(core, commonData)` is
  // the module's calculate; `core` carries Cu 4 mm², 65 m cable fields and no
  // wiring; the module evaluates `currentCase` (§9.8) and its wiring defaults
  // to defaultTopology(calcType).
  const CABLE_STEP_KEYS = 'cable_r20,cable_resistance_at_temp,cable_r_conductor,total_cable_resistance';
  function checkModuleCableRes(tag, calc, core, commonData, currentCase, calcType) {
    const results = [];
    const topo = CTCableRes.defaultTopology(calcType);
    const lead = (method, temp_c, A = 4, topology = topo) => CTCableRes.lead(method,
      { material: 'cu', cross_section_mm2: A, length_m: 65, temp_c }, topology, currentCase);

    // No project settings: iec60287 at 75 °C; the core's own cable_temp is ignored
    const d = calc({ ...core, cable_temp: 20 }, { ...commonData });
    const eD = lead('iec60287', 75);
    results.push(assert(`${tag} cable default iec60287 @ 75 °C, core.cable_temp ignored`,
      d.cable_res.method === 'iec60287' && d.Rc === eD.r_loop, d.Rc, eD.r_loop, ' Ω'));
    results.push(assert(`${tag} cable_res fields`,
      JSON.stringify(d.cable_res) === JSON.stringify({
        method: eD.method, source: eD.source, topology: topo, factor: CTCableRes.topology[topo].factors[currentCase],
        r_conductor: eD.r_conductor, r_loop: eD.r_loop, r20_per_km: eD.r20_per_km }),
      JSON.stringify(d.cable_res), `iec60287 / ${topo} / k = ${eD.factor}`));
    results.push(assert(`${tag} cable current case`, eD.current_case === currentCase,
      eD.current_case, currentCase));

    // Wiring (§9.6 9E): the core's cable_topology; an unknown id → the calc type's default
    const other = topo === 'six_wire' ? 'four_wire' : 'six_wire';
    const w = calc({ ...core, cable_topology: other }, { ...commonData });
    const eW = lead('iec60287', 75, 4, other);
    results.push(assert(`${tag} cable wiring ${other} from the core`,
      w.cable_res.topology === other && w.cable_res.factor === eW.factor && w.Rc === eW.r_loop
        && w.cable_res.r_conductor === eD.r_conductor,
      `${w.cable_res.topology} / ${w.Rc}`, `${other} / ${eW.r_loop}`, ' Ω'));
    const wU = calc({ ...core, cable_topology: 'three_wire' }, { ...commonData });
    results.push(assert(`${tag} cable unknown wiring → ${topo}`,
      wU.cable_res.topology === topo && wU.Rc === eD.r_loop, wU.cable_res.topology, topo));
    results.push(assert(`${tag} cable steps spliced first`,
      d.steps.slice(0, 4).map((x) => x.key).join(',') === CABLE_STEP_KEYS,
      d.steps.slice(0, 4).map((x) => x.key).join(','), CABLE_STEP_KEYS));

    // The project method and temperature are read from commonData
    const t = calc(core, { ...commonData, cable_r_method: 'table', cable_temp: 20 });
    const eT = lead('table', 20);
    results.push(assert(`${tag} cable project table @ 20 °C`,
      t.cable_res.method === 'table' && t.cable_res.source === 'iec60228_table' && t.Rc === eT.r_loop,
      t.Rc, eT.r_loop, ' Ω'));
    const u = calc(core, { ...commonData, cable_r_method: 'emf', cable_temp: 20 });
    results.push(assert(`${tag} cable unknown method → iec60287`,
      u.cable_res.method === 'iec60287' && u.Rc === lead('iec60287', 20).r_loop,
      u.cable_res.method, 'iec60287'));

    // Table fallback (5 mm² not in IEC 60228): labelled, and its warning reaches the module
    const f = calc({ ...core, cable_cross: 5 }, { ...commonData, cable_r_method: 'table', cable_temp: 75 });
    const eF = lead('table', 75, 5);
    const lastW = f.warnings[f.warnings.length - 1];
    results.push(assert(`${tag} cable table fallback`,
      f.cable_res.source === 'iec60287_fallback' && f.Rc === eF.r_loop
        && lastW === eF.warnings[0] && f.warnings.filter((w) => typeof w === 'string').length === 1,
      `${f.cable_res.source} / ${JSON.stringify(lastW)}`, `iec60287_fallback / ${JSON.stringify(eF.warnings[0])}`));
    return results;
  }

  // The wiring a by_method / by_topology golden case puts on the core (§9.6 9E).
  // by_method cases model the ctvt_dim ×2 (get_wiring_factor), so the core
  // gets that six_wire, as the golden's temperature goes into commonData.
  // by_topology cases (cable_res.current_case set) carry `cable_topology` only
  // when the core sets it; without it the module's default wiring applies.
  function goldenWiring(c) {
    const cr = c.expected.cable_res;
    if (cr.current_case === undefined) return { cable_topology: cr.topology };
    return c.input.cable_topology !== undefined ? { cable_topology: c.input.cable_topology } : {};
  }

  // by_topology for a module that takes the worst current case (1-phase, §9.8):
  // k = 2 with either wiring, so the default 4-wire case, the 6-wire case and
  // by_method case 1 (iec60287, ctvt_dim ×2) are the same Python numbers.
  function checkByTopologyUnchanged(tag, G) {
    const bt = G.by_topology || [];
    const ref = (G.by_method || [])[0];
    const same = (c) => ref && JSON.stringify({ ...c.expected, cable_res: null })
      === JSON.stringify({ ...ref.expected, cable_res: null });
    return [
      assert(`${tag} by_topology cases (default four_wire, six_wire)`,
        bt.length === 2 && bt[0].input.cable_topology === undefined && bt[0].expected.cable_res.topology === 'four_wire'
          && bt[1].input.cable_topology === 'six_wire' && bt.every((c) => c.expected.cable_res.factor === 2),
        bt.map((c) => `${c.input.cable_topology}→${c.expected.cable_res.topology}`).join(','), 'undefined→four_wire,six_wire→six_wire'),
      assert(`${tag} by_topology: 4-wire changes nothing (= by_method #0)`,
        bt.length === 2 && bt.every(same) && bt.every((c) => c.input.cable_resistance === ref.input.cable_resistance),
        bt.map((c) => c.input.cable_resistance).join(','), ref && ref.input.cable_resistance),
    ];
  }

  // by_method / by_topology golden case (§9.5): the module's cable_res equals
  // the Python reference the case injected, and Rc is that r_loop.
  function checkByMethodCableRes(tag, got, c) {
    const exp = c.expected.cable_res;
    const cr = got.cable_res || {};
    const res = [
      assert(`${tag} cable_res method/topology/factor`,
        cr.method === exp.method && cr.topology === exp.topology && cr.factor === exp.factor,
        `${cr.method}/${cr.topology}/${cr.factor}`, `${exp.method}/${exp.topology}/${exp.factor}`),
      assert(`${tag} R′20`, approx(cr.r20_per_km, exp.r20_per_km), cr.r20_per_km, exp.r20_per_km, ' Ω/km'),
      assert(`${tag} R_c`, approx(cr.r_conductor, exp.r_conductor), cr.r_conductor, exp.r_conductor, ' Ω'),
      assert(`${tag} Rc = r_loop ≈ injected`, got.Rc === cr.r_loop && approx(got.Rc, c.input.cable_resistance),
        got.Rc, c.input.cable_resistance, ' Ω'),
    ];
    if (exp.in_table !== undefined) {
      const src = exp.in_table ? 'iec60228_table' : 'iec60287_fallback';
      res.push(assert(`${tag} source`, cr.source === src, cr.source, src));
    }
    return res;
  }

  // ── OVERCURRENT ────────────────────────────────────────────────────────
  function testOvercurrent() {
    const results = [];

    // Reference case: Standard 400kV Distance CT used as overcurrent reference
    // Ip=2000A, Is=1A, rct=4Ω, Sn=30VA, SR=0.05VA, ALF=20, Isc=63000A
    // cable: 100m, 4mm², Cu, 20°C
    const core = {
      Is: 1, Ip: 2000, rct: 4, burden: 30, relay_burden: 0.05,
      alf: 20, is_px: false,
      cable_length: 100, cable_cross: 4, cable_mat: 'cu',
    };
    const cd = { isc_sys: 63, cable_r_method: 'iec60287', cable_temp: 20 };
    const r = CTOvercurrent.calculate(core, cd);

    // Rc = 2 × 0.017241 × 100 / 4 = 0.86205 Ω
    results.push(assert('OC Rc', approx(r.Rc, 0.86205), r.Rc, 0.86205, ' Ω'));
    // Rr = 0.05 / 1² = 0.05 Ω
    results.push(assert('OC Rr', approx(r.Rr, 0.05), r.Rr, 0.05, ' Ω'));
    // Rt = 4 + 0.86205 + 0.05 = 4.91205 Ω
    results.push(assert('OC Rt', approx(r.Rt, 4.91205), r.Rt, 4.91205, ' Ω'));
    // ALF_req = 63000 / 2000 = 31.5
    results.push(assert('OC ALF_req', approx(r.ALF_req, 31.5), r.ALF_req, 31.5));
    // Rn = 30 / 1² = 30 Ω
    results.push(assert('OC Rn', approx(r.Rn, 30), r.Rn, 30, ' Ω'));
    // ALF_act = 20 × (4 + 30) / (4 + 0.86205 + 0.05) = 20 × 34 / 4.91205 = 138.44...
    const expected_alf_act = 20 * (4 + 30) / (4 + 0.86205 + 0.05);
    results.push(assert('OC ALF_act', approx(r.ALF_act, expected_alf_act), r.ALF_act, expected_alf_act));
    // is_ok: 138.44 >= 31.5 → true
    results.push(assert('OC is_ok', r.is_ok === true, r.is_ok, true));

    // PX class: Vk=200V, Isc=10000A, Ip=2000A, Is=1A, rct=4Ω, cable 50m 4mm²
    const corePX = {
      Is: 1, Ip: 2000, rct: 4, burden: 30, relay_burden: 0.05,
      is_px: true, vk: 200,
      cable_length: 50, cable_cross: 4, cable_mat: 'cu',
    };
    const cdPX = { isc_sys: 10, cable_r_method: 'iec60287', cable_temp: 20 };
    const rPX = CTOvercurrent.calculate(corePX, cdPX);
    // ALF_act = Vk / (Is × (Rct + Rext)) = 200 / (1 × (4 + Rc_50m + 0.05))
    const Rc50 = 2 * 0.017241 * 50 / 4; // 2·ρ20·L/A, Cu at 20 °C
    const expected_px_alf = 200 / (1 * (4 + Rc50 + 0.05));
    results.push(assert('OC PX ALF_act', approx(rPX.ALF_act, expected_px_alf), rPX.ALF_act, expected_px_alf));

    // Cable resistance from CTCableRes (§9.6 9C): worst case, 1-phase (§9.8)
    results.push(...checkModuleCableRes('OC', CTOvercurrent.calculate,
      { ...core, cable_length: 65 }, { isc_sys: 63 }, 'single_phase', 'overcurrent'));

    // ── Golden-vector backed (calc/golden/overcurrent.json ← ct_overcurrent.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.overcurrent)
      ? CT_GOLDEN.overcurrent : null;
    if (!G) return results;

    (G.calculate_overcurrent || []).forEach((c, i) => {
      const cd = c.input.core_data;
      const cp = c.input.cable_params;
      const goldenCore = {
        rct: cd.rct, burden: cd.burden, Is: cd.secondary_current, Ip: cd.primary_current,
        alf: cd.alf, is_px: !!cd.is_px_class, vk: cd.vk_voltage,
        relay_burden: cd.relay_burden, Isc_max_override: cd.max_fault_current,
        cable_length: cp.length_m, cable_cross: cp.cross_mm2,
        cable_mat: cp.material.includes('(Al)') ? 'al' : 'cu',
      };
      // Zero-diff gate (§9.6): native method, the case's temperature as the project's
      const got = CTOvercurrent.calculate(goldenCore, { cable_r_method: 'iec60287', cable_temp: cp.temp_c });
      const exp = c.expected;

      results.push(assert(`OC golden #${i} status`, got.status === exp.status, got.status, exp.status));
      results.push(assert(`OC golden #${i} conclusion`,
        got.conclusion === exp.calculations.conclusion, got.conclusion, exp.calculations.conclusion));
      results.push(assert(`OC golden #${i} ALF_req`,
        approx(got.ALF_req, parseFloat(exp.calculations.required_alf)),
        got.ALF_req, parseFloat(exp.calculations.required_alf)));
      results.push(assert(`OC golden #${i} Rt`,
        approx(got.Rt, parseFloat(exp.calculations.total_secondary_resistance)),
        got.Rt, parseFloat(exp.calculations.total_secondary_resistance), ' Ω'));
      const expectedAlfAct = parseFloat(
        exp.calculations.actual_alf ?? exp.calculations.equivalent_alf_from_vk);
      results.push(assert(`OC golden #${i} ALF_act`,
        approx(got.ALF_act, expectedAlfAct), got.ALF_act, expectedAlfAct));
      results.push(assert(`OC golden #${i} warnings`,
        matchesExpected(got.warnings, exp.warnings),
        JSON.stringify(got.warnings), JSON.stringify(exp.warnings)));

      // steps spot-check: conclusion step mirrors the ALF verdict
      const conclusionStep = got.steps.find((s) => s.key === 'conclusion');
      results.push(assert(`OC golden #${i} steps.conclusion`,
        conclusionStep.is_ok === (exp.status === 'OK'), conclusionStep.is_ok, exp.status === 'OK'));
    });

    // ── by_method (§9.5): each core under each project method; by_topology
    //    (§9.6 9E): the default wiring and the other one ──
    const checkCableCase = (kind) => (c, i) => {
      const cd = c.input.core_data;
      const cp = c.input.cable_params;
      const tag = `OC ${kind} #${i} ${c.input.common_data.cable_r_method} ${c.expected.cable_res.topology}`;
      const got = CTOvercurrent.calculate({
        rct: cd.rct, burden: cd.burden, Is: cd.secondary_current, Ip: cd.primary_current,
        alf: cd.alf, is_px: !!cd.is_px_class, vk: cd.vk_voltage,
        relay_burden: cd.relay_burden, Isc_max_override: cd.max_fault_current,
        cable_length: cp.length_m, cable_cross: cp.cross_mm2, cable_mat: cp.material,
        ...goldenWiring(c),
      }, c.input.common_data);
      const exp = c.expected;
      results.push(...checkByMethodCableRes(tag, got, c));
      results.push(assert(`${tag} status`, got.status === exp.status, got.status, exp.status));
      results.push(assert(`${tag} Rt`,
        approx(got.Rt, parseFloat(exp.calculations.total_secondary_resistance)),
        got.Rt, parseFloat(exp.calculations.total_secondary_resistance), ' Ω'));
      const expectedAlfAct = parseFloat(
        exp.calculations.actual_alf ?? exp.calculations.equivalent_alf_from_vk);
      results.push(assert(`${tag} ALF_act`, approx(got.ALF_act, expectedAlfAct), got.ALF_act, expectedAlfAct));
      results.push(assert(`${tag} warnings`, matchesExpected(got.warnings, exp.warnings),
        JSON.stringify(got.warnings), JSON.stringify(exp.warnings)));
    };
    (G.by_method || []).forEach(checkCableCase('by_method'));
    (G.by_topology || []).forEach(checkCableCase('by_topology'));
    results.push(...checkByTopologyUnchanged('OC', G));
    if (G.by_method) {
      // Case 1 is chosen so the method flips the verdict.
      const st = G.by_method.slice(0, 2).map((c) => `${c.input.common_data.cable_r_method}:${c.expected.status}`).join(',');
      results.push(assert('OC by_method verdict differs by method',
        st === 'iec60287:OK,table:NOT_OK', st, 'iec60287:OK,table:NOT_OK'));
    }

    // ── satCurve tests: verify curve uses correct Is and all points fit ──
    (G.calculate_overcurrent || []).forEach((c, i) => {
      const cd = c.input.core_data;
      const cp = c.input.cable_params;
      const goldenCore = {
        rct: cd.rct, burden: cd.burden, Is: cd.secondary_current, Ip: cd.primary_current,
        alf: cd.alf, is_px: !!cd.is_px_class, vk: cd.vk_voltage,
        relay_burden: cd.relay_burden, Isc_max_override: cd.max_fault_current,
        cable_length: cp.length_m, cable_cross: cp.cross_mm2,
        cable_mat: cp.material.includes('(Al)') ? 'al' : 'cu',
      };
      const result = CTOvercurrent.calculate(goldenCore, { cable_r_method: 'iec60287', cable_temp: cp.temp_c });
      const curve = CTOvercurrent.satCurve(result);

      // Curve should not be empty
      results.push(assert(`OC satCurve #${i} not empty`, curve.length > 0, curve.length, '> 0'));

      if (curve.length > 0) {
        const lastPt = curve[curve.length - 1];
        const maxDataE = Math.max(lastPt.e, result.Esat, result.Esat_req);

        // Last curve point's E should be >= max(Esat, Esat_req) with 10% headroom buffer
        results.push(assert(`OC satCurve #${i} last.e >= max(Esat, Esat_req)`,
          lastPt.e >= maxDataE * 0.95, // Allow for floating-point rounding
          lastPt.e, maxDataE, ' V'));

        // Verify Esat lies on the curve: e = alf * Is * Rt at alf = ALF_act
        const calculatedEsat = result.ALF_act * result.Is * result.Rt;
        results.push(assert(`OC satCurve #${i} Esat = ALF_act * Is * Rt`,
          approx(result.Esat, calculatedEsat),
          result.Esat, calculatedEsat, ' V'));

        // Interpolate the curve at ALF_act to verify Esat is consistent
        // Find the two curve points bracketing ALF_act
        const alfAct = result.ALF_act;
        let lower = 0, upper = curve.length - 1;
        for (let j = 0; j < curve.length - 1; j++) {
          if (curve[j].alf <= alfAct && curve[j + 1].alf >= alfAct) {
            lower = j;
            upper = j + 1;
            break;
          }
        }
        const p0 = curve[lower], p1 = curve[upper];
        const t = (alfAct - p0.alf) / (p1.alf - p0.alf);
        const interpE = p0.e + t * (p1.e - p0.e);
        // Interpolated E should match Esat within 0.5% tolerance
        results.push(assert(`OC satCurve #${i} Esat on interpolated curve`,
          approx(result.Esat, interpE),
          result.Esat, interpE, ' V'));
      }
    });

    return results;
  }

  // ── METERING ───────────────────────────────────────────────────────────
  function testMetering() {
    const results = [];

    // Reference: Metering CT from Excel verification
    // Ip=1000A, Is=1A, rct=2Ω, Sn=5VA, Fs=5, Smin%=25, Fmin=5
    // cable: 50m, 4mm², Cu, 20°C, device_burden=0
    const core = {
      Is: 1, Ip: 1000, rct: 2, burden: 5,
      fs_factor: 5, min_safety_factor: 5, min_burden_percent: 25,
      device_burden: 0, attached_resistor: 0,
      cable_length: 50, cable_cross: 4, cable_mat: 'cu',
    };
    const r = CTMetering.calculate(core, { cable_r_method: 'iec60287', cable_temp: 20 });

    const Rc = 2 * 0.017241 * 50 / 4; // 2·ρ20·L/A, Cu at 20 °C
    // S_lead = 1² × Rc
    results.push(assert('MT S_lead', approx(r.S_lead, Rc), r.S_lead, Rc, ' VA'));
    // S_in = 2 × 1² = 2 VA
    results.push(assert('MT S_in', approx(r.S_in, 2), r.S_in, 2, ' VA'));
    // S_min = 0.25 × 5 = 1.25 VA
    results.push(assert('MT S_min', approx(r.S_min, 1.25), r.S_min, 1.25, ' VA'));
    // S_total = 0 + S_lead + 0
    results.push(assert('MT S_total', approx(r.S_total, Rc), r.S_total, Rc, ' VA'));
    // Fsa = 5 × (2 + 5) / (2 + S_total)
    const expected_fsa = 5 * (2 + 5) / (2 + Rc);
    results.push(assert('MT Fsa', approx(r.Fsa, expected_fsa), r.Fsa, expected_fsa));
    // cond1: 5 > S_total > 1.25 — S_lead < 5 and S_lead > 1.25 → depends on cable
    results.push(assert('MT ct_ratio', r.ct_ratio === 1000, r.ct_ratio, 1000));
    // Fmin, the Summary's "Fmin req" card (buildMetrics, PORTING_PLAN.md §10.6 F-SUM)
    results.push(assert('MT min_safety_factor (Fmin) in result', r.min_safety_factor === 5,
      r.min_safety_factor, 5));
    results.push(assert('MT min_safety_factor default',
      CTMetering.calculate({ ...core, min_safety_factor: undefined }, {}).min_safety_factor === 5,
      CTMetering.calculate({ ...core, min_safety_factor: undefined }, {}).min_safety_factor, 5));

    // Cable resistance from CTCableRes (§9.6 9C): balanced 3-phase load (§9.8)
    results.push(...checkModuleCableRes('MT', CTMetering.calculate,
      { ...core, cable_length: 65 }, {}, 'three_phase', 'metering'));

    // ── Golden-vector backed (calc/golden/metering.json ← ct_metering.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.metering)
      ? CT_GOLDEN.metering : null;
    if (!G) return results;

    (G.calculate_metering || []).forEach((c, i) => {
      const cd = c.input.core_data;
      const cp = c.input.cable_params;
      const goldenCore = {
        rct: cd.rct, burden: cd.burden, Is: cd.secondary_current, Ip: cd.primary_current,
        fs_factor: cd.fs_factor, min_burden_percent: cd.min_burden_percent,
        min_safety_factor: cd.min_safety_factor, attached_resistor: cd.attached_resistor,
        device_burden: cd.device_burden,
        cable_length: cp.length_m, cable_cross: cp.cross_mm2,
        cable_mat: cp.material.includes('(Al)') ? 'al' : 'cu',
      };
      // Zero-diff gate (§9.6): native method, the case's temperature as the project's
      const got = CTMetering.calculate(goldenCore, { cable_r_method: 'iec60287', cable_temp: cp.temp_c });
      const exp = c.expected;

      results.push(assert(`MT golden #${i} status`, got.status === exp.status, got.status, exp.status));
      results.push(assert(`MT golden #${i} conclusion`,
        got.conclusion === exp.calculations.conclusion, got.conclusion, exp.calculations.conclusion));
      results.push(assert(`MT golden #${i} S_total`,
        approx(got.S_total, parseFloat(exp.calculations.total_connected_burden_s)),
        got.S_total, parseFloat(exp.calculations.total_connected_burden_s), ' VA'));
      results.push(assert(`MT golden #${i} S_min`,
        approx(got.S_min, parseFloat(exp.calculations.minimum_required_burden_s_min)),
        got.S_min, parseFloat(exp.calculations.minimum_required_burden_s_min), ' VA'));
      results.push(assert(`MT golden #${i} Fsa`,
        approx(got.Fsa, parseFloat(exp.calculations.effective_safety_factor_fsa)),
        got.Fsa, parseFloat(exp.calculations.effective_safety_factor_fsa)));
      results.push(assert(`MT golden #${i} warnings`,
        matchesExpected(got.warnings, exp.warnings),
        JSON.stringify(got.warnings), JSON.stringify(exp.warnings)));

      // steps spot-check: cond1 step mirrors the burden-check verdict
      const cond1Step = got.steps.find((s) => s.key === 'cond1');
      results.push(assert(`MT golden #${i} steps.cond1`,
        cond1Step.is_ok === (exp.calculations.condition_1_burden_check === 'OK'),
        cond1Step.is_ok, exp.calculations.condition_1_burden_check === 'OK'));
    });

    // ── by_method (§9.5) / by_topology (§9.6 9E): the toolbox lead() equals
    // the Python reference the case fed to calculate_metering, and CTMetering
    // under the project method and the case's wiring reproduces
    // calculate_metering's output.
    const checkCableCase = (kind) => (c, i) => {
      const cp = c.input.cable_params;
      const cd = c.input.common_data;
      const exp = c.expected.cable_res;
      const tag = `MT ${kind} #${i} ${cd.cable_r_method} ${exp.topology}`;
      const got = CTCableRes.lead(cd.cable_r_method,
        { material: cp.material, cross_section_mm2: cp.cross_mm2, length_m: cp.length_m,
          temp_c: cd.cable_temp }, exp.topology, 'three_phase');
      results.push(assert(`${tag} method/topology/factor`,
        got.method === exp.method && got.topology === exp.topology && got.factor === exp.factor,
        `${got.method}/${got.topology}/${got.factor}`, `${exp.method}/${exp.topology}/${exp.factor}`));
      results.push(assert(`${tag} R′20`, approx(got.r20_per_km, exp.r20_per_km),
        got.r20_per_km, exp.r20_per_km, ' Ω/km'));
      results.push(assert(`${tag} R_c`, approx(got.r_conductor, exp.r_conductor),
        got.r_conductor, exp.r_conductor, ' Ω'));
      results.push(assert(`${tag} r_loop`, approx(got.r_loop, exp.r_loop), got.r_loop, exp.r_loop, ' Ω'));
      results.push(assert(`${tag} r_loop = injected cable_resistance`,
        exp.r_loop === c.input.cable_resistance, exp.r_loop, c.input.cable_resistance, ' Ω'));
      if (exp.in_table !== undefined) {
        const src = exp.in_table ? 'iec60228_table' : 'iec60287_fallback';
        results.push(assert(`${tag} source`, got.source === src, got.source, src));
      }

      const k = c.input.core_data;
      const m = CTMetering.calculate({
        rct: k.rct, burden: k.burden, Is: k.secondary_current, Ip: k.primary_current,
        fs_factor: k.fs_factor, min_burden_percent: k.min_burden_percent,
        min_safety_factor: k.min_safety_factor, attached_resistor: k.attached_resistor,
        device_burden: k.device_burden,
        cable_length: cp.length_m, cable_cross: cp.cross_mm2, cable_mat: cp.material,
        ...goldenWiring(c),
      }, cd);
      const e = c.expected;
      results.push(...checkByMethodCableRes(`${tag} CTMetering`, m, c));
      results.push(assert(`${tag} CTMetering status`, m.status === e.status, m.status, e.status));
      results.push(assert(`${tag} CTMetering S_total`,
        approx(m.S_total, parseFloat(e.calculations.total_connected_burden_s)),
        m.S_total, parseFloat(e.calculations.total_connected_burden_s), ' VA'));
      results.push(assert(`${tag} CTMetering Fsa`,
        approx(m.Fsa, parseFloat(e.calculations.effective_safety_factor_fsa)),
        m.Fsa, parseFloat(e.calculations.effective_safety_factor_fsa)));
      results.push(assert(`${tag} CTMetering warnings`, matchesExpected(m.warnings, e.warnings),
        JSON.stringify(m.warnings), JSON.stringify(e.warnings)));
    };
    (G.by_method || []).forEach(checkCableCase('by_method'));
    (G.by_topology || []).forEach(checkCableCase('by_topology'));
    // by_topology: the default wiring is 6-wire (= by_method #0, the ctvt_dim ×2);
    // 4-wire on the core gives k = 1 for the balanced load, half the lead resistance.
    const btM = G.by_topology || [];
    const refM = (G.by_method || [])[0];
    results.push(assert('MT by_topology: default six_wire = by_method #0, four_wire = half',
      btM.length === 2 && btM[0].input.cable_topology === undefined && btM[0].expected.cable_res.topology === 'six_wire'
        && JSON.stringify({ ...btM[0].expected, cable_res: null }) === JSON.stringify({ ...refM.expected, cable_res: null })
        && btM[1].input.cable_topology === 'four_wire' && btM[1].expected.cable_res.factor === 1
        && btM[1].input.cable_resistance * 2 === btM[0].input.cable_resistance,
      btM.map((c) => `${c.expected.cable_res.topology}:${c.input.cable_resistance}`).join(','), 'six_wire:R, four_wire:R/2'));
    if (G.by_method) {
      // Both cases are chosen so the method flips the verdict (Cu: table
      // above the formula, Al 6 mm²: table below it, so the flip reverses).
      const st = G.by_method.map((c) => `${c.input.common_data.cable_r_method}:${c.expected.status}`).join(',');
      const want = 'iec60287:NOT_OK,table:OK,iec60287:OK,table:NOT_OK';
      results.push(assert('MT by_method verdict differs by method', st === want, st, want));
    }

    return results;
  }

  // ── BUSBAR ─────────────────────────────────────────────────────────────
  function testBusbar() {
    const results = [];

    // Reference: Busbar from Excel verification
    // Ip=2000A, Is=1A, rct=4Ω, Sn=30VA, ALF=20, SR=0.02VA
    // cable: 30m, 4mm², Cu, 20°C, Isc=40kA
    const core = {
      Is: 1, Ip: 2000, rct: 4, burden: 30, alf: 20, relay_burden: 0.02,
      cable_length: 30, cable_cross: 4, cable_mat: 'cu',
    };
    const cd = { isc_sys: 40, cable_r_method: 'iec60287', cable_temp: 20 };
    const r  = CTBusbar.calculate(core, cd);

    const Rc = 2 * 0.017241 * 30 / 4; // 2·ρ20·L/A, Cu at 20 °C
    // S_in = 1² × 4 = 4 VA
    results.push(assert('BB S_in', approx(r.S_in, 4), r.S_in, 4, ' VA'));
    // S_a = 1² × Rc + 0.02
    const expected_sa = Rc + 0.02;
    results.push(assert('BB S_a', approx(r.S_a, expected_sa), r.S_a, expected_sa, ' VA'));
    // F_a = 20 × (4 + 30) / (4 + S_a)
    const expected_fa = 20 * (4 + 30) / (4 + expected_sa);
    results.push(assert('BB F_a', approx(r.f_a, expected_fa), r.f_a, expected_fa));
    // fault_ratio = 40000 / 2000 = 20
    results.push(assert('BB fault_ratio', approx(r.fault_ratio, 20), r.fault_ratio, 20));
    // check1: 30 > S_a ✓
    results.push(assert('BB check1', r.check1 === true, r.check1, true));

    // Cable resistance from CTCableRes (§9.6 9C): worst case, 1-phase (§9.8),
    // in both branches
    results.push(...checkModuleCableRes('BB', CTBusbar.calculate,
      { ...core, cable_length: 65 }, { isc_sys: 40 }, 'single_phase', 'busbar'));
    results.push(...checkModuleCableRes('BB PX', CTBusbar.calculate,
      { ...core, cable_length: 65, is_px: true, vk: 200 }, { isc_sys: 40 }, 'single_phase', 'busbar'));

    // ── Golden-vector backed (calc/golden/busbar.json ← ct_busbar.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.busbar)
      ? CT_GOLDEN.busbar : null;
    if (!G) return results;

    (G.calculate_busbar || []).forEach((c, i) => {
      const common = c.input.common_data;
      const cd = c.input.core_data;
      const cp = c.input.cable_params;
      const goldenCore = {
        rct: cd.rct, burden: cd.burden, Is: cd.secondary_current, Ip: cd.primary_current,
        alf: cd.alf, is_px: !!cd.is_px_class, vk: cd.vk_voltage,
        relay_burden: cd.relay_burden,
        cable_length: cp.length_m, cable_cross: cp.cross_mm2,
        cable_mat: cp.material.includes('(Al)') ? 'al' : 'cu',
      };
      // Zero-diff gate (§9.6): native method, the case's temperature as the project's
      const goldenCommon = { isc_sys: common.short_circuit_ka, tp: common.primary_time_constant,
        cable_r_method: 'iec60287', cable_temp: cp.temp_c };
      const got = CTBusbar.calculate(goldenCore, goldenCommon);
      const exp = c.expected;

      results.push(assert(`BB golden #${i} status`, got.status === exp.status, got.status, exp.status));
      results.push(assert(`BB golden #${i} conclusion`,
        got.conclusion === exp.calculations.conclusion, got.conclusion, exp.calculations.conclusion));
      results.push(assert(`BB golden #${i} warnings`,
        matchesExpected(got.warnings, exp.warnings),
        JSON.stringify(got.warnings), JSON.stringify(exp.warnings)));

      if (cd.is_px_class) {
        results.push(assert(`BB golden #${i} e_internal`,
          approx(got.e_internal, parseFloat(exp.calculations.emf_internal_fault)),
          got.e_internal, parseFloat(exp.calculations.emf_internal_fault), ' V'));
        results.push(assert(`BB golden #${i} e_through`,
          approx(got.e_through, parseFloat(exp.calculations.emf_through_fault)),
          got.e_through, parseFloat(exp.calculations.emf_through_fault), ' V'));
        results.push(assert(`BB golden #${i} vk_required`,
          approx(got.vk_required, parseFloat(exp.calculations.required_knee_point_voltage_vk)),
          got.vk_required, parseFloat(exp.calculations.required_knee_point_voltage_vk), ' V'));
      } else {
        results.push(assert(`BB golden #${i} S_in`,
          approx(got.S_in, parseFloat(exp.calculations.internal_burden_s_in)),
          got.S_in, parseFloat(exp.calculations.internal_burden_s_in), ' VA'));
        results.push(assert(`BB golden #${i} S_a`,
          approx(got.S_a, parseFloat(exp.calculations.actual_burden_s_a)),
          got.S_a, parseFloat(exp.calculations.actual_burden_s_a), ' VA'));
        results.push(assert(`BB golden #${i} f_a`,
          approx(got.f_a, parseFloat(exp.calculations.operating_alf_f_a)),
          got.f_a, parseFloat(exp.calculations.operating_alf_f_a)));
      }

      // steps spot-check: conclusion step mirrors the overall verdict
      const conclusionStep = got.steps.find((s) => s.key === 'conclusion');
      results.push(assert(`BB golden #${i} steps.conclusion`,
        conclusionStep?.is_ok === got.is_ok, conclusionStep?.is_ok, got.is_ok));
    });

    // ── by_method (§9.5): each core under each project method; by_topology
    //    (§9.6 9E): the default wiring and the other one ──
    const checkCableCase = (kind) => (c, i) => {
      const common = c.input.common_data;
      const cd = c.input.core_data;
      const cp = c.input.cable_params;
      const tag = `BB ${kind} #${i} ${common.cable_r_method} ${c.expected.cable_res.topology}`;
      const got = CTBusbar.calculate({
        rct: cd.rct, burden: cd.burden, Is: cd.secondary_current, Ip: cd.primary_current,
        alf: cd.alf, is_px: !!cd.is_px_class, vk: cd.vk_voltage, relay_burden: cd.relay_burden,
        cable_length: cp.length_m, cable_cross: cp.cross_mm2, cable_mat: cp.material,
        ...goldenWiring(c),
      }, { isc_sys: common.short_circuit_ka, tp: common.primary_time_constant,
        cable_r_method: common.cable_r_method, cable_temp: common.cable_temp });
      const exp = c.expected;
      results.push(...checkByMethodCableRes(tag, got, c));
      results.push(assert(`${tag} status`, got.status === exp.status, got.status, exp.status));
      results.push(assert(`${tag} warnings`, matchesExpected(got.warnings, exp.warnings),
        JSON.stringify(got.warnings), JSON.stringify(exp.warnings)));
      if (cd.is_px_class) {
        results.push(assert(`${tag} vk_required`,
          approx(got.vk_required, parseFloat(exp.calculations.required_knee_point_voltage_vk)),
          got.vk_required, parseFloat(exp.calculations.required_knee_point_voltage_vk), ' V'));
      } else {
        results.push(assert(`${tag} S_a`,
          approx(got.S_a, parseFloat(exp.calculations.actual_burden_s_a)),
          got.S_a, parseFloat(exp.calculations.actual_burden_s_a), ' VA'));
        results.push(assert(`${tag} f_a`,
          approx(got.f_a, parseFloat(exp.calculations.operating_alf_f_a)),
          got.f_a, parseFloat(exp.calculations.operating_alf_f_a)));
      }
    };
    (G.by_method || []).forEach(checkCableCase('by_method'));
    (G.by_topology || []).forEach(checkCableCase('by_topology'));
    results.push(...checkByTopologyUnchanged('BB', G));
    if (G.by_method) {
      // Both cases are chosen so the method flips the verdict.
      const st = G.by_method.map((c) => `${c.input.common_data.cable_r_method}:${c.expected.status}`).join(',');
      const want = 'iec60287:OK,table:NOT_OK,iec60287:OK,table:NOT_OK,iec60287:NOT_OK,table:OK';
      results.push(assert('BB by_method verdict differs by method', st === want, st, want));
    }

    return results;
  }

  // ── GENERIC ────────────────────────────────────────────────────────────
  function testGeneric() {
    const results = [];

    // Standard ALF branch: Ip=2000A, Is=1A, rct=4Ω, Sn=30VA, ALF=20
    // cable: 100m, 4mm², Cu, 20°C
    const core = {
      Is: 1, rct: 4, burden: 30, alf: 20,
      cable_length: 100, cable_cross: 4, cable_mat: 'cu',
    };
    const cd = { cable_r_method: 'iec60287', cable_temp: 20 };
    const r = CTGeneric.calculate(core, cd);

    // Rn = 30 / 1² = 30 Ω
    results.push(assert('GEN Rn', approx(r.Rn, 30), r.Rn, 30, ' Ω'));
    // Rc = 2 × 0.017241 × 100 / 4 = 0.86205 Ω
    results.push(assert('GEN Rc', approx(r.Rc, 0.86205), r.Rc, 0.86205, ' Ω'));
    // ALF_act = 20 × (4 + 30) / (4 + 0.86205) = 139.86...
    const expected_alf = 20 * (4 + 30) / (4 + 0.86205);
    results.push(assert('GEN alf_actual', approx(r.alf_actual, expected_alf), r.alf_actual, expected_alf));
    // EALF = 20 × 1 × (4 + 30) = 680 V
    results.push(assert('GEN ealf', approx(r.ealf, 680), r.ealf, 680, ' V'));
    results.push(assert('GEN is_ok', r.is_ok === true, r.is_ok, true));

    // PX branch: Vk=200V, Is=1A, rct=4Ω, cable 50m 4mm²
    const corePX = {
      Is: 1, rct: 4, is_px: true, vk: 200,
      cable_length: 50, cable_cross: 4, cable_mat: 'cu',
    };
    const rPX = CTGeneric.calculate(corePX, cd);
    const Rc50 = 2 * 0.017241 * 50 / 4; // 2·ρ20·L/A, Cu at 20 °C
    const expected_px_alf = 200 / (1 * (4 + Rc50));
    results.push(assert('GEN PX alf_actual', approx(rPX.alf_actual, expected_px_alf), rPX.alf_actual, expected_px_alf));

    // Cable resistance from CTCableRes (§9.6 9C): worst case, 1-phase (§9.8),
    // in both branches
    results.push(...checkModuleCableRes('GEN', CTGeneric.calculate,
      { ...core, cable_length: 65 }, {}, 'single_phase', 'generic'));
    results.push(...checkModuleCableRes('GEN PX', CTGeneric.calculate,
      { ...corePX, cable_length: 65 }, {}, 'single_phase', 'generic'));

    // ── Golden-vector backed (calc/golden/generic.json ← ct_generic.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.generic)
      ? CT_GOLDEN.generic : null;
    if (!G) return results;

    (G.calculate_generic_protection || []).forEach((c, i) => {
      const cd = c.input.core_data;
      const cp = c.input.cable_params;
      const goldenCore = {
        rct: cd.rct, burden: cd.burden, Is: cd.secondary_current,
        alf: cd.alf, is_px: !!cd.is_px_class, vk: cd.vk_voltage,
        cable_length: cp.length_m, cable_cross: cp.cross_mm2,
        cable_mat: cp.material.includes('(Al)') ? 'al' : 'cu',
      };
      // Zero-diff gate (§9.6): native method, the case's temperature as the project's
      const got = CTGeneric.calculate(goldenCore, { cable_r_method: 'iec60287', cable_temp: cp.temp_c });
      const exp = c.expected;

      results.push(assert(`GEN golden #${i} status`, got.status === exp.status, got.status, exp.status));
      results.push(assert(`GEN golden #${i} conclusion`,
        got.conclusion === exp.calculations.conclusion, got.conclusion, exp.calculations.conclusion));
      results.push(assert(`GEN golden #${i} warnings`,
        matchesExpected(got.warnings, exp.warnings),
        JSON.stringify(got.warnings), JSON.stringify(exp.warnings)));
      const expectedAlfActual = parseFloat(
        exp.calculations.actual_alf ?? exp.calculations.equivalent_alf_from_vk);
      results.push(assert(`GEN golden #${i} alf_actual`,
        approx(got.alf_actual, expectedAlfActual), got.alf_actual, expectedAlfActual));

      // steps spot-check: conclusion step mirrors the overall verdict
      const conclusionStep = got.steps.find((s) => s.key === 'conclusion');
      results.push(assert(`GEN golden #${i} steps.conclusion`,
        conclusionStep?.is_ok === got.is_ok, conclusionStep?.is_ok, got.is_ok));
    });

    // ── by_method (§9.5): each core under each project method; by_topology
    //    (§9.6 9E): the default wiring and the other one ──
    const checkCableCase = (kind) => (c, i) => {
      const cd = c.input.core_data;
      const cp = c.input.cable_params;
      const tag = `GEN ${kind} #${i} ${c.input.common_data.cable_r_method} ${c.expected.cable_res.topology}`;
      const got = CTGeneric.calculate({
        rct: cd.rct, burden: cd.burden, Is: cd.secondary_current,
        alf: cd.alf, is_px: !!cd.is_px_class, vk: cd.vk_voltage,
        cable_length: cp.length_m, cable_cross: cp.cross_mm2, cable_mat: cp.material,
        ...goldenWiring(c),
      }, c.input.common_data);
      const exp = c.expected;
      results.push(...checkByMethodCableRes(tag, got, c));
      results.push(assert(`${tag} status`, got.status === exp.status, got.status, exp.status));
      results.push(assert(`${tag} total_ext`,
        approx(got.total_ext, parseFloat(exp.calculations.total_external_resistance)),
        got.total_ext, parseFloat(exp.calculations.total_external_resistance), ' Ω'));
      const expectedAlfActual = parseFloat(
        exp.calculations.actual_alf ?? exp.calculations.equivalent_alf_from_vk);
      results.push(assert(`${tag} alf_actual`,
        approx(got.alf_actual, expectedAlfActual), got.alf_actual, expectedAlfActual));
      results.push(assert(`${tag} warnings`, matchesExpected(got.warnings, exp.warnings),
        JSON.stringify(got.warnings), JSON.stringify(exp.warnings)));
    };
    (G.by_method || []).forEach(checkCableCase('by_method'));
    (G.by_topology || []).forEach(checkCableCase('by_topology'));
    results.push(...checkByTopologyUnchanged('GEN', G));
    if (G.by_method) {
      // Both cases are chosen so the method flips the verdict; in case 2
      // (Al 6 mm²) IEC 60228 is below the formula, so the flip is reversed.
      const st = G.by_method.map((c) => `${c.input.common_data.cable_r_method}:${c.expected.status}`).join(',');
      const want = 'iec60287:OK,table:NOT_OK,iec60287:NOT_OK,table:OK';
      results.push(assert('GEN by_method verdict differs by method', st === want, st, want));
    }

    return results;
  }

  // ── DISTANCE ───────────────────────────────────────────────────────────
  // ── DISTANCE MAIN (composed CTDistance.calculate, calc/distance/main.js) ──
  // The full-fidelity composition entry: data → cable_resistance → relay →
  // fault_calculation → transient_factors → knee_point → auto_reclosure_ext.
  // Pinned against calc/golden/distance_main.json (← ct_distance/main.py's
  // calculate_distance_protection — status/warnings count authoritative, the
  // intermediate scalars re-derived from the same public sub-calls).
  function testDistanceMain() {
    const results = [];

    // Hand-derived sanity check: lookup-table Ktd path, comfortably passing.
    // Tp=100ms → ktd_a=4; ALF=20, Is=1, rct=4, Sn=30 → EALF = 20×1×(4+30) = 680 V.
    const core0 = {
      Is: 1, Ip: 2000, rct: 4, burden: 30, relay_burden: 0.1, alf: 20,
      tp: 100, zone1_setting: 0.85, cable_length: 65, cable_cross: 4,
      cable_temp: 75, cable_material: 'Kobber (Cu)',
    };
    const cd0 = {
      isc_sys: 20, voltage: 132, freq: 50,
      remote_end: { R_L_per_km: 0.0423, X_L_per_km: 0.203, lL: 6.4 },
    };
    const r0 = CTDistance.calculate(core0, cd0);
    results.push(assert('DISTMAIN ktd_a', r0.ktd_a === 4, r0.ktd_a, 4));
    results.push(assert('DISTMAIN EALF', approx(r0.EALF, 680), r0.EALF, 680, ' V'));
    results.push(assert('DISTMAIN EALF alias', r0.EALF === r0.ealf, r0.EALF, r0.ealf));
    results.push(assert('DISTMAIN Vk_req alias', r0.Vk_req === r0.vk_required, r0.Vk_req, r0.vk_required));
    // The Summary panel's Ktd and ωTp cards (ctsizer-panels.jsx buildMetrics, PORTING_PLAN.md §10.6 F-SUM)
    results.push(assert('DISTMAIN Ktd_a / omega_Tp aliases',
      r0.Ktd_a === r0.ktd_a && r0.omega_Tp === r0.omega_tp && Number.isFinite(r0.omega_Tp),
      `${r0.Ktd_a} / ${r0.omega_Tp}`, `${r0.ktd_a} / ${r0.omega_tp}`));
    // Rc: the lead resistance the AR canvas reads (PORTING_PLAN.md §9.4).
    results.push(assert('DISTMAIN Rc alias', r0.Rc === r0.r_lead && r0.Rc > 0, r0.Rc, r0.r_lead, ' Ω'));
    results.push(assert('DISTMAIN status OK', r0.status === 'OK', r0.status, 'OK'));
    results.push(assert('DISTMAIN is_ok', r0.is_ok === true, r0.is_ok, true));

    // Cable resistance from CTCableRes (PORTING_PLAN.md §9.6 9C): the shared
    // module hand checks, for the default 1-phase fault and for a 3-phase one.
    results.push(...checkModuleCableRes('DISTMAIN', CTDistance.calculate, core0, cd0, 'single_phase', 'distance'));
    results.push(...checkModuleCableRes('DISTMAIN 3-phase', CTDistance.calculate,
      { ...core0, fault_type: '3-phase' }, cd0, 'three_phase', 'distance'));
    results.push(assert('DISTMAIN Rc = r_lead = cable_res.r_loop',
      r0.Rc === r0.r_lead && r0.r_lead === r0.cable_res.r_loop, r0.Rc, r0.cable_res.r_loop, ' Ω'));
    // core.dc_resistance_20 / core.cable_resistance (hand-edited overrides) are ignored (D1)
    const rOv = CTDistance.calculate({ ...core0, dc_resistance_20: 9.99, cable_resistance: 5 }, cd0);
    results.push(assert('DISTMAIN overrides ignored (D1)', rOv.Rc === r0.Rc && rOv.r_total === r0.r_total,
      rOv.Rc, r0.Rc, ' Ω'));

    // ── Golden-vector backed (calc/golden/distance_main.json ← ct_distance/main.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.distance_main)
      ? CT_GOLDEN.distance_main : null;
    if (!G) return results;

    // Translate Python core_data/common_data keys → CTSizer core/commonData.
    // Extends the testDistanceData() pattern with the AR / knee-point / PX
    // class / relay fields the composed calculate consumes.
    const coreFromGolden = (cd) => ({
      rct: cd.rct, burden: cd.burden, Is: cd.secondary_current, Ip: cd.primary_current,
      relay_burden: cd.relay_burden, tp: cd.primary_time_constant,
      zone1_setting: cd.zone1_setting, cable_length: cd.cable_length,
      cable_cross: cd.cable_cross_section,
      cable_material: cd.cable_material,
      alf: cd.alf, is_px_class: cd.is_px_class, vk_voltage: cd.vk_voltage,
      relay_tal: cd.relay_tal, relay_type: cd.relay_type,
      fault_type: cd.fault_type, ik_alternative: cd.ik_alternative,
      auto_reclose_enabled: cd.auto_reclose_enabled,
      ar_t_prime: cd.ar_t_prime, ar_t_al: cd.ar_t_al, ar_tfr: cd.ar_tfr,
      ar_t_double_al: cd.ar_t_double_al, ar_ts: cd.ar_ts,
      ar_time_constant_class: cd.ar_time_constant_class, ar_ktf_preset: cd.ar_ktf_preset,
      ct_class: cd.ct_class,
    });
    // Zero-diff gate (PORTING_PLAN.md §9.6): distance's native method (table)
    // and the case's cable temperature as the project settings; the core
    // carries no cable_temp. by_method cases bring their own settings.
    // Wiring (§9.6 9E): the Python is ×2, so the plain golden cases run with
    // six_wire on the core; by_method / by_topology cases take goldenWiring().
    const commonFromGolden = (cmd, cd) => ({
      isc_sys: cmd.short_circuit_ka, remote_end: cmd.remote_end,
      voltage: cmd.voltage_level, freq: cmd.frequency,
      cable_r_method: cmd.cable_r_method ?? 'table',
      cable_temp: cmd.cable_temp ?? cd.cable_temp,
    });
    const SIX_WIRE = { cable_topology: 'six_wire' };

    const checkCase = (tag, c, wiring) => {
      const e = c.expected;
      // Fresh copies — calculate() mutates core (core.ar_tp / params.ktd_b).
      const core = { ...coreFromGolden(c.input.core_data), ...wiring };
      const commonData = commonFromGolden(c.input.common_data, c.input.core_data);
      const got = CTDistance.calculate(core, commonData);
      const i = tag;

      results.push(assert(`DISTMAIN golden #${i} status`,
        got.status === e.status, got.status, e.status));
      results.push(assert(`DISTMAIN golden #${i} warnings_len`,
        got.warnings.length === e.warnings_len, got.warnings.length, e.warnings_len));
      results.push(assert(`DISTMAIN golden #${i} ealf`,
        approx(got.ealf, e.ealf), got.ealf, e.ealf));
      results.push(assert(`DISTMAIN golden #${i} vk_required`,
        approx(got.vk_required, e.vk_required), got.vk_required, e.vk_required));
      results.push(assert(`DISTMAIN golden #${i} vka`,
        approx(got.vka, e.vka), got.vka, e.vka));
      results.push(assert(`DISTMAIN golden #${i} vkb`,
        approx(got.vkb, e.vkb), got.vkb, e.vkb));
      results.push(assert(`DISTMAIN golden #${i} ktd_a`,
        approx(got.ktd_a, e.ktd_a), got.ktd_a, e.ktd_a));
      results.push(assert(`DISTMAIN golden #${i} ktd_b`,
        approx(got.ktd_b, e.ktd_b), got.ktd_b, e.ktd_b));
      results.push(assert(`DISTMAIN golden #${i} is_px`,
        got.is_px === e.is_px, got.is_px, e.is_px));
      results.push(assert(`DISTMAIN golden #${i} r_total`,
        approx(got.r_total, e.r_total), got.r_total, e.r_total, ' Ω'));

      if ('eal_ar' in e) {
        results.push(assert(`DISTMAIN golden #${i} eal_ar`,
          approx(got.eal_ar, e.eal_ar), got.eal_ar, e.eal_ar));
        results.push(assert(`DISTMAIN golden #${i} kssc_ar`,
          approx(got.kssc_ar, e.kssc_ar), got.kssc_ar, e.kssc_ar));
        results.push(assert(`DISTMAIN golden #${i} is_adequate`,
          got.is_adequate === e.is_adequate, got.is_adequate, e.is_adequate));
        results.push(assert(`DISTMAIN golden #${i} ode_is_ok`,
          got.ode_is_ok === e.ode_is_ok, got.ode_is_ok, e.ode_is_ok));
      }
      return got;
    };

    (G.calculate_distance_protection || []).forEach((c, i) => {
      const got = checkCase(`${i}`, c, SIX_WIRE);
      results.push(assert(`DISTMAIN golden #${i} cable_res table`,
        got.cable_res.method === 'table' && got.Rc === got.cable_res.r_loop,
        got.cable_res.method, 'table'));
      // Named delta (§9.8) under the default wiring (4-wire): a 3-phase fault
      // type halves the lead resistance; the other fault types keep k = 2.
      const dflt = CTDistance.calculate(coreFromGolden(c.input.core_data),
        commonFromGolden(c.input.common_data, c.input.core_data));
      const is3 = c.input.core_data.fault_type === '3-phase';
      results.push(assert(`DISTMAIN golden #${i} default wiring: ${is3 ? 'Rc halves (3-phase)' : 'unchanged'}`,
        dflt.cable_res.topology === 'four_wire' && dflt.cable_res.factor === (is3 ? 1 : 2)
          && dflt.Rc === (is3 ? got.Rc / 2 : got.Rc)
          && (is3 || (dflt.vk_required === got.vk_required && dflt.status === got.status)),
        `${dflt.cable_res.factor} / ${dflt.Rc}`, `${is3 ? 1 : 2} / ${is3 ? got.Rc / 2 : got.Rc}`, ' Ω'));
    });

    // by_method (§9.5): the Python ran with the toolbox r_loop hooked into
    // calculate_lead_resistance and the AR ODE check.
    const bm = G.by_method || [];
    bm.forEach((c, i) => {
      const got = checkCase(`by_method ${i} ${c.input.common_data.cable_r_method}`, c, goldenWiring(c));
      results.push(...checkByMethodCableRes(`DISTMAIN by_method #${i}`, got, c));
    });
    // Each case pair flips the verdict with the method.
    for (let i = 0; i + 1 < bm.length; i += 2) {
      const st = `${bm[i].expected.status}/${bm[i + 1].expected.status}`;
      results.push(assert(`DISTMAIN by_method #${i} verdict differs by method`,
        bm[i].expected.status !== bm[i + 1].expected.status, st, 'different'));
    }
    results.push(assert('DISTMAIN by_method cases', bm.length === 4, bm.length, 4));

    // by_topology (§9.6 9E): iec60287, the core's wiring and the fault type's
    // case, factor × R_c hooked into the same Python paths as by_method.
    const bt = G.by_topology || [];
    bt.forEach((c, i) => {
      const got = checkCase(`by_topology ${i} ${c.input.core_data.fault_type} ${c.expected.cable_res.topology}`,
        c, goldenWiring(c));
      results.push(...checkByMethodCableRes(`DISTMAIN by_topology #${i}`, got, c));
    });
    const kOf = (c) => `${c.input.core_data.fault_type}:${c.expected.cable_res.topology}:${c.expected.cable_res.factor}`;
    const wantK = ['3-phase:four_wire:1', `2-phase:four_wire:${Math.sqrt(3)}`, '1-phase:four_wire:2',
      '3-phase:six_wire:2', '3-phase:four_wire:1'].join(',');
    results.push(assert('DISTMAIN by_topology cases: k per wiring and fault type',
      bt.map(kOf).join(',') === wantK && bt[3].input.cable_topology === 'six_wire'
        && bt.filter((c) => c.input.cable_topology === undefined).length === 4,
      bt.map(kOf).join(','), wantK));
    if (bt.length === 5) {
      // 4-wire, 3-phase: half of the 6-wire / 1-phase lead resistance (same R_c)
      results.push(assert('DISTMAIN by_topology 3-phase 4-wire Rc = ½ · 6-wire',
        bt[0].input.cable_resistance * 2 === bt[3].input.cable_resistance
          && bt[2].input.cable_resistance === bt[3].input.cable_resistance,
        bt[0].input.cable_resistance, bt[3].input.cable_resistance / 2, ' Ω'));
      // The AR case: the halved lead resistance reaches the ODE check, which
      // fails under 6-wire (by_method #2) and passes under the default 4-wire.
      results.push(assert('DISTMAIN by_topology AR: 4-wire flips the ODE verdict of by_method #2',
        bm[2].expected.ode_is_ok === false && bt[4].expected.ode_is_ok === true
          && bm[2].expected.status === 'NOT_OK' && bt[4].expected.status === 'OK',
        `${bm[2].expected.ode_is_ok} → ${bt[4].expected.ode_is_ok}`, 'false → true'));
    }

    return results;
  }

  // ── DISTANCE DATA (extraction/validation, calc/distance/data.js) ───────
  function testDistanceData() {
    const results = [];

    // Hand-derived: all-defaults case (empty core/commonData).
    const p = CTDistance.data.extractDistanceInputs({}, {});
    results.push(assert('DISTDATA default rct', p.rct === 4, p.rct, 4));
    results.push(assert('DISTDATA default tp', p.tp === 100, p.tp, 100));
    results.push(assert('DISTDATA default iscc_max', p.iscc_max === 40000, p.iscc_max, 40000));
    results.push(assert('DISTDATA default cable_material', p.cable_material === 'Kobber (Cu)', p.cable_material, 'Kobber (Cu)'));
    // Cable (PORTING_PLAN.md §9): no project settings → iec60287 at 75 °C;
    // dc_resistance_20 is the toolbox's R′20, IEC 60228 (4.61 Ω/km) only
    // when the project selects `table`.
    results.push(assert('DISTDATA default cable method/temp',
      p.cable_res.method === 'iec60287' && p.cable_temp === 75 && p.dc_resistance_20 === p.cable_res.r20_per_km
        && p.cable_res.source === 'iec60287_formula',
      `${p.cable_res.method} @ ${p.cable_temp}`, 'iec60287 @ 75'));
    const pT = CTDistance.data.extractDistanceInputs({ cable_temp: 20 }, { cable_r_method: 'table', cable_temp: 60 });
    results.push(assert('DISTDATA table dc_resistance_20', approx(pT.dc_resistance_20, 4.61) && pT.cable_temp === 60,
      pT.dc_resistance_20, 4.61));

    const fc = CTDistance.data.extractFaultCurrentData(p);
    const expFc = { tp: 100, iscc_max: 40000, voltage_level: 420, frequency: 50 };
    results.push(assert('DISTDATA fault_current_data', matchesExpected(fc, expFc), JSON.stringify(fc), JSON.stringify(expFc)));

    const warn = CTDistance.data.validateInputRanges(p);
    results.push(assert('DISTDATA no warnings on defaults', warn.length === 0, warn.length, 0));

    // ── Golden-vector backed (calc/golden/distance_data.json ← ct_distance/data.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.distance_data)
      ? CT_GOLDEN.distance_data : null;
    if (!G) return results;

    // Translate Python's core_data/common_data dict keys to CTSizer's core/commonData shape.
    const coreFromGolden = (cd) => ({
      rct: cd.rct, burden: cd.burden, Is: cd.secondary_current, Ip: cd.primary_current,
      relay_burden: cd.relay_burden, tp: cd.primary_time_constant,
      fault_type: cd.fault_type, ik_alternative: cd.ik_alternative,
      zone1_setting: cd.zone1_setting, cable_length: cd.cable_length,
      cable_cross: cd.cable_cross_section,
      cable_material: cd.cable_material, dc_resistance_20: cd.dc_resistance_20,
    });
    // Zero-diff gate (PORTING_PLAN.md §9.6): the native method (table) and the
    // case's cable temperature as the project settings, none on the core.
    const commonFromGolden = (cmd, cd) => ({
      isc_sys: cmd.short_circuit_ka, remote_end: cmd.remote_end,
      voltage: cmd.voltage_level, freq: cmd.frequency,
      cable_r_method: 'table', cable_temp: cd.cable_temp,
    });

    const cases = G.extract_distance_inputs || [];
    cases.forEach((c, i) => {
      const core = coreFromGolden(c.input.core_data);
      const commonData = commonFromGolden(c.input.common_data, c.input.core_data);
      const got = CTDistance.data.extractDistanceInputs(core, commonData);
      // Named delta (D1): the core.dc_resistance_20 override is ignored, so
      // R′20 is the Python value of a case with the same cable and no override.
      let exp = c.expected;
      if (c.input.core_data.dc_resistance_20 !== undefined) {
        const ref = cases.find((o) => o.input.core_data.dc_resistance_20 === undefined
          && o.expected.cable_material === exp.cable_material
          && o.expected.cable_cross_section === exp.cable_cross_section);
        results.push(assert(`DISTDATA golden #${i} override ignored (D1)`,
          !!ref && got.dc_resistance_20 !== c.input.core_data.dc_resistance_20,
          got.dc_resistance_20, ref ? ref.expected.dc_resistance_20 : 'a reference case'));
        exp = { ...exp, dc_resistance_20: ref ? ref.expected.dc_resistance_20 : NaN };
      }
      results.push(assert(`DISTDATA golden #${i} params`,
        matchesExpected(got, exp), JSON.stringify({ ...got, cable_res: undefined }), JSON.stringify(exp)));
    });

    (G.extract_fault_current_data || []).forEach((c, i) => {
      const got = CTDistance.data.extractFaultCurrentData(c.input);
      results.push(assert(`DISTDATA golden #${i} fault_current_data`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    (G.validate_input_ranges || []).forEach((c, i) => {
      const got = CTDistance.data.validateInputRanges(c.input);
      results.push(assert(`DISTDATA golden #${i} warnings`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    return results;
  }

  // ── DISTANCE / CABLE RESISTANCE (adapter onto CTCableRes, PORTING_PLAN.md §9.6 9C) ──
  // The Python port (calculate_lead_resistance from dc_resistance_20) and its
  // golden are gone; the resistance itself is pinned by cable_resistance.json
  // and the distance_main goldens.
  function testDistanceCableResistance() {
    const results = [];
    const CR = CTDistance.cableResistance;

    const cases = { '1-phase': 'single_phase', '2-phase': 'two_phase', '3-phase': 'three_phase',
      undefined: 'single_phase', constructor: 'single_phase' };
    Object.entries(cases).forEach(([ft, want]) => {
      const got = CR.currentCase(ft === 'undefined' ? undefined : ft);
      results.push(assert(`CABLER currentCase ${ft}`, got === want, got, want));
    });

    // Defaults (Cu, 4 mm², 65 m); the temperature is the project's, core.cable_temp ignored
    const d = CR.resolveParams({ cable_temp: 20 }, {});
    results.push(assert('CABLER defaults',
      d.material === 'Kobber (Cu)' && d.cross_section_mm2 === 4 && d.length_m === 65 && d.temp_c === 75,
      JSON.stringify(d), 'Kobber (Cu) / 4 / 65 / 75'));
    const c = CR.resolveParams({ cable_mat: 'al', cable_cross: 6, cable_length: 40, cable_temp: 20 }, { cable_temp: 60 });
    results.push(assert('CABLER core fields + project temp',
      c.material === 'al' && c.cross_section_mm2 === 6 && c.length_m === 40 && c.temp_c === 60,
      JSON.stringify(c), 'al / 6 / 40 / 60'));

    // lead(): project method, the given wiring, the fault type's case; = CTCableRes.lead
    [[{}, 'iec60287'], [{ cable_r_method: 'table' }, 'table'], [{ cable_r_method: 'emf' }, 'iec60287']]
      .forEach(([cd, method]) => {
        [['six_wire', 2], ['four_wire', 1]].forEach(([topo, k]) => {
          const got = CR.lead(c, cd, '3-phase', topo);
          const want = CTCableRes.lead(method, c, topo, 'three_phase');
          results.push(assert(`CABLER lead ${cd.cable_r_method ?? 'default'} ${topo} → ${method}`,
            got.method === method && got.topology === topo && got.current_case === 'three_phase'
              && got.factor === k && got.r_loop === want.r_loop && got.material === 'Aluminium (Al)',
            `${got.method}/${got.topology}/${got.current_case}/${got.r_loop}`, `${method}/${topo}/three_phase/${want.r_loop}`));
        });
      });

    // data.js carries the one lead() result on params, with the fault type's
    // case and the core's wiring (default four_wire for distance, §9.8)
    const p = CTDistance.data.extractDistanceInputs({ fault_type: '3-phase' }, { cable_r_method: 'table' });
    results.push(assert('CABLER params.cable_res',
      p.cable_res.current_case === 'three_phase' && p.cable_res.method === 'table'
        && p.cable_res.topology === 'four_wire' && p.cable_res.factor === 1
        && p.dc_resistance_20 === p.cable_res.r20_per_km && p.cable_material === 'Kobber (Cu)',
      `${p.cable_res.current_case}/${p.cable_res.method}/${p.cable_res.topology}`, 'three_phase/table/four_wire'));
    const p6 = CTDistance.data.extractDistanceInputs({ fault_type: '3-phase', cable_topology: 'six_wire' }, { cable_r_method: 'table' });
    results.push(assert('CABLER params.cable_res six_wire from the core',
      p6.cable_res.topology === 'six_wire' && p6.cable_res.factor === 2 && p6.cable_res.r_loop === 2 * p.cable_res.r_loop,
      `${p6.cable_res.topology}/${p6.cable_res.r_loop}`, `six_wire/${2 * p.cable_res.r_loop}`));

    return results;
  }

  // ── DISTANCE / FAULT CALCULATION ────────────────────────────────────────
  function testDistanceFaultCalculation() {
    const results = [];

    // Hand-derived: Tp=0 -> omega_tp=0 -> Rs=Zs, Xs=0 (no transient term).
    const { zs, rs, xs, omega_tp } = CTDistance.faultCalculation.calculateSourceImpedance({
      voltage_level: 420, iscc_max: 40000, frequency: 50, tp: 0,
    });
    const expectedZs = (1.1 * 420 * 1000) / (Math.sqrt(3) * 40000);
    results.push(assert('FAULTCALC Zs (Tp=0)', approx(zs, expectedZs), zs, expectedZs, ' Ω'));
    results.push(assert('FAULTCALC omega_tp (Tp=0)', omega_tp === 0, omega_tp, 0));
    results.push(assert('FAULTCALC Rs == Zs (Tp=0)', approx(rs, zs), rs, zs, ' Ω'));
    results.push(assert('FAULTCALC Xs == 0 (Tp=0)', Math.abs(xs) < 1e-9, xs, 0, ' Ω'));

    const { rl, xl } = CTDistance.faultCalculation.calculateZone1Impedance({
      klim: 0.85, line_length: 6.4, r_line: 0.0423, x_line: 0.203,
    });
    const expectedRl = 0.85 * 6.4 * 0.0423;
    const expectedXl = 0.85 * 6.4 * 0.203;
    results.push(assert('FAULTCALC RL', approx(rl, expectedRl), rl, expectedRl, ' Ω'));
    results.push(assert('FAULTCALC XL', approx(xl, expectedXl), xl, expectedXl, ' Ω'));

    const { rsc, xsc, zsc, isc_lim } = CTDistance.faultCalculation.calculateZone1FaultCurrent(rs, xs, rl, xl, 420);
    const expectedZsc = Math.sqrt(rsc * rsc + xsc * xsc);
    const expectedIscLim = (1.1 * 420 * 1000) / (Math.sqrt(3) * expectedZsc);
    results.push(assert('FAULTCALC Zsc', approx(zsc, expectedZsc), zsc, expectedZsc, ' Ω'));
    results.push(assert('FAULTCALC Isc_lim', approx(isc_lim, expectedIscLim), isc_lim, expectedIscLim, ' A'));

    // addFaultCalculationSteps: 11 rows, no warnings in the normal (non-edge) case.
    const { steps, warnings } = CTDistance.faultCalculation.addFaultCalculationSteps(
      [],
      { voltage_level: 420, iscc_max: 40000, frequency: 50, tp: 100, klim: 0.85, line_length: 6.4, r_line: 0.0423, x_line: 0.203 },
      zs, rs, xs, omega_tp, rl, xl, rsc, xsc, zsc, isc_lim
    );
    results.push(assert('FAULTCALC steps count', steps.length === 11, steps.length, 11));
    results.push(assert('FAULTCALC no warnings (normal case)', warnings.length === 0, warnings.length, 0));
    results.push(assert('FAULTCALC step keys order', steps[0].key === 'safety_factor' && steps[10].key === 'zone1_short_circuit_current',
      `${steps[0].key},${steps[10].key}`, 'safety_factor,zone1_short_circuit_current'));

    // ── Golden-vector backed (calc/golden/distance_fault_calculation.json ← ct_distance/fault_calculation.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.distance_fault_calculation)
      ? CT_GOLDEN.distance_fault_calculation : null;
    if (!G) return results;

    (G.calculate_source_impedance || []).forEach((c, i) => {
      const got = CTDistance.faultCalculation.calculateSourceImpedance(c.input);
      results.push(assert(`FAULTCALC golden #${i} calculate_source_impedance`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    (G.calculate_zone1_impedance || []).forEach((c, i) => {
      const got = CTDistance.faultCalculation.calculateZone1Impedance(c.input);
      results.push(assert(`FAULTCALC golden #${i} calculate_zone1_impedance`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    (G.calculate_zone1_fault_current || []).forEach((c, i) => {
      const got = CTDistance.faultCalculation.calculateZone1FaultCurrent(
        c.input.rs, c.input.xs, c.input.rl, c.input.xl, c.input.voltage_level
      );
      results.push(assert(`FAULTCALC golden #${i} calculate_zone1_fault_current`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    (G.calculate_source_impedance_with_validation || []).forEach((c, i) => {
      const got = CTDistance.faultCalculation.calculateSourceImpedanceWithValidation(c.input);
      results.push(assert(`FAULTCALC golden #${i} calculate_source_impedance_with_validation`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    return results;
  }

  // ── DISTANCE / TRANSIENT FACTORS ────────────────────────────────────────
  function testDistanceTransientFactors() {
    const results = [];
    const TF = CTDistance.transientFactors;

    // Hand-derived: calculateTalFromKtd's ratio>=1.0 -> Infinity branch.
    // Tp=100ms, f=50Hz -> Ktd_max = 1+2π×50×0.1 ≈ 32.416; Ktd=33 exceeds it.
    const talInf = TF.calculateTalFromKtd(100, 33);
    results.push(assert('TRANSF t_al Infinity (Ktd > Ktd_max)', talInf === Infinity, talInf, Infinity));

    // Hand-derived: getKtdFactorsWithValidation default relay_type is the
    // English "Unknown" here (CTSizer has no Translator/i18n indirection),
    // diverging intentionally from Python's Danish "Ukendt" default.
    const noRelay = TF.getKtdFactorsWithValidation(100, 80);
    results.push(assert('TRANSF default relay_type', noRelay.relay_type === 'Unknown', noRelay.relay_type, 'Unknown'));
    results.push(assert('TRANSF warning tuple shape', Array.isArray(noRelay.warnings[0]) && noRelay.warnings[0][0] === 'warning_ktd_analytical_deviation',
      JSON.stringify(noRelay.warnings[0]), 'warning_ktd_analytical_deviation tuple'));

    const lookupOnly = TF.getKtdFactorsWithValidation(100);
    results.push(assert('TRANSF lookup-fallback info warning', lookupOnly.warnings.length === 1 && lookupOnly.warnings[0][0] === 'info_ktd_lookup_table_assumption',
      JSON.stringify(lookupOnly.warnings), 'info_ktd_lookup_table_assumption tuple'));

    // addTransientFactorSteps / addVkbCalculationSteps: step counts + keys.
    const params = { tp: 100, iscc_max: 40000, primary_current: 2000, secondary_current: 1, ktd_b: 5 };
    const stepsA = TF.addTransientFactorSteps([], params, 4, 5, '50 ms < Tp <= 100 ms', '30 ms < Tp <= 200 ms', 80, null, 276.92, null, 4.5);
    results.push(assert('TRANSF addTransientFactorSteps count', stepsA.length === 4, stepsA.length, 4));
    results.push(assert('TRANSF addTransientFactorSteps keys', stepsA[3].key === 'min_required_knee_point_close_in', stepsA[3].key, 'min_required_knee_point_close_in'));

    const stepsB = TF.addVkbCalculationSteps([], params, 60, 270, 12000, 4.5);
    results.push(assert('TRANSF addVkbCalculationSteps count', stepsB.length === 2, stepsB.length, 2));
    results.push(assert('TRANSF addVkbCalculationSteps keys', stepsB[1].key === 'min_required_knee_point_zone1', stepsB[1].key, 'min_required_knee_point_zone1'));

    // ── Golden-vector backed (calc/golden/distance_transient_factors.json ← ct_distance/transient_factors.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.distance_transient_factors)
      ? CT_GOLDEN.distance_transient_factors : null;
    if (!G) return results;

    (G.calculate_ktd_analytical || []).forEach((c, i) => {
      const got = TF.calculateKtdAnalytical(c.input.t_p, c.input.t_al, c.input.t_s ?? null,
        c.input.frequency ?? 50, c.input.duty_cycle ?? 'C-O', c.input.remanence_factor ?? null);
      results.push(assert(`TRANSF golden #${i} calculateKtdAnalytical`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    (G.calculate_tal_from_ktd || []).forEach((c, i) => {
      const got = TF.calculateTalFromKtd(c.input.t_p, c.input.k_td, c.input.frequency ?? 50);
      results.push(assert(`TRANSF golden #${i} calculateTalFromKtd`,
        approx(got, c.expected), got, c.expected, ' ms'));
    });

    (G.get_ktd_factors || []).forEach((c, i) => {
      const got = TF.getKtdFactors(c.input.tp);
      results.push(assert(`TRANSF golden #${i} getKtdFactors`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    // get_ktd_factors_with_validation: relay_type/warnings excluded from the
    // structural compare (Python renders via Translator() — Danish text and
    // a "Ukendt" default; the JS keeps structured tuples and an "Unknown"
    // default, see transient_factors.js header comment) — compared by
    // length only (warnings_len), with relay_type checked separately only
    // when the golden case passed an explicit relay_type through.
    (G.get_ktd_factors_with_validation || []).forEach((c, i) => {
      const got = TF.getKtdFactorsWithValidation(c.input.t_p, c.input.t_al ?? null, c.input.relay_type ?? null);
      const { relay_type: expRelay, warnings_len, ...restExpected } = c.expected;
      results.push(assert(`TRANSF golden #${i} getKtdFactorsWithValidation`,
        matchesExpected(got, restExpected), JSON.stringify(got), JSON.stringify(restExpected)));
      results.push(assert(`TRANSF golden #${i} getKtdFactorsWithValidation warnings_len`,
        got.warnings.length === warnings_len, got.warnings.length, warnings_len));
      if (c.input.relay_type) {
        results.push(assert(`TRANSF golden #${i} getKtdFactorsWithValidation relay_type passthrough`,
          got.relay_type === expRelay, got.relay_type, expRelay));
      }
    });

    (G.calculate_kssc || []).forEach((c, i) => {
      const got = TF.calculateKssc(c.input.ktd, c.input.fault_current, c.input.primary_current);
      results.push(assert(`TRANSF golden #${i} calculateKssc`, approx(got, c.expected), got, c.expected));
    });

    (G.calculate_vka || []).forEach((c, i) => {
      const got = TF.calculateVka(c.input.kssc1, c.input.r_total, c.input.secondary_current, c.input.vka_factor ?? 1.3);
      results.push(assert(`TRANSF golden #${i} calculateVka`, approx(got, c.expected), got, c.expected, ' V'));
    });

    (G.calculate_vkb || []).forEach((c, i) => {
      const got = TF.calculateVkb(c.input.kssc2, c.input.r_total, c.input.secondary_current);
      results.push(assert(`TRANSF golden #${i} calculateVkb`, approx(got, c.expected), got, c.expected, ' V'));
    });

    return results;
  }

  // ── DISTANCE / KNEE POINT ────────────────────────────────────────────────
  function testDistanceKneePoint() {
    const results = [];
    const KP = CTDistance.kneePoint;

    // Hand-derived: required Vk is the max of Vka/Vkb.
    results.push(assert('KNEEPT requiredVk max(120.5,95.2)', KP.calculateRequiredVk(120.5, 95.2) === 120.5, KP.calculateRequiredVk(120.5, 95.2), 120.5));
    results.push(assert('KNEEPT requiredVk max(80,150.75)', KP.calculateRequiredVk(80.0, 150.75) === 150.75, KP.calculateRequiredVk(80.0, 150.75), 150.75));

    // addKneePointSteps: ALF branch -> offered_knee_point_voltage_alf row.
    const alfCore = { alf: 20, is_px_class: false, vk_voltage: null };
    const { ealf: alfEalf, is_px: alfIsPx } = KP.calculateProposedEalf(alfCore, 15, 1, 3.5);
    const alfSteps = KP.addKneePointSteps([], 120.5, 95.2, 120.5, alfEalf, alfIsPx, alfCore, 15, 1, 3.5);
    results.push(assert('KNEEPT ALF steps count', alfSteps.length === 2, alfSteps.length, 2));
    results.push(assert('KNEEPT ALF steps keys', alfSteps[0].key === 'required_knee_point_voltage' && alfSteps[1].key === 'offered_knee_point_voltage_alf',
      `${alfSteps[0].key},${alfSteps[1].key}`, 'required_knee_point_voltage,offered_knee_point_voltage_alf'));

    // addKneePointSteps: PX branch -> specified_knee_point_voltage_px row.
    const pxCore = { alf: null, is_px_class: true, vk_voltage: 180.0 };
    const { ealf: pxEalf, is_px: pxIsPx } = KP.calculateProposedEalf(pxCore, 30, 5, 1.2);
    const pxSteps = KP.addKneePointSteps([], 80.0, 150.75, 150.75, pxEalf, pxIsPx, pxCore, 30, 5, 1.2);
    results.push(assert('KNEEPT PX steps keys', pxSteps[1].key === 'specified_knee_point_voltage_px', pxSteps[1].key, 'specified_knee_point_voltage_px'));
    results.push(assert('KNEEPT PX ealf == vk_voltage', pxEalf === 180.0, pxEalf, 180.0));

    // ── Golden-vector backed (calc/golden/distance_knee_point.json ← ct_distance/knee_point.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.distance_knee_point)
      ? CT_GOLDEN.distance_knee_point : null;
    if (!G) return results;

    (G.calculate_required_vk || []).forEach((c, i) => {
      const got = KP.calculateRequiredVk(c.input.vka, c.input.vkb);
      results.push(assert(`KNEEPT golden #${i} calculateRequiredVk`, approx(got, c.expected), got, c.expected, ' V'));
    });

    (G.calculate_proposed_ealf || []).forEach((c, i) => {
      const got = KP.calculateProposedEalf(c.input.core_data, c.input.burden_va, c.input.secondary_current, c.input.rct);
      const gotObj = { ealf: got.ealf, is_px: got.is_px };
      results.push(assert(`KNEEPT golden #${i} calculateProposedEalf`,
        matchesExpected(gotObj, c.expected), JSON.stringify(gotObj), JSON.stringify(c.expected)));
    });

    return results;
  }

  function testDistanceRelay() {
    const results = [];
    const RL = CTDistance.relay;

    // Hand-derived: rated current passes through; relay resistance = S/I^2.
    const std = RL.calculateRelayParameters({ secondary_current: 1, relay_burden: 0.05 });
    results.push(assert('RELAY ratedCurrent=Isr', std.ratedCurrent === 1, std.ratedCurrent, 1));
    results.push(assert('RELAY resistance=S/I^2', approx(std.relayResistance, 0.05), std.relayResistance, 0.05));

    // addRelayParameterSteps: two rows, nominal current then relay resistance.
    const steps = RL.addRelayParameterSteps([], { secondary_current: 1, relay_burden: 0.05 }, std.ratedCurrent, std.relayResistance);
    results.push(assert('RELAY steps count', steps.length === 2, steps.length, 2));
    results.push(assert('RELAY steps keys', steps[0].key === 'relay_nominal_current' && steps[1].key === 'relay_resistance',
      `${steps[0].key},${steps[1].key}`, 'relay_nominal_current,relay_resistance'));

    // Zero secondary-current edge case: ct_base.calculate_relay_resistance guards against div-by-zero.
    const zero = RL.calculateRelayParameters({ secondary_current: 0, relay_burden: 0.1 });
    results.push(assert('RELAY zero Isr -> resistance=0', zero.relayResistance === 0, zero.relayResistance, 0));

    // ── Golden-vector backed (calc/golden/distance_relay.json ← ct_distance/relay.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.distance_relay)
      ? CT_GOLDEN.distance_relay : null;
    if (!G) return results;

    (G.calculate_relay_parameters || []).forEach((c, i) => {
      const got = RL.calculateRelayParameters(c.input);
      const gotObj = { rated_current: got.ratedCurrent, relay_resistance: got.relayResistance };
      results.push(assert(`RELAY golden #${i} calculateRelayParameters`,
        matchesExpected(gotObj, c.expected), JSON.stringify(gotObj), JSON.stringify(c.expected)));
    });

    return results;
  }

  function testDistanceAutoReclosureExt() {
    const results = [];
    const ARX = CTDistance.autoReclosureExt;

    // verifyArAdequacy: adequate / inadequate / boundary-equal-counts-as-adequate.
    const adq = ARX.verifyArAdequacy(100.0, 120.0);
    results.push(assert('ARX adequate', adq.isAdequate === true, adq.isAdequate, true));
    results.push(assert('ARX adequate warning null', adq.warning === null, adq.warning, null));
    const inadq = ARX.verifyArAdequacy(120.0, 100.0);
    results.push(assert('ARX inadequate', inadq.isAdequate === false, inadq.isAdequate, false));
    results.push(assert('ARX inadequate success null', inadq.success === null, inadq.success, null));
    const boundary = ARX.verifyArAdequacy(100.0, 100.0);
    results.push(assert('ARX boundary equal -> adequate', boundary.isAdequate === true, boundary.isAdequate, true));

    // addArSteps: 2 rows (EAL row + conclusion); comparison text mirrors ≥/< per adequacy.
    const okSteps = ARX.addArSteps([], 1360.0, 1500.0, 3.2, 12.5, 4.0, 30.0, 1.0, true);
    results.push(assert('ARX addArSteps count', okSteps.length === 2, okSteps.length, 2));
    results.push(assert('ARX addArSteps keys',
      okSteps[0].key === 'auto_reclosure_transient_dimensioning' && okSteps[1].key === 'auto_reclosure_evaluation',
      `${okSteps[0].key},${okSteps[1].key}`, 'auto_reclosure_transient_dimensioning,auto_reclosure_evaluation'));
    results.push(assert('ARX addArSteps comparison (ok)', okSteps[1].comparison === '1500.00 V ≥ 1360.00 V', okSteps[1].comparison, '1500.00 V ≥ 1360.00 V'));
    results.push(assert('ARX addArSteps is_ok (ok)', okSteps[1].is_ok === true, okSteps[1].is_ok, true));

    const failSteps = ARX.addArSteps([], 1360.0, 1000.0, 3.2, 12.5, 4.0, 30.0, 1.0, false);
    results.push(assert('ARX addArSteps comparison (fail)', failSteps[1].comparison === '1000.00 V < 1360.00 V', failSteps[1].comparison, '1000.00 V < 1360.00 V'));
    results.push(assert('ARX addArSteps is_ok (fail)', failSteps[1].is_ok === false, failSteps[1].is_ok, false));

    // calculateOdeSaturationCheck null guards (falsy core / missing alf / missing burden).
    results.push(assert('ARX ODE null guard (no core)',
      ARX.calculateOdeSaturationCheck(null, 3.0, 3.5, 0, 1.0) === null,
      ARX.calculateOdeSaturationCheck(null, 3.0, 3.5, 0, 1.0), null));
    results.push(assert('ARX ODE null guard (no alf)',
      ARX.calculateOdeSaturationCheck({ ct_class: '5P', burden: 15 }, 3.0, 3.5, 0, 1.0) === null,
      ARX.calculateOdeSaturationCheck({ ct_class: '5P', burden: 15 }, 3.0, 3.5, 0, 1.0), null));
    results.push(assert('ARX ODE null guard (no burden)',
      ARX.calculateOdeSaturationCheck({ ct_class: '5P', alf: 20 }, 3.0, 3.5, 0, 1.0) === null,
      ARX.calculateOdeSaturationCheck({ ct_class: '5P', alf: 20 }, 3.0, 3.5, 0, 1.0), null));

    // addOdeSaturationSteps: no-op for a null result (mirrors Python's early returns).
    const noop = ARX.addOdeSaturationSteps([], null);
    results.push(assert('ARX addOdeSaturationSteps no-op', noop.length === 0, noop.length, 0));

    // addOdeSaturationSteps: 3 rows (ALFo, ODE Ktd, saturation-check conclusion) for a real result.
    const odeResult = ARX.calculateOdeSaturationCheck(
      { ct_class: '5P', alf: 20, burden: 15, relay_burden: 0.1,
        ar_t_prime: 0.1, ar_t_al: 0.025, ar_tfr: 0.4, ar_t_double_al: 0.1, ar_ts: 1.0, ar_tp: 0.1 },
      3.0, 3.5, 0, 1.0, 0.5
    );
    const odeSteps = ARX.addOdeSaturationSteps([], odeResult);
    results.push(assert('ARX addOdeSaturationSteps count', odeSteps.length === 3, odeSteps.length, 3));
    results.push(assert('ARX addOdeSaturationSteps keys',
      odeSteps[0].key === 'auto_reclosure_operating_alf' && odeSteps[1].key === 'auto_reclosure_ode_ktd' && odeSteps[2].key === 'auto_reclosure_ode_saturation_check',
      `${odeSteps[0].key},${odeSteps[1].key},${odeSteps[2].key}`,
      'auto_reclosure_operating_alf,auto_reclosure_ode_ktd,auto_reclosure_ode_saturation_check'));
    results.push(assert('ARX addOdeSaturationSteps is_ok', odeSteps[2].is_ok === odeResult.isOk, odeSteps[2].is_ok, odeResult.isOk));

    // ── Golden-vector backed (calc/golden/distance_auto_reclosure_ext.json ← ct_distance/auto_reclosure_ext.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.distance_auto_reclosure_ext)
      ? CT_GOLDEN.distance_auto_reclosure_ext : null;
    if (!G) return results;

    (G.compute_ar_ktd || []).forEach((c, i) => {
      const got = ARX.computeArKtd(c.input);
      results.push(assert(`ARX golden #${i} computeArKtd`, approx(got, c.expected), got, c.expected));
    });

    (G.compute_ar_eal || []).forEach((c, i) => {
      const { ealAr, ksscAr } = ARX.computeArEal(
        c.input.ktd_ar, c.input.iscc_max, c.input.primary_current,
        c.input.rct, c.input.burden_resistance, c.input.secondary_current
      );
      const gotObj = { eal_ar: ealAr, kssc_ar: ksscAr };
      results.push(assert(`ARX golden #${i} computeArEal`, matchesExpected(gotObj, c.expected), JSON.stringify(gotObj), JSON.stringify(c.expected)));
    });

    (G.verify_ar_adequacy || []).forEach((c, i) => {
      const got = ARX.verifyArAdequacy(c.input.eal_ar, c.input.ealf).isAdequate;
      results.push(assert(`ARX golden #${i} verifyArAdequacy`, got === c.expected.is_adequate, got, c.expected.is_adequate));
    });

    // The Python reads the lead resistance from core_data["cable_resistance"];
    // the JS takes it as an argument (PORTING_PLAN.md §9.6) and ignores the
    // core field, so the golden's injected value is passed explicitly.
    (G.ode_saturation_check || []).forEach((c, i) => {
      const rLead = c.input.core_data ? (c.input.core_data.cable_resistance ?? 0) : 0;
      const got = ARX.calculateOdeSaturationCheck(c.input.core_data, c.input.kssc, c.input.rct, 0, c.input.secondary_current, rLead);
      results.push(assert(`ARX golden #${i} calculateOdeSaturationCheck`, matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
      if (rLead > 0) {
        const ignored = ARX.calculateOdeSaturationCheck(c.input.core_data, c.input.kssc, c.input.rct, 0, c.input.secondary_current, 0);
        const rRelay = c.input.core_data.relay_burden / c.input.secondary_current ** 2;
        results.push(assert(`ARX golden #${i} ODE ignores core.cable_resistance`,
          approx(ignored.rBurdenActual, rRelay) && approx(got.rBurdenActual - ignored.rBurdenActual, rLead),
          ignored.rBurdenActual, rRelay, ' Ω'));
      }
    });

    return results;
  }

  function testDistanceFormatting() {
    const results = [];
    const FMT = CTDistance.formatting;

    // Hand-derived: formatImpedanceStep ignores rs/frequency/tp in its output
    // (a real quirk of the Python source, preserved 1:1).
    const imp = FMT.formatImpedanceStep('s', 'd', 999, 2.3456, 2.6457, 110, 5000, 50, 100);
    results.push(assert('FMT impedance result string', imp.result === '2.6457 Ω', imp.result, '2.6457 Ω'));
    results.push(assert('FMT impedance substitution', imp.substitution === 'Zs = 1.1 x 110 x 1000 / (sqrt(3) x 5000)', imp.substitution, 'Zs = 1.1 x 110 x 1000 / (sqrt(3) x 5000)'));
    const impDifferentRs = FMT.formatImpedanceStep('s', 'd', -123, 2.3456, 2.6457, 110, 5000, 50, 100);
    results.push(assert('FMT impedance ignores rs', impDifferentRs.result === imp.result, impDifferentRs.result, imp.result));

    // Hand-derived: formatKtdStep's formula string interpolates the tp_range verbatim.
    const ktd = FMT.formatKtdStep('s', 'd', 1.05, 'Tp <= 30 ms');
    results.push(assert('FMT ktd formula', ktd.formula === 'Tp <= 30 ms → Ktd = 1.05', ktd.formula, 'Tp <= 30 ms → Ktd = 1.05'));
    results.push(assert('FMT ktd substitution empty', ktd.substitution === '', ktd.substitution, ''));

    // Hand-derived: formatFinalResult is a pure pass-through.
    const final = FMT.formatFinalResult('OK', 'CT er tilstrækkelig');
    results.push(assert('FMT final passthrough', final.status === 'OK' && final.conclusion === 'CT er tilstrækkelig', JSON.stringify(final), 'OK/CT er tilstrækkelig'));

    // ── Golden-vector backed (calc/golden/distance_formatting.json ← ct_distance/formatting.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.distance_formatting)
      ? CT_GOLDEN.distance_formatting : null;
    if (!G) return results;

    (G.format_impedance_step || []).forEach((c, i) => {
      const got = FMT.formatImpedanceStep(
        c.input.name, c.input.description, c.input.rs, c.input.xs, c.input.zs,
        c.input.voltage_level, c.input.iscc_max, c.input.frequency, c.input.tp
      );
      results.push(assert(`FMT golden #${i} formatImpedanceStep`, matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    (G.format_ktd_step || []).forEach((c, i) => {
      const got = FMT.formatKtdStep(c.input.name, c.input.description, c.input.ktd, c.input.tp_range);
      results.push(assert(`FMT golden #${i} formatKtdStep`, matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    (G.format_final_result || []).forEach((c, i) => {
      const got = FMT.formatFinalResult(c.input.status, c.input.conclusion);
      results.push(assert(`FMT golden #${i} formatFinalResult`, matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    return results;
  }

  // ── AUTO-RECLOSURE ─────────────────────────────────────────────────────
  function testAutoReclosure() {
    const results = [];

    // Test interpolateCurve
    const curve = CTAutoReclosure.KTF_PRESETS['iec_default'];
    const v_0   = CTAutoReclosure.calcKtdFromCurve(0,   curve);
    const v_02  = CTAutoReclosure.calcKtdFromCurve(0.2, curve);
    const v_10  = CTAutoReclosure.calcKtdFromCurve(1.0, curve);
    results.push(assert('AR curve t=0',   approx(v_0,  1.0), v_0,  1.0));
    results.push(assert('AR curve t=0.2', approx(v_02, 1.9), v_02, 1.9));
    results.push(assert('AR curve t=1.0', approx(v_10, 2.5), v_10, 2.5));

    // Test C-O-C-O for low TC class (exact computation.py formula)
    // t_al=0.06s, t'=0.1s, tfr=0.4s, t''al=0.025s, Ts=1.0s
    const ktf = CTAutoReclosure.KTF_PRESETS['iec_default'];
    const ktd_co_co = CTAutoReclosure.computeKtdCoCo(0.06, 0.1, 0.4, 0.025, 1.0, ktf, 'low');
    // ktd_tal = curve(0.06) — interpolate between [0.05,1.3] and [0.1,1.6]
    const ktd_tal = CTAutoReclosure.calcKtdFromCurve(0.06, ktf);
    // ktd_tprime = curve(0.1) = 1.6
    // ktd_tdouble = curve(0.025) — interpolate [0.02,1.15] and [0.05,1.3]
    const ktd_tprime  = CTAutoReclosure.calcKtdFromCurve(0.1,   ktf);
    const ktd_tdouble = CTAutoReclosure.calcKtdFromCurve(0.025, ktf);
    const decay = Math.exp(-(0.4 + 0.06) / 1.0);
    const candidate = ktd_tprime * decay + ktd_tdouble;
    const expected_coco = Math.max(ktd_tal, candidate);
    results.push(assert('AR Ktd C-O-C-O (low TC)', approx(ktd_co_co, expected_coco), ktd_co_co, expected_coco));

    // Test high TC class: Ktd = ktd_tal + ktd_tdouble
    const ktd_co_co_high = CTAutoReclosure.computeKtdCoCo(0.06, 0.1, 0.4, 0.025, 1.0, ktf, 'high');
    const expected_high = CTAutoReclosure.calcKtdFromCurve(0.06, ktf) + CTAutoReclosure.calcKtdFromCurve(0.025, ktf);
    results.push(assert('AR Ktd C-O-C-O (high TC)', approx(ktd_co_co_high, expected_high), ktd_co_co_high, expected_high));

    // Test compute_eal: Kssc=15, Ktd=3.5, Rct=4, Rb=30, Is=1 → 15 × 3.5 × 34 × 1 = 1785
    const eal = CTAutoReclosure.computeEal(15, 3.5, 4, 30, 1);
    results.push(assert('AR EAL compute', approx(eal, 1785), eal, 1785, ' V'));

    // The legacy C-O-C-O check and its helpers are gone (PORTING_PLAN.md §10.6
    // F-AR, F-LEGACY): the results panel takes every AR value from
    // CTDistance.calculate, and the ports live in distance/transient_factors.js
    // and foundation/base_classes.js.
    const legacy = {
      'CTCalc.autoReclosure': CTCalc.autoReclosure,
      'CTDistance.calcAutoReclosure': CTDistance.calcAutoReclosure,
      'CTDistance.offeredEalf': CTDistance.offeredEalf,
      'CTAutoReclosure.calcKtdAnalytical': CTAutoReclosure.calcKtdAnalytical,
      'CTAutoReclosure.getKtdFactors': CTAutoReclosure.getKtdFactors,
      'CTAutoReclosure.getRemanenceFactor': CTAutoReclosure.getRemanenceFactor,
      'CTAutoReclosure.getTimeConstantClass': CTAutoReclosure.getTimeConstantClass,
    };
    Object.entries(legacy).forEach(([name, fn]) => {
      results.push(assert(`AR legacy ${name} removed`, fn === undefined, typeof fn, 'undefined'));
    });

    return results;
  }

  // ── AUTO-RECLOSURE PRESETS ──────────────────────────────────────────────
  // Golden-vector backed (calc/golden/auto_reclosure.json ← ct_auto_reclosure/presets.py),
  // covering the full KTF_PRESETS table — including the *_digitized curves
  // loaded from data/ktf_2b{4,5,6}.csv in the Python reference.
  // CTSizer's typical-Ts table (calc/auto_reclosure/ts_table.js) and how
  // CTCalc.moduleCore applies it (ar_ts_mode 'table'); no ctvt_dim counterpart
  function testArTsTable() {
    const results = [];
    const E = CTAutoReclosure.estimateTs;
    const cases = [
      ['5P', 132, 5.0, 'closed', '110–150 kV'], ['5PR', 150, 1.0, 'gapped', '110–150 kV'],
      ['PX', 400, 10.0, 'closed', '≥ 400 kV'], ['10PR', 20, 0.5, 'gapped', '≤ 36 kV'],
      ['TPY', 220, 1.0, 'gapped', '220 kV'], ['5PR', 400, 1.0, 'gapped', '≥ 400 kV'], ['TPX', 60, 3.0, 'closed', '50–60 kV'],
      ['TPZ', 400, 0.06, 'linear', '≥ 400 kV'], ['5pr', 132, 1.0, 'gapped', '110–150 kV'],
      // band edges are inclusive upper limits
      ['5P', 36, 2.0, 'closed', '≤ 36 kV'], ['5P', 36.1, 3.0, 'closed', '50–60 kV'],
      ['5P', 72.5, 3.0, 'closed', '50–60 kV'], ['5P', 170, 5.0, 'closed', '110–150 kV'],
      ['5P', 245, 7.0, 'closed', '220 kV'], ['5P', 245.1, 10.0, 'closed', '≥ 400 kV'],
      // unknown class → closed core; missing / invalid voltage → 110–150 kV
      ['0.5', 132, 5.0, 'closed', '110–150 kV'], [undefined, 132, 5.0, 'closed', '110–150 kV'],
      ['5PR', undefined, 1.0, 'gapped', '110–150 kV'], ['5PR', 0, 1.0, 'gapped', '110–150 kV'],
      ['5PR', 'x', 1.0, 'gapped', '110–150 kV'],
    ];
    cases.forEach(([cls, kv, ts, group, band]) => {
      const r = E(cls, kv);
      results.push(assert(`Ts table ${cls} @ ${kv} kV → ${ts} s (${group}, ${band})`,
        r.ts === ts && r.group.id === group && r.band.label === band, `${r.ts} ${r.group.id} ${r.band.label}`, `${ts} ${group} ${band}`));
    });
    // Every class the panel offers has a row; Ts grows with the voltage (TPZ fixed)
    const fams = ['5P', '5PR', '10P', '10PR', 'PX', 'TPX', 'TPY', 'TPZ'];
    const { GROUPS } = CTAutoReclosure.TS_TABLE;
    results.push(assert('Ts table covers every panel class once',
      fams.every((f) => GROUPS.filter((g) => g.classes.includes(f)).length === 1), 'missing', 'all'));
    results.push(assert('Ts table rows do not decrease with the voltage',
      GROUPS.every((g) => g.ts.every((t, i) => i === 0 || t >= g.ts[i - 1])), 'decreasing', 'non-decreasing'));
    // moduleCore: 'table' → ar_ts from the table (class, project voltage),
    // even over a stored ar_ts; 'manual' / no mode → the stored ar_ts or none
    const mc = (inp, kv, type = 'distance') => CTCalc.moduleCore(type, inp, { voltage: kv });
    const base = { auto_reclose_enabled: true, ct_class_family: '5PR' };
    results.push(assert('moduleCore table mode: 5PR @ 20 kV → ar_ts 0.5 (distance and line diff)',
      mc({ ...base, ar_ts_mode: 'table' }, 20).ar_ts === 0.5 && mc({ ...base, ar_ts_mode: 'table' }, 20, 'line_diff').ar_ts === 0.5,
      mc({ ...base, ar_ts_mode: 'table' }, 20).ar_ts, 0.5));
    results.push(assert('moduleCore table mode ignores a stored ar_ts; no class → 5P',
      mc({ ...base, ar_ts_mode: 'table', ar_ts: 9 }, 132).ar_ts === 1.0
        && mc({ auto_reclose_enabled: true, ar_ts_mode: 'table' }, 132).ar_ts === 5.0, 'stored', 'table'));
    results.push(assert('moduleCore manual / no mode: stored ar_ts or none (older cores unchanged)',
      mc({ ...base, ar_ts_mode: 'manual', ar_ts: 0.7 }, 400).ar_ts === 0.7 && mc({ ...base, ar_ts: 0.7 }, 400).ar_ts === 0.7
        && !('ar_ts' in mc(base, 400)) && !('ar_ts' in mc({ ...base, ar_ts_mode: 'manual' }, 400)), 'changed', 'unchanged'));
    results.push(assert('moduleCore: other calc types get no AR keys',
      JSON.stringify(mc({ ...base, ar_ts_mode: 'table' }, 132, 'overcurrent')) === JSON.stringify({ ...base, ar_ts_mode: 'table' }), 'added', 'none'));
    return results;
  }

  function testAutoReclosurePresets() {
    const results = [];
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.auto_reclosure)
      ? CT_GOLDEN.auto_reclosure : null;
    if (!G) return results;

    Object.keys(G.ktf_presets || {}).forEach((name) => {
      const got = CTAutoReclosure.KTF_PRESETS[name];
      const expected = G.ktf_presets[name];
      results.push(assert(`AR preset ${name}`,
        matchesExpected(got, expected), got ? got.length : 0, expected.length));
    });

    (G.get_ktf_preset || []).forEach((c) => {
      const got = CTAutoReclosure.getKtfPreset(c.input[0]);
      results.push(assert(`AR getKtfPreset ${c.input[0]}`,
        matchesExpected(got, c.expected), got.length, c.expected.length));
    });

    return results;
  }

  // ── AUTO-RECLOSURE COMPUTATION ───────────────────────────────────────────
  // Golden-vector backed (calc/golden/auto_reclosure.json ← ct_auto_reclosure/
  // computation.py): interpolate_curve, calculate_ktd_from_curve,
  // compute_ktd_co_co, compute_eal.
  function testAutoReclosureComputation() {
    const results = [];
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.auto_reclosure)
      ? CT_GOLDEN.auto_reclosure : null;
    if (!G) return results;

    (G.interpolate_curve || []).forEach((c, i) => {
      const [points, t] = c.input;
      const got = CTAutoReclosure.interpolateCurve(points, t);
      results.push(assert(`AR interpolateCurve #${i}`, approx(got, c.expected), got, c.expected));
    });

    (G.calculate_ktd_from_curve || []).forEach((c, i) => {
      const [t, points] = c.input;
      const got = CTAutoReclosure.calcKtdFromCurve(t, points);
      results.push(assert(`AR calcKtdFromCurve #${i}`, approx(got, c.expected), got, c.expected));
    });

    (G.compute_ktd_co_co || []).forEach((c, i) => {
      const got = CTAutoReclosure.computeKtdCoCo(...c.input);
      results.push(assert(`AR computeKtdCoCo #${i}`, approx(got, c.expected), got, c.expected));
    });

    (G.compute_eal || []).forEach((c, i) => {
      const got = CTAutoReclosure.computeEal(...c.input);
      results.push(assert(`AR computeEal #${i}`, approx(got, c.expected), got, c.expected, ' V'));
    });

    return results;
  }

  // ── AUTO-RECLOSURE WAVEFORM ──────────────────────────────────────────────
  // Golden-vector backed (calc/golden/auto_reclosure.json ← ct_auto_reclosure/
  // waveform.py): generate_coco_transient (AC + decaying DC offset across the
  // C-O-C-O timeline) and generate_coco_flux (implicit-Euler secondary flux
  // integration per IEC 61869-100 §5.2.3). Whole {times, waveform/flux} arrays
  // are compared element-wise via matchesExpected.
  function testAutoReclosureWaveform() {
    const results = [];
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.auto_reclosure)
      ? CT_GOLDEN.auto_reclosure : null;
    if (!G) return results;

    (G.generate_coco_transient || []).forEach((c, i) => {
      const got = CTAutoReclosure.generateCocoTransient(...c.input);
      results.push(assert(`AR cocoTransient #${i} times`,
        matchesExpected(got.times, c.expected.times), got.times.length, c.expected.times.length));
      results.push(assert(`AR cocoTransient #${i} waveform`,
        matchesExpected(got.waveform, c.expected.waveform), got.waveform.length, c.expected.waveform.length));
    });

    (G.generate_coco_flux || []).forEach((c, i) => {
      const got = CTAutoReclosure.generateCocoFlux(...c.input);
      results.push(assert(`AR cocoFlux #${i} times`,
        matchesExpected(got.times, c.expected.times), got.times.length, c.expected.times.length));
      results.push(assert(`AR cocoFlux #${i} flux`,
        matchesExpected(got.flux, c.expected.flux), got.flux.length, c.expected.flux.length));
    });

    return results;
  }

  // ── TRANSFORMER DIFF / MAIN (composition, calc/transformer_diff/main.js) ──
  function testTransformerDiffMain() {
    const results = [];

    // Hand-derived: 100 MVA, 132 kV (per-core trafo_voltage_kv), ALF=20,
    // Is=1 A, Ip=2000 A, Rct=4 Ω, Sn=30 VA, explicit It=8 kA / Ik=20 kA.
    // Cable temperature and method are project settings (PORTING_PLAN.md §9).
    const core = {
      Is: 1, Ip: 2000, rct: 4, burden: 30, relay_burden: 0.1, alf: 20,
      trafo_power_mva: 100, trafo_voltage_kv: 132, trafo_z_percent: 12, inrush_factor: 8,
      trafo_it_max: 8000, trafo_ik_max: 20000,
      cable_length: 150, cable_cross: 4, cable_mat: 'cu',
    };
    const cdP = { cable_r_method: 'iec60287', cable_temp: 75 };
    const r = CTTransformerDiff.calculate(core, cdP);
    // EALF = 20 × 1 × (4 + 30) = 680 V
    results.push(assert('TDIFFMAIN EALF', approx(r.EALF, 680), r.EALF, 680, ' V'));
    // Compat-path rated current in kA: S[MVA] / (√3·U[kV]) = 0.4374 kA
    const iRated = 100 / (Math.sqrt(3) * 132);
    results.push(assert('TDIFFMAIN i_rated', approx(r.i_rated, iRated), r.i_rated, iRated));
    // Kssc,int = 20000/2000 = 10 → ALF_req,int = 5; Kssc,ext = 4 → 6; min 12.5
    results.push(assert('TDIFFMAIN ALF_ziegler (min 12.5)', approx(r.ALF_ziegler, 12.5), r.ALF_ziegler, 12.5));
    results.push(assert('TDIFFMAIN Vk_req alias', r.Vk_req === r.vk_required, r.Vk_req, r.vk_required));
    results.push(assert('TDIFFMAIN status OK', r.status === 'OK' && r.is_ok === true, r.status, 'OK'));
    const last = r.steps[r.steps.length - 1];
    results.push(assert('TDIFFMAIN last step is conclusion', last.key === 'conclusion_comparison' && last.is_ok === true,
      last.key, 'conclusion_comparison'));

    // Cable resistance from CTCableRes (PORTING_PLAN.md §9.6 9C): the shared
    // module hand checks, worst current case (§9.8).
    const core0 = { ...core, cable_length: 65 };
    results.push(...checkModuleCableRes('TDIFFMAIN', CTTransformerDiff.calculate, core0, {}, 'single_phase', 'transformer_diff'));
    // One lead resistance feeds both paths: the E.m.f. method (cable_resistance)
    // and the IEC 61869 / Ziegler burden, S_wire = r_loop·Isr², whose step
    // carries the topology factor as k_wire and the equivalent ρ_T.
    const burdenChecks = (tag, got, isr) => {
      const st = got.steps.find((x) => x.key === 'cable_burden');
      const v = st.variables;
      const emfStep = got.steps.find((x) => x.key === 'emf_internal_fault');
      results.push(assert(`${tag} Rc = cable_resistance = r_loop`,
        got.Rc === got.cable_resistance && got.Rc === got.cable_res.r_loop, got.Rc, got.cable_res.r_loop, ' Ω'));
      results.push(assert(`${tag} S_wire = r_loop·Isr²`,
        got.s_wire === got.cable_res.r_loop * isr ** 2 && st.result === got.s_wire,
        got.s_wire, got.cable_res.r_loop * isr ** 2, ' VA'));
      results.push(assert(`${tag} cable_burden step k_wire = topology factor, ρ consistent`,
        v.k_wire === got.cable_res.factor && v.rho === got.rho_t
          && approx(v.k_wire * v.rho * v.l_wire / v.a_wire * v.Isr ** 2, got.s_wire),
        `${v.k_wire} · ${v.rho}`, `${got.cable_res.factor} · ${got.rho_t}`));
      results.push(assert(`${tag} E.m.f. uses r_loop`, emfStep.variables.Rlead === got.Rc,
        emfStep.variables.Rlead, got.Rc, ' Ω'));
    };
    const rT = CTTransformerDiff.calculate({ ...core0, Is: 5, cable_mat: 'al', cable_cross: 6 },
      { cable_r_method: 'table', cable_temp: 20 });
    burdenChecks('TDIFFMAIN iec60287', CTTransformerDiff.calculate(core0, cdP), 1);
    burdenChecks('TDIFFMAIN table Al 5 A', rT, 5);
    // Under table the equivalent ρ_T is R′_T·A/1000 (IEC 60228 Al 6 mm²: 4.61 Ω/km at 20 °C)
    results.push(assert('TDIFFMAIN table ρ_T = R′_T·A/1000', approx(rT.rho_t, 4.61 * 6 / 1000),
      rT.rho_t, 4.61 * 6 / 1000, ' Ω·mm²/m'));
    // The factor comes from the topology registry, not IEC_CONSTANTS.k_wire:
    // a changed factor of the default wiring (four_wire, §9.8) reaches S_wire,
    // the step and the E.m.f. math.
    const fourWire = CTCableRes.topology.four_wire.factors;
    let rK;
    CTCableRes.topology.four_wire.factors = { three_phase: 3, two_phase: 3, single_phase: 3 };
    try { rK = CTTransformerDiff.calculate(core0, cdP); } finally { CTCableRes.topology.four_wire.factors = fourWire; }
    const r0 = CTTransformerDiff.calculate(core0, cdP);
    const kStep = rK.steps.find((x) => x.key === 'cable_burden').variables.k_wire;
    results.push(assert('TDIFFMAIN k_wire from the topology',
      kStep === 3 && rK.cable_res.factor === 3 && approx(rK.s_wire, 1.5 * r0.s_wire)
        && approx(rK.cable_resistance, 1.5 * r0.cable_resistance) && rK.e_through > r0.e_through,
      `${kStep} / ${rK.s_wire}`, `3 / ${1.5 * r0.s_wire}`));

    // ── Golden-vector backed (calc/golden/transformer_diff_main.json ←
    //    ct_transformer_differential/main.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.transformer_diff_main)
      ? CT_GOLDEN.transformer_diff_main : null;
    if (!G) return results;

    // Translate Python core_data/common_data keys → CTSizer core/commonData.
    // The core carries no cable_temp (it is a project setting).
    const coreFromGolden = (cd) => {
      const { secondary_current, primary_current, cable_temp, ...rest } = cd;
      return { ...rest, Is: secondary_current, Ip: primary_current };
    };
    // Zero-diff gate (PORTING_PLAN.md §9.6): transformer_diff's native method
    // (iec60287) and the case's cable temperature as the project settings.
    // by_method cases bring their own.
    const commonFromGolden = (cmd, cd) => ({
      voltage: cmd.voltage_level, remote_end: cmd.remote_end, isc_sys: cmd.short_circuit_ka,
      cable_r_method: cmd.cable_r_method ?? 'iec60287',
      cable_temp: cmd.cable_temp ?? cd.cable_temp,
    });

    const NUM = ['cable_resistance', 'i_rated', 'trafo_it_max', 'trafo_ik_max', 'z_percent',
      's_wire', 'rho_t', 's_total', 's_ct', 'alf_o', 'alf_ext_required', 'alf_int_required',
      'alf_min_required', 'i_ref', 'f_adap', 'kssc_int', 'kssc_ext', 'siemens_alf_int_req',
      'siemens_alf_ext_req', 'siemens_alf_required', 'r_relay', 'e_internal', 'e_through',
      'e_inrush', 'vk_required', 'ealf'];
    const EXACT = ['status', 'linked_winding', 'iec_method_applicable', 'iec_ok', 'siemens_ok',
      'vk_label', 'emf_ok'];

    // Wiring (§9.6 9E): the plain golden cases run under the default wiring
    // (four_wire; the worst case, 1-phase, is k = 2 = the Python ×2, so nothing
    // changes); by_method / by_topology cases take goldenWiring().
    const checkCase = (tag, c, wiring = {}) => {
      const e = c.expected;
      const got = CTTransformerDiff.calculate(
        { ...coreFromGolden(c.input.core_data), ...wiring },
        commonFromGolden(c.input.common_data, c.input.core_data));

      EXACT.forEach((k) => results.push(assert(`${tag} ${k}`,
        got[k] === e[k], got[k], e[k])));
      NUM.filter((k) => k in e).forEach((k) => {
        const ok = e[k] === null ? got[k] === null : approx(got[k], e[k]);
        results.push(assert(`${tag} ${k}`, ok, got[k], e[k]));
      });
      results.push(assert(`${tag} failed_methods`,
        JSON.stringify(got.failed_methods) === JSON.stringify(e.failed_methods),
        JSON.stringify(got.failed_methods), JSON.stringify(e.failed_methods)));
      results.push(assert(`${tag} warnings`,
        matchesExpected(got.warnings, e.warnings),
        JSON.stringify(got.warnings), JSON.stringify(e.warnings)));
      // The toolbox steps come first; the rest is the Python step sequence.
      // No internal fault current (issue #85): no steps at all, as in Python.
      const keys = got.steps.map((s) => s.key);
      const expKeys = e.step_keys.length ? [...CABLE_STEP_KEYS.split(','), ...e.step_keys] : [];
      results.push(assert(`${tag} step_keys`,
        JSON.stringify(keys) === JSON.stringify(expKeys),
        JSON.stringify(keys), JSON.stringify(expKeys)));
      return got;
    };

    // Deviation (issue #93): an IED name the database does not have is a
    // custom relay with the default IEC factors (main.py marks the IEC method
    // not applicable), so such a case must match the same core without it.
    const GT = G.calculate_transformer_differential || [];
    const customTwin = (c) => {
      const { relay_name, ...rest } = c.input.core_data;
      if (!relay_name || CTRelayDB.byName(relay_name)) return null;
      const want = JSON.stringify({ common_data: c.input.common_data, core_data: rest });
      return GT.find((o) => o !== c && JSON.stringify(o.input) === want) || 'missing';
    };

    GT.forEach((c, i) => {
      const twin = customTwin(c);
      if (twin === 'missing') {
        results.push(assert(`TDIFFMAIN golden #${i} unknown IED has a no-IED twin`, false, 'none', 'a twin case'));
        return;
      }
      const got = checkCase(`TDIFFMAIN golden #${i}${twin ? ' (unknown IED = custom relay)' : ''}`,
        twin ? { input: c.input, expected: twin.expected } : c);
      if (c.expected.trafo_ik_max === null) return;  // not calculated (issue #85)
      results.push(assert(`TDIFFMAIN golden #${i} cable_res iec60287 / four_wire (default), k = 2`,
        got.cable_res.method === 'iec60287' && got.cable_res.topology === 'four_wire'
          && got.cable_res.factor === 2 && got.Rc === got.cable_resistance,
        `${got.cable_res.method}/${got.cable_res.topology}/${got.cable_res.factor}`, 'iec60287/four_wire/2'));
    });

    // by_method (§9.5): the Python ran with the toolbox r_loop injected as
    // cable_resistance and calculate_cable_burden hooked onto it.
    const bm = G.by_method || [];
    bm.forEach((c, i) => {
      const got = checkCase(`TDIFFMAIN by_method #${i} ${c.input.common_data.cable_r_method}`, c, goldenWiring(c));
      results.push(...checkByMethodCableRes(`TDIFFMAIN by_method #${i}`, got, c));
    });
    // by_topology (§9.6 9E): the default 4-wire and 6-wire, the same Python numbers
    (G.by_topology || []).forEach((c, i) => {
      const got = checkCase(`TDIFFMAIN by_topology #${i} ${c.expected.cable_res.topology}`, c, goldenWiring(c));
      results.push(...checkByMethodCableRes(`TDIFFMAIN by_topology #${i}`, got, c));
    });
    results.push(...checkByTopologyUnchanged('TDIFFMAIN', G));
    // Each case pair flips the verdict with the method.
    for (let i = 0; i + 1 < bm.length; i += 2) {
      const st = `${bm[i].expected.status}/${bm[i + 1].expected.status}`;
      results.push(assert(`TDIFFMAIN by_method #${i} verdict differs by method`,
        bm[i].expected.status !== bm[i + 1].expected.status, st, 'different'));
    }
    results.push(assert('TDIFFMAIN by_method cases', bm.length === 4, bm.length, 4));

    return results;
  }

  // ── TRANSFORMER DIFF PRESETS ─────────────────────────────────────────────
  // Golden-vector backed (calc/golden/transformer_diff_presets.json <-
  // ct_transformer_differential/presets.py). Pure data — no functions to
  // exercise, so this pins the full dict contents structurally (same
  // treatment as testAutoReclosurePresets()'s ktf_presets check).
  function testTransformerDiffPresets() {
    const results = [];
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.transformer_diff_presets)
      ? CT_GOLDEN.transformer_diff_presets : null;
    if (!G) return results;

    const P = CTTransformerDiff.presets;

    // MATERIAL_RESISTIVITY is not ported: ρ20 lives only in calc/materials.js
    // (PORTING_PLAN.md §9.7 Q-TD1).
    results.push(assert('TDIFF presets no MATERIAL_RESISTIVITY',
      !('MATERIAL_RESISTIVITY' in P) && !('material_resistivity' in G),
      Object.keys(P).join(','), 'no MATERIAL_RESISTIVITY'));
    results.push(assert('TDIFF presets TEMPERATURE_COEFFICIENTS',
      matchesExpected(P.TEMPERATURE_COEFFICIENTS, G.temperature_coefficients),
      P.TEMPERATURE_COEFFICIENTS, G.temperature_coefficients));

    (G.default_values || []).forEach((c) => {
      results.push(assert('TDIFF presets DEFAULT_VALUES',
        matchesExpected(P.DEFAULT_VALUES, c.expected), P.DEFAULT_VALUES, c.expected));
    });
    (G.iec_constants || []).forEach((c) => {
      results.push(assert('TDIFF presets IEC_CONSTANTS',
        matchesExpected(P.IEC_CONSTANTS, c.expected), P.IEC_CONSTANTS, c.expected));
    });
    (G.ziegler_constants || []).forEach((c) => {
      results.push(assert('TDIFF presets ZIEGLER_CONSTANTS',
        matchesExpected(P.ZIEGLER_CONSTANTS, c.expected), P.ZIEGLER_CONSTANTS, c.expected));
    });
    (G.emf_constants || []).forEach((c) => {
      results.push(assert('TDIFF presets EMF_CONSTANTS',
        matchesExpected(P.EMF_CONSTANTS, c.expected), P.EMF_CONSTANTS, c.expected));
    });
    (G.z_percent_range || []).forEach((c) => {
      results.push(assert('TDIFF presets Z_PERCENT_RANGE',
        matchesExpected(P.Z_PERCENT_RANGE, c.expected), P.Z_PERCENT_RANGE, c.expected));
    });

    return results;
  }

  // ── TRANSFORMER DIFF DATA (calc/transformer_diff/data.js) ───────────────
  function testTransformerDiffData() {
    const results = [];
    const D = CTTransformerDiff.data;

    // Hand-derived: all-defaults, backwards-compatibility path.
    // i_rated = 160 / (√3·150) = 0.6158 kA; it_max = i_rated·1000 / 0.14 = 4 398.9 A.
    const td0 = D.extractTransformerData({}, {});
    const iR0 = 160 / (Math.sqrt(3) * 150);
    results.push(assert('TDIFFDATA default i_rated', approx(td0[4], iR0), td0[4], iR0));
    results.push(assert('TDIFFDATA default it_max from z%', approx(td0[5], iR0 * 1000 / 0.14), td0[5], iR0 * 1000 / 0.14));
    // No core override and no project Ik max → no internal fault current (issue #85)
    results.push(assert('TDIFFDATA default ik_max none', td0[6] === null, td0[6], null));
    const tdP = D.extractTransformerData({ isc_sys: 63 }, {});
    results.push(assert('TDIFFDATA ik_max = project Ik max', tdP[6] === 63000, tdP[6], 63000));
    const tdO = D.extractTransformerData({ isc_sys: 40 }, { trafo_ik_max: 32000 });
    results.push(assert('TDIFFDATA ik_max core override', tdO[6] === 32000, tdO[6], 32000));
    const tdZ = D.extractTransformerData({ isc_sys: 0 }, { trafo_ik_max: 0 });
    results.push(assert('TDIFFDATA ik_max 0 / 0 → none', tdZ[6] === null, tdZ[6], null));

    // CTSizer-native core fields feed the compat path.
    const tdC = D.extractTransformerData({ voltage: 400 },
      { trafo_power_mva: 100, trafo_voltage_kv: 132, trafo_z_percent: 12, cable_mat: 'al' });
    results.push(assert('TDIFFDATA trafo_voltage_kv preferred', tdC[0] === 132, tdC[0], 132));
    results.push(assert('TDIFFDATA trafo_z_percent alias', tdC[2] === 12, tdC[2], 12));
    const ctC = D.extractCtInputs({ cable_mat: 'al', cable_cross: 6 });
    results.push(assert('TDIFFDATA cable_mat al -> Aluminium (Al)',
      ctC.cable_material === 'Aluminium (Al)' && ctC.cable_cross_section === 6,
      JSON.stringify(ctC), 'Aluminium (Al), 6'));
    // Cable (PORTING_PLAN.md §9): no project settings → iec60287 at 75 °C, the
    // data.py defaults (Cu, 4 mm², 150 m), one lead() call for the worst case,
    // with the default wiring (four_wire: k = 2 for the 1-phase case, §9.8).
    const ct0 = D.extractCtInputs({ cable_temp: 20 });
    const l0 = CTCableRes.lead('iec60287',
      { material: 'cu', cross_section_mm2: 4, length_m: 150, temp_c: 75 }, 'four_wire', 'single_phase');
    results.push(assert('TDIFFDATA default cable iec60287 @ 75 °C, core.cable_temp ignored',
      ct0.cable_temp === 75 && ct0.cable_length === 150 && ct0.cable_cross_section === 4
        && ct0.cable_material === 'Kobber (Cu)' && ct0.cable_res.method === 'iec60287'
        && ct0.cable_res.topology === 'four_wire' && ct0.cable_res.current_case === 'single_phase'
        && ct0.cable_res.factor === 2 && ct0.cable_res.r_loop === l0.r_loop,
      `${ct0.cable_res.method} @ ${ct0.cable_temp}: ${ct0.cable_res.r_loop}`, `iec60287 @ 75: ${l0.r_loop}`));
    const ct6 = D.extractCtInputs({ cable_topology: 'six_wire' });
    results.push(assert('TDIFFDATA wiring from the core (six_wire), same k = 2',
      ct6.cable_res.topology === 'six_wire' && ct6.cable_res.r_loop === l0.r_loop,
      `${ct6.cable_res.topology}: ${ct6.cable_res.r_loop}`, `six_wire: ${l0.r_loop}`));
    const ctT = D.extractCtInputs({ cable_temp: 20, cable_mat: 'al', cable_cross: 6, cable_length: 40 },
      { cable_r_method: 'table', cable_temp: 60 });
    results.push(assert('TDIFFDATA table R′20, project temp',
      approx(ctT.cable_res.r20_per_km, 4.61) && ctT.cable_temp === 60 && ctT.cable_length === 40
        && ctT.cable_res.method === 'table' && ctT.cable_res.source === 'iec60228_table',
      `${ctT.cable_res.r20_per_km} @ ${ctT.cable_temp}`, '4.61 @ 60'));

    // ── Golden-vector backed (calc/golden/transformer_diff_data.json <- ct_transformer_differential/data.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.transformer_diff_data)
      ? CT_GOLDEN.transformer_diff_data : null;
    if (!G) return results;

    // Translate Python's core_data/common_data keys to CTSizer's core/commonData shape.
    const coreFromGolden = (cd) => {
      const { secondary_current, primary_current, ...rest } = cd;
      return { ...rest, Is: secondary_current, Ip: primary_current };
    };
    const commonFromGolden = (cmd) => ({ remote_end: cmd.remote_end, voltage: cmd.voltage_level,
      isc_sys: cmd.short_circuit_ka });

    // Zero-diff gate (PORTING_PLAN.md §9.6): the case's cable temperature
    // (Python default 75 °C) as the project setting; the core carries none.
    (G.extract_ct_inputs || []).forEach((c, i) => {
      const { cable_temp, ...cd } = c.input.core_data;
      const got = D.extractCtInputs(coreFromGolden(cd),
        { cable_r_method: 'iec60287', cable_temp: cable_temp ?? 75 });
      results.push(assert(`TDIFFDATA golden #${i} ct_inputs`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    (G.parse_transformer_windings || []).forEach((c, i) => {
      const got = D.parseTransformerWindings(c.input.transformer_data, c.input.linked_winding,
        commonFromGolden(c.input.common_data));
      results.push(assert(`TDIFFDATA golden #${i} parse_windings`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    (G.extract_transformer_data || []).forEach((c, i) => {
      const got = D.extractTransformerData(commonFromGolden(c.input.common_data),
        coreFromGolden(c.input.core_data));
      results.push(assert(`TDIFFDATA golden #${i} transformer_data`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    return results;
  }

  // ── TRANSFORMER DIFF BURDEN (calc/transformer_diff/burden_calculation.js) ──
  function testTransformerDiffBurden() {
    const results = [];
    const B = CTTransformerDiff.burden;

    // Hand-derived: Sct = 4·1² = 4 VA; Stotal = 0.1 + 2.08 = 2.18 VA;
    // ALF_O = 20·(30 + 4)/(2.18 + 4) = 110.032.
    results.push(assert('TDIFFBURDEN Sct', B.calculateCtInternalBurden(4, 1) === 4,
      B.calculateCtInternalBurden(4, 1), 4));
    const alfO = B.calculateOperatingAlf(20, 30, 4, 2.18);
    results.push(assert('TDIFFBURDEN ALF_O', approx(alfO, 20 * 34 / 6.18), alfO, 20 * 34 / 6.18));
    results.push(assert('TDIFFBURDEN ALF_O null alf', B.calculateOperatingAlf(null, 30, 4, 2.18) === null,
      B.calculateOperatingAlf(null, 30, 4, 2.18), null));
    // Cable burden from a lead() result: S_wire = r_loop·Isr², ρ_T = R′_T·A/1000.
    // Under table (Cu 2.5 mm², IEC 60228 7.41 Ω/km) at 20 °C, 100 m, 5 A:
    // r_loop = 2·0.741 = 1.482 Ω → S_wire = 37.05 VA, ρ_T = 0.018525 Ω·mm²/m.
    const lT = CTCableRes.lead('table', { material: 'cu', cross_section_mm2: 2.5, length_m: 100, temp_c: 20 },
      'six_wire', 'single_phase');
    const [sW, rhoT] = B.calculateCableBurden(lT, 2.5, 5);
    results.push(assert('TDIFFBURDEN cable burden (table)', approx(sW, 37.05) && approx(rhoT, 0.018525),
      `${sW} / ${rhoT}`, '37.05 / 0.018525'));

    // ── Golden-vector backed (calc/golden/transformer_diff_burden_calculation.json) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.transformer_diff_burden_calculation)
      ? CT_GOLDEN.transformer_diff_burden_calculation : null;
    if (!G) return results;

    const cases = [
      ['get_material_properties', (i) => B.getMaterialProperties(i.cable_material)],
      ['calculate_resistivity_at_temp', (i) => B.calculateResistivityAtTemp(i.cable_material, i.cable_temp)],
      // Onto CTCableRes (PORTING_PLAN.md §9.6 9C): the Python inputs go through
      // lead() with transformer_diff's native method (iec60287), zero-diff.
      ['calculate_cable_burden', (i) => B.calculateCableBurden(
        CTCableRes.lead('iec60287', { material: i.cable_material, cross_section_mm2: i.cable_cross_section,
          length_m: i.cable_length, temp_c: i.cable_temp }, 'six_wire', 'single_phase'),
        i.cable_cross_section, i.secondary_current)],
      ['calculate_ct_internal_burden', (i) => B.calculateCtInternalBurden(i.rct, i.secondary_current)],
      ['calculate_total_burden', (i) => B.calculateTotalBurden(i.relay_burden, i.s_wire)],
      ['calculate_operating_alf', (i) => B.calculateOperatingAlf(i.alf, i.burden_va, i.s_ct, i.s_total)],
    ];
    for (const [key, fn] of cases) {
      (G[key] || []).forEach((c, i) => {
        const got = fn(c.input);
        results.push(assert(`TDIFFBURDEN golden ${key} #${i}`,
          matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
      });
    }

    return results;
  }

  // ── TRANSFORMER DIFF METHODS/EMF (calc/transformer_diff/methods/emf.js) ──
  function testTransformerDiffMethodsEmf() {
    const results = [];
    const E = CTTransformerDiff.methods.emf;

    // Hand-derived: Ik=12000 A, Isr/Ipr=1/600, R = 4 + 1.2 + 0.1 = 5.3 Ω
    // → E_int = 20·5.3 = 106 V; E_through = 2·It·(1/600)·5.3 with It=5000 → 88.33 V;
    // E_inrush = 12·600·(1/600)·5.3 = 63.6 V; Vk_req = 106 V.
    const [eInt, eThr, eInr] = E.calculateEmfScenarios(12000, 5000, 12, 600, 1, 4, 1.2, 0.1);
    results.push(assert('TDIFFEMF E_int', approx(eInt, 106), eInt, 106, ' V'));
    results.push(assert('TDIFFEMF E_through', approx(eThr, 2 * 5000 / 600 * 5.3), eThr, 2 * 5000 / 600 * 5.3, ' V'));
    results.push(assert('TDIFFEMF E_inrush', approx(eInr, 63.6), eInr, 63.6, ' V'));
    const vkReq = E.calculateRequiredVk(eInt, eThr, eInr);
    results.push(assert('TDIFFEMF Vk_req = max', vkReq === eInt, vkReq, eInt, ' V'));
    // EALF = 20·1·(4 + 30) = 680 V ≥ 106 V → pass.
    const [ealf, label] = E.calculateOfferedVk(20, 1, 4, 30, false, null);
    results.push(assert('TDIFFEMF EALF', approx(ealf, 680) && label === 'EALF', `${ealf} ${label}`, '680 EALF'));
    results.push(assert('TDIFFEMF verify', E.verifyEmfMethod(ealf, vkReq) === true, E.verifyEmfMethod(ealf, vkReq), true));

    // ── Golden-vector backed (calc/golden/transformer_diff_methods_emf.json) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.transformer_diff_methods_emf)
      ? CT_GOLDEN.transformer_diff_methods_emf : null;
    if (!G) return results;

    const fault = (fn) => (i) => fn(i.trafo_i_max, i.secondary_current, i.primary_current,
      i.rct, i.cable_resistance, i.r_relay);
    const cases = [
      ['calculate_relay_resistance', (i) => E.calculateRelayResistance(i.relay_burden, i.secondary_current)],
      ['calculate_emf_internal_fault', fault(E.calculateEmfInternalFault)],
      ['calculate_emf_through_fault', fault(E.calculateEmfThroughFault)],
      ['calculate_emf_inrush', (i) => E.calculateEmfInrush(i.inrush_factor, i.primary_current,
        i.secondary_current, i.rct, i.cable_resistance, i.r_relay)],
      ['calculate_emf_scenarios', (i) => E.calculateEmfScenarios(i.trafo_ik_max, i.trafo_it_max,
        i.inrush_factor, i.primary_current, i.secondary_current, i.rct, i.cable_resistance, i.r_relay)],
      ['calculate_required_vk', (i) => E.calculateRequiredVk(i.e_internal, i.e_through, i.e_inrush)],
      ['calculate_offered_vk', (i) => E.calculateOfferedVk(i.alf, i.secondary_current, i.rct,
        i.burden_va, i.is_px, i.vk_specified)],
      ['verify_emf_method', (i) => E.verifyEmfMethod(i.ealf, i.vk_required)],
    ];
    for (const [key, fn] of cases) {
      (G[key] || []).forEach((c, i) => {
        const got = fn(c.input);
        results.push(assert(`TDIFFEMF golden ${key} #${i}`,
          matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
      });
    }

    return results;
  }

  // ── TRANSFORMER DIFF METHODS / IEC 61869 (calc/transformer_diff/methods/iec61869.js) ──
  function testTransformerDiffMethodsIec61869() {
    const results = [];
    const M = CTTransformerDiff.methods.iec61869;

    // Hand-derived: It=5000 A, Ik=12000 A, Ipr=600 A, Sn=40 MVA, U=132 kV
    // → ALF_ext = 1.5·5000/600 = 12.5; ALF_int = 0.4·12000/600 = 8; ALF_min = 12.5;
    // I_ref = 40/(√3·132) = 0.17495 kA; F_adap = 0.6/0.17495 = 3.4295.
    const [ext, int, min, iRef, fAdap] = M.calculateIecRequirements(5000, 12000, 600, 40, 132);
    results.push(assert('TDIFFIEC ALF_ext', approx(ext, 12.5), ext, 12.5));
    results.push(assert('TDIFFIEC ALF_int', approx(int, 8), int, 8));
    results.push(assert('TDIFFIEC ALF_min', min === 12.5, min, 12.5));
    results.push(assert('TDIFFIEC I_ref', approx(iRef, 40 / (Math.sqrt(3) * 132)), iRef, 40 / (Math.sqrt(3) * 132), ' kA'));
    results.push(assert('TDIFFIEC F_adap', approx(fAdap, 3.4295), fAdap, 3.4295));
    const [ok] = M.checkAllIecRequirements(20, ext, int, min, fAdap);
    results.push(assert('TDIFFIEC ALF_O=20 passes all', ok === true, ok, true));

    // ── Golden-vector backed (calc/golden/transformer_diff_methods_iec61869.json) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.transformer_diff_methods_iec61869)
      ? CT_GOLDEN.transformer_diff_methods_iec61869 : null;
    if (!G) return results;

    const cases = [
      ['calculate_iec_requirements', (i) => M.calculateIecRequirements(i.trafo_it_max, i.trafo_ik_max,
        i.primary_current, i.trafo_rated_power, i.trafo_primary_voltage, i.ext_fault_factor, i.int_fault_factor)],
      ['verify_alf_external_fault', (i) => M.verifyAlfExternalFault(i.alf_o, i.required)],
      ['verify_alf_internal_fault', (i) => M.verifyAlfInternalFault(i.alf_o, i.required)],
      ['verify_alf_minimum', (i) => M.verifyAlfMinimum(i.alf_o, i.required)],
      ['verify_adaptation_factor', (i) => M.verifyAdaptationFactor(i.f_adap, i.min_fadap, i.max_fadap)],
      ['check_all_iec_requirements', (i) => M.checkAllIecRequirements(i.alf_o, i.alf_ext_required,
        i.alf_int_required, i.alf_min_required, i.f_adap)],
    ];
    for (const [key, fn] of cases) {
      (G[key] || []).forEach((c, i) => {
        const got = fn(c.input);
        results.push(assert(`TDIFFIEC golden ${key} #${i}`,
          matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
      });
    }

    return results;
  }

  function testTransformerDiffMethodsZiegler() {
    const results = [];
    const M = CTTransformerDiff.methods.ziegler;

    // Hand-derived: It=5000 A, Ik=12000 A, Ipr=600 A
    // → Kssc,int = 12000/600 = 20; Kssc,ext = 5000/600 = 8.333;
    // ALF_int = 0.4·20 = 8 (Siemens 7UT8 Req. 2, issue #87); ALF_ext = 1.5·8.333 = 12.5;
    // ALF_req = max(8, 12.5, 12.5) = 12.5.
    const [kInt, kExt] = M.calculateKssc(5000, 12000, 600);
    results.push(assert('TDIFFZIEG Kssc,int', approx(kInt, 20), kInt, 20));
    results.push(assert('TDIFFZIEG Kssc,ext', approx(kExt, 8.3333), kExt, 8.3333));
    const [aInt, aExt, aReq] = M.calculateAlfRequirements(kInt, kExt);
    results.push(assert('TDIFFZIEG ALF_int', approx(aInt, 8), aInt, 8));
    results.push(assert('TDIFFZIEG ALF_ext', approx(aExt, 12.5), aExt, 12.5));
    results.push(assert('TDIFFZIEG ALF_req', approx(aReq, 12.5), aReq, 12.5));
    results.push(assert('TDIFFZIEG PX (null) passes', M.verifyZieglerMethod(null, 99) === true,
      M.verifyZieglerMethod(null, 99), true));

    // ── Golden-vector backed (calc/golden/transformer_diff_methods_ziegler.json) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.transformer_diff_methods_ziegler)
      ? CT_GOLDEN.transformer_diff_methods_ziegler : null;
    if (!G) return results;

    const cases = [
      ['calculate_kssc', (i) => M.calculateKssc(i.trafo_it_max, i.trafo_ik_max, i.primary_current)],
      ['calculate_alf_requirements', (i) => M.calculateAlfRequirements(i.kssc_int, i.kssc_ext)],
      ['verify_ziegler_method', (i) => M.verifyZieglerMethod(i.alf_o, i.siemens_alf_required)],
    ];
    for (const [key, fn] of cases) {
      (G[key] || []).forEach((c, i) => {
        const got = fn(c.input);
        results.push(assert(`TDIFFZIEG golden ${key} #${i}`,
          matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
      });
    }

    return results;
  }

  // ── TRANSFORMER DIFF — formatting (calc/transformer_diff/formatting.js) ──
  function testTransformerDiffFormatting() {
    const results = [];
    const FMT = CTTransformerDiff.formatting;

    // Hand-derived: keys match StepNames, results echo the value args,
    // multi-row builders return rows in the Python order.
    const td = FMT.formatTransformerDataStep('HV', 40, 12, 132, 0.17496, 1458, 25000);
    results.push(assert('TDIFFFMT trafo key', td.key === 'transformer_data', td.key, 'transformer_data'));
    results.push(assert('TDIFFFMT trafo result', td.result === 'It,max = 1.46 kA, Ik,max = 25.00 kA', td.result, 'It,max = 1.46 kA, Ik,max = 25.00 kA'));
    const emf = FMT.formatEmfSteps(0.1, 0.1, 1, 180, 20, 4, 25000, 1458, 1, 600, 4.2, 0.05, 180);
    results.push(assert('TDIFFFMT emf rows', emf.length === 5 && emf[4].key === 'required_knee_point_voltage', emf.length, 5));
    const zv = FMT.formatZieglerVerificationStep(10, 20.8333, false);
    results.push(assert('TDIFFFMT ziegler fail', zv.is_conclusion && zv.is_ok === false && zv.status === 'failed', zv.status, 'failed'));
    results.push(assert('TDIFFFMT iec PX empty', FMT.formatIecVerificationSteps([]).length === 0, FMT.formatIecVerificationSteps([]).length, 0));
    const fv = FMT.formatFinalVerdict(false, true, false);
    results.push(assert('TDIFFFMT verdict', matchesExpected(fv, ['NOT_OK', ['emf', 'ziegler']]), JSON.stringify(fv), 'NOT_OK emf,ziegler'));

    // ── Golden-vector backed (calc/golden/transformer_diff_formatting.json <- ct_transformer_differential/formatting.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.transformer_diff_formatting)
      ? CT_GOLDEN.transformer_diff_formatting : null;
    if (!G) return results;

    const single = (name, fn) => (G[name] || []).forEach((c, i) => {
      const got = fn(c.input);
      results.push(assert(`TDIFFFMT golden #${i} ${name} key`, got.key === c.expected.key, got.key, c.expected.key));
      results.push(assert(`TDIFFFMT golden #${i} ${name} result`, approx(got.result, c.expected.value), got.result, c.expected.value));
    });
    const multi = (name, fn) => (G[name] || []).forEach((c, i) => {
      const rows = fn(c.input);
      const ok = rows.length === c.expected.length &&
        c.expected.every((e, j) => rows[j].key === e.key && approx(rows[j].result, e.value));
      results.push(assert(`TDIFFFMT golden #${i} ${name}`, ok, rows.map(r => r.key).join(','), c.expected.map(e => e.key).join(',')));
    });

    (G.format_transformer_data_step || []).forEach((c, i) => {
      const x = c.input;
      const got = FMT.formatTransformerDataStep(x.linked_winding, x.trafo_rated_power, x.z_percent,
        x.trafo_primary_voltage, x.i_rated, x.trafo_it_max, x.trafo_ik_max);
      const ok = got.key === c.expected.key && got.result === c.expected.result &&
        got._linked_winding === c.expected.linked_winding &&
        got._trafo_rated_power === c.expected.trafo_rated_power && got._z_percent === c.expected.z_percent;
      results.push(assert(`TDIFFFMT golden #${i} format_transformer_data_step`, ok, got.result, c.expected.result));
    });
    single('format_cable_burden_step', (x) => FMT.formatCableBurdenStep(x.k_wire, x.rho_t, x.cable_length, x.cable_cross_section, x.secondary_current, x.s_wire));
    single('format_total_burden_step', (x) => FMT.formatTotalBurdenStep(x.relay_burden, x.s_wire, x.s_total));
    single('format_ct_burden_step', (x) => FMT.formatCtBurdenStep(x.rct, x.secondary_current, x.s_ct));
    single('format_operating_alf_step', (x) => FMT.formatOperatingAlfStep(x.alf, x.burden_va, x.s_ct, x.s_total, x.alf_o));
    single('format_specified_vk_step', (x) => FMT.formatSpecifiedVkStep(x.vk_specified, x.ealf));
    single('format_offered_vk_step', (x) => FMT.formatOfferedVkStep(x.alf, x.secondary_current, x.rct, x.burden_resistance, x.ealf));
    multi('format_iec_requirement_steps', (x) => FMT.formatIecRequirementSteps(x.alf_ext_required, x.alf_int_required,
      x.trafo_it_max, x.trafo_ik_max, x.primary_current, x.i_ref, x.trafo_rated_power, x.trafo_primary_voltage, x.f_adap));
    multi('format_ziegler_steps', (x) => FMT.formatZieglerSteps(x.kssc_int, x.kssc_ext, x.trafo_ik_max, x.trafo_it_max,
      x.primary_current, x.siemens_alf_int_req, x.siemens_alf_ext_req, x.siemens_alf_required));
    multi('format_emf_steps', (x) => FMT.formatEmfSteps(x.r_relay, x.relay_burden, x.secondary_current, x.e_internal,
      x.e_through, x.e_inrush, x.trafo_ik_max, x.trafo_it_max, x.inrush_factor, x.primary_current, x.rct,
      x.cable_resistance, x.vk_required));

    (G.format_iec_verification_steps || []).forEach((c, i) => {
      const rows = FMT.formatIecVerificationSteps(c.input.iec_results);
      const ok = rows.length === c.expected.length &&
        c.expected.every((e, j) => rows[j].key === e.key && rows[j].result === e.text);
      results.push(assert(`TDIFFFMT golden #${i} format_iec_verification_steps`, ok, rows.length, c.expected.length));
    });
    (G.format_ziegler_verification_step || []).forEach((c, i) => {
      const x = c.input;
      const got = FMT.formatZieglerVerificationStep(x.alf_o, x.siemens_alf_required, x.siemens_ok);
      const pyCmp = got.comparison.replace('≥', '>=');
      const ok = got.key === c.expected.key && got.status === c.expected.status && pyCmp === c.expected.comparison;
      results.push(assert(`TDIFFFMT golden #${i} format_ziegler_verification_step`, ok, pyCmp, c.expected.comparison));
    });
    (G.format_ziegler_px_step || []).forEach((c, i) => {
      const got = FMT.formatZieglerPxStep();
      results.push(assert(`TDIFFFMT golden #${i} format_ziegler_px_step`,
        got.key === c.expected.key && got.status === c.expected.status, got.status, c.expected.status));
    });
    (G.format_iec_check_step || []).forEach((c, i) => {
      const got = FMT.formatIecCheckStep(c.input.iec_ok, c.input.iec_results);
      const ok = got.key === c.expected.key && got.status === c.expected.status &&
        got.substitution === c.expected.substitution && got.is_ok === c.input.iec_ok;
      results.push(assert(`TDIFFFMT golden #${i} format_iec_check_step`, ok, got.status, c.expected.status));
    });
    (G.format_final_verdict || []).forEach((c, i) => {
      const x = c.input;
      const got = FMT.formatFinalVerdict(x.emf_ok, x.iec_ok, x.siemens_ok);
      results.push(assert(`TDIFFFMT golden #${i} format_final_verdict`, matchesExpected(got, c.expected),
        JSON.stringify(got), JSON.stringify(c.expected)));
    });

    return results;
  }

  // ── LINE DIFF MAIN (composition entry, calc/line_diff/main.js) ──────────
  function testLineDiffMain() {
    const results = [];

    // Hand-derived sanity check: ALF=20, Is=1, rct=4, Sn=30
    // EALF = 20 × 1 × (4 + 30/1²) = 680 V.
    const core0 = {
      Is: 1, Ip: 2000, rct: 4, burden: 30, relay_burden: 0.02, alf: 20,
      cable_length: 65, cable_cross: 4, cable_material: 'Kobber (Cu)',
    };
    const cd0 = { isc_sys: 63 };
    const r0 = CTLineDiff.calculate(core0, cd0);
    results.push(assert('LDIFFMAIN EALF', approx(r0.EALF, 680), r0.EALF, 680, ' V'));
    results.push(assert('LDIFFMAIN EALF alias', r0.EALF === r0.proposed_vk, r0.EALF, r0.proposed_vk));
    results.push(assert('LDIFFMAIN Vk_req alias', r0.Vk_req === r0.vk_required, r0.Vk_req, r0.vk_required));
    results.push(assert('LDIFFMAIN Rc alias', r0.Rc === r0.cable_resistance, r0.Rc, r0.cable_resistance));
    results.push(assert('LDIFFMAIN status OK', r0.status === 'OK', r0.status, 'OK'));
    results.push(assert('LDIFFMAIN is_ok', r0.is_ok === true, r0.is_ok, true));

    // Cable resistance from CTCableRes (PORTING_PLAN.md §9.6 9C): the shared
    // module hand checks. Rc / cable_res is the worst of the two cases; with
    // the default four_wire that is the 1-phase one (k = 2 vs 1, §9.8).
    results.push(...checkModuleCableRes('LDIFFMAIN', CTLineDiff.calculate, core0, cd0, 'single_phase', 'line_diff'));
    const lead = (cs, topology = 'four_wire') => CTCableRes.lead('iec60287',
      { material: 'cu', cross_section_mm2: 4, length_m: 65, temp_c: 75 }, topology, cs);
    const l3 = lead('three_phase'), l1 = lead('single_phase');
    results.push(assert('LDIFFMAIN Rc_3ph / Rc_1ph = lead() per case',
      r0.Rc_3ph === l3.r_loop && r0.Rc_1ph === l1.r_loop && r0.Rc === Math.max(r0.Rc_3ph, r0.Rc_1ph),
      `${r0.Rc_3ph} / ${r0.Rc_1ph}`, `${l3.r_loop} / ${l1.r_loop}`, ' Ω'));
    // One topology step per scenario case, with unique keys and case labels
    const s0 = r0.steps;
    const keys0 = s0.map((x) => x.key);
    const st3 = s0[3], st1 = s0[4];
    results.push(assert('LDIFFMAIN lead step per case',
      st3.key === 'total_cable_resistance' && st1.key === 'total_cable_resistance_1ph'
        && st3.result === r0.Rc_3ph && st1.result === r0.Rc_1ph
        && st3.label_en.endsWith('— 3-phase faults') && st1.label_en.endsWith('— 1-phase faults')
        && st3.label_da.endsWith('— 3-fasede fejl') && st1.label_da.endsWith('— 1-fasede fejl'),
      `${st3.key}: ${st3.label_en} / ${st1.key}: ${st1.label_en}`, 'total_cable_resistance / total_cable_resistance_1ph'));
    results.push(assert('LDIFFMAIN step keys unique', new Set(keys0).size === keys0.length,
      keys0.join(','), 'no duplicates'));
    // The same lead resistance feeds the report steps and the E.M.F. math
    const emfStep = (k) => s0.find((x) => x.key === k);
    results.push(assert('LDIFFMAIN EMF steps use the case Rlead',
      emfStep('emf_3phase_internal_fault').variables.Rlead === r0.Rc_3ph
        && emfStep('emf_3phase_through_fault').variables.Rlead === r0.Rc_3ph
        && emfStep('emf_1phase_internal_fault').variables.Rlead === r0.Rc_1ph
        && emfStep('emf_1phase_through_fault').variables.Rlead === r0.Rc_1ph
        && r0.total_resistance_3p === 4 + r0.Rc_3ph + r0.r_relay,
      r0.total_resistance_3p, 4 + r0.Rc_3ph + r0.r_relay, ' Ω'));
    // core.dc_resistance_20 / core.cable_resistance (hand-edited overrides) are ignored (D1)
    const rOv = CTLineDiff.calculate({ ...core0, dc_resistance_20: 9.99, cable_resistance: 5 }, cd0);
    results.push(assert('LDIFFMAIN overrides ignored (D1)',
      rOv.Rc === r0.Rc && rOv.vk_required === r0.vk_required && rOv.warnings.length === r0.warnings.length,
      rOv.Rc, r0.Rc, ' Ω'));

    // Each scenario takes its own case (§9.8): with the default four_wire the
    // 3-phase scenarios get k(3φ)·R_c = R_c and the 1-phase ones k(1φ)·R_c =
    // 2·R_c; Rc / cable_res report the worst case.
    const rK = r0;
    const Rcond = l3.r_conductor;
    const kE3 = 63000 / 2000 * (4 + Rcond + 0.02), kE1 = 63000 / 2000 * (4 + 2 * Rcond + 0.02);
    results.push(assert('LDIFFMAIN per-case factors reach the scenarios (four_wire)',
      rK.Rc_3ph === Rcond && rK.Rc_1ph === 2 * Rcond && rK.Rc === 2 * Rcond && rK.cable_res.factor === 2
        && rK.cable_res.topology === 'four_wire'
        && approx(rK.e_3p_in, kE3) && approx(rK.e_1p_in, kE1)
        && approx(rK.e_3p_ex, 2 * kE3) && approx(rK.e_1p_ex, 2 * kE1)
        && rK.steps[3].result === Rcond && rK.steps[4].result === 2 * Rcond
        && rK.steps[3].label_en.includes('(4-wire)') && rK.steps[4].label_en.includes('(4-wire)'),
      `${rK.e_3p_in} / ${rK.e_1p_in}`, `${kE3} / ${kE1}`, ' V'));
    // six_wire on the core: k = 2 for both cases (the ctvt_dim ×2)
    const r6 = CTLineDiff.calculate({ ...core0, cable_topology: 'six_wire' }, cd0);
    const l3s = lead('three_phase', 'six_wire');
    results.push(assert('LDIFFMAIN six_wire: both cases 2·R_c',
      r6.cable_res.topology === 'six_wire' && r6.Rc_3ph === l3s.r_loop && r6.Rc_1ph === l3s.r_loop
        && r6.Rc_1ph === r0.Rc_1ph && r6.e_1p_in === r0.e_1p_in && approx(r6.e_3p_in, r6.e_1p_in),
      `${r6.Rc_3ph} / ${r6.Rc_1ph}`, `${l3s.r_loop} / ${l3s.r_loop}`, ' Ω'));

    // ── Golden-vector backed (calc/golden/line_diff_main.json ← ct_line_differential/main.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.line_diff_main)
      ? CT_GOLDEN.line_diff_main : null;
    if (!G) return results;

    // Translate Python core_data/common_data keys → CTSizer core/commonData.
    const coreFromGolden = (cd) => ({
      rct: cd.rct, burden: cd.burden, Is: cd.secondary_current, Ip: cd.primary_current,
      relay_burden: cd.relay_burden,
      cable_length: cd.cable_length, cable_cross_section: cd.cable_cross_section,
      cable_material: cd.cable_material,
      alf: cd.alf, is_px_class: cd.is_px_class, vk_voltage: cd.vk_voltage,
      ik_max_3ph: cd.ik_max_3ph, ik_max_1ph: cd.ik_max_1ph,
      it_max_3ph: cd.it_max_3ph, it_max_1ph: cd.it_max_1ph,
      auto_reclose_enabled: cd.auto_reclose_enabled,
      ar_t_prime: cd.ar_t_prime, ar_t_al: cd.ar_t_al, ar_tfr: cd.ar_tfr,
      ar_t_double_al: cd.ar_t_double_al, ar_ts: cd.ar_ts,
      ar_time_constant_class: cd.ar_time_constant_class, ar_ktf_preset: cd.ar_ktf_preset,
    });
    // Zero-diff gate (PORTING_PLAN.md §9.6): line_diff's native method for the
    // math (iec60287) and the case's cable temperature as the project
    // settings; the core carries no cable_temp. by_method cases bring their own.
    const commonFromGolden = (cmd, cd) => ({
      isc_sys: cmd.short_circuit_ka,
      cable_r_method: cmd.cable_r_method ?? 'iec60287',
      cable_temp: cmd.cable_temp ?? cd.cable_temp,
    });

    // Wiring (§9.6 9E): the Python is ×2 for every scenario, so the plain
    // golden cases run with six_wire on the core; by_method / by_topology
    // cases take goldenWiring().
    const SIX_WIRE = { cable_topology: 'six_wire' };
    const checkCase = (i, c, wiring) => {
      const e = c.expected;
      const core = { ...coreFromGolden(c.input.core_data), ...wiring };
      const commonData = commonFromGolden(c.input.common_data, c.input.core_data);
      const got = CTLineDiff.calculate(core, commonData);

      results.push(assert(`LDIFFMAIN golden #${i} status`,
        got.status === e.status, got.status, e.status));
      results.push(assert(`LDIFFMAIN golden #${i} warnings_len`,
        got.warnings.length === e.warnings_len, got.warnings.length, e.warnings_len));
      results.push(assert(`LDIFFMAIN golden #${i} cable_resistance`,
        approx(got.cable_resistance, e.cable_resistance), got.cable_resistance, e.cable_resistance));
      results.push(assert(`LDIFFMAIN golden #${i} r_relay`,
        approx(got.r_relay, e.r_relay), got.r_relay, e.r_relay));
      ['e_3p_in', 'e_1p_in', 'e_3p_ex', 'e_1p_ex'].forEach((k) => {
        results.push(assert(`LDIFFMAIN golden #${i} ${k}`, approx(got[k], e[k]), got[k], e[k]));
      });
      results.push(assert(`LDIFFMAIN golden #${i} vk_required`,
        approx(got.vk_required, e.vk_required), got.vk_required, e.vk_required));
      results.push(assert(`LDIFFMAIN golden #${i} proposed_vk`,
        approx(got.proposed_vk, e.proposed_vk), got.proposed_vk, e.proposed_vk));
      results.push(assert(`LDIFFMAIN golden #${i} is_px`,
        got.is_px === e.is_px, got.is_px, e.is_px));

      if ('eal_ar' in e) {
        results.push(assert(`LDIFFMAIN golden #${i} eal_ar`,
          approx(got.eal_ar, e.eal_ar), got.eal_ar, e.eal_ar));
        results.push(assert(`LDIFFMAIN golden #${i} ktd_ar`,
          approx(got.ktd_ar, e.ktd_ar), got.ktd_ar, e.ktd_ar));
        results.push(assert(`LDIFFMAIN golden #${i} kssc_ar`,
          approx(got.kssc_ar, e.kssc_ar), got.kssc_ar, e.kssc_ar));
      }
      return got;
    };
    const stepResult = (got, key) => (got.steps.find((x) => x.key === key) || {}).result;

    (G.calculate_line_differential || []).forEach((c, i) => {
      const got = checkCase(`${i}`, c, SIX_WIRE);
      // Named delta: the report steps now show the value the math uses
      // (under iec60287, R′20 is the formula, not the IEC 60228 table).
      results.push(assert(`LDIFFMAIN golden #${i} report = math (iec60287)`,
        got.cable_res.method === 'iec60287' && got.cable_res.source === 'iec60287_formula'
          && stepResult(got, 'total_cable_resistance') === got.cable_resistance
          && stepResult(got, 'total_cable_resistance_1ph') === got.cable_resistance,
        stepResult(got, 'total_cable_resistance'), got.cable_resistance, ' Ω'));
      // Named delta (§9.8) under the default wiring (4-wire): the 3-phase
      // scenarios get half the lead resistance; the 1-phase ones keep k = 2.
      const dflt = CTLineDiff.calculate(coreFromGolden(c.input.core_data),
        commonFromGolden(c.input.common_data, c.input.core_data));
      results.push(assert(`LDIFFMAIN golden #${i} default wiring: 3-phase Rc halves, 1-phase unchanged`,
        dflt.cable_res.topology === 'four_wire' && dflt.Rc_3ph === got.Rc_3ph / 2 && dflt.Rc_1ph === got.Rc_1ph
          && dflt.Rc === got.Rc && dflt.e_1p_in === got.e_1p_in && dflt.e_1p_ex === got.e_1p_ex
          && dflt.e_3p_in < got.e_3p_in,
        `${dflt.Rc_3ph} / ${dflt.Rc_1ph}`, `${got.Rc_3ph / 2} / ${got.Rc_1ph}`, ' Ω'));
    });

    // by_method (§9.5): the Python ran with the toolbox r_loop injected as
    // cable_resistance and its report path hooked onto the toolbox R′20.
    const bm = G.by_method || [];
    bm.forEach((c, i) => {
      const e = c.expected;
      const got = checkCase(`by_method ${i} ${c.input.common_data.cable_r_method}`, c, goldenWiring(c));
      results.push(...checkByMethodCableRes(`LDIFFMAIN by_method #${i}`, got, c));
      results.push(assert(`LDIFFMAIN by_method #${i} report R′T`,
        approx(stepResult(got, 'cable_resistance_at_temp'), e.report_rho_temp),
        stepResult(got, 'cable_resistance_at_temp'), e.report_rho_temp, ' Ω/km'));
      results.push(assert(`LDIFFMAIN by_method #${i} report R_lead (both cases)`,
        approx(stepResult(got, 'total_cable_resistance'), e.report_r_lead)
          && approx(stepResult(got, 'total_cable_resistance_1ph'), e.report_r_lead),
        stepResult(got, 'total_cable_resistance'), e.report_r_lead, ' Ω'));
    });
    // Each case pair flips the verdict with the method.
    for (let i = 0; i + 1 < bm.length; i += 2) {
      const st = `${bm[i].expected.status}/${bm[i + 1].expected.status}`;
      results.push(assert(`LDIFFMAIN by_method #${i} verdict differs by method`,
        bm[i].expected.status !== bm[i + 1].expected.status, st, 'different'));
    }
    results.push(assert('LDIFFMAIN by_method cases', bm.length === 4, bm.length, 4));

    // by_topology (§9.6 9E): iec60287; the Python's 3-phase scenarios were
    // hooked onto cable_res_3ph, the 1-phase ones took cable_res (the worst
    // case, = Rc / cable_res here).
    const bt = G.by_topology || [];
    bt.forEach((c, i) => {
      const e = c.expected;
      const tag = `LDIFFMAIN by_topology #${i} ${e.cable_res.topology}`;
      const got = checkCase(`by_topology ${i} ${e.cable_res.topology}`, c, goldenWiring(c));
      results.push(...checkByMethodCableRes(tag, got, c));
      results.push(assert(`${tag} Rc_3ph / Rc_1ph`,
        approx(got.Rc_3ph, e.cable_res_3ph.r_loop) && approx(got.Rc_1ph, e.cable_res.r_loop)
          && got.Rc_3ph === e.cable_res_3ph.factor * got.cable_res.r_conductor
          && stepResult(got, 'total_cable_resistance') === got.Rc_3ph
          && stepResult(got, 'total_cable_resistance_1ph') === got.Rc_1ph,
        `${got.Rc_3ph} / ${got.Rc_1ph}`, `${e.cable_res_3ph.r_loop} / ${e.cable_res.r_loop}`, ' Ω'));
      results.push(assert(`${tag} report R′T`,
        approx(stepResult(got, 'cable_resistance_at_temp'), e.report_rho_temp),
        stepResult(got, 'cable_resistance_at_temp'), e.report_rho_temp, ' Ω/km'));
    });
    const kOf = (c) => `${c.input.cable_topology ?? 'default'}:${c.expected.cable_res_3ph.factor}/${c.expected.cable_res.factor}`;
    const wantK = 'default:1/2,six_wire:2/2,default:1/2';
    results.push(assert('LDIFFMAIN by_topology cases: k(3φ)/k(1φ) per wiring',
      bt.map(kOf).join(',') === wantK && bt.every((c) => c.expected.cable_res.topology === (c.input.cable_topology ?? 'four_wire')),
      bt.map(kOf).join(','), wantK));
    if (bt.length === 3) {
      // 4-wire lowers only the 3-phase E.M.F.s; six_wire = by_method #0 (the Python ×2)
      results.push(assert('LDIFFMAIN by_topology: 4-wire changes only the 3-phase scenarios',
        bt[0].expected.e_3p_in < bt[1].expected.e_3p_in && bt[0].expected.e_1p_in === bt[1].expected.e_1p_in
          && bt[1].expected.e_3p_in === bm[0].expected.e_3p_in && bt[1].expected.vk_required === bm[0].expected.vk_required,
        `${bt[0].expected.e_3p_in} / ${bt[1].expected.e_3p_in}`, '4-wire < 6-wire'));
    }

    return results;
  }

  // ── LINE DIFF / DATA (extraction, calc/line_diff/data.js) ──────────────
  function testLineDiffData() {
    const results = [];

    // Hand-derived: all-defaults cases (empty core/commonData).
    const ctIn = CTLineDiff.data.extractCtInputs({});
    results.push(assert('LDIFFDATA default rct', ctIn.rct === 4, ctIn.rct, 4));
    results.push(assert('LDIFFDATA default relay_burden', ctIn.relay_burden === 0.02, ctIn.relay_burden, 0.02));

    const cableData = CTLineDiff.data.extractCableData({});
    results.push(assert('LDIFFDATA default cable_material', cableData.cable_material === 'Kobber (Cu)', cableData.cable_material, 'Kobber (Cu)'));
    // Cable (PORTING_PLAN.md §9): no project settings → iec60287 at 75 °C;
    // dc_resistance_20 is the toolbox's R′20, IEC 60228 (4.61 Ω/km) only
    // when the project selects `table`. One lead() call, the 3-phase case,
    // with the default wiring (four_wire, k = 1, §9.8).
    results.push(assert('LDIFFDATA default cable method/temp',
      cableData.cable_res.method === 'iec60287' && cableData.cable_temp === 75
        && cableData.dc_resistance_20 === cableData.cable_res.r20_per_km
        && cableData.cable_res.source === 'iec60287_formula'
        && cableData.cable_res.topology === 'four_wire' && cableData.cable_res.current_case === 'three_phase'
        && cableData.cable_res.factor === 1,
      `${cableData.cable_res.method} @ ${cableData.cable_temp}`, 'iec60287 @ 75'));
    const cT = CTLineDiff.data.extractCableData({ cable_temp: 20, cable_mat: 'al', cable_cross: 6, cable_length: 40 },
      { cable_r_method: 'table', cable_temp: 60 });
    results.push(assert('LDIFFDATA table dc_resistance_20, project temp',
      approx(cT.dc_resistance_20, 4.61) && cT.cable_temp === 60 && cT.cable_material === 'Aluminium (Al)'
        && cT.cable_cross_section === 6 && cT.cable_length === 40 && cT.cable_res.method === 'table',
      `${cT.dc_resistance_20} @ ${cT.cable_temp}`, '4.61 @ 60'));

    const fc = CTLineDiff.data.extractFaultCurrents({}, {});
    const expFc = { ik_max_3ph: 63000, ik_max_1ph: 63000, it_max_3ph: 63000, it_max_1ph: 63000 };
    results.push(assert('LDIFFDATA default fault_currents', matchesExpected(fc, expFc), JSON.stringify(fc), JSON.stringify(expFc)));

    const arOff = CTLineDiff.data.extractAutoReclosureParams({});
    results.push(assert('LDIFFDATA AR disabled -> null', arOff === null, arOff, null));

    const arOn = CTLineDiff.data.extractAutoReclosureParams({ auto_reclose_enabled: true });
    results.push(assert('LDIFFDATA AR default t_double_al = t_prime default', arOn.t_double_al === 0.1, arOn.t_double_al, 0.1));

    // ── Golden-vector backed (calc/golden/line_diff_data.json <- ct_line_differential/data.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.line_diff_data)
      ? CT_GOLDEN.line_diff_data : null;
    if (!G) return results;

    // Translate Python's core_data/common_data dict keys to CTSizer's core/commonData shape
    // — each function reads a different subset of fields, so each gets its own mapper.
    const ctInputsCoreFromGolden = (cd) => ({
      rct: cd.rct, burden: cd.burden, Is: cd.secondary_current, Ip: cd.primary_current,
      relay_burden: cd.relay_burden,
    });
    const cableCoreFromGolden = (cd) => ({
      cable_length: cd.cable_length, cable_cross_section: cd.cable_cross_section,
      cable_material: cd.cable_material, dc_resistance_20: cd.dc_resistance_20,
    });
    // Zero-diff gate (PORTING_PLAN.md §9.6): extract_cable_data's R′20 is the
    // report path, which used the IEC 60228 table — so `table` and the case's
    // cable temperature (Python default 75 °C) as the project settings.
    const cableCommonFromGolden = (cd) => ({ cable_r_method: 'table', cable_temp: cd.cable_temp ?? 75 });
    const faultCoreFromGolden = (cd) => ({
      Ip: cd.primary_current, ik_max_3ph: cd.ik_max_3ph, ik_max_1ph: cd.ik_max_1ph,
      it_max_3ph: cd.it_max_3ph, it_max_1ph: cd.it_max_1ph,
    });
    const faultCommonFromGolden = (cmd) => ({ isc_sys: cmd.short_circuit_ka });
    const arCoreFromGolden = (cd) => ({
      auto_reclose_enabled: cd.auto_reclose_enabled,
      ar_t_prime: cd.ar_t_prime, ar_t_al: cd.ar_t_al, ar_tfr: cd.ar_tfr,
      ar_t_double_al: cd.ar_t_double_al, ar_ts: cd.ar_ts,
      ar_time_constant_class: cd.ar_time_constant_class, ar_ktf_preset: cd.ar_ktf_preset,
    });

    (G.extract_ct_inputs || []).forEach((c, i) => {
      const got = CTLineDiff.data.extractCtInputs(ctInputsCoreFromGolden(c.input.core_data));
      results.push(assert(`LDIFFDATA golden #${i} ct_inputs`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    const cableCases = G.extract_cable_data || [];
    cableCases.forEach((c, i) => {
      const got = CTLineDiff.data.extractCableData(cableCoreFromGolden(c.input.core_data),
        cableCommonFromGolden(c.input.core_data));
      // Named delta (D1): the core.dc_resistance_20 override is ignored, so
      // R′20 is the Python value of a case with the same cable and no override.
      let exp = c.expected;
      if (c.input.core_data.dc_resistance_20 !== undefined) {
        const ref = cableCases.find((o) => o.input.core_data.dc_resistance_20 === undefined
          && o.expected.cable_material === exp.cable_material
          && o.expected.cable_cross_section === exp.cable_cross_section);
        results.push(assert(`LDIFFDATA golden #${i} override ignored (D1)`,
          !!ref && got.dc_resistance_20 !== c.input.core_data.dc_resistance_20,
          got.dc_resistance_20, ref ? ref.expected.dc_resistance_20 : 'a reference case'));
        exp = { ...exp, dc_resistance_20: ref ? ref.expected.dc_resistance_20 : NaN };
      }
      results.push(assert(`LDIFFDATA golden #${i} cable_data`,
        matchesExpected(got, exp), JSON.stringify({ ...got, cable_res: undefined }), JSON.stringify(exp)));
    });

    (G.extract_fault_currents || []).forEach((c, i) => {
      const core = faultCoreFromGolden(c.input.core_data);
      const commonData = faultCommonFromGolden(c.input.common_data);
      const got = CTLineDiff.data.extractFaultCurrents(commonData, core);
      results.push(assert(`LDIFFDATA golden #${i} fault_currents`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    (G.extract_auto_reclosure_params || []).forEach((c, i) => {
      const got = CTLineDiff.data.extractAutoReclosureParams(arCoreFromGolden(c.input.core_data));
      results.push(assert(`LDIFFDATA golden #${i} ar_params`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    return results;
  }

  // ── LINE_DIFF EMF_CALCULATION (golden-vector backed) ─────────────────
  function testLineDiffEmfCalculation() {
    const results = [];

    // Hand-derived: under-cap resistance passes through unchanged.
    const rUnderCap = CTLineDiff.emfCalculation.calculateTotalResistance3ph(4, 1.5, 0.5);
    results.push(assert('LDIFFEMF total resistance under cap', rUnderCap === 6, rUnderCap, 6, ' Ω'));

    // Hand-derived: over-cap resistance clamps to MAX_TOTAL_RESISTANCE (99 Ω).
    const rOverCap = CTLineDiff.emfCalculation.calculateTotalResistance1ph(50, 40, 20);
    results.push(assert('LDIFFEMF total resistance capped', rOverCap === 99, rOverCap, 99, ' Ω'));

    // Hand-derived: external (through-fault) scenarios carry the ×2 stability factor.
    const eIn = CTLineDiff.emfCalculation.calculateEmf3PhaseInternal(5000, 1, 2000, 5.5);
    const eEx = CTLineDiff.emfCalculation.calculateEmf3PhaseExternal(5000, 1, 2000, 5.5);
    results.push(assert('LDIFFEMF external = 2x internal', approx(eEx, 2 * eIn), eEx, 2 * eIn, ' V'));

    // Hand-derived: calculateAllEmfScenarios surfaces the resistance-cap warning tuple.
    const capped = CTLineDiff.emfCalculation.calculateAllEmfScenarios(
      { ik_max_3ph: 90000, ik_max_1ph: 90000, it_max_3ph: 90000, it_max_1ph: 90000 },
      5, 50, 50, 40, 20
    );
    results.push(assert('LDIFFEMF warning on cap', capped.warnings.length === 1, capped.warnings.length, 1));
    results.push(assert('LDIFFEMF warning key', capped.warnings[0][0] === 'warning_total_resistance_capped',
      capped.warnings[0][0], 'warning_total_resistance_capped'));

    const uncapped = CTLineDiff.emfCalculation.calculateAllEmfScenarios(
      { ik_max_3ph: 63000, ik_max_1ph: 50000, it_max_3ph: 40000, it_max_1ph: 30000 },
      1, 2000, 4, 1.5, 0.5
    );
    results.push(assert('LDIFFEMF no warning under cap', uncapped.warnings.length === 0, uncapped.warnings.length, 0));

    // Hand-derived: the optional 1-phase lead resistance (§9.8) feeds only the
    // 1-phase scenarios; omitted, it equals the 3-phase one (the Python).
    const split = CTLineDiff.emfCalculation.calculateAllEmfScenarios(
      { ik_max_3ph: 63000, ik_max_1ph: 50000, it_max_3ph: 40000, it_max_1ph: 30000 },
      1, 2000, 4, 1.5, 0.5, 3
    );
    results.push(assert('LDIFFEMF 1-phase lead resistance',
      split.total_resistance_3p === 6 && split.total_resistance_1p === 7.5
        && split.e_3p_in === uncapped.e_3p_in && split.e_3p_ex === uncapped.e_3p_ex
        && approx(split.e_1p_in, 50000 / 2000 * 7.5) && approx(split.e_1p_ex, 2 * 30000 / 2000 * 7.5),
      `${split.total_resistance_3p} / ${split.total_resistance_1p}`, '6 / 7.5', ' Ω'));
    const cap1 = CTLineDiff.emfCalculation.calculateAllEmfScenarios(
      { ik_max_3ph: 1, ik_max_1ph: 1, it_max_3ph: 1, it_max_1ph: 1 }, 1, 1, 4, 1, 0, 120);
    results.push(assert('LDIFFEMF cap warning from the 1-phase lead',
      cap1.warnings.length === 1 && cap1.warnings[0][1] === 124 && cap1.total_resistance_3p === 5,
      JSON.stringify(cap1.warnings), '[[…, 124, 99]]'));

    // ── Golden-vector backed (calc/golden/line_diff_emf_calculation.json <- ct_line_differential/emf_calculation.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.line_diff_emf_calculation)
      ? CT_GOLDEN.line_diff_emf_calculation : null;
    if (!G) return results;

    (G.calculate_total_resistance_3ph || []).forEach((c, i) => {
      const got = CTLineDiff.emfCalculation.calculateTotalResistance3ph(
        c.input.rct, c.input.cable_resistance, c.input.r_relay
      );
      results.push(assert(`LDIFFEMF golden #${i} total_resistance_3ph`, approx(got, c.expected), got, c.expected, ' Ω'));
    });

    (G.calculate_total_resistance_1ph || []).forEach((c, i) => {
      const got = CTLineDiff.emfCalculation.calculateTotalResistance1ph(
        c.input.rct, c.input.cable_resistance, c.input.r_relay
      );
      results.push(assert(`LDIFFEMF golden #${i} total_resistance_1ph`, approx(got, c.expected), got, c.expected, ' Ω'));
    });

    (G.calculate_emf_3phase_internal || []).forEach((c, i) => {
      const got = CTLineDiff.emfCalculation.calculateEmf3PhaseInternal(
        c.input.current, c.input.secondary_current, c.input.primary_current, c.input.total_resistance
      );
      results.push(assert(`LDIFFEMF golden #${i} emf_3phase_internal`, approx(got, c.expected), got, c.expected, ' V'));
    });

    (G.calculate_emf_1phase_internal || []).forEach((c, i) => {
      const got = CTLineDiff.emfCalculation.calculateEmf1PhaseInternal(
        c.input.current, c.input.secondary_current, c.input.primary_current, c.input.total_resistance
      );
      results.push(assert(`LDIFFEMF golden #${i} emf_1phase_internal`, approx(got, c.expected), got, c.expected, ' V'));
    });

    (G.calculate_emf_3phase_external || []).forEach((c, i) => {
      const got = CTLineDiff.emfCalculation.calculateEmf3PhaseExternal(
        c.input.current, c.input.secondary_current, c.input.primary_current, c.input.total_resistance
      );
      results.push(assert(`LDIFFEMF golden #${i} emf_3phase_external`, approx(got, c.expected), got, c.expected, ' V'));
    });

    (G.calculate_emf_1phase_external || []).forEach((c, i) => {
      const got = CTLineDiff.emfCalculation.calculateEmf1PhaseExternal(
        c.input.current, c.input.secondary_current, c.input.primary_current, c.input.total_resistance
      );
      results.push(assert(`LDIFFEMF golden #${i} emf_1phase_external`, approx(got, c.expected), got, c.expected, ' V'));
    });

    (G.calculate_all_emf_scenarios || []).forEach((c, i) => {
      const got = CTLineDiff.emfCalculation.calculateAllEmfScenarios(
        c.input.fault_currents, c.input.secondary_current, c.input.primary_current,
        c.input.rct, c.input.cable_resistance, c.input.r_relay
      );
      results.push(assert(`LDIFFEMF golden #${i} all_emf_scenarios`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    return results;
  }

  function testLineDiffKneePoint() {
    const results = [];

    // Hand-derived: required Vk is the max of all four E.M.F. scenarios.
    const reqVk = CTLineDiff.kneePoint.calculateRequiredVk(
      { e_3p_in: 120.5, e_1p_in: 95.2, e_3p_ex: 80.0, e_1p_ex: 150.75 }
    );
    results.push(assert('LDIFFKNEE required Vk = max of 4 scenarios', reqVk === 150.75, reqVk, 150.75, ' V'));

    // Hand-derived: calculateProposedVk is a direct re-export of CTKnee.calcProposedVk.
    results.push(assert('LDIFFKNEE proposedVk is CTKnee re-export',
      CTLineDiff.kneePoint.calculateProposedVk === CTKnee.calcProposedVk, true, true));

    // Hand-derived: verifyVkAdequacy drops the warning element from CTKnee's tuple.
    const adequate = CTLineDiff.kneePoint.verifyVkAdequacy(300, 200, false);
    results.push(assert('LDIFFKNEE adequate -> OK/ct_sufficient, no warning key',
      adequate.status === 'OK' && adequate.conclusion === 'ct_sufficient' && !('warning' in adequate),
      JSON.stringify(adequate), 'OK/ct_sufficient, no warning'));

    const inadequate = CTLineDiff.kneePoint.verifyVkAdequacy(100, 200, false);
    results.push(assert('LDIFFKNEE inadequate -> NOT_OK/ct_insufficient',
      inadequate.status === 'NOT_OK' && inadequate.conclusion === 'ct_insufficient',
      JSON.stringify(inadequate), 'NOT_OK/ct_insufficient'));

    // ── Golden-vector backed (calc/golden/line_diff_knee_point.json <- ct_line_differential/knee_point.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.line_diff_knee_point)
      ? CT_GOLDEN.line_diff_knee_point : null;
    if (!G) return results;

    (G.calculate_required_vk || []).forEach((c, i) => {
      const got = CTLineDiff.kneePoint.calculateRequiredVk(c.input);
      results.push(assert(`LDIFFKNEE golden #${i} required_vk`, approx(got, c.expected), got, c.expected, ' V'));
    });

    (G.verify_vk_adequacy || []).forEach((c, i) => {
      const got = CTLineDiff.kneePoint.verifyVkAdequacy(c.input.proposed_vk, c.input.required_vk, c.input.is_px);
      results.push(assert(`LDIFFKNEE golden #${i} verify_vk_adequacy`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    return results;
  }

  function testLineDiffAutoReclosureExt() {
    const results = [];

    // Hand-derived: primary_current==0 guard short-circuits Kssc to 0.
    const ksscZero = CTLineDiff.autoReclosureExt.calculateArKssc(
      { it_max_3ph: 1000, it_max_1ph: 4000 }, 0
    );
    results.push(assert('LDIFFAREXT kssc primary_current=0 -> 0', ksscZero === 0, ksscZero, 0));

    // Hand-derived: kssc uses the max of it_max_3ph/it_max_1ph.
    const kssc = CTLineDiff.autoReclosureExt.calculateArKssc(
      { it_max_3ph: 8000, it_max_1ph: 6000 }, 2000
    );
    results.push(assert('LDIFFAREXT kssc = max(it_3ph,it_1ph)/Ip', kssc === 4.0, kssc, 4.0));

    // Hand-derived: ar_params == null short-circuits compute_auto_reclosure_analysis to null.
    const nullAnalysis = CTLineDiff.autoReclosureExt.computeAutoReclosureAnalysis(
      null, { it_max_3ph: 8000, it_max_1ph: 6000 }, { primary_current: 2000, secondary_current: 1, rct: 4 }, 10
    );
    results.push(assert('LDIFFAREXT null ar_params -> null analysis', nullAnalysis === null, nullAnalysis, null));

    // ── Golden-vector backed (calc/golden/line_diff_auto_reclosure_ext.json <- ct_line_differential/auto_reclosure_ext.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.line_diff_auto_reclosure_ext)
      ? CT_GOLDEN.line_diff_auto_reclosure_ext : null;
    if (!G) return results;

    (G.calculate_ar_ktd || []).forEach((c, i) => {
      const ktfCurve = CTLineDiff.autoReclosureExt.getKtfCurve(c.input.preset_name);
      const got = CTLineDiff.autoReclosureExt.calculateArKtd(c.input.ar_params, ktfCurve);
      results.push(assert(`LDIFFAREXT golden #${i} calculate_ar_ktd`, approx(got, c.expected), got, c.expected));
    });

    (G.calculate_ar_kssc || []).forEach((c, i) => {
      const got = CTLineDiff.autoReclosureExt.calculateArKssc(c.input.fault_currents, c.input.primary_current);
      results.push(assert(`LDIFFAREXT golden #${i} calculate_ar_kssc`, approx(got, c.expected), got, c.expected));
    });

    (G.calculate_ar_eal || []).forEach((c, i) => {
      const got = CTLineDiff.autoReclosureExt.calculateArEal(
        c.input.kssc, c.input.ktd, c.input.rct, c.input.burden_resistance, c.input.secondary_current
      );
      results.push(assert(`LDIFFAREXT golden #${i} calculate_ar_eal`, approx(got, c.expected), got, c.expected, ' V'));
    });

    (G.compute_auto_reclosure_analysis || []).forEach((c, i) => {
      const got = CTLineDiff.autoReclosureExt.computeAutoReclosureAnalysis(
        c.input.ar_params, c.input.fault_currents, c.input.ct_inputs, c.input.burden_resistance
      );
      results.push(assert(`LDIFFAREXT golden #${i} compute_auto_reclosure_analysis`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    return results;
  }

  function testLineDiffFormatting() {
    const results = [];
    const FMT = CTLineDiff.formatting;

    // Hand-derived: each step builder returns a CTStep row whose `key` matches
    // the corresponding StepNames constant, and `result` echoes the value arg.
    // The cable steps come from CTCableRes (PORTING_PLAN.md §9.6 9C); the old
    // cable / lead step builders are gone.
    results.push(assert('LDIFFFMT old cable steps removed',
      !('formatCableResistanceStep' in FMT) && !('formatLeadResistanceStep' in FMT), true, true));
    // The toolbox topology step, once per scenario case: own key + case label
    const topo = CTCableRes.lead('iec60287', { material: 'cu', cross_section_mm2: 4, length_m: 65, temp_c: 75 },
      'six_wire', 'three_phase').steps[3];
    const lead3 = FMT.formatLeadResistanceCaseStep(topo, 'three_phase');
    const lead1 = FMT.formatLeadResistanceCaseStep(topo, 'single_phase');
    results.push(assert('LDIFFFMT lead case keys',
      lead3.key === 'total_cable_resistance' && lead1.key === 'total_cable_resistance_1ph'
        && lead3.result === topo.result && lead3.latex === topo.latex && topo.key === 'total_cable_resistance',
      `${lead3.key} / ${lead1.key}`, 'total_cable_resistance / total_cable_resistance_1ph'));
    results.push(assert('LDIFFFMT lead case labels',
      lead3.label_en === `${topo.label_en} — 3-phase faults` && lead1.label_da === `${topo.label_da} — 1-fasede fejl`,
      `${lead3.label_en} / ${lead1.label_da}`, '… — 3-phase faults / … — 1-fasede fejl'));
    let caseErr = null;
    try { FMT.formatLeadResistanceCaseStep(topo, 'two_phase'); } catch (e) { caseErr = e; }
    results.push(assert('LDIFFFMT lead case unknown → throws', caseErr instanceof Error, String(caseErr), 'Error'));

    const relay = FMT.formatRelayResistanceStep(0.05, 0.05, 1);
    results.push(assert('LDIFFFMT relay key', relay.key === 'relay_resistance', relay.key, 'relay_resistance'));

    const px = FMT.formatProposedVkPxStep(150);
    results.push(assert('LDIFFFMT px key', px.key === 'specified_knee_point_voltage_px', px.key, 'specified_knee_point_voltage_px'));
    results.push(assert('LDIFFFMT px result', px.result === 150, px.result, 150));

    // ── Golden-vector backed (calc/golden/line_diff_formatting.json <- ct_line_differential/formatting.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.line_diff_formatting)
      ? CT_GOLDEN.line_diff_formatting : null;
    if (!G) return results;

    const checkKeyValue = (name, fn, cases, valueField) => {
      (cases || []).forEach((c, i) => {
        const got = fn(c.input);
        results.push(assert(`LDIFFFMT golden #${i} ${name} key`, got.key === c.expected.key, got.key, c.expected.key));
        results.push(assert(`LDIFFFMT golden #${i} ${name} result`, approx(got.result, c.expected.value), got.result, c.expected.value));
        void valueField;
      });
    };

    checkKeyValue('format_relay_resistance_step', (i) => FMT.formatRelayResistanceStep(i.r_relay, i.relay_burden, i.secondary_current), G.format_relay_resistance_step);
    checkKeyValue('format_emf_3phase_internal_step', (i) => FMT.formatEmf3PhaseInternalStep(i.e_3p_in, i.ik_max, i.isr, i.ipr, i.rct, i.rlead, i.rrelay), G.format_emf_3phase_internal_step);
    checkKeyValue('format_emf_1phase_internal_step', (i) => FMT.formatEmf1PhaseInternalStep(i.e_1p_in, i.ik_max, i.isr, i.ipr, i.rct, i.rlead, i.rrelay), G.format_emf_1phase_internal_step);
    checkKeyValue('format_emf_3phase_external_step', (i) => FMT.formatEmf3PhaseExternalStep(i.e_3p_ex, i.it_max, i.isr, i.ipr, i.rct, i.rlead, i.rrelay), G.format_emf_3phase_external_step);
    checkKeyValue('format_emf_1phase_external_step', (i) => FMT.formatEmf1PhaseExternalStep(i.e_1p_ex, i.it_max, i.isr, i.ipr, i.rct, i.rlead, i.rrelay), G.format_emf_1phase_external_step);
    checkKeyValue('format_required_vk_step', (i) => FMT.formatRequiredVkStep(i.vk_required, i.e_3p_in, i.e_1p_in, i.e_3p_ex, i.e_1p_ex), G.format_required_vk_step);
    checkKeyValue('format_proposed_vk_px_step', (i) => FMT.formatProposedVkPxStep(i.vk), G.format_proposed_vk_px_step);
    checkKeyValue('format_proposed_vk_alf_step', (i) => FMT.formatProposedVkAlfStep(i.ealf, i.alf, i.isr, i.rct, i.burden_resistance), G.format_proposed_vk_alf_step);
    checkKeyValue('format_ar_eal_step', (i) => FMT.formatArEalStep(i.eal_ar, i.kssc_ar, i.ktd_ar, i.rct, i.burden_resistance, i.isr), G.format_ar_eal_step);

    return results;
  }

  // ── FOUNDATION (golden-vector backed) ────────────────────────────────
  // Verifies calc/foundation/{base_core,knee_point,base_classes}.js against
  // numbers generated from ctvt_dim (calc/golden/foundation.json). The golden
  // file is injected as CT_GOLDEN by tools/run-tests.mjs; in the browser it is
  // absent, so this suite skips silently (the hard-coded suites below still run).
  function testFoundation() {
    const results = [];
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.foundation)
      ? CT_GOLDEN.foundation : null;
    if (!G) return results;

    (G.calculate_relay_resistance || []).forEach((c, i) => {
      const got = CTBase.calcRelayResistance(c.input[0], c.input[1]);
      results.push(assert(`base.relayR #${i}`, approx(got, c.expected), got, c.expected, ' Ω'));
    });
    (G.calculate_ealf || []).forEach((c, i) => {
      const got = CTBase.calcEalf(c.input[0], c.input[1], c.input[2], c.input[3]);
      results.push(assert(`base.ealf #${i}`, approx(got, c.expected), got, c.expected, ' V'));
    });
    (G.calculate_operating_alf || []).forEach((c, i) => {
      const got = CTBase.calcOperatingAlf(c.input[0], c.input[1], c.input[2], c.input[3]);
      results.push(assert(`base.opAlf #${i}`, approx(got, c.expected), got, c.expected));
    });
    (G.get_alf_or_vk || []).forEach((c, i) => {
      const got = CTBase.getAlfOrVk(c.input);
      const gv = got.is_px ? got.vk : got.alf;
      const ev = c.expected.is_px ? c.expected.vk : c.expected.alf;
      results.push(assert(`base.alfOrVk #${i}`,
        got.is_px === c.expected.is_px && approx(gv, ev), gv, ev));
    });
    (G.calculate_proposed_vk || []).forEach((c, i) => {
      const got = CTKnee.calcProposedVk(c.input[0], c.input[1], c.input[2], c.input[3], c.input[4], c.input[5]);
      results.push(assert(`knee.proposedVk #${i}`,
        approx(got.vk, c.expected.vk) && got.is_px === c.expected.is_px, got.vk, c.expected.vk, ' V'));
    });
    (G.verify_vk_adequacy || []).forEach((c, i) => {
      const got = CTKnee.verifyVkAdequacy(c.input[0], c.input[1], c.input[2]);
      results.push(assert(`knee.verifyVk #${i}`, got.status === c.expected.status, got.status, c.expected.status));
    });
    (G.get_remanence_factor || []).forEach((c, i) => {
      const got = CTBaseClasses.getRemanenceFactor(c.input[0]);
      results.push(assert(`classes.remanence #${i}`, approx(got, c.expected), got, c.expected));
    });
    (G.get_typical_ts || []).forEach((c, i) => {
      const got = CTBaseClasses.getTypicalTs(c.input[0]);
      results.push(assert(`classes.typicalTs #${i}`, approx(got, c.expected), got, c.expected, ' s'));
    });
    (G.map_class_to_time_constant || []).forEach((c, i) => {
      const got = CTBaseClasses.mapClassToTimeConstant(c.input[0]);
      results.push(assert(`classes.timeConstant #${i}`, got === c.expected, got, c.expected));
    });
    (G.extract_alf_from_class || []).forEach((c, i) => {
      const got = CTBaseClasses.extractAlfFromClass(c.input[0]);
      results.push(assert(`classes.extractAlf #${i}`, got === c.expected, got, c.expected));
    });
    (G.estimate_alf_from_voltage || []).forEach((c, i) => {
      const got = CTBaseClasses.estimateAlfFromVoltage(c.input[0], c.input[1]);
      results.push(assert(`classes.estimateAlf #${i}`, approx(got, c.expected), got, c.expected));
    });
    if (G.ct_class_descriptions) {
      const expectedKeys = Object.keys(G.ct_class_descriptions).sort();
      const gotKeys = Object.keys(CTBaseClasses.CT_CLASS_DESCRIPTIONS).sort();
      results.push(assert('classes.descriptions keys',
        JSON.stringify(gotKeys) === JSON.stringify(expectedKeys), gotKeys.join(','), expectedKeys.join(',')));
      expectedKeys.forEach((cls) => {
        const exp = G.ct_class_descriptions[cls];
        const got = CTBaseClasses.CT_CLASS_DESCRIPTIONS[cls] || {};
        const fieldsMatch = Object.keys(exp).every((f) => got[f] === exp[f]);
        results.push(assert(`classes.descriptions ${cls}`, fieldsMatch, JSON.stringify(got), JSON.stringify(exp)));
      });
    }
    (G.check_core_adequacy || []).forEach((c, i) => {
      const got = CTBaseAdequacy.checkCoreAdequacy(
        c.input[0], c.input[1], c.input[2], c.input[3], c.input[4], c.input[5]);
      results.push(assert(`adequacy.checkCore #${i}`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });
    (G.calculate_remanence_benefit || []).forEach((c, i) => {
      const got = CTBaseAdequacy.calculateRemanenceBenefit(c.input[0], c.input[1], c.input[2]);
      results.push(assert(`adequacy.remanenceBenefit #${i}`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });
    (G.recommend_ct_class || []).forEach((c, i) => {
      const got = CTBaseAdequacy.recommendCtClass(c.input[0], c.input[1], c.input[2], c.input[3]);
      results.push(assert(`adequacy.recommendClass #${i}`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });
    return results;
  }

  // ── VT DATA (calc/vt/data.js) ─────────────────────────────────────────
  function testVtData() {
    const results = [];
    const D = CTVT.data;

    // Hand-derived: defaults, CTSizer-shaped empty input, and the validator's verdicts.
    const d0 = D.extractVtCoreData({});
    results.push(assert('VTDATA default thermal_burden', d0.thermal_burden === 50, d0.thermal_burden, 50));
    results.push(assert('VTDATA default vt_class', d0.vt_class === '0.2', d0.vt_class, '0.2'));
    results.push(assert('VTDATA common default', D.extractCommonData().cable_resistance === 0,
      D.extractCommonData().cable_resistance, 0));
    const [ok0, err0] = D.validateVtInputs({});
    results.push(assert('VTDATA defaults valid', ok0 === true && err0.length === 0, ok0, true));
    const [okE, errE] = D.validateVtInputs({ burden: 50 });
    results.push(assert('VTDATA thermal == burden valid', okE === true && errE.length === 0, okE, true));
    const [okT, errT] = D.validateVtInputs({ burden: 60 });
    results.push(assert('VTDATA thermal < burden invalid', okT === false && errT.length === 1, errT.length, 1));

    // ── Golden-vector backed (calc/golden/vt_data.json <- vt_calculations/data.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.vt_data) ? CT_GOLDEN.vt_data : null;
    if (!G) return results;

    (G.extract_vt_core_data || []).forEach((c, i) => {
      const got = D.extractVtCoreData(c.input.core);
      results.push(assert(`VTDATA golden #${i} core_data`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    (G.extract_common_data || []).forEach((c, i) => {
      const got = D.extractCommonData(c.input.common_data);
      results.push(assert(`VTDATA golden #${i} common_data`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    (G.validate_vt_inputs || []).forEach((c, i) => {
      const got = D.validateVtInputs(c.input.core_data);
      results.push(assert(`VTDATA golden #${i} validate`,
        matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
    });

    return results;
  }

  // ── VT PRESETS (calc/vt/presets.js) ───────────────────────────────────
  function testVtPresets() {
    const results = [];
    const P = CTVT.presets;

    // Hand-derived: spot values and key sets (matchesExpected only checks the
    // expected side's keys, so pin the exact key lists separately).
    results.push(assert('VTPRESETS drop limit 3P', P.VOLTAGE_DROP_LIMITS['3P'] === 3.0,
      P.VOLTAGE_DROP_LIMITS['3P'], 3.0));
    results.push(assert('VTPRESETS thermal medium', P.THERMAL_BURDEN_DEFAULTS.medium === 50,
      P.THERMAL_BURDEN_DEFAULTS.medium, 50));
    results.push(assert('VTPRESETS class 0.5 phase error', P.CLASS_DEFINITIONS['0.5'].max_phase_error === 20,
      P.CLASS_DEFINITIONS['0.5'].max_phase_error, 20));
    const classKeys = Object.keys(P.CLASS_DEFINITIONS).join(',');
    results.push(assert('VTPRESETS class keys match drop-limit keys',
      classKeys === Object.keys(P.VOLTAGE_DROP_LIMITS).join(','), classKeys, '0.1,0.2,0.5,1.0,3P'));
    const errsAgree = Object.keys(P.CLASS_DEFINITIONS).every(
      (k) => P.CLASS_DEFINITIONS[k].max_voltage_error === P.VOLTAGE_DROP_LIMITS[k]);
    results.push(assert('VTPRESETS max_voltage_error == drop limit', errsAgree, errsAgree, true));

    // ── Golden-vector backed (calc/golden/vt_presets.json <- vt_calculations/presets.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.vt_presets) ? CT_GOLDEN.vt_presets : null;
    if (!G) return results;

    const sameKeys = (a, b) => JSON.stringify(Object.keys(a)) === JSON.stringify(Object.keys(b));
    [
      ['VOLTAGE_DROP_LIMITS', P.VOLTAGE_DROP_LIMITS, G.voltage_drop_limits],
      ['THERMAL_BURDEN_DEFAULTS', P.THERMAL_BURDEN_DEFAULTS, G.thermal_burden_defaults],
      ['CLASS_DEFINITIONS', P.CLASS_DEFINITIONS, G.class_definitions],
    ].forEach(([name, got, cases]) => {
      (cases || []).forEach((c) => {
        results.push(assert(`VTPRESETS golden ${name}`,
          matchesExpected(got, c.expected), JSON.stringify(got), JSON.stringify(c.expected)));
        results.push(assert(`VTPRESETS golden ${name} keys`,
          sameKeys(got, c.expected), Object.keys(got), Object.keys(c.expected)));
      });
    });
    Object.keys((G.class_definitions || [{}])[0].expected || {}).forEach((k) => {
      const exp = G.class_definitions[0].expected[k];
      results.push(assert(`VTPRESETS golden CLASS_DEFINITIONS[${k}] keys`,
        sameKeys(P.CLASS_DEFINITIONS[k] || {}, exp), Object.keys(P.CLASS_DEFINITIONS[k] || {}), Object.keys(exp)));
    });

    return results;
  }

  // ── VT IMPEDANCE (calc/vt/impedance.js) ───────────────────────────────
  function testVtImpedance() {
    const results = [];
    const I = CTVT.impedance;

    // Golden encodes Python float('inf') as "inf" (JSON has no Infinity token).
    const dec = (v) => (v === 'inf' ? Infinity : v === '-inf' ? -Infinity : v);
    const numEq = (a, b) => (Number.isFinite(b) ? typeof a === 'number' && approx(a, b) : a === b);
    // Re-render a CTStep row the way the Python result string shows it ("{x:.2f} unit").
    const stepText = (s) => `${Number.isFinite(s.result) ? s.result.toFixed(s.precision) : 'inf'} ${s.unit}`;

    // Hand-derived: 25 VA / 100 V → 0.25 A → Zn = 400 Ω; defaults (burden 0) → Zn = ∞.
    const [is1, st1] = I.calculateRatedSecondaryCurrent(25, 100);
    results.push(assert('VTIMP Is = 25/100', approx(is1, 0.25), is1, 0.25));
    results.push(assert('VTIMP Is step in mA', approx(st1.result, 250) && st1.unit === 'mA', st1.result, 250));
    const [zn1] = I.calculateBurdenImpedance(100, is1);
    results.push(assert('VTIMP Zn = 100/0.25', approx(zn1, 400), zn1, 400));
    const [zn0] = I.calculateBurdenImpedance(100, I.calculateRatedSecondaryCurrent(0, 100)[0]);
    results.push(assert('VTIMP Zn infinite at zero burden', zn0 === Infinity, zn0, Infinity));
    const rp = I.calculateParallelResistance([100, 100]);
    results.push(assert('VTIMP 100 ∥ 100 = 50', approx(rp, 50), rp, 50));
    const [zt, rl, st3] = I.calculateTotalImpedance(0.42, 100, 25);
    results.push(assert('VTIMP Ztot = 0.42 + 100∥25', approx(zt, 20.42) && approx(rl, 20), zt, 20.42));
    results.push(assert('VTIMP Ztot step key', st3.key === 'total_load_impedance' && typeof st3.latex === 'string',
      st3.key, 'total_load_impedance'));

    // ── Golden-vector backed (calc/golden/vt_impedance.json <- vt_calculations/impedance.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.vt_impedance) ? CT_GOLDEN.vt_impedance : null;
    if (!G) return results;

    const checkStep = (tag, step, exp) => {
      results.push(assert(`${tag} step key`, step.key === exp.key, step.key, exp.key));
      results.push(assert(`${tag} step result`, stepText(step) === exp.result, stepText(step), exp.result));
    };

    (G.rated_secondary_current || []).forEach((c, i) => {
      const [cur, step] = I.calculateRatedSecondaryCurrent(...c.input);
      const exp = dec(c.expected.current);
      results.push(assert(`VTIMP golden #${i} rated current`, numEq(cur, exp), cur, exp));
      checkStep(`VTIMP golden #${i} rated current`, step, c.expected.step);
    });

    (G.burden_impedance || []).forEach((c, i) => {
      const [z, step] = I.calculateBurdenImpedance(...c.input);
      const exp = dec(c.expected.impedance);
      results.push(assert(`VTIMP golden #${i} burden impedance`, numEq(z, exp), z, exp));
      checkStep(`VTIMP golden #${i} burden impedance`, step, c.expected.step);
    });

    (G.parallel_resistance || []).forEach((c, i) => {
      const got = I.calculateParallelResistance(c.input[0].map(dec));
      const exp = dec(c.expected);
      results.push(assert(`VTIMP golden #${i} parallel`, numEq(got, exp), got, exp));
    });

    (G.total_impedance || []).forEach((c, i) => {
      const [z, load, step] = I.calculateTotalImpedance(...c.input);
      const expZ = dec(c.expected.total_impedance);
      const expL = dec(c.expected.load_resistance);
      results.push(assert(`VTIMP golden #${i} total impedance`, numEq(z, expZ), z, expZ));
      results.push(assert(`VTIMP golden #${i} load resistance`, numEq(load, expL), load, expL));
      checkStep(`VTIMP golden #${i} total impedance`, step, c.expected.step);
    });

    return results;
  }

  function testVtCurrentBurden() {
    const results = [];
    const C = CTVT.currentBurden;

    // Golden encodes Python float('inf') as "inf" (JSON has no Infinity token).
    const dec = (v) => (v === 'inf' ? Infinity : v === '-inf' ? -Infinity : v);
    // Re-render a CTStep row the way the Python result string shows it ("{x:.Nf} unit").
    const stepText = (s) => `${s.result.toFixed(s.precision)} ${s.unit}`;

    // Hand-derived chain: 100 V over 20 Ω → 5 A → 500 VA; against Sn = 25 VA → 2000 %, −475 VA.
    const [i1, st1] = C.calculateActualCurrent(100, 20);
    results.push(assert('VTCB Is_actual = 100/20', approx(i1, 5), i1, 5));
    results.push(assert('VTCB Is_actual step in mA', approx(st1.result, 5000) && st1.unit === 'mA', st1.result, 5000));
    const [i0] = C.calculateActualCurrent(100, Infinity);
    results.push(assert('VTCB Is_actual = 0 at infinite impedance', i0 === 0, i0, 0));
    const [s1] = C.calculateActualBurden(100, i1);
    results.push(assert('VTCB S_actual = 100·5', approx(s1, 500), s1, 500));
    const [u1, st3] = C.calculateBurdenUtilization(s1, 25);
    results.push(assert('VTCB utilization = 500/25·100', approx(u1, 2000) && st3.precision === 1, u1, 2000));
    const [u0] = C.calculateBurdenUtilization(s1, 0);
    results.push(assert('VTCB utilization = 0 at zero rated burden', u0 === 0, u0, 0));
    const [r1, st4] = C.calculateReserveCapacity(25, s1);
    results.push(assert('VTCB reserve = 25 − 500', approx(r1, -475), r1, -475));
    results.push(assert('VTCB reserve step key', st4.key === 'reserve_capacity' && typeof st4.latex === 'string',
      st4.key, 'reserve_capacity'));

    // ── Golden-vector backed (calc/golden/vt_current_burden.json <- vt_calculations/current_burden.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.vt_current_burden) ? CT_GOLDEN.vt_current_burden : null;
    if (!G) return results;

    const check = (tag, fn, input, valueKey, exp) => {
      const [val, step] = fn(...input.map(dec));
      results.push(assert(`${tag} value`, approx(val, exp[valueKey]), val, exp[valueKey]));
      results.push(assert(`${tag} step key`, step.key === exp.step.key, step.key, exp.step.key));
      results.push(assert(`${tag} step result`, stepText(step) === exp.step.result, stepText(step), exp.step.result));
    };

    (G.actual_current || []).forEach((c, i) =>
      check(`VTCB golden #${i} actual current`, C.calculateActualCurrent, c.input, 'current', c.expected));
    (G.actual_burden || []).forEach((c, i) =>
      check(`VTCB golden #${i} actual burden`, C.calculateActualBurden, c.input, 'burden', c.expected));
    (G.burden_utilization || []).forEach((c, i) =>
      check(`VTCB golden #${i} utilization`, C.calculateBurdenUtilization, c.input, 'utilization', c.expected));
    (G.reserve_capacity || []).forEach((c, i) =>
      check(`VTCB golden #${i} reserve`, C.calculateReserveCapacity, c.input, 'reserve', c.expected));

    return results;
  }

  function testVtVoltageAnalysis() {
    const results = [];
    const V = CTVT.voltageAnalysis;

    // Re-render the CTStep row the way the Python result string shows it ("{dU:.4f} V ({pct:.3f}%)").
    const stepText = (s) => `${s.result.toFixed(s.precision)} ${s.unit} (${s.percent.toFixed(s.percent_precision)}%)`;

    // Hand-derived: 2 Ω · 0.05 A = 0.1 V → 0.1 % of 100 V.
    const [d1, p1, st1] = V.calculateVoltageDrop(2, 0.05, 100);
    results.push(assert('VTVA ΔU = 2·0.05', approx(d1, 0.1), d1, 0.1));
    results.push(assert('VTVA ΔU% = 0.1/100·100', approx(p1, 0.1), p1, 0.1));
    results.push(assert('VTVA step key/unit', st1.key === 'voltage_drop_in_cable' && st1.unit === 'V',
      st1.key, 'voltage_drop_in_cable'));
    const [, p0] = V.calculateVoltageDrop(2, 0.05, 0);
    results.push(assert('VTVA ΔU% = 0 at Us = 0', p0 === 0, p0, 0));
    results.push(assert('VTVA limit class 0.2', V.getMaxVoltageDrop('0.2') === 0.2, V.getMaxVoltageDrop('0.2'), 0.2));
    results.push(assert('VTVA unknown class → 0.5', V.getMaxVoltageDrop('toString') === 0.5,
      V.getMaxVoltageDrop('toString'), 0.5));
    const [okEq, wEq] = V.checkVoltageDropLimits(0.5, '0.5');
    results.push(assert('VTVA at limit passes', okEq === true && wEq.length === 0, okEq, true));

    // ── Golden-vector backed (calc/golden/vt_voltage_analysis.json <- vt_calculations/voltage_analysis.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.vt_voltage_analysis) ? CT_GOLDEN.vt_voltage_analysis : null;
    if (!G) return results;

    (G.voltage_drop || []).forEach((c, i) => {
      const e = c.expected;
      const [d, p, step] = V.calculateVoltageDrop(...c.input);
      results.push(assert(`VTVA golden #${i} ΔU`, approx(d, e.voltage_drop), d, e.voltage_drop));
      results.push(assert(`VTVA golden #${i} ΔU%`, approx(p, e.voltage_drop_percent), p, e.voltage_drop_percent));
      results.push(assert(`VTVA golden #${i} step key`, step.key === e.step.key, step.key, e.step.key));
      results.push(assert(`VTVA golden #${i} step result`, stepText(step) === e.step.result, stepText(step), e.step.result));
    });
    (G.max_voltage_drop || []).forEach((c, i) => {
      const v = V.getMaxVoltageDrop(...c.input);
      results.push(assert(`VTVA golden #${i} max drop (${c.input[0]})`, v === c.expected, v, c.expected));
    });
    (G.check_limits || []).forEach((c, i) => {
      const e = c.expected;
      const [ok, warnings] = V.checkVoltageDropLimits(...c.input);
      results.push(assert(`VTVA golden #${i} is_ok`, ok === e.is_ok, ok, e.is_ok));
      results.push(assert(`VTVA golden #${i} warnings`, JSON.stringify(warnings) === JSON.stringify(e.warnings),
        JSON.stringify(warnings), JSON.stringify(e.warnings)));
    });

    return results;
  }

  function testVtThermal() {
    const results = [];
    const T = CTVT.thermal;

    // Re-render the CTStep row the way the Python result string shows it ("{util:.1f} %").
    const stepText = (s) => `${s.result.toFixed(s.precision)} ${s.unit}`;

    // Hand-derived: 30 VA of 50 VA → 60 %; margin 20 VA.
    const [u1, st1] = T.calculateThermalUtilization(30, 50);
    results.push(assert('VTTH util = 30/50·100', approx(u1, 60), u1, 60));
    results.push(assert('VTTH step key/unit', st1.key === 'thermal_utilization' && st1.unit === '%',
      st1.key, 'thermal_utilization'));
    const [u0] = T.calculateThermalUtilization(30, 0);
    results.push(assert('VTTH util = 0 at S_thermal = 0', u0 === 0, u0, 0));
    results.push(assert('VTTH margin = 50 − 30', T.getThermalMargin(30, 50) === 20, T.getThermalMargin(30, 50), 20));
    const [okEq, wEq] = T.checkThermalLimits(100);
    results.push(assert('VTTH 100 % passes', okEq === true && wEq.length === 0, okEq, true));
    const [okOver] = T.checkThermalLimits(100.5);
    results.push(assert('VTTH 100.5 % fails', okOver === false, okOver, false));

    // ── Golden-vector backed (calc/golden/vt_thermal.json <- vt_calculations/thermal.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.vt_thermal) ? CT_GOLDEN.vt_thermal : null;
    if (!G) return results;

    (G.utilization || []).forEach((c, i) => {
      const e = c.expected;
      const [u, step] = T.calculateThermalUtilization(...c.input);
      results.push(assert(`VTTH golden #${i} util`, approx(u, e.utilization), u, e.utilization));
      results.push(assert(`VTTH golden #${i} step key`, step.key === e.step.key, step.key, e.step.key));
      results.push(assert(`VTTH golden #${i} step result`, stepText(step) === e.step.result, stepText(step), e.step.result));
    });
    (G.check_limits || []).forEach((c, i) => {
      const e = c.expected;
      const [ok, warnings] = T.checkThermalLimits(...c.input);
      results.push(assert(`VTTH golden #${i} is_ok`, ok === e.is_ok, ok, e.is_ok));
      results.push(assert(`VTTH golden #${i} warnings`, JSON.stringify(warnings) === JSON.stringify(e.warnings),
        JSON.stringify(warnings), JSON.stringify(e.warnings)));
    });
    (G.margin || []).forEach((c, i) => {
      const m = T.getThermalMargin(...c.input);
      results.push(assert(`VTTH golden #${i} margin`, approx(m, c.expected), m, c.expected));
    });

    return results;
  }

  function testVtValidation() {
    const results = [];
    const V = CTVT.validation;

    // Hand-derived: 60 % burden is Range II with no warnings; 10 % passes with the
    // Range I warning; 120 % fails; exactly 100 % passes both checks.
    const [ok60, w60] = V.checkBurdenLimits(60);
    results.push(assert('VTVA 60 % burden ok, no warnings', ok60 === true && w60.length === 0, ok60, true));
    const [ok10, w10] = V.checkBurdenLimits(10);
    results.push(assert('VTVA 10 % burden ok + low warning', ok10 === true && w10.length === 1 && w10[0].startsWith('Lav byrde: 10.0%'),
      w10[0], 'Lav byrde: 10.0% …'));
    const [ok120, w120] = V.checkBurdenLimits(120);
    results.push(assert('VTVA 120 % burden fails', ok120 === false && w120[0] === 'Byrde overskridelse: 120.0% > 100%',
      w120[0], 'Byrde overskridelse: 120.0% > 100%'));
    const [okTh] = V.checkThermalBurdenLimits(100);
    results.push(assert('VTVA thermal 100 % passes', okTh === true, okTh, true));
    // Python "{:.1f}" rounds exact ties half to even: 24.25 → "24.2", toFixed gives "24.3".
    const [, wTie] = V.checkBurdenLimits(24.25);
    results.push(assert('VTVA tie 24.25 → 24.2', wTie[0].startsWith('Lav byrde: 24.2%'), wTie[0], 'Lav byrde: 24.2% …'));
    // NaN fails every comparison in both languages: (False, []) and range "None".
    const [okNaN, wNaN] = V.checkBurdenLimits(NaN);
    results.push(assert('VTVA NaN burden → [false, []]', okNaN === false && wNaN.length === 0, okNaN, false));
    results.push(assert('VTVA range 25 → II', V.verifyRangeCompliance(25).range === 'II', V.verifyRangeCompliance(25).range, 'II'));
    results.push(assert('VTVA range NaN → None', V.verifyRangeCompliance(NaN).range === 'None', V.verifyRangeCompliance(NaN).range, 'None'));

    // ── Golden-vector backed (calc/golden/vt_validation.json <- vt_calculations/validation.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.vt_validation) ? CT_GOLDEN.vt_validation : null;
    if (!G) return results;

    const checkTuple = (tag, fn, cases) => (cases || []).forEach((c, i) => {
      const e = c.expected;
      const [ok, warnings] = fn(...c.input);
      results.push(assert(`VTVA golden ${tag} #${i} is_ok`, ok === e.is_ok, ok, e.is_ok));
      results.push(assert(`VTVA golden ${tag} #${i} warnings`, JSON.stringify(warnings) === JSON.stringify(e.warnings),
        JSON.stringify(warnings), JSON.stringify(e.warnings)));
    });
    checkTuple('burden', V.checkBurdenLimits, G.burden_limits);
    checkTuple('thermal', V.checkThermalBurdenLimits, G.thermal_limits);

    // Key order and the optional `warning` key both come from the Python dict, so an
    // exact JSON comparison checks the key set too.
    (G.range_compliance || []).forEach((c, i) => {
      const r = V.verifyRangeCompliance(...c.input);
      results.push(assert(`VTVA golden range #${i}`, JSON.stringify(r) === JSON.stringify(c.expected),
        JSON.stringify(r), JSON.stringify(c.expected)));
    });

    return results;
  }

  function testVtFormatting() {
    const results = [];
    const F = CTVT.formatting;

    // Hand-derived: a fresh, independent empty result each call.
    const r1 = F.createResultDict();
    const r2 = F.createResultDict();
    r1.warnings.push('x');
    results.push(assert('VTFM result dict is fresh', r2.warnings.length === 0 && r1 !== r2, r2.warnings.length, 0));
    results.push(assert('VTFM result dict status OK', r2.status === 'OK', r2.status, 'OK'));

    // Status defaults to 'OK'; optional keys are absent unless given.
    const d = F.formatVtResults({}, [], []);
    results.push(assert('VTFM default status/keys', JSON.stringify(Object.keys(d)) === '["status","calculations","warnings","intermediate_steps"]' && d.status === 'OK',
      JSON.stringify(Object.keys(d)), 'status,calculations,warnings,intermediate_steps'));
    // core_number 0 is kept (`is not None`); core_name '' and transformer_id 0 are dropped (truthiness).
    const z = F.formatVtResults({}, [], [], 'OK', '', 0, 0);
    results.push(assert('VTFM core_number 0 kept, falsy names dropped', z.core_number === 0 && !('core_name' in z) && !('transformer_id' in z),
      JSON.stringify(z), '{…,"core_number":0}'));
    // Python bool(): an empty list is falsy, NaN is truthy.
    const e = F.formatVtResults({}, [], [], 'OK', [], NaN);
    results.push(assert('VTFM [] dropped, NaN kept', !('core_name' in e) && Number.isNaN(e.transformer_id), JSON.stringify(e), 'transformer_id NaN'));
    // The arguments are passed through by reference, as in Python.
    const calcs = { a: 1 };
    results.push(assert('VTFM calculations by reference', F.formatVtResults(calcs, [], []).calculations === calcs, false, true));
    const cc = F.formatCommonCalculations(0.42).cable_resistance;
    results.push(assert('VTFM common cable resistance', cc.value === 0.42 && cc.unit === 'Ω', cc.value, 0.42));

    // ── Golden-vector backed (calc/golden/vt_formatting.json <- vt_calculations/formatting.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.vt_formatting) ? CT_GOLDEN.vt_formatting : null;
    if (!G) return results;

    // Pure dict builders: an exact JSON comparison checks the values, the key set and the
    // key order against the Python dict.
    const checkExact = (tag, fn, cases) => (cases || []).forEach((c, i) => {
      const r = fn(...c.input);
      results.push(assert(`VTFM golden ${tag} #${i}`, JSON.stringify(r) === JSON.stringify(c.expected),
        JSON.stringify(r), JSON.stringify(c.expected)));
    });
    checkExact('step', F.createCalculationStep, G.calculation_step);
    checkExact('result_dict', F.createResultDict, G.result_dict);
    checkExact('vt_results', F.formatVtResults, G.vt_results);
    checkExact('common', F.formatCommonCalculations, G.common_calculations);

    return results;
  }

  // ── VT CALCULATOR (calc/vt/calculator.js) ───────────────────────────────
  function testVtCalculator() {
    const results = [];
    const C = CTVT.calculator;

    // Hand-derived: pyFixed follows Python format() — half-even on exact ties, "inf".
    results.push(assert('VTCALC pyFixed tie 0.125 → 0.12', C.pyFixed(0.125, 2) === '0.12', C.pyFixed(0.125, 2), '0.12'));
    results.push(assert('VTCALC pyFixed tie 0.375 → 0.38', C.pyFixed(0.375, 2) === '0.38', C.pyFixed(0.375, 2), '0.38'));
    results.push(assert('VTCALC pyFixed non-tie 1.005 → 1.00', C.pyFixed(1.005, 2) === '1.00', C.pyFixed(1.005, 2), '1.00'));
    results.push(assert('VTCALC pyFixed inf', C.pyFixed(Infinity, 2) === 'inf' && C.pyFixed(-Infinity, 1) === '-inf',
      C.pyFixed(Infinity, 2), 'inf'));
    results.push(assert('VTCALC pyFixed 2.5 → 2 (d=0)', C.pyFixed(2.5, 0) === '2', C.pyFixed(2.5, 0), '2'));

    // 10 VA rated, 2000 Ω device, 0.656 Ω cable at 100 V: ≈ 5 VA → 50 %, thermal 10 %.
    const r1 = C.executeCoreCalculation(0.656, CTVT.data.extractVtCoreData({ burden: 10, device_resistance: 2000 }));
    results.push(assert('VTCALC all-pass status', r1.status === 'OK' && r1.warnings.length === 0, r1.status, 'OK'));
    results.push(assert('VTCALC 10 steps incl. conclusion', r1.intermediate_steps.length === 10 &&
      r1.intermediate_steps[9].is_conclusion === true, r1.intermediate_steps.length, 10));
    // The voltage-drop warning never changes the status.
    const r2 = C.executeCoreCalculation(5, CTVT.data.extractVtCoreData({
      burden: 25, thermal_burden: 100, secondary_voltage: 110 / Math.sqrt(3), device_resistance: 300, vt_class: '0.5' }));
    results.push(assert('VTCALC voltage-drop warning keeps OK', r2.status === 'OK' && r2.warnings.length === 1, r2.status, 'OK'));
    // UI entry: the cable resistance comes from the toolbox (§9.6 9C), project method and
    // temperature, the core's wiring (default four_wire, §9.8), balanced 3-phase load; then
    // the result panel fields.
    const ui = CTVT.calculate({ burden: 10, device_resistance: 2000, cable_mat: 'cu',
      cable_cross: 4, cable_length: 150 }, {});
    const leadVt = (method, material, A, L, T, topology = 'four_wire') => CTCableRes.lead(method,
      { material, cross_section_mm2: A, length_m: L, temp_c: T }, topology, 'three_phase');
    // 4-wire, balanced load: k = 1, one conductor
    const rcExp = CTMaterials.COPPER_RESISTIVITY_20C * (1 + CTMaterials.COPPER_TEMP_COEFFICIENT * 55) * 150 / 4;
    results.push(assert('VTCALC UI cable resistance (toolbox, iec60287 @ 75 °C, 4-wire k = 1)',
      approx(ui.cable_resistance, rcExp) && ui.Rc === ui.cable_resistance &&
      ui.cable_res.topology === 'four_wire' && ui.cable_res.factor === 1 &&
      ui.Rc === leadVt('iec60287', 'cu', 4, 150, 75).r_loop, ui.cable_resistance, rcExp, 'Ω'));
    // 6-wire on the core: k = 2, the ctvt_dim ×2 (the VT Rc before 9E)
    const ui6 = CTVT.calculate({ burden: 10, device_resistance: 2000, cable_mat: 'cu',
      cable_cross: 4, cable_length: 150, cable_topology: 'six_wire' }, {});
    results.push(assert('VTCALC UI six_wire: k = 2, twice the 4-wire Rc',
      ui6.cable_res.topology === 'six_wire' && ui6.cable_res.factor === 2 && ui6.Rc === 2 * ui.Rc &&
      ui6.Rc === leadVt('iec60287', 'cu', 4, 150, 75, 'six_wire').r_loop, ui6.Rc, 2 * ui.Rc, 'Ω'));
    results.push(assert('VTCALC UI is_ok/margin', ui.is_ok === true && ui.margin > 0, ui.margin, '> 0'));
    results.push(assert('VTCALC UI steps = toolbox steps + intermediate_steps',
      ui.steps.length === 4 + ui.intermediate_steps.length &&
      ui.steps.slice(4).every((x, j) => x === ui.intermediate_steps[j]) &&
      ui.intermediate_steps.every((x) => !x.key.startsWith('cable_') && x.key !== 'total_cable_resistance'),
      ui.steps.length, 4 + ui.intermediate_steps.length));
    results.push(assert('VTCALC UI core name default', ui.core_name === 'VT kerne 1', ui.core_name, 'VT kerne 1'));
    // Cable defaults follow ui/vt_widget.py: Cu, 4 mm², 150 m
    const uiDef = CTVT.calculate({ burden: 10, device_resistance: 2000 }, {});
    results.push(assert('VTCALC UI cable defaults Cu 4 mm² 150 m', uiDef.Rc === ui.Rc, uiDef.Rc, ui.Rc, 'Ω'));
    // Named delta (§9.6 9C, D2): the vt_widget constants (ρ20 Cu 0.0175, same α) are retired,
    // so under iec60287 a 6-wire VT Rc is 0.017241 / 0.0175 of the old value (≈ 1.5 % lower).
    // The 4-wire default (§9.6 9E) halves it on top of that.
    const rcWidget = 2 * 0.0175 * (1 + 0.00393 * 55) * 150 / 4;
    const ratioCu = CTMaterials.COPPER_RESISTIVITY_20C / 0.0175;
    results.push(assert('VTCALC named delta Cu: 6-wire Rc = 0.017241/0.0175 × vt_widget (−1.48 %)',
      approx(ui6.Rc / rcWidget, ratioCu, 1e-9) && approx((ui6.Rc / rcWidget - 1) * 100, -1.48, 0.01),
      ((ui6.Rc / rcWidget - 1) * 100).toFixed(3), '-1.480', ' %'));
    results.push(assert('VTCALC named delta Cu: 4-wire Rc = ½ · 0.017241/0.0175 × vt_widget',
      approx(ui.Rc / rcWidget, ratioCu / 2, 1e-9), ui.Rc / rcWidget, ratioCu / 2));
    // D1: core.cable_resistance is no longer an override (the dispatcher path)
    const viaDispatcher = CTCalc.calculate('vt', { burden: 10, device_resistance: 500, cable_resistance: 0 }, {});
    results.push(assert('VTCALC CTCalc dispatcher vt overload', viaDispatcher && viaDispatcher.is_ok === false &&
      viaDispatcher.status === 'IKKE OK' && viaDispatcher.margin < 0, viaDispatcher && viaDispatcher.status, 'IKKE OK'));
    results.push(assert('VTCALC core.cable_resistance ignored (D1)',
      viaDispatcher && viaDispatcher.Rc === ui.Rc && viaDispatcher.cable_resistance === ui.Rc,
      viaDispatcher && viaDispatcher.Rc, ui.Rc, 'Ω'));
    // Shared module checks: default, project method/temperature, unknown id, table fallback.
    results.push(...checkModuleCableRes('VTCALC', CTVT.calculate,
      { burden: 10, device_resistance: 2000, cable_mat: 'cu', cable_cross: 4, cable_length: 65 }, {}, 'three_phase', 'vt'));
    // Current-case plumbing (§9.8): a VT evaluates the balanced 3-phase load, so the
    // default four_wire gives k = 1 (k = √3 / 2 would mean the 2-phase / 1-phase case).
    const uiK = CTVT.calculate({ burden: 10, device_resistance: 2000 }, {});
    results.push(assert('VTCALC current case three_phase reaches the toolbox',
      uiK.cable_res.factor === 1 && uiK.Rc === uiK.cable_res.r_conductor && uiK.Rc === ui6.Rc / 2,
      `${uiK.cable_res.factor} / ${uiK.Rc}`, `1 / ${ui6.Rc / 2}`, 'Ω'));
    const uiAl = CTVT.calculate({ burden: 10, device_resistance: 2000, cable_mat: 'al', cable_cross: 6,
      cable_length: 300, cable_temp: 20 }, { cable_r_method: 'table', cable_temp: 20 });
    const eAl = leadVt('table', 'al', 6, 300, 20);
    results.push(assert('VTCALC table Al 6 mm² @ 20 °C (project)', uiAl.Rc === eAl.r_loop &&
      approx(uiAl.cable_res.r20_per_km, 4.61) && uiAl.cable_res.source === 'iec60228_table',
      uiAl.Rc, eAl.r_loop, 'Ω'));

    // ── Golden-vector backed (calc/golden/vt_calculator.json <- vt_calculations/calculator.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.vt_calculator) ? CT_GOLDEN.vt_calculator : null;
    if (!G) return results;

    const dec = (v) => (v === 'inf' ? Infinity : v === '-inf' ? -Infinity : v);
    // Re-render a CTStep row the way the Python result string shows it.
    const stepText = (s) => {
      if (s.is_conclusion) return s.result_text;
      if (s.key === 'voltage_drop_in_cable') {
        return `${C.pyFixed(s.result, s.precision)} V (${C.pyFixed(s.percent, s.percent_precision)}%)`;
      }
      return `${C.pyFixed(s.result, s.precision)} ${s.unit}`;
    };
    const checkCore = (tag, r, e) => {
      results.push(assert(`${tag} status`, r.status === e.status, r.status, e.status));
      results.push(assert(`${tag} calculations`, JSON.stringify(r.calculations) === JSON.stringify(e.calculations),
        JSON.stringify(r.calculations), JSON.stringify(e.calculations)));
      results.push(assert(`${tag} warnings`, JSON.stringify(r.warnings) === JSON.stringify(e.warnings),
        JSON.stringify(r.warnings), JSON.stringify(e.warnings)));
      const keys = r.intermediate_steps.map((s) => s.key);
      const eKeys = e.steps.map((s) => s.key);
      results.push(assert(`${tag} step keys`, JSON.stringify(keys) === JSON.stringify(eKeys), keys.join(','), eKeys.join(',')));
      e.steps.forEach((es, j) => {
        const s = r.intermediate_steps[j];
        if (!s) return;
        const txt = stepText(s);
        results.push(assert(`${tag} step ${es.key}`, txt === es.result, txt, es.result));
        if (es.substitution !== undefined) {
          results.push(assert(`${tag} conclusion text`, s.comparison === es.substitution, s.comparison, es.substitution));
        }
      });
      for (const k of ['core_name', 'transformer_id', 'core_number']) {
        if (k in e || k in r) results.push(assert(`${tag} ${k}`, r[k] === e[k], r[k], e[k]));
      }
    };

    (G.execute_core || []).forEach((c, i) => {
      const [cable, core] = c.input;
      checkCore(`VTCALC golden execute #${i}`, C.executeCoreCalculation(cable, CTVT.data.extractVtCoreData(core)), c.expected);
    });
    (G.single_core || []).forEach((c, i) => {
      checkCore(`VTCALC golden single #${i}`, C.calculateSingleCore(...c.input), c.expected);
    });
    (G.multi_core || []).forEach((c, i) => {
      const r = C.calculate(...c.input);
      const e = c.expected;
      results.push(assert(`VTCALC golden multi #${i} overall`, r.overall_status === e.overall_status, r.overall_status, e.overall_status));
      results.push(assert(`VTCALC golden multi #${i} common`, JSON.stringify(r.common_calculations) === JSON.stringify(e.common_calculations),
        JSON.stringify(r.common_calculations), JSON.stringify(e.common_calculations)));
      results.push(assert(`VTCALC golden multi #${i} core keys`, JSON.stringify(Object.keys(r.cores)) === JSON.stringify(Object.keys(e.cores)),
        Object.keys(r.cores).join(','), Object.keys(e.cores).join(',')));
      Object.keys(e.cores).forEach((k) => checkCore(`VTCALC golden multi #${i} core ${k}`, r.cores[k], e.cores[k]));
    });
    (G.core_internal || []).forEach((c, i) => {
      checkCore(`VTCALC golden internal #${i}`, C.calculateCoreInternal(...c.input), c.expected);
    });
    (G.parallel_resistance || []).forEach((c, i) => {
      const r = C.parallelResistance(c.input[0].map(dec));
      const e = dec(c.expected);
      results.push(assert(`VTCALC golden parallel #${i}`, Number.isFinite(e) ? approx(r, e) : r === e, r, e, 'Ω'));
    });
    (G.max_voltage_drop || []).forEach((c, i) => {
      const r = C.getMaxVoltageDrop(c.input[0]);
      results.push(assert(`VTCALC golden max drop #${i}`, r === c.expected, r, c.expected, '%'));
    });
    results.push(assert('VTCALC calcWidgetCableResistance removed (D2)', !('calcWidgetCableResistance' in C),
      typeof C.calcWidgetCableResistance, 'undefined'));

    // by_method (§9.5): CTVT.calculate with the project method vs the unmodified Python
    // calculate_single_core fed the toolbox reference r_loop. The core also carries a stale
    // cable_resistance / cable_temp, which must be ignored (D1).
    const RHO_RATIO = { cu: CTMaterials.COPPER_RESISTIVITY_20C / 0.0175, al: CTMaterials.ALUMINUM_RESISTIVITY_20C / 0.0283 };
    const byMethod = (G.by_method || []).map((c, i) => {
      const cp = c.input.cable_params;
      const mat = cp.material.includes('(Al)') ? 'al' : 'cu';
      const core = { ...c.input.core_data, cable_mat: mat, cable_cross: cp.cross_mm2, cable_length: cp.length_m,
        cable_resistance: 99, cable_temp: 20, ...goldenWiring(c) };
      const got = CTVT.calculate(core, c.input.common_data);
      const tag = `VTCALC by_method #${i} ${c.input.common_data.cable_r_method}`;
      checkCore(tag, got, c.expected);
      results.push(...checkByMethodCableRes(tag, got, c));
      results.push(assert(`${tag} cable steps first`, got.steps.slice(0, 4).map((x) => x.key).join(',') === CABLE_STEP_KEYS,
        got.steps.slice(0, 4).map((x) => x.key).join(','), CABLE_STEP_KEYS));
      // Named delta: iec60287 vs the Python GUI's vt_widget value for the same cable
      if (c.input.common_data.cable_r_method === 'iec60287') {
        const ratio = got.Rc / c.expected.widget_r_loop;
        results.push(assert(`${tag} named delta Rc / vt_widget = ρ20 ratio (${mat})`, approx(ratio, RHO_RATIO[mat], 1e-9),
          ratio, RHO_RATIO[mat]));
      }
      return got;
    });
    for (let i = 0; i + 1 < byMethod.length; i += 2) {
      results.push(assert(`VTCALC by_method #${i}/#${i + 1} method flips the verdict`,
        byMethod[i].is_ok !== byMethod[i + 1].is_ok, `${byMethod[i].status} / ${byMethod[i + 1].status}`, 'different'));
    }
    results.push(assert('VTCALC by_method cases present', byMethod.length === 4, byMethod.length, 4));

    // by_topology (§9.6 9E): by_method core 1 under iec60287 with the default wiring
    // (4-wire, balanced load: k = 1, the named delta) and with 6-wire on the core (k = 2).
    const byTopology = (G.by_topology || []).map((c, i) => {
      const cp = c.input.cable_params;
      const mat = cp.material.includes('(Al)') ? 'al' : 'cu';
      const core = { ...c.input.core_data, cable_mat: mat, cable_cross: cp.cross_mm2, cable_length: cp.length_m,
        ...goldenWiring(c) };
      const got = CTVT.calculate(core, c.input.common_data);
      const tag = `VTCALC by_topology #${i} ${c.expected.cable_res.topology}`;
      checkCore(tag, got, c.expected);
      results.push(...checkByMethodCableRes(tag, got, c));
      return got;
    });
    const btV = G.by_topology || [];
    results.push(assert('VTCALC by_topology: default four_wire k = 1 = ½ · six_wire; six_wire = by_method #0',
      btV.length === 2 && btV[0].input.cable_topology === undefined && btV[0].expected.cable_res.factor === 1
        && btV[1].input.cable_topology === 'six_wire' && btV[1].expected.cable_res.factor === 2
        && byTopology[0].Rc * 2 === byTopology[1].Rc && byTopology[1].Rc === byMethod[0].Rc
        && btV[1].expected.calculations !== undefined
        && JSON.stringify(btV[1].expected.calculations) === JSON.stringify(G.by_method[0].expected.calculations),
      btV.map((c) => `${c.expected.cable_res.topology}:${c.expected.cable_res.factor}`).join(','), 'four_wire:1,six_wire:2'));

    // PORTING_PLAN §8.2: line R'/X' (positive and zero sequence) in commonData.remote_end never
    // reaches the VT path. The Python goldens pin it (single #3 = #0, multi #4 = #0); check the
    // CTSizer entry too, with the same line impedance on the dispatcher's commonData.
    const sc = G.single_core || [];
    const mc = G.multi_core || [];
    if (sc.length > 3 && mc.length > 4) {
      results.push(assert('VTCALC golden single: line R/X ignored', JSON.stringify(sc[3].expected) === JSON.stringify(sc[0].expected),
        JSON.stringify(sc[3].expected.calculations), JSON.stringify(sc[0].expected.calculations)));
      results.push(assert('VTCALC golden multi: line R/X ignored', JSON.stringify(mc[4].expected) === JSON.stringify(mc[0].expected),
        mc[4].expected.overall_status, mc[0].expected.overall_status));
      const vtCore = { burden: 10, device_resistance: 2000, cable_length: 65 };
      const plain = CTCalc.calculate('vt', vtCore, {});
      const withLine = CTCalc.calculate('vt', vtCore, sc[3].input[0]);
      results.push(assert('VTCALC CTSizer entry: line R/X in commonData ignored',
        JSON.stringify(withLine) === JSON.stringify(plain), JSON.stringify(withLine.calculations), JSON.stringify(plain.calculations)));
    }

    return results;
  }

  // ── CT CALCULATIONS (CTCalc dispatcher, calc/index.js ← ct_calculations.py) ──
  function testCtCalculations() {
    const results = [];

    // Hand-derived: routing defaults and the CTSizer-side dispatcher.
    results.push(assert('CTC route default → metering', CTCalc.routeCore({}) === 'metering', CTCalc.routeCore({}), 'metering'));
    results.push(assert('CTC route protection default → distance',
      CTCalc.routeCore({ application: 'protection' }) === 'distance',
      CTCalc.routeCore({ application: 'protection' }), 'distance'));
    results.push(assert('CTC calculate unknown type → null', CTCalc.calculate('nope', {}, {}) === null,
      CTCalc.calculate('nope', {}, {}), null));
    results.push(assert('CTC calculate prototype key → null', CTCalc.calculate('toString', {}, {}) === null,
      CTCalc.calculate('toString', {}, {}), null));
    const gv = CTCalc.getAlfOrVk({ is_px: true, vk: 300 });
    results.push(assert('CTC getAlfOrVk delegates to CTBase', gv.vk === 300 && gv.is_px === true, gv.vk, 300));
    let threw = false;
    const origErr = console.error;
    console.error = () => {};
    try { CTCalc.calculateSingleCore({}, null); } catch (e) { threw = true; } finally { console.error = origErr; }
    results.push(assert('CTC calculateSingleCore re-throws', threw, threw, true));

    // Core API for the cable-resistance toolbox (PORTING_PLAN.md §9.6 9B item 1)
    results.push(assert('CTC cableRes exposes CTCableRes', CTCalc.cableRes === CTCableRes,
      typeof CTCalc.cableRes, 'CTCableRes'));
    // The dispatcher passes commonData to metering too (calculate and calculateSingleCore)
    const origMetering = CTMetering.calculate;
    const seen = [];
    CTMetering.calculate = (core, commonData) => { seen.push(commonData); return {}; };
    const cdM = { cable_r_method: 'table', cable_temp: 20 };
    try {
      CTCalc.calculate('metering', {}, cdM);
      CTCalc.calculateSingleCore(cdM, { application: 'metering' });
    } finally { CTMetering.calculate = origMetering; }
    results.push(assert('CTC metering gets commonData', seen.length === 2 && seen.every((x) => x === cdM),
      seen.length, 2));
    // The CTCalc.cableResistance shim and CTMaterials.cableResistance are gone
    // (§9.6 9D, D5): every caller now reads the module's Rc / cable_res.
    results.push(assert('CTC cableResistance shim removed', !('cableResistance' in CTCalc),
      typeof CTCalc.cableResistance, 'undefined'));
    results.push(assert('CTMaterials.cableResistance removed', !('cableResistance' in CTMaterials),
      typeof CTMaterials.cableResistance, 'undefined'));

    // ── Golden-vector backed (calc/golden/ct_calculations.json ← ct_calculations.py) ──
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.ct_calculations) ? CT_GOLDEN.ct_calculations : null;
    if (!G) return results;

    const ROUTE = {
      calculate_metering: 'metering',
      calculate_distance_protection: 'distance',
      calculate_line_differential: 'line_diff',
      calculate_transformer_differential: 'transformer_diff',
      calculate_overcurrent: 'overcurrent',
      calculate_busbar: 'busbar',
      calculate_generic_protection: 'generic',
    };
    const META = ['core_name', 'transformer_id', 'core_number', 'application'];

    (G.security_factor_c || []).forEach((c) => {
      results.push(assert('CTC golden SECURITY_FACTOR_C', CTCalc.SECURITY_FACTOR_C === c.expected,
        CTCalc.SECURITY_FACTOR_C, c.expected));
    });

    (G.route || []).forEach((c, i) => {
      const e = c.expected;
      const type = CTCalc.routeCore(c.input);
      results.push(assert(`CTC golden route #${i}`, type === ROUTE[e.route], type, ROUTE[e.route]));
      const meta = CTCalc.coreMetadata(c.input);
      const eMeta = {};
      META.forEach((k) => { eMeta[k] = e[k]; });
      results.push(assert(`CTC golden route #${i} metadata`, JSON.stringify(meta) === JSON.stringify(eMeta),
        JSON.stringify(meta), JSON.stringify(eMeta)));
      const eTail = e.keys.slice(-META.length);
      results.push(assert(`CTC golden route #${i} metadata key order`,
        JSON.stringify(Object.keys(meta)) === JSON.stringify(eTail), Object.keys(meta).join(','), eTail.join(',')));
    });

    (G.single_core || []).forEach((c, i) => {
      const cd = c.input.core_data;
      const cp = c.input.cable_params;
      const core = {
        rct: cd.rct, burden: cd.burden, Is: cd.secondary_current, Ip: cd.primary_current,
        fs_factor: cd.fs_factor, min_burden_percent: cd.min_burden_percent,
        min_safety_factor: cd.min_safety_factor, attached_resistor: cd.attached_resistor,
        device_burden: cd.device_burden,
        alf: cd.alf, is_px: !!cd.is_px_class, vk: cd.vk_voltage,
        relay_burden: cd.relay_burden, Isc_max_override: cd.max_fault_current,
        cable_length: cp.length_m, cable_cross: cp.cross_mm2,
        cable_mat: cp.material.includes('(Al)') ? 'al' : 'cu',
      };
      ['application', 'relay_type', 'transformer_id', 'core_number'].forEach((k) => {
        if (k in cd) core[k] = cd[k];
      });
      // Migrated modules read the method and temperature from the project (§9.6 9C).
      const got = CTCalc.calculateSingleCore({ cable_r_method: 'iec60287', cable_temp: cp.temp_c }, core);
      const e = c.expected;
      const calc = e.calculations;
      const tag = `CTC golden single #${i}`;

      results.push(assert(`${tag} status`, got.status === e.status, got.status, e.status));
      results.push(assert(`${tag} conclusion`, got.conclusion === calc.conclusion, got.conclusion, calc.conclusion));
      results.push(assert(`${tag} warnings`, matchesExpected(got.warnings, e.warnings),
        JSON.stringify(got.warnings), JSON.stringify(e.warnings)));
      META.forEach((k) => {
        results.push(assert(`${tag} ${k}`, got[k] === e[k], got[k], e[k]));
      });
      const tail = Object.keys(got).slice(-META.length);
      results.push(assert(`${tag} metadata appended last`, JSON.stringify(tail) === JSON.stringify(META),
        tail.join(','), META.join(',')));

      // One key number per routed module.
      let val, exp, label;
      if ('effective_safety_factor_fsa' in calc) {
        label = 'Fsa'; val = got.Fsa; exp = parseFloat(calc.effective_safety_factor_fsa);
      } else if ('required_alf' in calc) {
        label = 'ALF_act'; val = got.ALF_act; exp = parseFloat(calc.actual_alf ?? calc.equivalent_alf_from_vk);
      } else {
        label = 'alf_actual'; val = got.alf_actual; exp = parseFloat(calc.actual_alf ?? calc.equivalent_alf_from_vk);
      }
      results.push(assert(`${tag} ${label}`, typeof val === 'number' && approx(val, exp), val, exp));
    });

    return results;
  }

  // ── CABLE RESISTANCE CONSISTENCY (§9.5, the §8.1 acceptance test) ──────
  // The same cable through every protection module, via the dispatcher the UI
  // uses, for each method and project temperature: result.cable_res.r_loop is
  // the SAME number (===, not within a tolerance) in every module, and equals
  // CTCableRes.lead() for the module's wiring and current case (§9.8). Each
  // combination runs with the default wiring (none on the core) and with
  // four_wire and six_wire set on the core. r_conductor (one conductor, no
  // topology) is identical in every module whatever the wiring; with six_wire
  // (k = 2 in every case) r_loop is too.
  function testCableResConsistency() {
    const results = [];
    // calc type → the current case it evaluates (§9.8) with the core below.
    const MODULES = {
      metering: 'three_phase', overcurrent: 'single_phase', busbar: 'single_phase',
      generic: 'single_phase', distance: 'single_phase', line_diff: 'single_phase',
      transformer_diff: 'single_phase', vt: 'three_phase',
    };
    const types = Object.keys(MODULES);
    results.push(assert('CRC every dispatcher calc type covered',
      types.join(',') === 'metering,overcurrent,busbar,generic,distance,line_diff,transformer_diff,vt',
      types.join(','), 'all 8'));

    const cables = [];
    ['cu', 'al'].forEach((mat) => [1.5, 4, 5, 6, 50].forEach((A) => [0, 65, 150].forEach((L) =>
      cables.push({ cable_mat: mat, cable_cross: A, cable_length: L }))));
    // A full-name material string (as an imported project may carry)
    cables.push({ cable_mat: 'Aluminium (Al)', cable_cross: 1, cable_length: 300 });

    let nCombos = 0, nOk = 0, firstBad = null;
    const fail = (msg) => { if (!firstBad) firstBad = msg; };
    ['iec60287', 'table'].forEach((method) => [20, 75].forEach((temp_c) => cables.forEach((cable) =>
      [undefined, 'four_wire', 'six_wire'].forEach((wiring) => {
        nCombos++;
        const cd = { cable_r_method: method, cable_temp: temp_c };
        const params = { material: cable.cable_mat, cross_section_mm2: cable.cable_cross,
          length_m: cable.cable_length, temp_c };
        const tag = `${method} ${temp_c} °C ${cable.cable_mat} ${cable.cable_cross} mm² ${cable.cable_length} m ` +
          `${wiring ?? 'default wiring'}`;
        let ok = true;
        let rLoop0 = null, rCond0 = null;
        types.forEach((type) => {
          // a stale core.cable_temp must not matter: the temperature is the project's
          const core = { ...cable, cable_temp: temp_c === 20 ? 75 : 20 };
          if (wiring) core.cable_topology = wiring;
          const r = CTCalc.calculate(type, core, cd);
          const cr = r && r.cable_res;
          if (!cr) { ok = false; fail(`${tag}: ${type} gave no cable_res`); return; }
          const topo = wiring ?? CTCableRes.defaultTopology(type);
          const ref = CTCableRes.lead(method, params, topo, MODULES[type]);
          if (cr.r_loop !== ref.r_loop || r.Rc !== ref.r_loop || cr.r_conductor !== ref.r_conductor
            || cr.r20_per_km !== ref.r20_per_km || cr.method !== method || cr.source !== ref.source
            || cr.topology !== topo || cr.factor !== ref.factor) {
            ok = false;
            fail(`${tag}: ${type} r_loop ${cr.r_loop} / Rc ${r.Rc} / ${cr.topology} / ${cr.source} ` +
              `vs lead() ${ref.r_loop} / ${topo} / ${ref.source}`);
          }
          if (type === 'line_diff') {
            // both scenario cases (Q-L1)
            const r3 = CTCableRes.lead(method, params, topo, 'three_phase').r_loop;
            const r1 = CTCableRes.lead(method, params, topo, 'single_phase').r_loop;
            if (r.Rc_3ph !== r3 || r.Rc_1ph !== r1) {
              ok = false; fail(`${tag}: line_diff Rc_3ph/Rc_1ph ${r.Rc_3ph}/${r.Rc_1ph} vs ${r3}/${r1}`);
            }
          }
          if (rCond0 === null) { rLoop0 = cr.r_loop; rCond0 = cr.r_conductor; }
          else if (cr.r_conductor !== rCond0 || (wiring === 'six_wire' && cr.r_loop !== rLoop0)) {
            ok = false; fail(`${tag}: ${type} r_conductor ${cr.r_conductor} / r_loop ${cr.r_loop} ≠ ${types[0]} ${rCond0} / ${rLoop0}`);
          }
        });
        if (ok) nOk++;
      }))));
    results.push(assert('CRC r_conductor identical in every module, r_loop = CTCableRes.lead() for its wiring and case',
      nOk === nCombos, firstBad || `${nOk}/${nCombos}`, `${nCombos}/${nCombos}`));
    results.push(assert('CRC case count', nCombos === 2 * 2 * 31 * 3, nCombos, 372));

    // The methods really differ, and the table fallback is labelled in every module
    const cdT = { cable_r_method: 'table', cable_temp: 75 };
    const cdI = { cable_r_method: 'iec60287', cable_temp: 75 };
    types.forEach((type) => {
      const core = { cable_mat: 'cu', cable_cross: 4, cable_length: 65 };
      const rT = CTCalc.calculate(type, core, cdT).cable_res;
      const rI = CTCalc.calculate(type, core, cdI).cable_res;
      results.push(assert(`CRC ${type} table ≠ iec60287 (Cu 4 mm²)`,
        rT.r_loop > rI.r_loop && rT.source === 'iec60228_table' && rI.source === 'iec60287_formula',
        `${rT.r_loop} / ${rI.r_loop}`, 'table > iec60287'));
      const rF = CTCalc.calculate(type, { ...core, cable_cross: 5 }, cdT).cable_res;
      results.push(assert(`CRC ${type} 5 mm² under table → formula fallback`,
        rF.source === 'iec60287_fallback' && rF.r_loop === CTCalc.calculate(type, { ...core, cable_cross: 5 }, cdI).cable_res.r_loop,
        rF.source, 'iec60287_fallback'));
    });

    return results;
  }

  // ── RUN ALL ────────────────────────────────────────────────────────────
  // ── END TO END (PORTING_PLAN.md §10 B2) ────────────────────────────────
  // Realistic cores in the shape the UI stores them (core.inputs and the
  // project settings; calc/golden/e2e.json ← gen_e2e) go through
  // CTCalc.calculate(type, inputs, system), exactly as ctsizer-app.jsx calls
  // it. The expected values are ctvt_dim's output for the same inputs
  // (calculate_single_core, the toolbox lead resistance injected per §9.5):
  // status, the numbers the Summary panel shows (buildMetrics) and every
  // Formula Steps row the Python reports. Nothing is hand-written.
  function testEndToEnd() {
    const results = [];
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.e2e) ? CT_GOLDEN.e2e : null;
    if (!G) return results;

    // A Python result string carries its own precision ("68.51", "0.0000 VA"):
    // equal within TOLERANCE, or within half a unit of its last printed digit.
    const NUM = /-?\d+(?:\.(\d+))?(?:e[-+]?\d+)?/i;
    const num = (s) => { const m = String(s ?? '').match(NUM); return m ? parseFloat(m[0]) : NaN; };
    const near = (js, py) => {
      const m = String(py ?? '').match(NUM);
      if (!m || typeof js !== 'number' || !Number.isFinite(js)) return false;
      const v = parseFloat(m[0]);
      const half = m[1] ? 0.5 * 10 ** -m[1].length : 0.5;
      return approx(js, v) || Math.abs(js - v) <= half * (1 + 1e-9);
    };
    const pct = (s) => String(s).split('(')[1];   // "1.0578 V (1.666%)" → "1.666%)"

    // Steps the four Phase-2 modules name differently from ctvt_dim's StepNames
    const STEP_ALIAS = {
      metering: { s_lead: 'cable_burden', s_res: 'resistance_burden', s_total: 'total_connected_burden',
        s_in: 'internal_burden', s_min: 'minimum_required_burden', fsa: 'effective_safety_factor',
        cond1: 'condition_1_burden_control', cond2: 'condition_2_safety_factor_control',
        conclusion: 'conclusion_comparison' },
      overcurrent: { relay_r: 'relay_resistance', total_r: 'total_secondary_resistance',
        alf_req: 'required_alf', burden_r: 'burden_resistance',
        alf_act: ['actual_alf_at_connected_burden', 'equivalent_alf_from_knee_point'],
        esat: 'secondary_saturation_voltage', conclusion: 'conclusion_comparison' },
      busbar: { relay_r: 'relay_resistance', s_in: 'internal_burden', s_a: 'actual_burden',
        check1: 'burden_adequacy_check', f_a: 'actual_alf_at_connected_burden',
        fault_ratio: 'fault_current_ratio', emf_internal: 'emf_internal_fault',
        emf_through: 'emf_through_fault', vk_required: 'required_knee_point_voltage',
        vk_specified: 'specified_knee_point_voltage_px', conclusion: 'conclusion_comparison' },
      generic: { burden_r: 'resistance_burden', alf_act: 'actual_alf_at_connected_burden',
        alf_eq: 'equivalent_alf_from_knee_point', ealf: 'offered_knee_point_voltage_alf',
        conclusion: 'conclusion_comparison' },
    };
    // The toolbox rows (§9.2) have no Python row under the project method /
    // wiring (the Python report keeps its native table / ×2): they are checked
    // against the toolbox reference the case injected.
    const CABLE_ROWS = ['cable_r20', 'cable_resistance_at_temp', 'cable_r_conductor',
      'total_cable_resistance', 'total_cable_resistance_1ph'];

    // Summary panel (ctsizer-panels.jsx buildMetrics) → Python reference.
    // `st` maps Python step key → result string; `e` is the golden `expected`.
    const ok = (s) => s === 'OK';
    const SUMMARY = {
      metering: (e, st) => ({ Fsa: st.effective_safety_factor, S_total: st.total_connected_burden,
        Rc: e.cable_res.r_loop, S_min: st.minimum_required_burden, S_in: st.internal_burden,
        min_safety_factor: num(e.calculations.condition_2_values),   // "Fmin=10, Fsa=…"
        cond2: ok(st.condition_2_safety_factor_control) }),
      overcurrent: (e, st) => ({ ALF_act: st.actual_alf_at_connected_burden ?? st.equivalent_alf_from_knee_point,
        ALF_req: st.required_alf, Esat: st.secondary_saturation_voltage,
        Rt: st.total_secondary_resistance, Rc: e.cable_res.r_loop }),
      // PX busbar: the E.M.F. / Vk cards (§10.6 F-SUM)
      busbar: (e, st) => (st.fault_current_ratio === undefined ? { Rc: e.cable_res.r_loop,
        e_internal: st.emf_internal_fault, e_through: st.emf_through_fault,
        vk_required: st.required_knee_point_voltage, vk: st.specified_knee_point_voltage_px } : {
        f_a: st.actual_alf_at_connected_burden, fault_ratio: st.fault_current_ratio,
        S_in: st.internal_burden, S_a: st.actual_burden, Rc: e.cable_res.r_loop,
        check2: ok(e.calculations.fault_current_check) }),
      generic: (e, st) => ({ alf_actual: st.actual_alf_at_connected_burden ?? st.equivalent_alf_from_knee_point,
        Rc: e.cable_res.r_loop }),
      distance: (e, st) => ({ EALF: st.offered_knee_point_voltage_alf ?? st.specified_knee_point_voltage_px,
        Vk_req: st.required_knee_point_voltage, Vka: st.min_required_knee_point_close_in,
        Vkb: st.min_required_knee_point_zone1, Ktd_a: st.transient_dimensioning_factor_close_in,
        omega_Tp: e.derived.omega_tp, Rc: e.cable_res.r_loop }),
      transformer_diff: (e, st) => ({ EALF: st.offered_knee_point_voltage_alf ?? st.specified_knee_point_voltage_px,
        Vk_req: st.required_knee_point_voltage, alf_o: st.operational_alf,
        ALF_ziegler: st.required_alf_siemens_combined, Rc: e.cable_res.r_loop,
        emf_ok: ok(e.calculations.emf_method_result), ziegler_ok: ok(e.calculations.ziegler_method_result) }),
      // E internal / E through: the larger of the 3-phase and 1-phase E.M.F. (§10.6 F-SUM)
      line_diff: (e, st) => ({ EALF: st.offered_knee_point_voltage_alf ?? st.specified_knee_point_voltage_px,
        Vk_req: st.required_knee_point_voltage, Rc_3ph: e.cable_res_3ph.r_loop, Rc_1ph: e.cable_res.r_loop,
        E_internal: [st.emf_3phase_internal_fault, st.emf_1phase_internal_fault].reduce((a, b) => (num(b) > num(a) ? b : a)),
        E_through: [st.emf_3phase_through_fault, st.emf_1phase_through_fault].reduce((a, b) => (num(b) > num(a) ? b : a)) }),
      vt: (e, st) => ({ burden_utilization: st.burden_utilization, thermal_utilization: st.thermal_utilization,
        actual_burden_va: st.actual_burden, actual_current: num(st.actual_secondary_current) / 1000,
        voltage_drop_percent: pct(st.voltage_drop_in_cable), Rc: e.cable_res.r_loop }),
    };
    // The result fields buildMetrics reads (ctsizer-panels.jsx): every one is
    // returned, so no Summary card is blank (PORTING_PLAN.md §10.6 F-SUM).
    const SUMMARY_READS = {
      busbar: (r) => (r.is_px ? ['e_internal', 'e_through', 'vk_required', 'vk', 'Rc', 'margin']
        : ['f_a', 'check2', 'fault_ratio', 'S_in', 'S_a', 'Rc', 'margin']),
      line_diff: () => ['EALF', 'Vk_req', 'E_internal', 'E_through', 'Rc_3ph', 'Rc_1ph'],
      generic: () => ['alf_actual', 'Rc'],
    };

    const types = new Set();
    G.cases.forEach((c) => {
      const tag = `E2E ${c.name}`;
      const e = c.expected;
      types.add(c.calc_type);
      // As the UI: CTCalc.calculate(c.calc_type, c.inputs, dSystem)
      const inputs = JSON.parse(JSON.stringify(c.inputs));
      const r = CTCalc.calculate(c.calc_type, inputs, { ...c.system });
      if (!r) { results.push(assert(`${tag} result`, false, r, 'a result')); return; }
      results.push(assert(`${tag} inputs not modified`, JSON.stringify(inputs) === JSON.stringify(c.inputs),
        JSON.stringify(inputs), JSON.stringify(c.inputs)));

      // Status (VT keeps the Python 'OK' / 'IKKE OK'; CT 'OK' / 'NOT_OK')
      results.push(assert(`${tag} status`, r.status === e.status && r.is_ok === (e.status === 'OK'),
        `${r.status} / ${r.is_ok}`, e.status));
      // Warnings: same count; same content where the Python keeps structured
      // tuples or verbatim text (distance renders some via Translator, §7)
      results.push(assert(`${tag} warnings`, r.warnings.length === e.warnings.length
        && (c.calc_type === 'distance' || matchesExpected(r.warnings, e.warnings)),
        JSON.stringify(r.warnings), JSON.stringify(e.warnings)));
      // Conclusion key (line_diff keeps the conclusion key where Python stores
      // the status string, §7 Phase 4; distance's Python key is presentation-only)
      if (c.calc_type === 'line_diff') {
        // The conclusion key is the Vk verdict (the Python conclusion_comparison
        // row). On an AR failure Python overwrites calculations.conclusion with
        // NOT_OK, the JS keeps the key and flips `status` (line_diff/main.js).
        const vkOk = e.steps.some(([k, v]) => k === 'conclusion_comparison' && v === 'OK');
        const want = vkOk ? 'ct_sufficient' : 'ct_insufficient';
        results.push(assert(`${tag} conclusion`, r.conclusion === want, r.conclusion, want));
      } else if (c.calc_type !== 'distance' && c.calc_type !== 'vt') {
        results.push(assert(`${tag} conclusion`, r.conclusion === e.calculations.conclusion,
          r.conclusion, e.calculations.conclusion));
      }

      // Lead resistance: the toolbox reference for the project method /
      // temperature and the core's wiring and current case
      const cr = r.cable_res || {};
      const ex = e.cable_res;
      results.push(assert(`${tag} cable ${ex.method}/${ex.topology}/k=${ex.factor}`,
        cr.method === ex.method && cr.topology === ex.topology && approx(cr.factor, ex.factor)
          && approx(cr.r_conductor, ex.r_conductor) && approx(cr.r20_per_km, ex.r20_per_km),
        `${cr.method}/${cr.topology}/${cr.factor}/${cr.r_conductor}`,
        `${ex.method}/${ex.topology}/${ex.factor}/${ex.r_conductor}`));

      // Summary panel numbers
      const st = {};
      e.steps.forEach(([k, v]) => { if (!(k in st)) st[k] = v; });
      const want = SUMMARY[c.calc_type](e, st);
      Object.entries(want).forEach(([k, v]) => {
        const got = r[k];
        const pass = typeof v === 'boolean' ? got === v
          : typeof v === 'string' ? near(got, v) : approx(got, v);
        results.push(assert(`${tag} Summary ${k}`, pass, got, v));
      });
      const reads = SUMMARY_READS[c.calc_type];
      if (reads) {
        const blank = reads(r).filter((k) => r[k] == null).join(',');
        results.push(assert(`${tag} Summary blank cards (F-SUM)`, blank === '', blank, ''));
      }
      if (c.calc_type === 'overcurrent') {
        // Esat_req is CTSizer-only: ALF_req·Isr·Rt from the Python ALF_req and Rt
        const esatReq = num(st.required_alf) * c.inputs.Is * num(st.total_secondary_resistance);
        results.push(assert(`${tag} Summary Esat_req (ALF_req·Isr·Rt)`, approx(r.Esat_req, esatReq),
          r.Esat_req, esatReq));
      }

      // Formula Steps: every Python row is present in the JS with the same value
      const alias = STEP_ALIAS[c.calc_type] || {};
      const pyByKey = {};
      e.steps.forEach(([k, v, sub]) => { if (!(k in pyByKey)) pyByKey[k] = { v, sub }; });
      const seen = new Set();
      let compared = 0;
      const bad = [];
      r.steps.forEach((s) => {
        // Every row has a LaTeX string; only the IEC "Krav" text rows have an
        // empty one, as their Python rows (FormulaStep then shows the text only);
        // so does distance's analytical-Ktd methodology note
        if (typeof s.latex !== 'string' || (!s.latex && !/^iec_requirement_|^ktd_methodology_description$/.test(s.key))) bad.push(`${s.key}: no latex`);
        if (CABLE_ROWS.includes(s.key)) {
          const L = c.inputs.cable_length;
          const ref = {
            cable_r20: ex.r20_per_km,
            cable_resistance_at_temp: ex.r_conductor * 1000 / L,
            cable_r_conductor: ex.r_conductor,
            total_cable_resistance: c.calc_type === 'line_diff' ? e.cable_res_3ph.r_loop : ex.r_loop,
            total_cable_resistance_1ph: ex.r_loop,
          }[s.key];
          compared++;
          if (!approx(s.result, ref)) bad.push(`${s.key}: ${s.result} ≠ ${ref}`);
          return;
        }
        const names = [].concat(alias[s.key] ?? s.key);
        const pk = names.find((n) => n in pyByKey);
        if (pk === undefined) return;
        seen.add(pk);
        const { v, sub } = pyByKey[pk];
        compared++;
        if (s.is_conclusion) {
          // Python writes the AR evaluation row (a text) only when EAL_AR passes;
          // the JS always writes a pass/fail row (distance/auto_reclosure_ext.js)
          const pyOk = v === 'OK' || v === 'passed' || s.key === 'auto_reclosure_evaluation';
          if (s.is_ok !== pyOk) bad.push(`${s.key}: is_ok ${s.is_ok} ≠ ${v}`);
        } else if (typeof s.result === 'number') {
          if (!near(s.result, v)) bad.push(`${s.key}: ${s.result} ≠ ${v}`);
        } else {
          const text = [s.result, s.unit].filter(Boolean).join(' ');
          if (!(s.result === sub || text === v || s.result === v)) bad.push(`${s.key}: ${JSON.stringify(s.result)} ≠ ${JSON.stringify(v || sub)}`);
        }
      });
      const keys = r.steps.map((s) => s.key);
      const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
      if (dupes.length) bad.push(`duplicate step keys (the Steps tab keys rows by key): ${dupes.join(',')}`);
      // auto_reclosure_ode_graph: the Python's preview-image row, not ported
      // (presentation only, distance/auto_reclosure_ext.js)
      const unseen = Object.keys(pyByKey).filter((k) => !seen.has(k)
        && !['cable_resistance_at_temp', 'total_cable_resistance', 'auto_reclosure_ode_graph'].includes(k));
      results.push(assert(`${tag} Formula Steps (${compared} rows vs Python)`,
        bad.length === 0 && unseen.length === 0,
        bad.concat(unseen.map((k) => `missing ${k}`)).join('; ') || 'all equal', 'all equal'));

      if (c.calc_type === 'distance' || c.calc_type === 'line_diff') {
        // F-AR-KEYS (PORTING_PLAN.md §10.6): the module gets the CT class keys
        // ctvt_dim's GUI writes (CTCalc.moduleCore): ct_class and
        // ar_time_constant_class from ct_class_family, and no alf on a distance
        // PX core (only its ODE check reads alf; line_diff ignores it for PX):
        // the same keys as the Python core_data
        // and ar_ts (the typical-Ts table for ar_ts_mode 'table')
        const mc = CTCalc.moduleCore(c.calc_type, c.inputs, c.system);
        const cd = c.python.core_data;
        const dist = c.calc_type === 'distance';
        // and the C-O-C-O windows ar_t_al / ar_t_double_al = the relay t_al
        // (relay_tal, blank 25 ms) on an AR core
        const got = { ct_class: mc.ct_class, ar_time_constant_class: mc.ar_time_constant_class, alf: dist && 'alf' in mc, ar_ts: mc.ar_ts,
                      ar_t_al: mc.ar_t_al, ar_t_double_al: mc.ar_t_double_al };
        const want = { ct_class: cd.ct_class, ar_time_constant_class: cd.ar_time_constant_class, alf: dist && 'alf' in cd, ar_ts: cd.ar_ts,
                       ar_t_al: cd.ar_t_al, ar_t_double_al: cd.ar_t_double_al };
        results.push(assert(`${tag} module core: CT class keys, alf, ar_ts and AR windows as the Python core_data`,
          JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got), JSON.stringify(want)));
      }
      if (c.calc_type === 'distance') {
        // F-DIST-UI (PORTING_PLAN.md §10.6): relay_tal selects the analytical
        // Ktd, auto_reclose_enabled runs the verified AR check (EAL_AR and the
        // IEC 61869-100 ODE check; the Python rows were compared above)
        const analytical = c.inputs.relay_tal != null;
        results.push(assert(`${tag} Ktd method (relay_tal ${c.inputs.relay_tal ?? 'not set'})`,
          r.method === (analytical ? 'analytical' : 'lookup_table') && (st.ktd_methodology_description !== undefined) === analytical,
          r.method, analytical ? 'analytical' : 'lookup_table'));
        const ar = !!c.inputs.auto_reclose_enabled;
        // A PX core has no ODE check (no rated ALF): EAL_AR decides alone
        const arPass = st.auto_reclosure_evaluation !== undefined
          && [undefined, 'OK'].includes(st.auto_reclosure_ode_saturation_check);
        results.push(assert(`${tag} AR check ${ar ? 'runs' : 'off'}`, ar
          ? near(r.eal_ar, st.auto_reclosure_transient_dimensioning) && (r.is_adequate && r.ode_is_ok !== false) === arPass
          : r.eal_ar === null && r.ode_is_ok === null && !r.steps.some((x) => /^auto_reclosure_/.test(x.key)),
          { eal_ar: r.eal_ar, is_adequate: r.is_adequate, ode_is_ok: r.ode_is_ok },
          ar ? { eal_ar: st.auto_reclosure_transient_dimensioning, pass: arPass } : 'no AR'));
        if (ar) {
          // The ODE check runs exactly when the Python's does (not for PX: no
          // rated ALF); its class, K_R and Ts are the Python ODE row's
          // ("CT class: 5PR, K_R=0.10, T_s=1.00s, …", the preview-image row)
          const pyOde = st.auto_reclosure_ode_saturation_check !== undefined;
          const jsOde = r.steps.some((x) => x.key === 'auto_reclosure_ode_saturation_check');
          results.push(assert(`${tag} ODE check ${pyOde ? 'runs' : 'skipped'} as Python`,
            jsOde === pyOde && (r.ode_is_ok !== null) === pyOde, { jsOde, ode_is_ok: r.ode_is_ok }, pyOde));
          if (pyOde) {
            const m = String(pyByKey.auto_reclosure_ode_graph?.sub ?? '').match(/CT class: (\S+), K_R=([\d.]+), T_s=([\d.]+)s/);
            const mc = CTCalc.moduleCore('distance', c.inputs, c.system);
            const ctClass = mc.ct_class ?? '5P';
            const jsRow = [ctClass, CTBaseClasses.getRemanenceFactor(ctClass).toFixed(2), (mc.ar_ts ?? 1.0).toFixed(2)];
            results.push(assert(`${tag} ODE class / K_R / Ts as Python (${m ? m.slice(1).join(', ') : 'no row'})`,
              !!m && JSON.stringify(jsRow) === JSON.stringify(m.slice(1, 4)), jsRow.join(', '), m && m.slice(1, 4).join(', ')));
          }
        }
        // An old core's t_al / vka_factor (the panel's former fields) reach no
        // calculation: the same core without them, or with other values, gives
        // the same result
        if ('t_al' in c.inputs || 'vka_factor' in c.inputs) {
          const strip = JSON.parse(JSON.stringify(c.inputs));
          delete strip.t_al; delete strip.vka_factor;
          const other = { ...strip, t_al: 250, vka_factor: 2.5 };
          const same = (x) => JSON.stringify(x) === JSON.stringify(r);
          results.push(assert(`${tag} stored t_al / vka_factor change nothing (old core)`,
            same(CTCalc.calculate('distance', strip, { ...c.system }))
              && same(CTCalc.calculate('distance', other, { ...c.system })), 'differs', 'identical'));
        }
      }
      if (c.calc_type === 'line_diff') {
        // The shared AR card on the line diff panel: auto_reclose_enabled runs
        // line_diff's own check (EAL_AR = Kssc·Ktd·(Rct+Rb)·Isr; proposed Vk /
        // EALF < EAL_AR → NOT OK, no ODE check). Python marks a failure with
        // warning_auto_reclosure_eal_below_vk; its EAL_AR row was compared above.
        const ar = !!c.inputs.auto_reclose_enabled;
        const pyFail = e.warnings.some((w) => [].concat(w)[0] === 'warning_auto_reclosure_eal_below_vk');
        const jsFail = r.warnings.some((w) => [].concat(w)[0] === 'warning_auto_reclosure_eal_below_vk');
        results.push(assert(`${tag} AR check ${ar ? 'runs' : 'off'}`, ar
          ? near(r.eal_ar, st.auto_reclosure_transient_dimensioning) && r.ktd_ar > 0 && r.kssc_ar > 0
            && (r.proposed_vk < r.eal_ar) === pyFail && jsFail === pyFail
            && (pyFail ? r.status === 'NOT_OK' : true)
          : r.eal_ar === null && r.ktd_ar === null && !r.steps.some((x) => /^auto_reclosure_/.test(x.key)),
          { eal_ar: r.eal_ar, proposed_vk: r.proposed_vk, fail: jsFail, status: r.status },
          ar ? { eal_ar: st.auto_reclosure_transient_dimensioning, fail: pyFail, status: e.status } : 'no AR'));
      }
    });

    // The golden covers what §10 B1 asks for
    const cover = (f) => [...new Set(G.cases.map(f))].sort().join(',');
    results.push(assert('E2E covers all eight calc types', types.size === 8, [...types].join(','), 8));
    results.push(assert('E2E covers a distance core with relay_tal and AR enabled, and old t_al cores',
      G.cases.some((c) => c.calc_type === 'distance' && c.inputs.relay_tal != null && c.inputs.auto_reclose_enabled)
        && G.cases.some((c) => c.calc_type === 'distance' && 't_al' in c.inputs && !('relay_tal' in c.inputs)),
      G.cases.filter((c) => c.calc_type === 'distance').map((c) => c.name).join(','), 'relay_tal + AR, t_al'));
    results.push(assert('E2E covers distance AR cores of a gapped (PR) and a PX class',
      G.cases.some((c) => c.calc_type === 'distance' && c.inputs.auto_reclose_enabled && /PR$/.test(c.inputs.ct_class_family || ''))
        && G.cases.some((c) => c.calc_type === 'distance' && c.inputs.auto_reclose_enabled && c.inputs.ct_class_family === 'PX' && c.inputs.is_px),
      G.cases.filter((c) => c.calc_type === 'distance' && c.inputs.auto_reclose_enabled).map((c) => c.inputs.ct_class_family).join(','), 'PR + PX'));
    results.push(assert('E2E covers Ts from the table on both AR types and a manual Ts',
      ['distance', 'line_diff'].every((t) => G.cases.some((c) => c.calc_type === t && c.inputs.auto_reclose_enabled && c.inputs.ar_ts_mode === 'table'))
        && G.cases.some((c) => c.inputs.auto_reclose_enabled && c.inputs.ar_ts_mode === 'manual' && c.inputs.ar_ts != null),
      G.cases.filter((c) => c.inputs.auto_reclose_enabled).map((c) => `${c.name}:${c.inputs.ar_ts_mode}`).join(','), 'table ×2 + manual'));
    results.push(assert('E2E covers a line_diff core with AR enabled and non-default t\' / tfr, and line_diff cores without AR',
      G.cases.some((c) => c.calc_type === 'line_diff' && c.inputs.auto_reclose_enabled
        && c.inputs.ar_t_prime !== 0.1 && c.inputs.ar_tfr !== 0.4)
        && G.cases.some((c) => c.calc_type === 'line_diff' && !c.inputs.auto_reclose_enabled),
      G.cases.filter((c) => c.calc_type === 'line_diff').map((c) => c.name).join(','), 'AR + no AR'));
    results.push(assert('E2E covers both methods, both wirings, 20 / 75 °C',
      cover((c) => c.expected.cable_res.method) === 'iec60287,table'
        && cover((c) => c.expected.cable_res.topology) === 'four_wire,six_wire'
        && cover((c) => c.system.cable_temp) === '20,75',
      `${cover((c) => c.expected.cable_res.method)} | ${cover((c) => c.expected.cable_res.topology)} | ${cover((c) => c.system.cable_temp)}`,
      'iec60287,table | four_wire,six_wire | 20,75'));
    return results;
  }

  // ── CTRelayDB (calc/relays.js ← ctvt_dim data/relays.db) and the relay
  //    t_al reaching the C-O-C-O check ─────────────────────────────────────
  function testRelayDb() {
    const results = [];
    const DB = CTRelayDB;
    results.push(assert('RELAYDB 23 relays exported from ctvt_dim', DB.RELAYS.length === 23, DB.RELAYS.length, 23));
    results.push(assert('RELAYDB manufacturers', DB.manufacturers().join(',') === 'ABB,GE,SEL,Siemens',
      DB.manufacturers().join(','), 'ABB,GE,SEL,Siemens'));
    const sieDist = DB.list('Siemens', 'distance').map((r) => r.name).join(',');
    results.push(assert('RELAYDB Siemens distance IEDs (supported_applications)',
      sieDist === 'SIPROTEC 4 7SA522,SIPROTEC 5 7SA87,SIPROTEC 5 7SD87', sieDist, '7SA522, 7SA87, 7SD87'));
    results.push(assert('RELAYDB metering / VT have no relay', !DB.supports('metering') && !DB.supports('vt'), 'supported', 'not'));
    // get_ct_specs(name, Isr).burden_va: the first row with that rated current
    const b1 = DB.lookup('SIPROTEC 5 7SA87', 1), b5 = DB.lookup('SIPROTEC 5 7SA87', 5);
    results.push(assert('RELAYDB 7SA87 burden 1 A / 5 A, t_al', b1.burden_va === 0.05 && b5.burden_va === 0.3 && b1.tal_ms === 25,
      `${b1.burden_va} / ${b5.burden_va}, ${b1.tal_ms}`, '0.05 / 0.3, 25'));
    const core = { Is: 1, relay_model: 'SIPROTEC 5 7SA87', relay_burden: 0.4, relay_tal: 60 };
    const a1 = DB.apply(core), a5 = DB.apply({ ...a1, Is: 5 });
    results.push(assert('RELAYDB apply fills SR, t_al, manufacturer, model; a new Isr brings its burden',
      a1.relay_burden === 0.05 && a1.relay_tal === 25 && a1.relay_manufacturer === 'Siemens' && a1.relay_type === '7SA87'
        && a5.relay_burden === 0.3 && DB.apply(a1) === a1,
      JSON.stringify([a1.relay_burden, a1.relay_tal, a5.relay_burden]), '[0.05,25,0.3]'));
    const noCt = DB.apply({ Is: 1, relay_model: 'ABB REL670', relay_burden: 0.07 });
    const custom = { Is: 1, relay_burden: 0.07, relay_tal: 40 };
    results.push(assert('RELAYDB no CT input in the DB keeps the typed SR; a custom relay is unchanged',
      noCt.relay_burden === 0.07 && noCt.relay_tal === 25 && DB.apply(custom) === custom, noCt.relay_burden, 0.07));

    // The relay t_al is the C-O-C-O window (CTCalc.moduleCore): it moves the
    // ODE check and EAL_AR; blank → 25 ms
    const arCore = { Ip: 3000, Is: 1, rct: 3, burden: 15, relay_burden: 0.1, alf: 40, ct_class_family: '5PR',
      auto_reclose_enabled: true, ar_t_prime: 0.08, ar_tfr: 0.5, ar_ts: 1.0, ar_ktf_preset: 'iec_default',
      cable_length: 120, cable_cross: 4, cable_mat: 'cu' };
    const sys = { voltage: 132, freq: '50', isc_sys: 31.5, tp: 80 };
    const mBlank = CTCalc.moduleCore('distance', arCore, sys);
    const m60 = CTCalc.moduleCore('distance', { ...arCore, relay_tal: 60, ar_t_al: 0.2 }, sys);
    results.push(assert('RELAYDB t_al → ar_t_al / ar_t_double_al (blank 25 ms, overrides a stored ar_t_al)',
      mBlank.ar_t_al === 0.025 && mBlank.ar_t_double_al === 0.025 && m60.ar_t_al === 0.06 && m60.ar_t_double_al === 0.06,
      `${mBlank.ar_t_al}, ${m60.ar_t_al}`, '0.025, 0.06'));
    const ld = CTCalc.moduleCore('line_diff', { ...arCore, relay_tal: 40 }, sys);
    const off = CTCalc.moduleCore('distance', { ...arCore, auto_reclose_enabled: false, relay_tal: 40 }, sys);
    results.push(assert('RELAYDB t_al reaches the line diff AR too; no AR → no AR windows',
      ld.ar_t_al === 0.04 && off.ar_t_al === undefined, `${ld.ar_t_al}, ${off.ar_t_al}`, '0.04, undefined'));
    const ode = (tal) => CTCalc.calculate('distance', { ...arCore, relay_tal: tal }, sys)
      .steps.find((x) => x.key === 'auto_reclosure_ode_ktd').result;
    results.push(assert('RELAYDB a longer t_al gives a larger ODE Ktd', ode(60) > ode(25), ode(60), `> ${ode(25)}`));
    return results;
  }

  // ── The picked IED's calculation parameters (issue #93): busbar Check 3,
  //    transformer diff IEC 61869 factors, distance Vka factor ─────────────
  function testRelayCalcParams() {
    const results = [];
    const DB = CTRelayDB;

    // Lookups: values from calc/relay_db.js; an IED without the group, no
    // IED, or a name the database does not have
    const bb500 = DB.busbarParams({ relay_model: 'ABB REB500' });
    results.push(assert('RELAYPARAMS REB500 busbar Fa minimum 10 / 20, Tp threshold 120 ms',
      JSON.stringify(bb500) === JSON.stringify({ fa_min_low_tp: 10, fa_min_high_tp: 20, tp_threshold_ms: 120 }),
      JSON.stringify(bb500), '{10, 20, 120}'));
    results.push(assert('RELAYPARAMS no busbar minimum: B90, SEL-487B, manual entry, unknown IED',
      DB.busbarParams({ relay_model: 'GE Multilin B90' }) === null && DB.busbarParams({ relay_model: 'SEL-487B' }) === null
        && DB.busbarParams({}) === null && DB.busbarParams({ relay_model: 'Gone IED' }) === null, 'non-null', 'null'));
    results.push(assert('RELAYPARAMS relay_name is the fallback for relay_model',
      DB.relayNameOf({ relay_name: 'ABB REB500' }) === 'ABB REB500'
        && DB.relayNameOf({ relay_model: 'SEL-421', relay_name: 'ABB REB500' }) === 'SEL-421'
        && DB.busbarParams({ relay_name: 'ABB REB500' }) !== null, 'no fallback', 'relay_model, else relay_name'));
    const ret = DB.trafoDiffParams({ relay_model: 'ABB RET670' });
    const ut = DB.trafoDiffParams({ relay_model: 'SIPROTEC 5 7UT86' });
    const none = DB.trafoDiffParams({});
    const gone = DB.trafoDiffParams({ relay_model: 'Gone IED' });
    results.push(assert('RELAYPARAMS transformer diff: E.m.f.-only IED not applicable; 7UT86, no IED and an unknown IED applicable',
      ret.applicable === false && ret.params === null && ut.applicable && ut.params.ext_fault_factor === 1.5
        && none.applicable && none.params === null && gone.applicable && gone.params === null
        && ['GE Multilin T60', 'SEL-487E'].every((n) => !DB.trafoDiffParams({ relay_model: n }).applicable),
      JSON.stringify([ret.applicable, ut.applicable, none.applicable, gone.applicable]), '[false,true,true,true]'));
    results.push(assert('RELAYPARAMS distance Vka factor 1.3 (7SA87, no IED)',
      DB.vkaFactor({ relay_model: 'SIPROTEC 5 7SA87' }) === 1.3 && DB.vkaFactor({}) === 1.3, DB.vkaFactor({}), 1.3));

    // Busbar Check 3: Ifmax/Ipr = 5 < Fa < 10 passes without an IED and
    // fails the REB500 minimum (Tp 100 ms ≤ 120 ms → 10); Tp 150 ms → 20
    const cd = { isc_sys: 40, tp: 100, cable_r_method: 'iec60287', cable_temp: 70 };
    const bb = { Ip: 8000, Is: 5, rct: 1, burden: 30, alf: 6, relay_burden: 0.2,
                 cable_length: 50, cable_cross: 4, cable_mat: 'cu' };
    const plain = CTBusbar.calculate(bb, cd);
    const reb = CTBusbar.calculate({ ...bb, relay_model: 'ABB REB500' }, cd);
    const slow = CTBusbar.calculate({ ...bb, alf: 15, relay_model: 'ABB REB500' }, { ...cd, tp: 150 });
    results.push(assert('RELAYPARAMS busbar: no IED → no Check 3; 5 < Fa < 10',
      plain.is_ok && plain.fa_min === null && !plain.steps.some((x) => x.key === 'check3')
        && plain.f_a > plain.fault_ratio && plain.f_a < 10, `${plain.is_ok} Fa ${plain.f_a}`, 'OK, 5 < Fa < 10'));
    results.push(assert('RELAYPARAMS busbar: REB500 Check 3 Fa ≥ 10 fails the core',
      !reb.is_ok && reb.check2 && !reb.check3 && reb.fa_min === 10
        && reb.steps.some((x) => x.key === 'check3' && x.is_ok === false)
        && reb.warnings.some((w) => w[0] === 'warning_manufacturer_fa_minimum' && w[2] === 10),
      `${reb.is_ok} Fa_min ${reb.fa_min}`, 'NOT OK, Fa_min 10'));
    results.push(assert('RELAYPARAMS busbar: Tp 150 ms > 120 ms → Fa_min 20',
      slow.fa_min === 20 && slow.check3 === (slow.f_a >= 20), slow.fa_min, 20));

    // A test IED with non-default values: every parameter must come from the
    // database, none from a constant in the calculation
    const TEST = { name: 'TEST IED', manufacturer: 'Test', series: 'T', model: 'T1',
      applications: ['busbar', 'distance', 'transformer_differential'], measurement_time_ms: 25, ct_inputs: {},
      busbar: { fa_min_low_tp: 7 },
      transformer_diff: { ext_fault_factor: 2, int_fault_factor: 0.5, min_alf: 15, max_fadap: 1 },
      distance: { vka_factor: 1.6 } };
    DB.RELAYS.push(TEST);
    try {
      const tp = DB.busbarParams({ relay_model: 'TEST IED' });
      results.push(assert('RELAYPARAMS a missing field takes the default (busbar 20 / 120 ms)',
        tp.fa_min_low_tp === 7 && tp.fa_min_high_tp === 20 && tp.tp_threshold_ms === 120, JSON.stringify(tp), '{7, 20, 120}'));
      const bt = CTBusbar.calculate({ ...bb, relay_model: 'TEST IED' }, cd);
      results.push(assert('RELAYPARAMS busbar Check 3 uses the IED minimum (7)',
        bt.fa_min === 7 && bt.check3 === (bt.f_a >= 7), bt.fa_min, 7));

      const tcd = { voltage: 150, isc_sys: 40, cable_r_method: 'iec60287', cable_temp: 70 };
      const tcore = { Ip: 1000, Is: 1, rct: 3, burden: 20, alf: 20, relay_burden: 0.1,
        cable_length: 50, cable_cross: 4, cable_mat: 'cu', trafo_voltage_kv: 150, trafo_power_mva: 100,
        trafo_z_percent: 12, trafo_ik_max: 22000 };
      const t0 = CTTransformerDiff.calculate(tcore, tcd);
      const tt = CTTransformerDiff.calculate({ ...tcore, relay_model: 'TEST IED' }, tcd);
      const latex = (r, k) => r.steps.find((x) => x.key === k).latex;
      results.push(assert('RELAYPARAMS transformer diff Krav 1–3 use the IED factors (2, 0.5, 15)',
        approx(tt.alf_ext_required, t0.alf_ext_required * 2 / 1.5) && approx(tt.alf_int_required, t0.alf_int_required * 0.5 / 0.4)
          && t0.alf_min_required === 12.5 && tt.alf_min_required === 15,
        JSON.stringify([tt.alf_ext_required / t0.alf_ext_required, tt.alf_min_required]), '[1.333, 15]'));
      results.push(assert('RELAYPARAMS transformer diff formulas show the IED factors',
        latex(t0, 'requirement_1_alf_external_fault').startsWith('ALF_{ext} = 1.5 ')
          && latex(tt, 'requirement_1_alf_external_fault').startsWith('ALF_{ext} = 2 ')
          && latex(tt, 'requirement_2_alf_internal_fault').startsWith('ALF_{int} = 0.5 '),
        latex(tt, 'requirement_1_alf_external_fault'), 'ALF_{ext} = 2 …'));
      const krav4 = tt.steps.find((x) => x.key === 'iec_requirement_4');
      results.push(assert('RELAYPARAMS transformer diff Krav 4 uses the IED F_adap range (0.05 default – 1)',
        String(krav4.result).startsWith('Krav 4: 0.05 <= ') && String(krav4.result).includes('<= 1 →'),
        krav4.result, 'Krav 4: 0.05 <= Fadap (…) <= 1 → …'));

      const dsys = { voltage: 132, freq: '50', isc_sys: 31.5, tp: 80 };
      const dcore = { Ip: 3000, Is: 1, rct: 3, burden: 15, relay_burden: 0.1, alf: 40, ct_class_family: '5PR',
        cable_length: 120, cable_cross: 4, cable_mat: 'cu' };
      const d0 = CTDistance.calculate({ ...dcore }, dsys);
      const dt = CTDistance.calculate({ ...dcore, relay_model: 'TEST IED' }, dsys);
      results.push(assert('RELAYPARAMS distance Vka uses the IED factor (1.6)',
        approx(dt.vka, d0.vka * 1.3 / 1.6), dt.vka, d0.vka * 1.3 / 1.6));
    } finally {
      DB.RELAYS.pop();
    }
    return results;
  }

  // ── IED input rating (calc/ied_rating.js ← ct_ied_rating.py) ──────────
  function testIedRating() {
    const results = [];
    const I = CTIedRating;
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.ied_rating) ? CT_GOLDEN.ied_rating : null;
    if (!G) return results;
    const pin = (c) => ({ id: c.id, kind: c.kind, value: c.value, limit: c.limit, ok: c.ok, reason: c.reason });
    const same = (a, b) => (a == null && b == null) || (typeof b === 'number' ? approx(a, b, 1e-9) : a === b);
    const checksMatch = (got, exp) => got.length === exp.length && got.every((c, i) =>
      ['id', 'kind', 'value', 'limit', 'ok', 'reason'].every((k) => same(c[k], exp[i][k])));

    G.peak_factor.forEach((c) => {
      const got = I.peakFactor(c.input[0], c.input[1]);
      results.push(assert(`IED peak_factor(${c.input})`, approx(got, c.expected, 1e-9), got, c.expected));
    });
    G.thermal_allowed_current.forEach((c) => {
      const got = I.thermalAllowedCurrent(c.input[0], c.input[1]);
      results.push(assert(`IED thermal_allowed_current(t=${c.input[1]})`,
        got.every((v, i) => approx(v, c.expected[i], 1e-9)), JSON.stringify(got), JSON.stringify(c.expected)));
    });
    G.requirements.forEach((c, n) => {
      const { specs, isr, i_sec_rms, i_sec_peak } = c.input;
      const got = I.buildRequirements(specs, isr).map((r) => pin(I.evaluateRequirement(r, i_sec_rms, i_sec_peak)));
      results.push(assert(`IED build + evaluate requirements #${n + 1}`, checksMatch(got, c.expected),
        JSON.stringify(got), JSON.stringify(c.expected)));
    });

    G.calculate.forEach((c) => {
      const got = I.calculate(c.calc_type, c.inputs, c.system);
      const exp = c.expected;
      if (exp == null) {
        results.push(assert(`IED ${c.name}`, got === null, JSON.stringify(got), 'null'));
        return;
      }
      const nums = ['i_fault', 'tp_ms', 'kappa', 'i_sec_rms', 'i_sec_peak'].filter((k) => k in exp);
      const stepKeys = got.steps.map((st) => st.key);
      const ok = got.status === exp.status && nums.every((k) => approx(got[k], exp[k], 1e-9))
        && checksMatch(got.checks.map(pin), exp.checks)
        && JSON.stringify(stepKeys) === JSON.stringify(exp.step_keys)
        && got.warnings.length === exp.n_warnings;
      results.push(assert(`IED ${c.name}`, ok,
        JSON.stringify([got.status, got.i_sec_peak, got.checks.map((x) => x.ok), stepKeys, got.warnings.length]),
        JSON.stringify([exp.status, exp.i_sec_peak, exp.checks.map((x) => x.ok), exp.step_keys, exp.n_warnings])));
    });

    // CTCalc.calculate runs it after the module: a failed IED check fails the
    // core; a passing one leaves the module verdict; no IED → no ied_rating
    const sys = { voltage: 150, freq: '50', isc_sys: 40, tp: 100, cable_r_method: 'iec60287', cable_temp: 70 };
    const bb = { Ip: 2000, Is: 5, rct: 1, burden: 30, alf: 20, relay_burden: 0.2,
                 cable_length: 50, cable_cross: 4, cable_mat: 'cu' };
    // 1000/5 A: 540 A peak > 500 A measuring range (placeholder, ctvt_dim#26)
    // (ALF 60 so the busbar check itself passes)
    const plain = CTCalc.calculate('busbar', { ...bb, Ip: 1000, alf: 60 }, sys);
    const fail = CTCalc.calculate('busbar', { ...bb, Ip: 1000, alf: 60, relay_model: 'SIPROTEC 5 7SS85' }, sys);
    results.push(assert('IED CTCalc: measuring range exceeded fails the core',
      plain.is_ok === true && !('ied_rating' in plain) && fail.is_ok === false && fail.status === 'NOT_OK'
        && fail.conclusion === 'ct_insufficient' && fail.ied_rating.status === 'NOT_OK'
        && fail.steps.some((st) => st.key === 'ied_measuring_range_check' && st.is_ok === false)
        && approx(fail.margin, Math.min(plain.margin, (500 / fail.ied_rating.i_sec_peak - 1) * 100), 1e-9),
      `${plain.is_ok} → ${fail.is_ok}`, 'true → false'));
    const pass = CTCalc.calculate('busbar', { ...bb, Ip: 4000, relay_model: 'SIPROTEC 5 7SS85' }, sys);
    const plain4k = CTCalc.calculate('busbar', { ...bb, Ip: 4000 }, sys);
    results.push(assert('IED CTCalc: within ratings keeps the module verdict and margin',
      pass.ied_rating.status === 'OK' && pass.is_ok === plain4k.is_ok && pass.margin === plain4k.margin,
      `${pass.is_ok}/${pass.margin}`, `${plain4k.is_ok}/${plain4k.margin}`));
    const td = CTCalc.calculate('transformer_diff', { Ip: 100, Is: 1, rct: 3, burden: 20, alf: 20, relay_burden: 0.1,
      cable_length: 50, cable_cross: 4, cable_mat: 'cu', trafo_voltage_kv: 150, trafo_power_mva: 100,
      trafo_z_percent: 12, trafo_ik_max: 22000, relay_model: 'SIPROTEC 5 7UT86' }, sys);
    results.push(assert('IED CTCalc: transformer diff failure adds ied_rating to failed_methods',
      td.is_ok === false && td.failed_methods.includes('ied_rating'), JSON.stringify(td.failed_methods), '[…, ied_rating]'));
    const noData = CTCalc.calculate('transformer_diff', { Ip: 1000, Is: 1, rct: 3, burden: 20, alf: 20, relay_burden: 0.1,
      cable_length: 50, cable_cross: 4, cable_mat: 'cu', trafo_voltage_kv: 150, trafo_power_mva: 100,
      trafo_z_percent: 12, trafo_ik_max: 22000, relay_model: 'ABB RET670' }, sys);
    results.push(assert('IED CTCalc: an IED without input data only warns',
      noData.ied_rating.status === 'N/A' && noData.warnings.some((w) => w[0] === 'warning_ied_no_input_data'),
      noData.ied_rating.status, 'N/A'));
    return results;
  }

  function run() {
    const suites = [
      { name: 'Foundation',     fn: testFoundation     },
      { name: 'Materials',      fn: testMaterials      },
      { name: 'CableResCore',   fn: testCableResCore   },
      { name: 'CableResTable',  fn: testCableResTable  },
      { name: 'CableResIec60287', fn: testCableResIec60287 },
      { name: 'CableResTopology', fn: testCableResTopology },
      { name: 'Overcurrent',    fn: testOvercurrent    },
      { name: 'Metering',       fn: testMetering       },
      { name: 'Busbar',         fn: testBusbar         },
      { name: 'Generic',        fn: testGeneric        },
      { name: 'DistanceMain',   fn: testDistanceMain   },
      { name: 'DistanceData',   fn: testDistanceData   },
      { name: 'DistanceCableResistance', fn: testDistanceCableResistance },
      { name: 'DistanceFaultCalculation', fn: testDistanceFaultCalculation },
      { name: 'DistanceTransientFactors', fn: testDistanceTransientFactors },
      { name: 'DistanceKneePoint', fn: testDistanceKneePoint },
      { name: 'DistanceRelay', fn: testDistanceRelay },
      { name: 'DistanceAutoReclosureExt', fn: testDistanceAutoReclosureExt },
      { name: 'DistanceFormatting', fn: testDistanceFormatting },
      { name: 'AutoReclosure',  fn: testAutoReclosure  },
      { name: 'ArTsTable',      fn: testArTsTable      },
      { name: 'AutoReclosurePresets', fn: testAutoReclosurePresets },
      { name: 'AutoReclosureComputation', fn: testAutoReclosureComputation },
      { name: 'AutoReclosureWaveform', fn: testAutoReclosureWaveform },
      { name: 'TransformerDiffMain', fn: testTransformerDiffMain },
      { name: 'TransformerDiffPresets', fn: testTransformerDiffPresets },
      { name: 'TransformerDiffData', fn: testTransformerDiffData },
      { name: 'TransformerDiffBurden', fn: testTransformerDiffBurden },
      { name: 'TransformerDiffMethodsEmf', fn: testTransformerDiffMethodsEmf },
      { name: 'TransformerDiffMethodsIec61869', fn: testTransformerDiffMethodsIec61869 },
      { name: 'TransformerDiffMethodsZiegler', fn: testTransformerDiffMethodsZiegler },
      { name: 'TransformerDiffFormatting', fn: testTransformerDiffFormatting },
      { name: 'LineDiffMain',    fn: testLineDiffMain   },
      { name: 'LineDiffData',   fn: testLineDiffData   },
      { name: 'LineDiffEmfCalculation', fn: testLineDiffEmfCalculation },
      { name: 'LineDiffKneePoint', fn: testLineDiffKneePoint },
      { name: 'LineDiffAutoReclosureExt', fn: testLineDiffAutoReclosureExt },
      { name: 'LineDiffFormatting', fn: testLineDiffFormatting },
      { name: 'VtData',         fn: testVtData         },
      { name: 'VtPresets',      fn: testVtPresets      },
      { name: 'VtImpedance',    fn: testVtImpedance    },
      { name: 'VtCurrentBurden', fn: testVtCurrentBurden },
      { name: 'VtVoltageAnalysis', fn: testVtVoltageAnalysis },
      { name: 'VtThermal',      fn: testVtThermal      },
      { name: 'VtValidation',   fn: testVtValidation   },
      { name: 'VtFormatting',   fn: testVtFormatting   },
      { name: 'VtCalculator',   fn: testVtCalculator   },
      { name: 'CtCalculations', fn: testCtCalculations },
      { name: 'CableResConsistency', fn: testCableResConsistency },
      { name: 'RelayDb',        fn: testRelayDb        },
      { name: 'RelayCalcParams', fn: testRelayCalcParams },
      { name: 'IedRating',      fn: testIedRating      },
      { name: 'EndToEnd',       fn: testEndToEnd       },
    ];

    let totalPass = 0, totalFail = 0;
    const report = {};

    for (const suite of suites) {
      try {
        const results = suite.fn();
        const pass = results.filter(r => r.pass).length;
        const fail = results.filter(r => !r.pass).length;
        totalPass += pass; totalFail += fail;
        report[suite.name] = { pass, fail, results };
        const icon = fail === 0 ? '✅' : '❌';
        console.log(`[CTTest] ${icon} ${suite.name}: ${pass}/${results.length} passed`);
      } catch (e) {
        console.error(`[CTTest] 💥 ${suite.name} threw:`, e);
        report[suite.name] = { error: e.message };
        totalFail++;
      }
    }

    console.log(`[CTTest] ─────── TOTAL: ${totalPass} passed, ${totalFail} failed ───────`);
    return { totalPass, totalFail, report };
  }

  // Auto-run on load
  if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
      try { run(); } catch(e) { console.error('[CTTest] Failed to auto-run:', e); }
    });
  }

  return { run, testFoundation, testMaterials, testCableResCore, testCableResTable, testCableResIec60287, testCableResTopology, testOvercurrent, testMetering, testBusbar,
           testGeneric, testDistanceMain, testDistanceData, testAutoReclosure, testAutoReclosurePresets, testAutoReclosureComputation,
           testAutoReclosureWaveform, testTransformerDiffMain, testTransformerDiffPresets, testTransformerDiffData, testTransformerDiffBurden, testLineDiffMain, testLineDiffData,
           testLineDiffEmfCalculation, testLineDiffKneePoint, testVtData, testVtPresets, testVtImpedance,
           testCtCalculations, testCableResConsistency, testIedRating };
})();
