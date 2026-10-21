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

  // The remarks CTSizer adds to a module's Python ones (issue #125): the
  // parity checks compare the Python ones only.
  const CTSIZER_ONLY_WARNINGS = [
    ...((typeof CTMetering !== 'undefined' && CTMetering.EXTRA_WARNINGS) || []),
    'warning_vt_range_ii_below_25', 'warning_vt_range_nonstandard',
    ...((typeof CTPlausibility !== 'undefined' && CTPlausibility.KEYS) || []),
  ];
  const pyWarnings = (ws) => (Array.isArray(ws)
    ? ws.filter((w) => !(Array.isArray(w) && CTSIZER_ONLY_WARNINGS.includes(w[0]))) : ws);
  // Steps CTSizer adds to a VT core (the CTVT.calculate entry, issue #125)
  const CTSIZER_ONLY_VT_STEPS = ['burden_range_check'];

  // ── MATERIALS ─────────────────────────────────────────────────────────
  function testMaterials() {
    const results = [];

    // Copper 4mm² at 20°C, 100m one-way → R = 2 × ρ₂₀ × L / A
    // ρ₂₀ = 0.017241 Ω·mm²/m → R_one = 0.017241 × 100 / 4 = 0.431025 Ω → R_wire = 0.86205 Ω
    const R_cu = CTMaterials.calcWireResistance('Kobber (Cu)', 20, 100, 4).r_wire;
    results.push(assert('Cu 4mm² 100m 20°C', approx(R_cu, 0.86205), R_cu, 0.86205, ' Ω'));

    // Aluminium 4mm² at 20°C
    const R_al = CTMaterials.calcWireResistance('Aluminium (Al)', 20, 100, 4).r_wire;
    const expected_al = 2 * 0.028264 * 100 / 4;
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
  // The Python tool only has ×2, so the four_wire factors are asserted literally
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

    // ── ρ20 source (#132): IEC (auto) or manual; never a silent IEC fallback ──
    const P4 = { material: 'cu', cross_section_mm2: 4, length_m: 150, temp_c: 25 };
    const iecJ = JSON.stringify(R.calculate('iec60287', P4));
    results.push(assert('cres.rho no rho_mode = IEC (direct calls, old projects)',
      iecJ === JSON.stringify(R.calculate('iec60287', { ...P4, rho_mode: 'iec' })), 'differs', 'same result'));
    const iec4 = R.calculate('iec60287', P4);
    results.push(assert('cres.rho IEC: rho20 / rho_source / label',
      iec4.rho20 === CTMaterials.COPPER_RESISTIVITY_20C && iec4.rho_source === 'iec60287_1_1'
      && iec4.steps[0].rho_source === 'iec60287_1_1' && iec4.steps[0].variables.rho_20 === CTMaterials.COPPER_RESISTIVITY_20C
      && iec4.steps[0].label_en.includes('ρ20 = 0.017241 Ω·mm²/m from IEC 60287-1-1 Table 1')
      && iec4.steps[0].label_da.includes('ρ20 = 0.017241 Ω·mm²/m fra IEC 60287-1-1 tabel 1'),
      iec4.steps[0].label_en, 'ρ20 = 0.017241 … IEC 60287-1-1 Table 1'));
    // REF160 / the reference calculation: manual ρ20 0.0185 at 25 °C, 150 m, 4 mm², k = 2 → S_wire 1.4148 VA at 1 A
    const man = R.lead('iec60287', { ...P4, rho_mode: 'manual', rho20_manual: 0.0185 }, 'four_wire', 'single_phase');
    results.push(assert('cres.rho manual 0.0185: R′20 = 4.625 Ω/km', man.r20_per_km === 0.0185 / 4 * 1000,
      man.r20_per_km, 4.625, ' Ω/km'));
    results.push(assert('cres.rho manual 0.0185: ρ(25 °C) = 0.018864', approx(man.rho_t, 0.018863525, 1e-9)
      && man.rho_source === 'manual', man.rho_t, 0.018863525));
    results.push(assert('cres.rho manual 0.0185: R_c = 0.707382 Ω', approx(man.r_conductor, 0.7073821875, 1e-9),
      man.r_conductor, 0.7073821875, ' Ω'));
    results.push(assert('cres.rho manual 0.0185: k = 2, S_wire = 1.4148 VA (reference)',
      man.factor === 2 && (man.r_loop * 1 * 1).toFixed(4) === '1.4148', man.r_loop, 1.4148, ' VA'));
    results.push(assert('cres.rho manual labels (EN/DA, ρ20 and ρ(T))',
      man.steps[0].label_en.includes('ρ20 = 0.0185 Ω·mm²/m entered manually')
      && man.steps[0].label_da.includes('ρ20 = 0.0185 Ω·mm²/m indtastet manuelt')
      && man.steps[1].label_en.includes('ρ(25 °C) = 0.018864 Ω·mm²/m') && man.steps[1].label_en.includes('α20 = 0.00393')
      && man.steps[1].label_da.includes('ρ(25 °C) = 0.018864 Ω·mm²/m'),
      `${man.steps[0].label_en} | ${man.steps[1].label_en}`, 'ρ20 entered manually, ρ(25 °C)'));
    for (const [name, p] of [['mode null (not entered)', { rho_mode: null }], ['mode foo', { rho_mode: 'foo' }],
      ['manual blank', { rho_mode: 'manual' }], ['manual 0', { rho_mode: 'manual', rho20_manual: 0 }],
      ['manual string', { rho_mode: 'manual', rho20_manual: '0.0185' }]]) {
      let thr = false;
      try { R.calculate('iec60287', { ...P4, ...p }); } catch (e) { thr = e instanceof RangeError; }
      results.push(assert(`cres.rho ${name} → RangeError (no IEC fallback)`, thr, 'no throw', 'RangeError'));
    }
    // The table method never reads the manual ρ (no single ρ there)
    const tman = R.calculate('table', { ...P4, rho_mode: 'manual', rho20_manual: 0.0185 });
    results.push(assert('cres.rho table ignores manual ρ: R′20 = 4.61, no ρ',
      tman.r20_per_km === 4.61 && tman.rho20 === null && tman.rho_source === null && tman.rho_t === null
      && !tman.steps[1].label_en.includes('ρ('), `${tman.r20_per_km}/${tman.rho20}`, '4.61/null'));
    const tnull = R.calculate('table', { ...P4, rho_mode: null });
    results.push(assert('cres.rho table with a blank source still calculates', tnull.r20_per_km === 4.61,
      tnull.r20_per_km, 4.61));
    // resolveParams: the project's mode, the core's metal
    const MANSYS = { cable_r_method: 'iec60287', cable_temp: 25, cable_rho_mode: 'manual', cable_rho20_cu: 0.0185, cable_rho20_al: 0.029 };
    const rpCu = R.resolveParams({ cable_mat: 'cu', cable_cross: 4, cable_length: 150 }, MANSYS);
    const rpAl = R.resolveParams({ cable_mat: 'al', cable_cross: 4, cable_length: 150 }, MANSYS);
    const rpOld = R.resolveParams({ cable_mat: 'cu', cable_cross: 4, cable_length: 150 }, { cable_r_method: 'iec60287', cable_temp: 25 });
    const rpIec = R.resolveParams({ cable_mat: 'cu', cable_cross: 4, cable_length: 150 }, { ...MANSYS, cable_rho_mode: 'iec' });
    results.push(assert('cres.rho resolveParams: manual Cu / Al, legacy → iec, iec has no manual value',
      rpCu.rho_mode === 'manual' && rpCu.rho20_manual === 0.0185 && rpAl.rho20_manual === 0.029
      && rpOld.rho_mode === 'iec' && !('rho20_manual' in rpOld) && rpIec.rho_mode === 'iec' && !('rho20_manual' in rpIec),
      `${rpCu.rho20_manual}/${rpAl.rho20_manual}/${rpOld.rho_mode}`, '0.0185/0.029/iec'));
    // resistivity(system): what Station Data and the RTF show
    const rsOld = R.resistivity({ cable_r_method: 'iec60287', cable_temp: 25 });
    results.push(assert('cres.rho resistivity: legacy formula project → IEC, legacy',
      rsOld.mode === 'iec' && rsOld.legacy === true && rsOld.cu.rho20 === CTMaterials.COPPER_RESISTIVITY_20C
      && approx(rsOld.cu.rho_t, 0.017241 * (1 + 0.00393 * 5), 1e-9) && rsOld.al.rho20 === CTMaterials.ALUMINUM_RESISTIVITY_20C,
      JSON.stringify(rsOld), 'iec, legacy'));
    const rsNull = R.resistivity({ cable_r_method: 'iec60287', cable_temp: 25, cable_rho_mode: null });
    results.push(assert('cres.rho resistivity: blank source → no ρ shown',
      rsNull.mode === null && rsNull.legacy === false && rsNull.cu.rho20 === null && rsNull.cu.rho_t === null,
      JSON.stringify(rsNull), 'mode null'));
    const rsMan = R.resistivity({ ...MANSYS, cable_rho20_al: null });
    results.push(assert('cres.rho resistivity: manual Cu 0.0185, Al not entered',
      rsMan.mode === 'manual' && rsMan.cu.rho20 === 0.0185 && approx(rsMan.cu.rho_t, 0.018863525, 1e-9)
      && rsMan.al.rho20 === null && rsMan.al.alpha === CTMaterials.ALUMINUM_TEMP_COEFFICIENT,
      JSON.stringify(rsMan), 'manual, al null'));
    const rsOut = R.resistivity({ ...MANSYS, cable_rho20_cu: 0.5, cable_rho20_al: '0.029' });
    results.push(assert('cres.rho resistivity: an out-of-range or text manual ρ20 is not shown',
      rsOut.cu.rho20 === null && rsOut.cu.rho_t === null && rsOut.al.rho20 === null, JSON.stringify(rsOut.cu), 'null'));
    const rsTab = R.resistivity({ cable_r_method: 'table', cable_temp: 25 });
    const rsNoT = R.resistivity({ cable_r_method: 'iec60287', cable_rho_mode: 'iec' });
    results.push(assert('cres.rho resistivity: table has no ρ; no ρ(T) without a temperature',
      rsTab.uses_rho === false && rsTab.mode === null && rsTab.legacy === false && rsTab.cu.rho20 === null
      && rsNoT.cu.rho20 === CTMaterials.COPPER_RESISTIVITY_20C && rsNoT.cu.rho_t === null
      && R.resistivity({}).method === null, `${rsTab.uses_rho}/${rsNoT.cu.rho_t}`, 'false/null'));

    // REF160 CT1 (reference calculation): 750/1 5PR30 30 VA Rct 2.402 Ω, 7UT86 0.1 VA, 150 m 4 mm² Cu at 25 °C
    const SIE = { voltage: 150, freq: '50', isc_sys: 40, tp: 100, cable_temp: 25 };
    const HV = { Ip: 750, Is: 1, rct: 2.402, burden: 30, alf: 30, ct_class_family: '5PR', relay_burden: 0.1,
      relay_name: 'SIPROTEC 5 7UT86', trafo_power_mva: 160, trafo_voltage_kv: 150, trafo_z_percent: 7.92,
      cable_length: 150, cable_cross: 4, cable_mat: 'cu' };
    const aboMan = CTCalc.calculate('transformer_diff', HV, { ...SIE, cable_r_method: 'iec60287', cable_rho_mode: 'manual',
      cable_rho20_cu: 0.0185, cable_rho20_al: 0.02826 });
    const refTab = CTCalc.calculate('transformer_diff', HV, { ...SIE, cable_r_method: 'table' });
    const aboIec = CTCalc.calculate('transformer_diff', HV, { ...SIE, cable_r_method: 'iec60287', cable_rho_mode: 'iec' });
    const aboOld = CTCalc.calculate('transformer_diff', HV, { ...SIE, cable_r_method: 'iec60287' });
    results.push(assert('cres.rho REF160 CT1 manual ρ20 0.0185: S_wire 1.4148 VA, ALFo 248.18 (reference 248.179)',
      aboMan && aboMan.s_wire.toFixed(4) === '1.4148' && aboMan.alf_o.toFixed(2) === '248.18',
      aboMan && aboMan.alf_o, 248.18));
    results.push(assert('cres.rho REF160 CT1 table: ALFo 248.470', refTab && refTab.alf_o.toFixed(3) === '248.470',
      refTab && refTab.alf_o, 248.470));
    results.push(assert('cres.rho REF160 CT1 IEC = legacy: ALFo 254.434',
      aboIec && aboOld && aboIec.alf_o.toFixed(3) === '254.434' && aboIec.alf_o === aboOld.alf_o,
      aboIec && aboIec.alf_o, 254.434));

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
  // by_method cases model the Python tool's ×2 (get_wiring_factor), so the core
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
  // by_method case 1 (iec60287, the Python tool's ×2) are the same Python numbers.
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
        smin_floor_va: 0,   // metering: the Python has no 1 VA floor on Smin (F-MT-125)
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
        smin_floor_va: 0,   // metering: the Python has no 1 VA floor on Smin (F-MT-125)
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
    // Issue #125: the meter's defaults are Fmin 20 and Sdevice 0.1 VA (CEWE Prometer 100)
    const dflt = CTMetering.calculate({ ...core, min_safety_factor: undefined, device_burden: undefined }, {});
    results.push(assert('MT min_safety_factor default 20', dflt.min_safety_factor === 20,
      dflt.min_safety_factor, 20));
    results.push(assert('MT device_burden default 0.1 VA',
      approx(dflt.S_total - dflt.S_lead - dflt.S_res, 0.1), dflt.S_total - dflt.S_lead - dflt.S_res, 0.1, ' VA'));

    // ── Issue #125: inclusive bounds, Smin floor, extended range, cond. 2 hints ──
    // No cable (S_lead = 0), so S = Sdevice exactly. 1 A, Rct 2 Ω: S_in = 2 VA.
    const mt = (o) => CTMetering.calculate({ Is: 1, Ip: 1000, rct: 2, burden: 5, fs_factor: 5,
      min_safety_factor: 20, min_burden_percent: 25, attached_resistor: 0, cable_length: 0, ...o }, {});
    const keys = (r) => r.warnings.map((w) => (Array.isArray(w) ? w[0] : w));
    // Fs = Fmin: cond. 2 cannot be met → the infeasibility warning
    const eq = mt({ fs_factor: 5, min_safety_factor: 5, device_burden: 2 });
    results.push(assert('MT #125 Fs = Fmin → warning_fs_not_below_fmin',
      !eq.cond2 && !eq.cond2_feasible && keys(eq).includes('warning_fs_not_below_fmin'), keys(eq).join(','), 'warning_fs_not_below_fmin'));
    // S_req = Fs·(S_in+Sn)/Fmin − S_in = 5·7/20 − 2 = −0.25 VA: any burden meets cond. 2
    const d1 = mt({ device_burden: 1.25 });
    results.push(assert('MT #125 S_req by hand (5·7/20 − 2 = −0.25 VA)', approx(d1.S_req, -0.25), d1.S_req, -0.25, ' VA'));
    // Boundary S = Sn: Fsa = Fs; S = Smin = 1.25 VA → cond. 1 OK (inclusive)
    const atSn = mt({ device_burden: 5 });
    results.push(assert('MT #125 boundary S = Sn → OK', atSn.cond1 && atSn.is_ok, atSn.status, 'OK'));
    results.push(assert('MT #125 boundary S = Smin → cond. 1 OK', approx(d1.S_min, 1.25) && d1.cond1, d1.cond1, true));
    // Boundary Fsa = Fmin: Fs 10, Fmin 14 → S_req = 10·7/14 − 2 = 3 VA exactly; S = 3 VA
    const atF = mt({ fs_factor: 10, min_safety_factor: 14, device_burden: 3 });
    results.push(assert('MT #125 boundary Fsa = Fmin → OK', approx(atF.Fsa, 14) && atF.cond2 && atF.is_ok,
      atF.Fsa, 14));
    // Below it: S = 2 VA → ΔS = 3 − 2 = 1 VA (hint)
    const miss = mt({ fs_factor: 10, min_safety_factor: 14, device_burden: 2 });
    const hint = miss.warnings.find((w) => w[0] === 'hint_metering_add_burden');
    results.push(assert('MT #125 ΔS = S_req − S = 1 VA (hint)', !miss.cond2 && hint && approx(hint[1], 1) && approx(hint[2], 3)
      && approx(miss.delta_S, 1), hint && hint[1], 1, ' VA'));
    // Fs > Fmin (Rct 0: S_req = 10·5/9.9 = 5.05 VA > Sn): cond. 2 cannot be met
    const inf = mt({ rct: 0, burden: 5, fs_factor: 10, min_safety_factor: 9.9, device_burden: 4 });
    results.push(assert('MT #125 Fs > Fmin → infeasible', !inf.cond2_feasible && inf.S_req > 5 && keys(inf).includes('warning_fs_not_below_fmin'),
      keys(inf).join(','), 'warning_fs_not_below_fmin'));
    // The 1 A default case (issue table): S 1.15 VA < 1.25 VA → cond. 1 fails, extended range hinted
    const lowS = mt({ device_burden: 1.15 });
    results.push(assert('MT #125 S 1.15 < Smin 1.25 → cond. 1 ✗, extended range hinted',
      !lowS.cond1 && lowS.cond2 && keys(lowS).includes('hint_extended_burden_range'), keys(lowS).join(','), 'hint_extended_burden_range'));
    // Extended burden range (IEC 61869-2 5.6.201.4): Smin = 1 VA → cond. 1 OK
    const ext = mt({ device_burden: 1.15, extended_burden_range: true });
    results.push(assert('MT #125 extended range S 1.15 VA, Sn 5 VA → OK', ext.extended_burden_range && ext.S_min === 1
      && ext.cond1 && ext.is_ok && !keys(ext).includes('hint_extended_burden_range'), ext.status, 'OK'));
    // Extended range with Sn > 15 VA: not applied, warned
    const ext30 = mt({ burden: 30, device_burden: 10, extended_burden_range: true });
    results.push(assert('MT #125 extended range Sn 30 VA → not applied, warned',
      !ext30.extended_burden_range && approx(ext30.S_min, 7.5) && keys(ext30).includes('warning_extended_range_sn_above_15'),
      keys(ext30).join(','), 'warning_extended_range_sn_above_15'));
    // Hard 1 VA floor: Sn 2.5 VA, 25 % → 0.625 VA, raised to 1 VA
    const floor = mt({ burden: 2.5, device_burden: 0.8 });
    results.push(assert('MT #125 Smin floor 1 VA', floor.S_min === 1 && !floor.cond1, floor.S_min, 1, ' VA'));
    // Smin% from the accuracy class: 50 % for classes 3 and 5, 25 % for 0.2S; typed % without a class
    const c3 = mt({ mt_class: '3', min_burden_percent: 25, device_burden: 2 });
    const c02 = mt({ mt_class: '0.2S', min_burden_percent: 50, device_burden: 2 });
    results.push(assert('MT #125 Smin% from class (3 → 50 %, 0.2S → 25 %)',
      approx(c3.S_min, 2.5) && !c3.cond1 && approx(c02.S_min, 1.25) && c02.cond1, `${c3.S_min} / ${c02.S_min}`, '2.5 / 1.25'));
    // S_lead > Sn (5 A, default cable): the lead hint
    const lead5 = CTMetering.calculate({ Is: 5, burden: 15, rct: 0.2, fs_factor: 5, min_safety_factor: 20,
      device_burden: 0.1, cable_length: 100, cable_cross: 4, cable_mat: 'cu' }, {});
    results.push(assert('MT #125 5 A default cable: S_lead > Sn hint', lead5.S_lead > 15 && keys(lead5).includes('hint_lead_burden_above_sn'),
      lead5.S_lead, '> 15', ' VA'));
    // 5 A, Sn 15 VA, 30 m × 6 mm² Cu (issue table): OK
    const ok5 = CTMetering.calculate({ Is: 5, burden: 15, rct: 0.2, fs_factor: 5, min_safety_factor: 20,
      device_burden: 0.1, cable_length: 30, cable_cross: 6, cable_mat: 'cu' }, {});
    results.push(assert('MT #125 5 A, Sn 15 VA, 30 m × 6 mm² → OK', ok5.is_ok && !keys(ok5).includes('hint_lead_burden_above_sn'),
      ok5.status, 'OK'));
    // The Prometer 100 preset (calc/meters.js) with Fs 5 is feasible: Fs < Fmin
    results.push(assert('MT #125 preset Fs 5 < Fmin 20', CTMeterDB.DEFAULT_FMIN === 20 && dflt.cond2_feasible,
      dflt.cond2_feasible, true));

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
        smin_floor_va: 0,   // the Python has no 1 VA floor on Smin (F-MT-125)
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
        matchesExpected(pyWarnings(got.warnings), exp.warnings),
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
        smin_floor_va: 0,   // the Python has no 1 VA floor on Smin (F-MT-125)
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
      results.push(assert(`${tag} CTMetering warnings`, matchesExpected(pyWarnings(m.warnings), e.warnings),
        JSON.stringify(m.warnings), JSON.stringify(e.warnings)));
    };
    (G.by_method || []).forEach(checkCableCase('by_method'));
    (G.by_topology || []).forEach(checkCableCase('by_topology'));
    // by_topology: the default wiring is 6-wire (= by_method #0, the Python tool's ×2);
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
  // CTCalc.moduleCore applies it (ar_ts_mode 'table'); no counterpart in the Python tool
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
    // (overcurrent has a class row: is_px follows the class, F-TP-PX)
    const { is_px: ocPx, ...ocRest } = mc({ ...base, ar_ts_mode: 'table' }, 132, 'overcurrent');
    results.push(assert('moduleCore: other calc types get no AR keys',
      JSON.stringify(ocRest) === JSON.stringify({ ...base, ar_ts_mode: 'table' }) && ocPx === false
        && JSON.stringify(mc({ ...base, ar_ts_mode: 'table' }, 132, 'busbar')) === JSON.stringify({ ...base, ar_ts_mode: 'table' }),
      'added', 'none'));
    return results;
  }

  // CTSizer's rule-of-thumb Rct estimate (calc/rct_estimate.js) and how
  // CTCalc.moduleCore / CTRequired apply it (rct_estimate); no counterpart in the Python tool
  function testRctEstimate() {
    const results = [];
    const E = (inp, kv) => CTRctEstimate.estimate(inp, kv);
    const cases = [
      // [Ip, Is, class, kV, Rct Ω, r_turn, range, basis, band]
      [750, 1, '5PR', 150, 2.625, 3.5, [2, 5], 'data', '110–150 kV'],
      [2000, 1, '5PR', 60, 7.0, 3.5, [2, 5], 'data', '50–60 kV'],
      [3000, 1, '5P', 400, 12.0, 4.0, [2, 5], 'limits', '≥ 400 kV'],
      [1200, 5, '5P', 20, 0.6, 2.5, [1, 2.8], 'data', '≤ 36 kV'],
      [1200, 5, '10PR', 132, 0.6, 2.5, [1, 2.8], 'derived', '110–150 kV'],
      // band edges are inclusive upper limits; metering / no class → the table
      [1000, 1, '5P', 170, 3.5, 3.5, [2, 5], 'data', '110–150 kV'],
      [1000, 1, '5p', 170.1, 4.0, 4.0, [2, 5], 'limits', '220 kV'],
      [1000, 1, undefined, 36, 3.5, 3.5, [2, 5], 'data', '≤ 36 kV'],
      [1000, '5', '0.2S', 36, 0.5, 2.5, [1, 2.8], 'data', '≤ 36 kV'],
      // whole mΩ: 1250/1 × 3.5 = 4375 mΩ; 333/5 × 2.5 = 166.5 → 167 mΩ
      [1250, 1, '5P', 10, 4.375, 3.5, [2, 5], 'data', '≤ 36 kV'],
      [333, 5, '5P', 10, 0.167, 2.5, [1, 2.8], 'data', '≤ 36 kV'],
    ];
    cases.forEach(([Ip, Is, cls, kv, rct, rTurn, [min, max], basis, band]) => {
      const r = E({ Ip, Is, ct_class_family: cls, rct_np: 1 }, kv);
      results.push(assert(`Rct estimate ${Ip}/${Is} ${cls} @ ${kv} kV → ${rct} Ω (${rTurn} mΩ/turn ${min}–${max}, ${basis}, ${band})`,
        r && r.rct === rct && r.rTurn === rTurn && r.min === min && r.max === max && r.basis === basis
          && r.band.label === band && r.n === Ip / Is,
        r && `${r.rct} ${r.rTurn} ${r.min}–${r.max} ${r.basis} ${r.band.label}`, `${rct} ${rTurn} ${min}–${max} ${basis} ${band}`));
    });
    // REF160 (reference calculation, README): the estimate within ±25 % of the nameplate Rct
    const ref160 = [[750, 150, 2.402], [2000, 150, 7.422], [2000, 60, 7.422]];
    results.push(assert('Rct estimate within ±25 % of REF160 750/1 (2.402 Ω) and 2000/1 (7.422 Ω)',
      ref160.every(([Ip, kv, rct]) => Math.abs(E({ Ip, Is: 1, ct_class_family: '5PR', rct_np: 1 }, kv).rct / rct - 1) <= 0.25),
      ref160.map(([Ip, kv]) => E({ Ip, Is: 1, ct_class_family: '5PR', rct_np: 1 }, kv).rct).join(' / '), '±25 %'));
    // A class whose Rct is a rated value (also as a full designation) gets
    // the same table, flagged as very uncertain; P, PR, metering and unknown
    // classes are reliable
    const rated = ['PX', 'PXR', 'TPX', 'TPY', 'tpz', 'TPY 20x12,5', 'PX 300'].map((c) => ({ Ip: 1000, Is: 1, ct_class_family: c, rct_np: 1 }));
    results.push(assert('Rct estimate: PX, PXR, TPX, TPY, TPZ (also "TPY 20x12,5") and a legacy is_px core: estimated, not reliable, warning first',
      rated.every((c) => !CTRctEstimate.reliable(c) && E(c, 132).rct === 3.5 && E(c, 132).reliable === false
        && CTRctEstimate.notes(E(c, 132), 'distance')[0].key === 'rct_note_uncertain'
        && CTRctEstimate.notes(E(c, 132), 'distance')[0].level === 'warn')
        && !CTRctEstimate.reliable({ is_px: true })
        && ['5PR30', '0,2S', '5P', '0.5FS5'].every((c) => CTRctEstimate.reliable({ ct_class_family: c })) && CTRctEstimate.reliable({}),
      'wrong', 'estimated, flagged'));
    // The notes: the spread always; 1 A above 170 kV, 5 A, metering and
    // Ipr < 600 A with Np 1 when they apply
    const nk = (inp, kv, type = 'overcurrent') => CTRctEstimate.notes(E({ rct_np: 1, ...inp }, kv), type).map((n) => n.key).join(' ');
    const notesGot = [nk({ Ip: 1000, Is: 1 }, 132), nk({ Ip: 1000, Is: 1 }, 400), nk({ Ip: 1000, Is: 5 }, 10),
      nk({ Ip: 400, Is: 5 }, 10, 'metering'), nk({ Ip: 1000, Is: 1, ct_class_family: 'TPY' }, 400)];
    const notesWant = ['rct_note_spread', 'rct_note_spread rct_note_hv1', 'rct_note_spread rct_note_isn5',
      'rct_note_spread rct_note_isn5 rct_note_metering rct_note_wound', 'rct_note_uncertain rct_note_spread rct_note_hv1'];
    results.push(assert('Rct estimate notes per case', JSON.stringify(notesGot) === JSON.stringify(notesWant)
      && CTRctEstimate.notes(null, 'overcurrent').length === 0, notesGot.join(' | '), notesWant.join(' | ')));
    const ok = { Ip: 1000, Is: 1, rct_np: 1 };
    const none = [[{ Is: 1, rct_np: 1 }, 132], [{ ...ok, Ip: 0 }, 132], [{ ...ok, Is: 2 }, 132], [{ Ip: 1000, rct_np: 1 }, 132],
      [{ Ip: 1000, Is: 1 }, 132], [{ ...ok, rct_np: 0.5 }, 132], [{ ...ok, rct_np: '' }, 132],
      [ok, undefined], [ok, 0], [ok, 'x'], [null, 132]];
    results.push(assert('Rct estimate: null without Ip, Is, Np or voltage',
      none.every(([inp, kv]) => E(inp, kv) === null), 'value', 'null'));
    // Np: N = Np · Ip / Is; the cell (lookup) needs no Ip or Np
    const np2 = E({ Ip: 300, Is: 1, rct_np: 2 }, 10);
    results.push(assert('Rct estimate: Np 2 → N = 2 · 300 / 1 = 600, Rct 2.1 Ω (range 1.2–3.0 Ω); lookup without Ip / Np',
      np2.n === 600 && np2.rct === 2.1 && np2.rctMin === 1.2 && np2.rctMax === 3.0
        && CTRctEstimate.lookup({ Is: 5 }, 400).rTurn === 2.5, np2 && `${np2.n} ${np2.rct} ${np2.rctMin}–${np2.rctMax}`, '600 2.1 1.2–3'));
    results.push(assert('Rct estimate: wound-primary note below Ipr 600 A with Np 1 only',
      E({ Ip: 599, Is: 1, rct_np: 1 }, 10).woundPrimary === true && E({ Ip: 600, Is: 1, rct_np: 1 }, 10).woundPrimary === false
        && E({ Ip: 300, Is: 1, rct_np: 2 }, 10).woundPrimary === false, 'wrong', '599 yes, 600 no, Np 2 no'));
    // Every cell: min ≤ r ≤ max, a known basis, one per band
    const { TABLE, BANDS } = CTRctEstimate;
    results.push(assert('Rct table: 1 A and 5 A, one r_turn per band within its range, basis data / limits / derived',
      [1, 5].every((isn) => ['r', 'min', 'max', 'basis'].every((k) => TABLE[isn][k].length === BANDS.length)
        && TABLE[isn].r.every((r, i) => TABLE[isn].min[i] <= r && r <= TABLE[isn].max[i] && r > 0)
        && TABLE[isn].basis.every((b) => ['data', 'limits', 'derived'].includes(b))), 'bad', 'ok'));
    // moduleCore: rct_estimate → rct from the table over a stored rct (also
    // on a rated-Rct class); not on generic (no Ip) or VT; without the box the
    // stored rct is kept
    const mc = (inp, type = 'overcurrent', kv = 132) => CTCalc.moduleCore(type, inp, { voltage: kv });
    const est = { Ip: 750, Is: 1, ct_class_family: '5PR', rct_estimate: true, rct_np: 1 };
    results.push(assert('moduleCore rct_estimate: Rct from the table on every CT calc type with an Ip',
      CTCalc.RCT_ESTIMATE_TYPES.every((t) => mc({ ...est, rct: 9 }, t).rct === 2.625), 'stored', 2.625));
    results.push(assert('moduleCore: generic / VT / no box keep the stored rct; a PX core is estimated',
      mc({ ...est, rct: 9 }, 'generic').rct === 9 && mc({ ...est, rct: 9 }, 'vt').rct === 9
        && mc({ ...est, ct_class_family: 'PX', rct: 9 }).rct === 2.625
        && mc({ Ip: 750, Is: 1, rct: 9 }).rct === 9 && !('rct' in mc({ Ip: 750, Is: 1 })), 'changed', 'unchanged'));
    // CTRequired: an estimated Rct is not typed but Np is (also on a
    // rated-Rct class); generic still needs Rct
    const req = (type, inp) => { const f = CTRequired.core({ calc_type: type, inputs: inp }).fields; return `${f.rct}/${f.rct_np}`; };
    const reqGot = [req('overcurrent', { rct_estimate: true }), req('metering', { rct_estimate: true, rct_np: 2 }),
      req('overcurrent', {}), req('generic', { rct_estimate: true }), req('distance', { rct_estimate: true, ct_class_family: 'TPY' }),
      req('busbar', { rct_estimate: true, rct_np: 0 }), req('busbar', { rct_estimate: true, rct_np: '1' })];
    const reqWant = ['undefined/missing', 'undefined/undefined', 'missing/undefined', 'missing/undefined', 'undefined/missing',
      'undefined/invalid', 'undefined/invalid'];
    results.push(assert('CTRequired: estimated → Np required (a number ≥ 1), not Rct (also TPY); otherwise and on generic Rct',
      JSON.stringify(reqGot) === JSON.stringify(reqWant), reqGot.join(' '), reqWant.join(' ')));
    // The calculation with the estimate equals the same Rct typed
    const oc = { Is: 1, Ip: 750, burden: 30, relay_burden: 0.05, ct_class_family: '5P', alf: 20,
      cable_length: 100, cable_cross: 4, cable_mat: 'cu', cable_topology: 'four_wire' };
    const cd = { isc_sys: 20, voltage: 150, cable_r_method: 'iec60287', cable_temp: 20 };
    const rEst = CTCalc.calculate('overcurrent', { ...oc, rct_estimate: true, rct_np: 1 }, cd);
    const rTyped = CTCalc.calculate('overcurrent', { ...oc, rct: 2.625 }, cd);
    results.push(assert('Overcurrent with the estimate = with the same Rct typed',
      rEst && rTyped && rEst.ALF_act === rTyped.ALF_act && rEst.Rt === rTyped.Rt, rEst && rEst.ALF_act, rTyped && rTyped.ALF_act));
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

    // Deviation (F-TP-PX, decision A2): a Vk-specified core (is_px_class with
    // a Vk) has no rated ALF, so the IEC ALF method is not applicable, as for
    // an E.m.f.-only IED (main.py runs it with alf_o None: iec_ok False,
    // NOT_OK whatever the Vk). Such a core with no IED, or an IED that uses
    // the IEC method, must match the same core with ABB RET670.
    const EMF_ONLY_IED = 'ABB RET670';
    const vkTwin = (c) => {
      const cd = c.input.core_data;
      if (!cd.is_px_class || cd.vk_voltage == null) return null;
      if (cd.relay_name && !CTRelayDB.trafoDiffParams({ relay_name: cd.relay_name }).applicable) return null;
      const want = JSON.stringify({ common_data: c.input.common_data, core_data: { ...cd, relay_name: EMF_ONLY_IED } });
      return GT.find((o) => o !== c && JSON.stringify(o.input) === want) || 'missing';
    };
    results.push(assert('TDIFFMAIN golden has a Vk core with the IEC method and its E.m.f.-only twin (F-TP-PX)',
      GT.some((c) => vkTwin(c) && vkTwin(c) !== 'missing'), 'none', 'a twin pair'));

    GT.forEach((c, i) => {
      const twin = customTwin(c);
      const vTwin = vkTwin(c);
      if (twin === 'missing' || vTwin === 'missing') {
        results.push(assert(`TDIFFMAIN golden #${i} ${vTwin === 'missing' ? `Vk core has an ${EMF_ONLY_IED}` : 'unknown IED has a no-IED'} twin`,
          false, 'none', 'a twin case'));
        return;
      }
      const ref = vTwin || twin;
      const why = vTwin ? ` (Vk core: IEC N/A as ${EMF_ONLY_IED})` : twin ? ' (unknown IED = custom relay)' : '';
      const got = checkCase(`TDIFFMAIN golden #${i}${why}`, ref ? { input: c.input, expected: ref.expected } : c);
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

    // #134 named delta: the Python's hard fallback It,max = 10000 A (a winding
    // with no isc_ext and no Ir / Sr / Ur / Z% to derive it from) is gone in
    // CTSizer: It,max is null there (main.js then does not calculate). Only
    // these degenerate golden cases have it; every other value is the golden's.
    const noFallback = (exp, idx) => exp.map((x, j) => (j === idx && x === 10000 ? null : x));
    (G.parse_transformer_windings || []).forEach((c, i) => {
      const got = D.parseTransformerWindings(c.input.transformer_data, c.input.linked_winding,
        commonFromGolden(c.input.common_data));
      const exp = noFallback(c.expected, 2);
      results.push(assert(`TDIFFDATA golden #${i} parse_windings`,
        matchesExpected(got, exp), JSON.stringify(got), JSON.stringify(exp)));
    });

    (G.extract_transformer_data || []).forEach((c, i) => {
      const cd = commonFromGolden(c.input.common_data);
      const got = D.extractTransformerData(cd, coreFromGolden(c.input.core_data));
      // the per-core path keeps its own 10000 fallback (no transformer_data → compat)
      const exp = cd.remote_end && cd.remote_end.transformer_data != null ? noFallback(c.expected, 5) : c.expected;
      results.push(assert(`TDIFFDATA golden #${i} transformer_data`,
        matchesExpected(got, exp), JSON.stringify(got), JSON.stringify(exp)));
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
    // six_wire on the core: k = 2 for both cases (the Python tool's ×2)
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

  // ── PLAUSIBILITY (calc/plausibility.js, issue #154; hand-derived) ─────
  function testPlausibility() {
    const results = [];
    const P = CTPlausibility;
    const sys = { voltage: 420, freq: '50', isc_sys: 40, tp: 100, cable_r_method: 'iec60287',
      cable_temp: 75, cable_rho_mode: 'iec' };
    const ld = {
      relay_burden: 0.1, ct_class_family: '5PR', is_px: false, ct_class_alf: 30, alf: 30,
      Ip: 4000, Is: 5, burden: 30, cable_length: 900, cable_cross: 1.5, cable_mat: 'cu',
      cable_topology: 'four_wire', rct: 100,
    };
    const keysOf = (r) => r.warnings.filter((w) => P.KEYS.includes(w[0])).map((w) => w[0]).join(',');
    const step = (r) => r.steps.find((st) => st.key === 'secondary_voltage_limit');

    // The issue's core: EALF = 30·5·(100 + 30/25) = 15 180 V, Vk,req 12 516.5 V,
    // both above 2 kV → NOT_OK although EALF ≥ Vk,req; Rct 100 Ω / 800 turns =
    // 125 mΩ/turn > 3 × 2.8
    const r1 = CTCalc.calculate('line_diff', ld, sys);
    const raw1 = CTLineDiff.calculate(CTCalc.moduleCore('line_diff', ld, sys), sys);
    results.push(assert('PLAUS #154 line diff above 2 kV fails the core',
      raw1.is_ok === true && r1.is_ok === false && r1.status === 'NOT_OK' && r1.conclusion === 'ct_insufficient'
        && step(r1).is_ok === false && step(r1).comparison === '15180.00 V > 2000 V',
      `${raw1.is_ok} → ${r1.is_ok} / ${step(r1)?.comparison}`, 'true → false / 15180.00 V > 2000 V'));
    results.push(assert('PLAUS #154 remarks: Rct, Vk,req and EALF',
      keysOf(r1) === 'warning_rct_implausible,warning_vk_required_above_limit,warning_offered_emf_above_limit',
      keysOf(r1), 'warning_rct_implausible,warning_vk_required_above_limit,warning_offered_emf_above_limit'));
    results.push(assert('PLAUS #154 margin is the voltage limit’s',
      approx(r1.margin, (2000 / 15180 - 1) * 100), r1.margin, (2000 / 15180 - 1) * 100, ' %'));
    const rw = r1.warnings.find((w) => w[0] === 'warning_rct_implausible');
    results.push(assert('PLAUS #154 Rct remark values (125 mΩ/turn, N 800, max 2.8, 5 A, × 3)',
      rw[1] === 100 && approx(rw[2], 125) && rw[3] === '800' && rw[4] === 2.8 && rw[5] === 5 && rw[6] === 3,
      JSON.stringify(rw), '[…, 100, 125, 800, 2.8, 5, 3]'));
    // The screenshot: Rct 50 Ω passed the knee point check (7680 ≥ 7516.5 V) only on paper
    const r50 = CTCalc.calculate('line_diff', { ...ld, rct: 50 }, sys);
    results.push(assert('PLAUS Rct 50 Ω: EALF 7680 V fails the 2 kV limit',
      approx(r50.secondary_voltage.offered.value, 7680) && r50.is_ok === false, r50.secondary_voltage.max, 7680, ' V'));

    // A realistic 4000/1 A core: Rct 14 Ω (3.5 mΩ/turn), EALF 30·(14 + 30) = 1320 V
    const ok = CTCalc.calculate('line_diff', { ...ld, Is: 1, rct: 14, cable_length: 100, cable_cross: 4 }, sys);
    results.push(assert('PLAUS realistic 1 A core: passes, no remark, step row OK',
      ok.is_ok === true && keysOf(ok) === '' && step(ok).is_ok === true && approx(ok.secondary_voltage.max, 1320),
      `${ok.is_ok} ${keysOf(ok)} ${ok.secondary_voltage.max}`, 'true  1320'));

    // The limit is inclusive: EALF = 20·1·(0 + 100) = 2000 V
    const at = P.checkVoltage('generic', { Is: 1, rct: 0, burden: 100, alf: 20 }, {});
    const over = P.checkVoltage('generic', { Is: 1, rct: 0, burden: 100, alf: 20.01 }, {});
    results.push(assert('PLAUS 2000 V passes, 2001 V fails (offered only on generic)',
      at.ok === true && at.required === null && over.ok === false && over.warnings[0][0] === 'warning_offered_emf_above_limit',
      `${at.ok}/${over.ok}`, 'true/false'));
    // A Vk class: its Vk; overcurrent: Esat,req
    const px = P.checkVoltage('busbar', { Is: 1, rct: 5, burden: 10, ct_class_family: 'PX', is_px: true, vk: 2500 },
      { vk_required: 900 });
    results.push(assert('PLAUS Vk class: Vk 2500 V fails, labelled Vk',
      px.ok === false && px.offered.label === 'Vk' && px.offered.value === 2500 && px.required.value === 900,
      JSON.stringify(px.offered), '{"label":"Vk","value":2500}'));
    const oc = P.checkVoltage('overcurrent', { Is: 1, rct: 5, burden: 10, alf: 20 }, { Esat_req: 2400 });
    results.push(assert('PLAUS overcurrent: Esat,req 2400 V fails',
      oc.ok === false && oc.warnings.length === 1 && oc.warnings[0][1] === 'Esat,req' && oc.step.latex.includes('E_{sat,req}'),
      JSON.stringify(oc.warnings), '[["warning_vk_required_above_limit","Esat,req",2400,2000]]'));
    // Not checked: metering, VT, a transformer core that is not calculated
    results.push(assert('PLAUS no voltage check on metering / VT / an uncalculated core',
      P.checkVoltage('metering', ld, {}) === null && P.checkVoltage('vt', ld, {}) === null
        && P.checkVoltage('transformer_diff', ld, { isc_int_missing: true, Vk_req: 5000 }) === null,
      'checked', 'null'));
    // Transformer diff: a failure adds to failed_methods (EALF = 120·1·(3 + 20) = 2760 V)
    const td = CTCalc.calculate('transformer_diff', { Ip: 100, Is: 1, rct: 3, burden: 20, alf: 120, relay_burden: 0.1,
      cable_length: 50, cable_cross: 4, cable_mat: 'cu', trafo_voltage_kv: 150, trafo_power_mva: 100,
      trafo_z_percent: 12, trafo_ik_max: 22000 }, { ...sys, voltage: 150 });
    results.push(assert('PLAUS transformer diff above 2 kV: secondary_voltage in failed_methods',
      td.secondary_voltage.ok === false && td.is_ok === false && td.failed_methods.includes('secondary_voltage'),
      JSON.stringify(td.failed_methods), '[…, secondary_voltage]'));

    // Rct: 3 × the table maximum per turn, one primary turn
    const rct = (core, kv = 420) => P.checkRct(core.type, core, { voltage: kv });
    const c1 = { type: 'distance', Ip: 2000, Is: 1, rct: 30 };   // 15.0 mΩ/turn = 3 × 5.0: not above
    results.push(assert('PLAUS Rct at 3 × max: no remark; above: remark',
      rct(c1) === null && rct({ ...c1, rct: 30.1 }) !== null && rct({ ...c1, rct: 30.1 }).limitPerTurn === 15,
      `${JSON.stringify(rct(c1))}`, 'null'));
    results.push(assert('PLAUS Rct: no remark for an estimated Rct, generic, VT, no voltage or Isr 2 A',
      rct({ ...c1, rct: 300, rct_estimate: true }) === null && rct({ ...c1, type: 'generic', rct: 300 }) === null
        && rct({ ...c1, type: 'vt', rct: 300 }) === null && rct({ ...c1, rct: 300 }, null) === null
        && rct({ ...c1, rct: 300, Is: 2 }) === null,
      'a remark', 'null'));
    // Metering: the remark only (no voltage check, the verdict unchanged)
    const mt = { Ip: 600, Is: 1, rct: 20, burden: 5, fs_factor: 5, min_safety_factor: 10, min_burden_percent: 25,
      device_burden: 0.5, attached_resistor: 0, cable_length: 80, cable_cross: 2.5, cable_mat: 'cu' };
    const mr = CTCalc.calculate('metering', mt, sys);
    const mraw = CTMetering.calculate(CTCalc.moduleCore('metering', mt, sys), sys);
    results.push(assert('PLAUS metering: Rct remark (33.3 mΩ/turn), verdict and steps unchanged',
      keysOf(mr) === 'warning_rct_implausible' && mr.is_ok === mraw.is_ok && mr.steps.length === mraw.steps.length
        && !('secondary_voltage' in mr),
      keysOf(mr), 'warning_rct_implausible'));
    // The remarks render in both languages
    const txt = ['en', 'da'].map((l) => r1.warnings.filter((w) => P.KEYS.includes(w[0]))
      .map((w) => CTSReport_text(l, w)));
    results.push(assert('PLAUS remark texts exist (en, da)',
      txt.every((ts) => ts.length === 3 && ts.every((t) => t && !t.startsWith('warning_'))), JSON.stringify(txt), 'texts'));

    return results;
  }
  // ctsizer-report.js is not loaded in the headless runner: a remark's text
  // when it is (the browser), else a stand-in that passes
  const CTSReport_text = (lang, w) => (typeof CTSReport !== 'undefined' ? CTSReport.warningText(lang, w) : 'text');

  // ── LINE_DIFF EMF_CALCULATION (golden-vector backed) ─────────────────
  function testLineDiffEmfCalculation() {
    const results = [];

    // Hand-derived: under-cap resistance passes through unchanged.
    const rUnderCap = CTLineDiff.emfCalculation.calculateTotalResistance3ph(4, 1.5, 0.5);
    results.push(assert('LDIFFEMF total resistance under cap', rUnderCap === 6, rUnderCap, 6, ' Ω'));

    // Hand-derived: no 99 Ω cap (issue #154; the Python clamps to 99 Ω).
    const rOverCap = CTLineDiff.emfCalculation.calculateTotalResistance1ph(50, 40, 20);
    results.push(assert('LDIFFEMF total resistance not capped', rOverCap === 110, rOverCap, 110, ' Ω'));

    // Hand-derived: external (through-fault) scenarios carry the ×2 stability factor.
    const eIn = CTLineDiff.emfCalculation.calculateEmf3PhaseInternal(5000, 1, 2000, 5.5);
    const eEx = CTLineDiff.emfCalculation.calculateEmf3PhaseExternal(5000, 1, 2000, 5.5);
    results.push(assert('LDIFFEMF external = 2x internal', approx(eEx, 2 * eIn), eEx, 2 * eIn, ' V'));

    // Hand-derived: above 99 Ω the E.M.F.s use the real total, with no cap warning (issue #154).
    const capped = CTLineDiff.emfCalculation.calculateAllEmfScenarios(
      { ik_max_3ph: 90000, ik_max_1ph: 90000, it_max_3ph: 90000, it_max_1ph: 90000 },
      5, 50, 50, 40, 20
    );
    results.push(assert('LDIFFEMF no warning above 99 Ω', capped.warnings.length === 0, capped.warnings.length, 0));
    results.push(assert('LDIFFEMF E above 99 Ω uses the real total',
      capped.total_resistance_3p === 110 && approx(capped.e_3p_ex, 2 * 90000 * 5 / 50 * 110),
      capped.e_3p_ex, 2 * 90000 * 5 / 50 * 110, ' V'));

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
    results.push(assert('LDIFFEMF 1-phase lead above 99 Ω not capped',
      cap1.warnings.length === 0 && cap1.total_resistance_1p === 124 && cap1.total_resistance_3p === 5,
      `${cap1.total_resistance_3p} / ${cap1.total_resistance_1p}`, '5 / 124', ' Ω'));

    // Issue #154: the reported project (5 A, Rct 100 Ω, 900 m × 1.5 mm² Cu, 40 kA).
    // The Python's 99 Ω cap gave Vk,req = 2·40 kA·5/4000·99 = 9900 V whatever the
    // lead; the real 1-phase total is 100 + 25.16 + 0.004 Ω → 12 516.5 V.
    const core154 = {
      relay_burden: 0.1, ct_class_family: '5PR', is_px: false, ct_class_alf: 30, alf: 30,
      Ip: 4000, Is: 5, burden: 30, cable_length: 900, cable_cross: 1.5, cable_mat: 'cu',
      cable_topology: 'four_wire', rct: 100,
    };
    const system154 = { voltage: 420, freq: '50', isc_sys: 40, tp: 100, cable_r_method: 'iec60287',
      cable_temp: 75, cable_rho_mode: 'iec' };
    const issue154 = CTCalc.calculate('line_diff', core154, system154);
    const r154 = 100 + issue154.Rc_1ph + 0.1 / 25;
    results.push(assert('LDIFFEMF issue #154 Vk,req uses Rct + lead + relay',
      approx(issue154.total_resistance_1p, r154) && approx(issue154.vk_required, 2 * 40000 * 5 / 4000 * r154)
        && issue154.vk_required > 12500
        && !issue154.warnings.some((w) => w[0] === 'warning_total_resistance_capped'),
      issue154.vk_required, 2 * 40000 * 5 / 4000 * r154, ' V'));
    const longer154 = CTCalc.calculate('line_diff', { ...core154, cable_length: 1000 }, system154);
    results.push(assert('LDIFFEMF issue #154 a longer lead raises Vk,req',
      longer154.vk_required > issue154.vk_required, longer154.vk_required, `> ${issue154.vk_required}`, ' V'));

    // ── Golden-vector backed (calc/golden/line_diff_emf_calculation.json <- ct_line_differential/emf_calculation.py) ──
    // Issue #154: the Python clamps the total resistance at 99 Ω, CTSizer does
    // not. A golden case the clamp engaged in is checked as CTSizer's value:
    // the resistance is the real sum (and the Python's value its min with 99),
    // the E.M.F.s scale by sum / 99, and the cap warning is gone.
    const PY_CAP = 99;
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.line_diff_emf_calculation)
      ? CT_GOLDEN.line_diff_emf_calculation : null;
    if (!G) return results;

    const uncappedTotal = (c) => {
      const sum = c.input.rct + c.input.cable_resistance + c.input.r_relay;
      return approx(Math.min(sum, PY_CAP), c.expected) ? sum : NaN;
    };
    (G.calculate_total_resistance_3ph || []).forEach((c, i) => {
      const got = CTLineDiff.emfCalculation.calculateTotalResistance3ph(
        c.input.rct, c.input.cable_resistance, c.input.r_relay
      );
      const want = uncappedTotal(c);
      results.push(assert(`LDIFFEMF golden #${i} total_resistance_3ph`, approx(got, want), got, want, ' Ω'));
    });

    (G.calculate_total_resistance_1ph || []).forEach((c, i) => {
      const got = CTLineDiff.emfCalculation.calculateTotalResistance1ph(
        c.input.rct, c.input.cable_resistance, c.input.r_relay
      );
      const want = uncappedTotal(c);
      results.push(assert(`LDIFFEMF golden #${i} total_resistance_1ph`, approx(got, want), got, want, ' Ω'));
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
      let want = c.expected;
      if (c.expected.warnings.some((w) => w[0] === 'warning_total_resistance_capped')) {
        const sum = c.input.rct + c.input.cable_resistance + c.input.r_relay;
        const k = sum / PY_CAP;
        want = {
          e_3p_in: c.expected.e_3p_in * k, e_1p_in: c.expected.e_1p_in * k,
          e_3p_ex: c.expected.e_3p_ex * k, e_1p_ex: c.expected.e_1p_ex * k,
          total_resistance_3p: sum, total_resistance_1p: sum,
          warnings: c.expected.warnings.filter((w) => w[0] !== 'warning_total_resistance_capped'),
        };
      }
      results.push(assert(`LDIFFEMF golden #${i} all_emf_scenarios`,
        matchesExpected(got, want), JSON.stringify(got), JSON.stringify(want)));
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
  // numbers generated from the Python tool (calc/golden/foundation.json). The golden
  // file is injected as CT_GOLDEN by tools/run-tests.mjs; in the browser it is
  // absent, so this suite skips silently (the hard-coded suites below still run).
  function testFoundation() {
    const results = [];
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.foundation)
      ? CT_GOLDEN.foundation : null;
    if (!G) return results;

    // ct_base.create_result_template (§10.6 F-TPL): the same keys, in the same
    // order, with the same values, and a fresh object per call (Python builds a
    // new dict each time). Required: a missing golden key fails.
    results.push(assert('base.resultTemplate golden present',
      Array.isArray(G.create_result_template) && G.create_result_template.length > 0,
      G.create_result_template ? G.create_result_template.length : 'missing', '> 0 cases'));
    (G.create_result_template || []).forEach((c, i) => {
      const got = JSON.stringify(CTBase.createResultTemplate(c.input[0]));
      results.push(assert(`base.resultTemplate #${i} ${c.input[0]}`,
        got === JSON.stringify(c.expected), got, JSON.stringify(c.expected)));
    });
    {
      const a = CTBase.createResultTemplate('distance');
      const b = CTBase.createResultTemplate('distance');
      a.warnings.push('x'); a.calculations.k = 1; a.intermediate_steps.push('s');
      results.push(assert('base.resultTemplate fresh object per call',
        a !== b && b.warnings.length === 0 && Object.keys(b.calculations).length === 0 && b.intermediate_steps.length === 0,
        JSON.stringify(b), 'untouched'));
    }

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
    // 6-wire on the core: k = 2, the Python tool's ×2 (the VT Rc before 9E)
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

    // ── Issue #125: device burden in VA, burden range I / II, migration ──
    // No cable: the device alone loads the VT.
    const vt = (o) => CTVT.calculate({ secondary_voltage: 100, vt_class: '0.2', burden: 10, thermal_burden: 50,
      attached_resistor: 0, cable_length: 0, ...o }, {});
    const vkeys = (r) => r.warnings.map((w) => (Array.isArray(w) ? w[0] : w));
    // VA input = the equivalent Ω input (R = Us²/S)
    const va6 = vt({ device_burden: 6, cable_length: 150 });
    const ohm6 = vt({ device_resistance: 100 * 100 / 6, cable_length: 150 });
    results.push(assert('VTCALC #125 6 VA = Us²/6 Ω', approx(va6.actual_burden_va, ohm6.actual_burden_va)
      && approx(va6.device_resistance, 10000 / 6) && va6.status === ohm6.status,
      va6.actual_burden_va, ohm6.actual_burden_va, ' VA'));
    results.push(assert('VTCALC #125 R_device step from the VA input',
      va6.steps.some((x) => x.key === 'device_resistance_from_burden' && approx(x.result, 10000 / 6)),
      va6.steps.map((x) => x.key).join(','), 'device_resistance_from_burden'));
    // A class 0.2 10 VA VT with an aux-powered meter (0.1 VA, the Prometer 100 preset) → OK
    const vtDef = CTVT.calculate({ secondary_voltage: 100, vt_class: '0.2', burden: 10, thermal_burden: 50,
      device_burden: 0.1, vt_supply_mode: 'aux', attached_resistor: 0 }, {});
    results.push(assert('VTCALC #125 defaults (0.1 VA, 150 m) → OK, range I', vtDef.is_ok && vtDef.burden_range === 'I'
      && vtDef.burden_range_label === '0 VA-10 VA class 0.2', `${vtDef.status} ${vtDef.burden_range_label}`, 'OK 0 VA-10 VA class 0.2'));
    // Self-powered meter 6 VA on 10 VA → 60 %
    const self6 = vt({ device_burden: 6 });
    results.push(assert('VTCALC #125 self-powered 6 VA → 60 % OK', approx(self6.burden_utilization, 60) && self6.is_ok,
      self6.burden_utilization, 60, ' %'));
    // Range I at 1 %: OK, no low-burden warning
    const r1pct = vt({ device_burden: 0.1 });
    results.push(assert('VTCALC #125 range I at 1 % → OK, no warning', r1pct.is_ok && r1pct.warnings.length === 0
      && approx(r1pct.burden_utilization, 1), JSON.stringify(r1pct.warnings), '[]'));
    // Range II at 20 %: NOT OK; at 25 %: OK (boundary)
    const r20 = vt({ vt_burden_range: 'II', device_burden: 2 });
    results.push(assert('VTCALC #125 range II at 20 % → NOT OK', !r20.is_ok && r20.status === 'IKKE OK' && r20.margin < 0
      && vkeys(r20).includes('warning_vt_range_ii_below_25')
      && r20.steps.some((x) => x.key === 'burden_range_check' && x.is_ok === false), r20.status, 'IKKE OK'));
    const r25 = vt({ vt_burden_range: 'II', device_burden: 2.5 });
    results.push(assert('VTCALC #125 range II at 25 % → OK (boundary)', r25.is_ok && approx(r25.burden_utilization, 25)
      && r25.burden_range_label === '2.5 VA-10 VA class 0.2', `${r25.status} ${r25.burden_utilization}`, 'OK 25'));
    // Default range: I for Sn ≤ 10 VA, II above; non-standard combinations warned
    results.push(assert('VTCALC #125 default range: 10 VA → I, 25 VA → II',
      CTVT.validation.resolveBurdenRange({ burden: 10 }) === 'I' && CTVT.validation.resolveBurdenRange({ burden: 25 }) === 'II',
      `${CTVT.validation.resolveBurdenRange({ burden: 10 })}/${CTVT.validation.resolveBurdenRange({ burden: 25 })}`, 'I/II'));
    const nsI = vt({ burden: 25, vt_burden_range: 'I', device_burden: 1 });
    const nsII = vt({ burden: 5, vt_burden_range: 'II', device_burden: 2 });
    results.push(assert('VTCALC #125 non-standard range warnings (I > 10 VA, II < 10 VA)',
      nsI.is_ok && vkeys(nsI).includes('warning_vt_range_nonstandard') && nsII.is_ok && vkeys(nsII).includes('warning_vt_range_nonstandard'),
      `${vkeys(nsI)} / ${vkeys(nsII)}`, 'warning_vt_range_nonstandard'));
    // The old defaults (100 Ω ≈ 99 VA) are NOT OK — the reason the input is VA now
    results.push(assert('VTCALC #125 old default 100 Ω → NOT OK', !vt({ device_resistance: 100, cable_length: 150 }).is_ok,
      'OK', 'NOT OK'));
    // Migration Ω → VA: same results, device_resistance dropped
    const old = { secondary_voltage: 100, burden: 10, thermal_burden: 50, device_resistance: 2000, cable_length: 150 };
    const mig = CTVT.migrateInputs(old);
    results.push(assert('VTCALC #125 migration 2000 Ω @ 100 V → 5 VA', mig.device_burden === 5 && !('device_resistance' in mig)
      && old.device_resistance === 2000, mig.device_burden, 5, ' VA'));
    results.push(assert('VTCALC #125 migrated core gives the same burden',
      approx(CTVT.calculate(mig, {}).actual_burden_va, CTVT.calculate(old, {}).actual_burden_va),
      CTVT.calculate(mig, {}).actual_burden_va, CTVT.calculate(old, {}).actual_burden_va, ' VA'));
    results.push(assert('VTCALC #125 migration: 0 Ω → 0 VA, a VA core untouched',
      CTVT.migrateInputs({ device_resistance: 0 }).device_burden === 0
        && CTVT.migrateInputs(mig) === mig && CTVT.migrateInputs({ device_burden: 1, device_resistance: 7 }).device_resistance === 7,
      'ok', 'ok'));

    // CTMeterDB (calc/meters.js): presets fill editable values
    const M = CTMeterDB;
    results.push(assert('METERDB Prometer 100: metering 0.1 VA / Fmin 20',
      JSON.stringify(M.presetValues('cewe_prometer_100', 'metering')) === JSON.stringify({ device_burden: 0.1, min_safety_factor: 20 }),
      JSON.stringify(M.presetValues('cewe_prometer_100', 'metering')), '{device_burden:0.1,min_safety_factor:20}'));
    results.push(assert('METERDB VT supply mode aux 0.1 / self 6 VA (preset and custom)',
      M.presetValues('cewe_prometer_100', 'vt', 'aux').device_burden === 0.1 && M.presetValues('cewe_prometer_100', 'vt', 'self').device_burden === 6
        && M.presetValues('', 'vt', 'self').device_burden === 6 && M.presetValues('', 'vt', 'aux').device_burden === 0.1
        && M.presetValues('', 'metering') === null, 'ok', 'ok'));
    results.push(assert('METERDB modified from preset',
      M.modifiedFields({ meter_model: 'cewe_prometer_100', device_burden: 0.2, min_safety_factor: 20 }, 'metering').join() === 'device_burden'
        && M.modifiedFields({ meter_model: 'cewe_prometer_100', device_burden: 6, vt_supply_mode: 'self' }, 'vt').length === 0
        && M.modifiedFields({ device_burden: 3 }, 'vt').length === 0, 'ok', 'ok'));

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
    const checkCore = (tag, r0, e) => {
      // CTVT.calculate adds the burden-range row (issue #125); the Python has none
      const r = { ...r0, intermediate_steps: r0.intermediate_steps.filter((s) => !CTSIZER_ONLY_VT_STEPS.includes(s.key)) };
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
      // Named delta: Al ρ20 is the IEC 60287-1-1 value 0.028264 Ω·mm²/m; the
      // Python golden used 0.02826 (+0.014 %), which moves the voltage drop of
      // the aluminium iec60287 case in the fourth digit
      let expected = c.expected;
      if (mat === 'al' && c.input.common_data.cable_r_method === 'iec60287') {
        const json = JSON.stringify(c.expected);
        const patched = json.split('1.3587 V (2.139%)').join('1.3589 V (2.140%)').split('2.139% > 0.5%').join('2.140% > 0.5%');
        results.push(assert(`${tag} named delta Al ρ20 0.028264: voltage drop 1.3587 → 1.3589 V`,
          patched !== json && approx(1.3587 * CTMaterials.ALUMINUM_RESISTIVITY_20C / 0.02826, 1.3589, 1e-4),
          CTMaterials.ALUMINUM_RESISTIVITY_20C, 0.028264));
        expected = JSON.parse(patched);
      }
      checkCore(tag, got, expected);
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
        smin_floor_va: 0,   // metering: the Python has no 1 VA floor on Smin (F-MT-125)
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
      results.push(assert(`${tag} warnings`, matchesExpected(pyWarnings(got.warnings), e.warnings),
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

  // ── Fault level: Ik1 max and the Tp helper (CTFaultLevel) ──────────────
  // Hand-derived. Ik1 max (isc_1ph) above Ik3 max (isc_sys) governs the
  // single-case modules and the 1-phase line diff cases; a project without
  // Ik1, or with Ik1 below Ik3, gives the results it gave before.
  function testFaultLevel() {
    const results = [];
    const F = CTFaultLevel;
    results.push(assert('FL governing: Ik1 above Ik3 → Ik1', F.governingKa(40, 44) === 44, F.governingKa(40, 44), 44));
    results.push(assert('FL governing: Ik1 below Ik3 → Ik3', F.governingKa(40, 30) === 40, F.governingKa(40, 30), 40));
    results.push(assert('FL governing: no Ik1 → Ik3', F.governingKa(40, null) === 40 && F.governingKa(40) === 40, '', 40));
    results.push(assert('FL step only when Ik1 governs', F.governingStep(40, 30) === null
      && F.governingStep(40, 44).result === 44, '', 'null / 44'));

    // Tp: Z1 = Z2 = 0.6953 + j7.4393 Ω, Z0 = 2.1943 + j6.9040 Ω, 50 Hz
    // Tp3 = 7.4393 / (100π · 0.6953) = 34.06 ms
    // Tp1 = 21.7826 / (100π · 3.5849) = 19.34 ms
    const z = { r1: 0.6953, x1: 7.4393, r2: 0.6953, x2: 7.4393, r0: 2.1943, x0: 6.9040 };
    const t = F.primaryTimeConstants(z, 50);
    results.push(assert('FL Tp3 = X1/(ωR1)', approx(t.tp3, 34.057), t.tp3, 34.057, ' ms'));
    results.push(assert('FL Tp1 = (X1+X2+X0)/(ω(R1+R2+R0))', approx(t.tp1, 19.341), t.tp1, 19.341, ' ms'));
    // Z2 ≠ Z1: (5 + 4 + 9) / (2π·60 · (0.5 + 0.4 + 1.5)) · 1000 = 19.894 ms
    const t2 = F.primaryTimeConstants({ r1: 0.5, x1: 5, r2: 0.4, x2: 4, r0: 1.5, x0: 9 }, 60);
    results.push(assert('FL Tp1 with Z2 ≠ Z1, 60 Hz', approx(t2.tp1, 19.894), t2.tp1, 19.894, ' ms'));
    const tPart = F.primaryTimeConstants({ r1: 0.6953, x1: 7.4393 }, 50);
    results.push(assert('FL only Z1: Tp3, no Tp1, Tp1 lists R2 X2 R0 X0',
      approx(tPart.tp3, 34.057) && tPart.tp1 === null && tPart.missing.tp1.join() === 'r2,x2,r0,x0'
      && tPart.missing.tp3.length === 0, tPart.missing.tp1.join(), 'r2,x2,r0,x0'));
    const tZero = F.primaryTimeConstants({ ...z, r1: 0 }, 50);
    results.push(assert('FL R1 = 0 → no Tp3; no frequency → none', tZero.tp3 === null && tZero.tp1 !== null
      && F.primaryTimeConstants(z, NaN).tp3 === null, '', 'null'));

    // Line diff: the 1-phase cases take Ik1, the 3-phase ones Ik3
    const D = CTLineDiff.data;
    const fc = D.extractFaultCurrents({ isc_sys: 40, isc_1ph: 44 }, { Ip: 2000 });
    results.push(assert('FL line diff: 3-phase cases Ik3, 1-phase cases Ik1',
      fc.ik_max_3ph === 40000 && fc.it_max_3ph === 40000 && fc.ik_max_1ph === 44000 && fc.it_max_1ph === 44000,
      JSON.stringify(fc), '40000 / 44000'));
    const fc0 = D.extractFaultCurrents({ isc_sys: 40 }, { Ip: 2000 });
    results.push(assert('FL line diff: no Ik1 → Ik3 for all', fc0.ik_max_1ph === 40000 && fc0.it_max_1ph === 40000,
      JSON.stringify(fc0), 40000));
    const fcO = D.extractFaultCurrents({ isc_sys: 40, isc_1ph: 44 }, { Ip: 2000, ik_max_1ph: 30000 });
    results.push(assert('FL line diff: a core override still wins', fcO.ik_max_1ph === 30000, fcO.ik_max_1ph, 30000));

    // Single-case modules: the result scales with the governing current
    const base = { voltage: 150, freq: '50', isc_sys: 40, tp: 100, cable_r_method: 'table', cable_temp: 25 };
    const core = { Ip: 2000, Is: 1, rct: 4, burden: 30, alf: 30, relay_burden: 0.05,
      cable_length: 100, cable_cross: 4, cable_mat: 'cu', cable_topology: 'six_wire' };
    const oc3 = CTOvercurrent.calculate(core, base);
    const oc1 = CTOvercurrent.calculate(core, { ...base, isc_1ph: 44 });
    const ocLo = CTOvercurrent.calculate(core, { ...base, isc_1ph: 30 });
    results.push(assert('FL overcurrent: Ik1 44 kA governs, a step shows it',
      oc1.Isc_max === 44000 && oc1.steps.some((st) => st.key === 'ik_governing'), oc1.Isc_max, 44000));
    results.push(assert('FL overcurrent: Ik1 below Ik3 → as before, no step',
      ocLo.Isc_max === oc3.Isc_max && JSON.stringify(ocLo.steps) === JSON.stringify(oc3.steps), ocLo.Isc_max, oc3.Isc_max));
    const pxCore = { ...core, is_px: true, vk: 200 };
    const bb3 = CTBusbar.calculate(pxCore, base);
    const bb1 = CTBusbar.calculate(pxCore, { ...base, isc_1ph: 44 });
    results.push(assert('FL busbar PX: E_int scales with Ik1/Ik3',
      approx(bb1.e_internal / bb3.e_internal, 44 / 40) && bb1.steps.some((st) => st.key === 'ik_governing'),
      bb1.e_internal / bb3.e_internal, 1.1));
    const dist = (sys) => CTDistance.data.extractDistanceInputs({ ...core }, sys).iscc_max;
    results.push(assert('FL distance: Iscc,max = max(Ik3, Ik1)', dist({ ...base, isc_1ph: 44 }) === 44000
      && dist({ ...base, isc_1ph: 30 }) === 40000 && dist(base) === 40000, dist({ ...base, isc_1ph: 44 }), 44000));
    const T = CTTransformerDiff.data;
    results.push(assert('FL transformer diff: project internal current = max(Ik3, Ik1)',
      T.projectInternalFaultCurrent({ isc_sys: 40, isc_1ph: 44 }) === 44000
      && T.projectInternalFaultCurrent({ isc_sys: 40, isc_1ph: 30 }) === 40000
      && T.projectInternalFaultCurrent({ isc_sys: 0, isc_1ph: 44 }) === null, '', '44000 / 40000 / null'));
    return results;
  }

  // ── RUN ALL ────────────────────────────────────────────────────────────
  // ── END TO END (PORTING_PLAN.md §10 B2) ────────────────────────────────
  // Realistic cores in the shape the UI stores them (core.inputs and the
  // project settings; calc/golden/e2e.json ← gen_e2e) go through
  // CTCalc.calculate(type, inputs, system), exactly as ctsizer-app.jsx calls
  // it. The expected values are the Python tool's output for the same inputs
  // (calculate_single_core, the toolbox lead resistance injected per §9.5):
  // status, the numbers the Summary panel shows (buildMetrics) and every
  // Formula Steps row the Python reports. Nothing is hand-written.
  // ── CTRequired (calc/required.js): no default values ──────────────────
  // Every input must be entered: a blank project, bay or core is incomplete,
  // and only a complete core with complete station data is calculated.
  // ── VT: where the attached resistor sits (CTVT.calculate resistor_location) ──
  // At the meter (the Python model) its current flows in the lead; at the VT
  // only the meter's current does. Hand-derived: Us 100 V, R_cable 2 Ω,
  // R_device 5000 Ω (2 VA), R_attached 1000 Ω.
  function testVtResistorLocation() {
    const results = [];
    const C = CTVT.calculator;
    const core = { burden: 10, thermal_burden: 50, secondary_voltage: 100, attached_resistor: 1000,
      device_resistance: 5000, vt_class: '0.2' };
    const [, atMeter] = C.executeWithValues(2, core, { resistor_location: 'meter' });
    const [, py] = C.executeWithValues(2, core);
    const [rVt, atVt] = C.executeWithValues(2, core, { resistor_location: 'vt' });
    // at the meter: Z = 2 + 1000∥5000 = 835.333 Ω, I = 0.119713 A, ΔU = 0.239425 V
    results.push(assert('VTLOC at the meter = the Python model', atMeter.total_impedance === py.total_impedance
      && atMeter.voltage_drop === py.voltage_drop, atMeter.voltage_drop, py.voltage_drop, ' V'));
    results.push(assert('VTLOC at the meter: Z_total', approx(atMeter.total_impedance, 2 + 1000 * 5000 / 6000), atMeter.total_impedance, 835.3333, ' Ω'));
    results.push(assert('VTLOC at the meter: ΔU = R_cable · I_s', approx(atMeter.voltage_drop, 2 * 100 / 835.3333), atMeter.voltage_drop, 0.239425, ' V'));
    // at the VT: Z = 1000∥5002 = 833.389 Ω, I_VT = 0.119992 A, I_meter = 100/5002, ΔU = 0.039984 V
    results.push(assert('VTLOC at the VT: Z_total = R_att ∥ (R_cable + R_device)', approx(atVt.total_impedance, 1000 * 5002 / 6002),
      atVt.total_impedance, 833.3889, ' Ω'));
    results.push(assert('VTLOC at the VT: the VT supplies both (S = Us·I)', approx(atVt.actual_burden_va, 100 * 100 / (1000 * 5002 / 6002)),
      atVt.actual_burden_va, 11.9992, ' VA'));
    results.push(assert('VTLOC at the VT: the lead carries the meter current only', approx(atVt.lead_current, 100 / 5002),
      atVt.lead_current, 0.019992, ' A'));
    results.push(assert('VTLOC at the VT: ΔU = R_cable · I_meter', approx(atVt.voltage_drop, 2 * 100 / 5002) && approx(atVt.voltage_drop_percent, 2 * 100 / 5002),
      atVt.voltage_drop, 0.039984, ' V'));
    results.push(assert('VTLOC at the VT: lead current and voltage-drop steps', rVt.intermediate_steps.some((s) => s.key === 'lead_current')
      && rVt.intermediate_steps.find((s) => s.key === 'voltage_drop_in_cable').latex.includes('I_{meter}'), '', 'steps'));
    // no resistor: the place does not matter
    const [, n1] = C.executeWithValues(2, { ...core, attached_resistor: 0 }, { resistor_location: 'vt' });
    const [, n2] = C.executeWithValues(2, { ...core, attached_resistor: 0 }, { resistor_location: 'meter' });
    results.push(assert('VTLOC no resistor: VT and meter the same', n1.voltage_drop === n2.voltage_drop && n1.total_impedance === n2.total_impedance,
      n1.voltage_drop, n2.voltage_drop, ' V'));

    // Through CTVT.calculate: vt_resistor_location, blank = at the meter
    const sys = { cable_r_method: 'iec60287', cable_temp: 20 };
    const VT = { secondary_voltage: 57.735, vt_class: '0.2', burden: 10, thermal_burden: 50, vt_burden_range: 'I',
      vt_supply_mode: 'aux', device_burden: 0.1, cable_length: 100, cable_cross: 1.5, cable_mat: 'cu', cable_topology: 'six_wire',
      attached_resistor: 400 };
    const blank = CTVT.calculate(VT, sys), m = CTVT.calculate({ ...VT, vt_resistor_location: 'meter' }, sys);
    const v = CTVT.calculate({ ...VT, vt_resistor_location: 'vt' }, sys);
    results.push(assert('VTLOC calculate: blank = at the meter', blank.resistor_location === 'meter' && blank.voltage_drop === m.voltage_drop,
      blank.resistor_location, 'meter'));
    results.push(assert('VTLOC calculate: at the VT the drop is far lower, the burden about the same',
      v.resistor_location === 'vt' && v.voltage_drop_percent < m.voltage_drop_percent / 10
        && Math.abs(v.actual_burden_va - m.actual_burden_va) / m.actual_burden_va < 0.05,
      [v.voltage_drop_percent, m.voltage_drop_percent], 'vt ≪ meter'));
    // Elmåling §7.4.2 (lead drop < 0.1 %) follows the place
    if (typeof CTLocalRules !== 'undefined') {
      const s = { ...sys, voltage: 10, local_rules: 'dk_elmaaling_9' };
      const lead = (inp) => CTLocalRules.evaluate('dk_elmaaling_9', { kind: 'vt', calc_type: 'vt', inputs: inp },
        CTVT.calculate(inp, s), s).items.find((x) => x.id === 'vt_lead_drop').status;
      results.push(assert('VTLOC Elmåling lead drop: at the meter fails, at the VT passes',
        lead({ ...VT, vt_resistor_location: 'meter' }) === 'fail' && lead({ ...VT, vt_resistor_location: 'vt' }) === 'ok',
        [lead({ ...VT, vt_resistor_location: 'meter' }), lead({ ...VT, vt_resistor_location: 'vt' })], ['fail', 'ok']));
    }

    // Required: the place only when a resistor is entered
    const req = (inp) => CTRequired.core({ kind: 'vt', calc_type: 'vt', inputs: { ...VT, meter_manufacturer: 'Other', ...inp } });
    results.push(assert('VTLOC required with a resistor', req({}).fields.vt_resistor_location === 'missing' && req({}).sections.cable === 1,
      JSON.stringify(req({}).fields), 'vt_resistor_location:missing'));
    results.push(assert('VTLOC not asked without a resistor', req({ attached_resistor: 0 }).ok, JSON.stringify(req({ attached_resistor: 0 }).fields), ''));
    results.push(assert('VTLOC a picked place → ok; another value invalid', req({ vt_resistor_location: 'vt' }).ok
      && req({ vt_resistor_location: 'x' }).fields.vt_resistor_location === 'invalid', '', 'ok / invalid'));
    return results;
  }

  // ── LOCAL METERING RULES (calc/local_rules/) ─────────────────────────
  // Denmark: Elmåling 9th ed., section 3 (TR 353, 9th ed.), on cores
  // calculated by CTCalc as the app does.
  function testLocalRules() {
    const results = [];
    const LR = CTLocalRules;
    const ID = 'dk_elmaaling_9';
    const sys = (kV) => ({ station_name: 'Test', station_abbr: 'TST', voltage: kV, freq: '50', isc_sys: 20, isc_1ph: 20, tp: 100,
      cable_r_method: 'iec60287', cable_temp: 20, local_rules: ID });
    const MT = { Ip: 100, Is: 5, rct: 0.1, burden: 5, mt_class: '0.2S', fs_factor: 5, extended_burden_range: true,
      meter_manufacturer: 'Other', device_burden: 0.1, min_safety_factor: 20,
      meter_standard: 'dsen', meter_class: '0.5S',
      cable_length: 10, cable_cross: 2.5, cable_mat: 'cu', cable_topology: 'six_wire', attached_resistor: 0 };
    const VT = { secondary_voltage: 100 / Math.sqrt(3), vt_class: '0.2', burden: 10, thermal_burden: 50, vt_burden_range: 'I',
      meter_manufacturer: 'Other', vt_supply_mode: 'aux', device_burden: 0.1,
      cable_length: 30, cable_cross: 2.5, cable_mat: 'cu', cable_topology: 'four_wire', attached_resistor: 0 };
    const run = (kind, type, inputs, s) => {
      const core = { kind, calc_type: type, inputs };
      return LR.evaluate(ID, core, CTCalc.calculate(type, inputs, s), s);
    };
    const mt = (over, kV = 10) => run('ct', 'metering', { ...MT, ...over }, sys(kV));
    const vt = (over, kV = 10) => run('vt', 'vt', { ...VT, ...over }, sys(kV));
    const st = (r, id) => { const it = r && r.items.find((x) => x.id === id); return it ? it.status : 'absent'; };
    const allOk = (r) => r.items.every((x) => x.status === 'ok');

    // Registry
    results.push(assert('LR registry has the Danish set', LR.ids().includes(ID) && LR.byId(ID).country === 'DK', LR.ids().join(','), ID));
    const s10 = sys(10);
    const mtRes = CTCalc.calculate('metering', MT, s10);
    results.push(assert('LR no set picked → null', LR.evaluate(null, { kind: 'ct', calc_type: 'metering', inputs: MT }, mtRes, s10) === null, 'obj', 'null'));
    results.push(assert('LR unknown set → null', LR.evaluate('xx', { kind: 'ct', calc_type: 'metering', inputs: MT }, mtRes, s10) === null, 'obj', 'null'));
    results.push(assert('LR protection core not covered → null',
      LR.evaluate(ID, { kind: 'ct', calc_type: 'overcurrent', inputs: {} }, { is_ok: true }, s10) === null, 'obj', 'null'));
    results.push(assert('LR core without result → null',
      LR.evaluate(ID, { kind: 'ct', calc_type: 'metering', inputs: MT }, null, s10) === null, 'obj', 'null'));

    // Metering CT: a compliant 10 kV core
    const ok10 = mt({});
    results.push(assert('LR DK 10 kV compliant metering core → ok, every item ok', ok10.verdict === 'ok' && allOk(ok10),
      ok10.items.map((x) => `${x.id}:${x.status}`).join(' '), 'all ok'));
    results.push(assert('LR DK every item cites TR 353', ok10.items.every((x) => /^TR 353 /.test(x.ref) && x.en && x.da), '', ''));
    const t51 = ok10.items.find((x) => x.id === 'ct_class');
    results.push(assert('LR DK refs: "table" in English, "tabel" in Danish', LR.refText(t51, 'en') === 'TR 353 §6.2, table 5.1'
      && LR.refText(t51, 'da') === 'TR 353 §6.2, tabel 5.1', LR.refText(t51, 'da'), 'TR 353 §6.2, tabel 5.1'));
    results.push(assert('LR DK class 0.5S → fail (§6.2: 0.2S)', st(mt({ mt_class: '0.5S' }), 'ct_class') === 'fail'
      && mt({ mt_class: '0.5S' }).verdict === 'fail', st(mt({ mt_class: '0.5S' }), 'ct_class'), 'fail'));
    results.push(assert('LR DK class 0.2 (not S) → fail', st(mt({ mt_class: '0.2' }), 'ct_class') === 'fail', '', 'fail'));
    results.push(assert('LR DK no extended range → fail (§6.2)', st(mt({ extended_burden_range: false }), 'ct_extended_range') === 'fail', '', 'fail'));
    results.push(assert('LR DK extended range asked with Sn 30 VA (> 15) → fail', st(mt({ burden: 30 }), 'ct_extended_range') === 'fail', '', 'fail'));
    const big = mt({ cable_length: 200, cable_cross: 1.5 });
    results.push(assert('LR DK S above Sn → burden fail (§7.4.1)', st(big, 'ct_burden') === 'fail', st(big, 'ct_burden'), 'fail'));
    results.push(assert('LR DK S below 1 VA → burden fail', st(mt({ cable_length: 0, Is: 1 }), 'ct_burden') === 'fail', '', 'fail'));
    results.push(assert('LR DK lead 2.5 mm² ≥ 1.5 → ok', st(ok10, 'ct_cross') === 'ok', '', 'ok'));
    const ip = mt({ Ip: 120 });
    results.push(assert('LR DK 10 kV Ip 120 A → advice, verdict still ok', st(ip, 'ct_primary') === 'advice' && ip.verdict === 'ok', ip.verdict, 'ok'));
    results.push(assert('LR DK 10 kV Ip 1500 A (15 × 100) → ok', st(mt({ Ip: 1500 }), 'ct_primary') === 'ok', '', 'ok'));
    results.push(assert('LR DK 0.4 kV: no primary-current advice', st(mt({ meter_class: '1' }, 0.4), 'ct_primary') === 'absent', '', 'absent'));
    const lvR = mt({ attached_resistor: 0.1, meter_class: '1' }, 0.4);
    results.push(assert('LR DK ≤ 1 kV attached resistor → fail (§6.2)', st(lvR, 'ct_no_extra_burden') === 'fail', st(lvR, 'ct_no_extra_burden'), 'fail'));
    results.push(assert('LR DK ≤ 1 kV no resistor → ok', st(mt({ meter_class: '1' }, 0.4), 'ct_no_extra_burden') === 'ok', '', 'ok'));
    const hvR = mt({ attached_resistor: 0.05 });
    results.push(assert('LR DK > 1 kV attached resistor → advice', st(hvR, 'ct_extra_burden_hv') === 'advice'
      && st(hvR, 'ct_no_extra_burden') === 'absent', st(hvR, 'ct_extra_burden_hv'), 'advice'));

    // Table 5.1: the meter class per level (exclusive lower bounds)
    const lvl = LR.byId(ID).level;
    results.push(assert('LR DK levels 0.4 / 0.69 / 1 / 10 / 100 / 132 kV',
      [0.4, 0.69, 1, 10, 100, 132].map((u) => lvl({ voltage: u })).join(' ') === '0.4 0.4-1 0.4-1 1-100 1-100 100+',
      [0.4, 0.69, 1, 10, 100, 132].map((u) => lvl({ voltage: u })).join(' '), '0.4 0.4-1 0.4-1 1-100 1-100 100+'));
    const mc = (std, cls, kV) => st(mt({ meter_standard: std, meter_class: cls }, kV), 'meter_class');
    const cases = [
      ['dsen', '1', 0.4, 'ok'], ['dsen', '2', 0.4, 'fail'], ['dsen', '1', 0.69, 'ok'],
      ['dsen', '1', 10, 'fail'], ['dsen', '0.5S', 10, 'ok'], ['dsen', '0.2S', 10, 'ok'],
      ['dsen', '0.5S', 132, 'fail'], ['dsen', '0.2S', 132, 'ok'],
      ['mid', 'A', 0.4, 'fail'], ['mid', 'B', 0.4, 'ok'], ['mid', 'B', 10, 'fail'], ['mid', 'C', 10, 'ok'],
      ['mid', 'C', 132, 'fail'],
    ];
    for (const [std, cls, kV, exp] of cases) {
      const got = mc(std, cls, kV);
      results.push(assert(`LR DK table 5.1: ${std} ${cls} at ${kV} kV → ${exp}`, got === exp, got, exp));
    }
    const mid069 = mt({ meter_standard: 'mid', meter_class: 'B' }, 0.69);
    results.push(assert('LR DK MID B at 0.4–1 kV: note 4 advice (class C with VTs)',
      st(mid069, 'meter_class') === 'ok' && st(mid069, 'meter_class_bek582') === 'advice', st(mid069, 'meter_class_bek582'), 'advice'));
    const noMeter = mt({ meter_standard: undefined, meter_class: undefined });
    results.push(assert('LR DK meter class not entered → missing, verdict incomplete',
      st(noMeter, 'meter_class') === 'missing' && noMeter.verdict === 'incomplete', noMeter.verdict, 'incomplete'));
    results.push(assert('LR DK class of another standard → missing', st(mt({ meter_standard: 'mid', meter_class: '0.5S' }), 'meter_class') === 'missing', '', 'missing'));
    results.push(assert('LR verdict: fail beats incomplete', LR.verdict([{ status: 'missing' }, { status: 'fail' }, { status: 'advice' }]) === 'fail', '', 'fail'));

    // VT core
    const vok = vt({});
    results.push(assert('LR DK 10 kV compliant VT core → ok, every item ok', vok.verdict === 'ok' && allOk(vok),
      vok.items.map((x) => `${x.id}:${x.status}`).join(' '), 'all ok'));
    results.push(assert('LR DK VT class 0.5 → fail (§6.3)', st(vt({ vt_class: '0.5' }), 'vt_class') === 'fail', '', 'fail'));
    results.push(assert('LR DK VT class 0.1 → ok', st(vt({ vt_class: '0.1' }), 'vt_class') === 'ok', '', 'ok'));
    results.push(assert('LR DK VT burden series II → fail', st(vt({ vt_burden_range: 'II' }), 'vt_series') === 'fail', '', 'fail'));
    const v15 = vt({ burden: 15 });
    results.push(assert('LR DK VT 15 VA → advice (series I values)', st(v15, 'vt_rated_burden') === 'advice' && v15.verdict === 'ok', st(v15, 'vt_rated_burden'), 'advice'));
    const vfar = vt({ vt_supply_mode: 'self', device_burden: 6, cable_length: 500, cable_cross: 1.5, cable_topology: 'six_wire' });
    const vfarRes = CTCalc.calculate('vt', { ...VT, vt_supply_mode: 'self', device_burden: 6, cable_length: 500, cable_cross: 1.5, cable_topology: 'six_wire' }, sys(10));
    results.push(assert('LR DK VT lead drop ≥ 0.1 % → fail (§7.4.2)', st(vfar, 'vt_lead_drop') === 'fail'
      && vfarRes.voltage_drop_percent >= 0.1, vfarRes.voltage_drop_percent, '≥ 0.1'));
    results.push(assert('LR DK VT Us 110/√3 V → ok', st(vt({ secondary_voltage: 63.51 }), 'vt_us') === 'ok', '', 'ok'));
    results.push(assert('LR DK VT Us 110 V → ok', st(vt({ secondary_voltage: 110 }), 'vt_us') === 'ok', '', 'ok'));
    results.push(assert('LR DK VT Us 230 V at 10 kV → advice', st(vt({ secondary_voltage: 230 }), 'vt_us') === 'advice', '', 'advice'));
    results.push(assert('LR DK VT at 0.69 kV: no Us advice', st(vt({}, 0.69), 'vt_us') === 'absent', '', 'absent'));

    // Manual items
    const hasRef = (r, ref) => r.manual.some((x) => x.ref === `TR 353 ${ref}`);
    results.push(assert('LR DK manual: > 1 kV main + check meter cores', hasRef(ok10, '§6.2, §7.1'), '', 'present'));
    const lv = mt({ meter_class: '1' }, 0.4);
    results.push(assert('LR DK manual: ≤ 1 kV no check-meter core item, LV rating item',
      !hasRef(lv, '§6.2, §7.1') && lv.manual.some((x) => /Fællesregulativet/.test(x.en)), '', ''));
    results.push(assert('LR DK manual VT: no primary fuses, MCB', hasRef(vok, '§6.3') && hasRef(vok, '§6.3, §7.4.2'), '', 'present'));

    // Remarks: no "add burden" advice TR 353 does not allow, only with the set picked
    const keysOf = (ws) => ws.map((w) => (Array.isArray(w) ? w[0] : w));
    const rem = (type, kind, inp, kV, id = ID) => {
      const s = { ...sys(kV), local_rules: id };
      const r = CTCalc.calculate(type, inp, s);
      return { r, ws: LR.remarks(id, { kind, calc_type: type, inputs: inp }, r, s) };
    };
    const fmin6 = { ...MT, min_safety_factor: 6, meter_class: '1' };   // S 3.55 < S_req 3.75: add 0.2 VA
    const none = rem('metering', 'ct', fmin6, 0.4, null);
    results.push(assert('LR remarks: no set picked → the calculation\'s own, unchanged',
      none.ws === none.r.warnings && keysOf(none.ws).includes('hint_metering_add_burden'), keysOf(none.ws).join(), 'hint_metering_add_burden'));
    const lvRem = rem('metering', 'ct', fmin6, 0.4);
    results.push(assert('LR remarks DK ≤ 1 kV: add-burden hint → no extra burden allowed',
      keysOf(lvRem.ws).includes('hint_metering_add_burden_dk_lv') && !keysOf(lvRem.ws).includes('hint_metering_add_burden')
        && lvRem.r.warnings.some((w) => w[0] === 'hint_metering_add_burden'), keysOf(lvRem.ws).join(), 'hint_metering_add_burden_dk_lv'));
    const lvArgs = lvRem.ws.find((w) => w[0] === 'hint_metering_add_burden_dk_lv');
    const calcArgs = lvRem.r.warnings.find((w) => w[0] === 'hint_metering_add_burden');
    results.push(assert('LR remarks DK keep ΔS and S_req', JSON.stringify(lvArgs.slice(1)) === JSON.stringify(calcArgs.slice(1)),
      JSON.stringify(lvArgs.slice(1)), JSON.stringify(calcArgs.slice(1))));
    const hvRem = rem('metering', 'ct', { ...fmin6, meter_class: '0.5S' }, 10);
    results.push(assert('LR remarks DK > 1 kV: add-burden hint → leads / cross-section, no resistor',
      keysOf(hvRem.ws).includes('hint_metering_add_burden_dk_hv'), keysOf(hvRem.ws).join(), 'hint_metering_add_burden_dk_hv'));
    const extInp = { ...MT, burden: 15, extended_burden_range: false };   // S 3.55 < Smin 3.75
    const extNone = rem('metering', 'ct', extInp, 10, null), extDk = rem('metering', 'ct', extInp, 10);
    results.push(assert('LR remarks DK: S < Smin → the extended range, not "add burden"',
      keysOf(extNone.ws).includes('hint_extended_burden_range') && keysOf(extDk.ws).includes('hint_extended_burden_range_dk')
        && !keysOf(extDk.ws).includes('hint_extended_burden_range'), keysOf(extDk.ws).join(), 'hint_extended_burden_range_dk'));
    const vtII = { ...VT, vt_burden_range: 'II' };
    const vtNone = rem('vt', 'vt', vtII, 10, null), vtDk = rem('vt', 'vt', vtII, 10);
    results.push(assert('LR remarks DK: VT range II below 25 % → series I, not "add burden"',
      keysOf(vtNone.ws).includes('warning_vt_range_ii_below_25') && keysOf(vtDk.ws).includes('warning_vt_range_ii_below_25_dk')
        && !keysOf(vtDk.ws).includes('warning_vt_range_ii_below_25'), keysOf(vtDk.ws).join(), 'warning_vt_range_ii_below_25_dk'));
    results.push(assert('LR remarks: a protection core is never touched',
      LR.remarks(ID, { kind: 'ct', calc_type: 'overcurrent', inputs: {} }, { warnings: [['hint_metering_add_burden', 1, 2]] }, sys(0.4))[0][0]
        === 'hint_metering_add_burden', '', 'unchanged'));

    // CTRequired: the rule set and the meter's class are optional, but valid
    const R = CTRequired;
    results.push(assert('LR REQ local_rules blank → station ok', R.system({ ...sys(10), local_rules: null }).ok, '', 'ok'));
    results.push(assert('LR REQ local_rules unknown → invalid', R.system({ ...sys(10), local_rules: 'xx' }).fields.local_rules === 'invalid', '', 'invalid'));
    const mcore = (o) => R.core({ kind: 'ct', calc_type: 'metering', inputs: { ...MT, ...o } }, { connection: { sn_mva: 1 } });
    results.push(assert('LR REQ meter standard / class blank → ok', mcore({ meter_standard: undefined, meter_class: undefined }).ok, '', 'ok'));
    results.push(assert('LR REQ MID class 0.5S → invalid', mcore({ meter_standard: 'mid', meter_class: '0.5S' }).fields.meter_class === 'invalid', '', 'invalid'));
    results.push(assert('LR REQ meter classes match the rule set', JSON.stringify(R.METER_CLASSES) === JSON.stringify(LR.byId(ID).METER_CLASSES),
      JSON.stringify(R.METER_CLASSES), JSON.stringify(LR.byId(ID).METER_CLASSES)));
    return results;
  }

  function testRequired() {
    const results = [];
    const R = CTRequired;
    const SYS = { station_name: 'Test', station_abbr: 'TST', voltage: 132, freq: '50', isc_sys: 20, isc_1ph: 20, tp: 100,
      cable_r_method: 'iec60287', cable_temp: 75 };
    const CT = { Ip: 2000, Is: 1, rct: 4, burden: 30 };
    const RELAY = { relay_manufacturer: 'Other', relay_burden: 0.05 };
    const CABLE = { cable_length: 100, cable_cross: 4, cable_mat: 'cu', cable_topology: 'six_wire' };
    const keys = (r) => Object.keys(r.fields).sort().join(',');

    // Station data
    const s0 = R.system({});
    results.push(assert('REQ empty station: all 9 fields missing', !s0.ok && s0.count === 9
      && Object.values(s0.fields).every((x) => x === 'missing') && s0.sections.station === 9, s0.count, 9));
    // Ik1 max (isc_1ph) is required like Ik3 max: blank → missing, ≤ 0 → invalid
    results.push(assert('REQ Ik1 max: blank → missing, 0 → invalid, 22 kA → ok',
      R.system({ ...SYS, isc_1ph: null }).fields.isc_1ph === 'missing'
      && R.system({ ...SYS, isc_1ph: 0 }).fields.isc_1ph === 'invalid'
      && R.system({ ...SYS, isc_1ph: 22 }).fields.isc_1ph === undefined, '', 'missing / invalid / ok'));
    results.push(assert('REQ station complete → ok', R.system(SYS).ok, keys(R.system(SYS)), ''));
    // ρ20 source (#132): required with the formula method; absent = saved before → note, not a mark
    const sOld = R.system(SYS);
    results.push(assert('REQ ρ: formula project without the key → ok, legacy note',
      sOld.ok && sOld.notes.cable_rho_mode === 'legacy' && !('cable_rho_mode' in sOld.fields), JSON.stringify(sOld.notes), 'legacy'));
    const sNull = R.system({ ...SYS, cable_rho_mode: null });
    results.push(assert('REQ ρ: blank source (new project) → missing, blocks',
      !sNull.ok && sNull.count === 1 && sNull.fields.cable_rho_mode === 'missing' && sNull.sections.station === 1
      && Object.keys(sNull.notes).length === 0, keys(sNull), 'cable_rho_mode'));
    results.push(assert('REQ ρ: IEC → ok, no note', R.system({ ...SYS, cable_rho_mode: 'iec' }).ok
      && Object.keys(R.system({ ...SYS, cable_rho_mode: 'iec' }).notes).length === 0, '', 'ok'));
    const sMan = R.system({ ...SYS, cable_rho_mode: 'manual', cable_rho20_cu: null, cable_rho20_al: null });
    results.push(assert('REQ ρ: manual needs both Cu and Al', keys(sMan) === 'cable_rho20_al,cable_rho20_cu'
      && sMan.fields.cable_rho20_cu === 'missing', keys(sMan), 'cable_rho20_al,cable_rho20_cu'));
    const sManBad = R.system({ ...SYS, cable_rho_mode: 'manual', cable_rho20_cu: 1.7241e-8, cable_rho20_al: 0.5 });
    results.push(assert('REQ ρ: manual in Ω·m / out of range → invalid',
      sManBad.fields.cable_rho20_cu === 'invalid' && sManBad.fields.cable_rho20_al === 'invalid', keys(sManBad), 'both invalid'));
    results.push(assert('REQ ρ: manual ρ20 stored as text (hand-edited file) → invalid',
      R.system({ ...SYS, cable_rho_mode: 'manual', cable_rho20_cu: '0.0185', cable_rho20_al: 0.02826 }).fields.cable_rho20_cu === 'invalid', '', 'invalid'));
    results.push(assert('REQ ρ: manual 0.0185 / 0.02826 → ok',
      R.system({ ...SYS, cable_rho_mode: 'manual', cable_rho20_cu: 0.0185, cable_rho20_al: 0.02826 }).ok, '', 'ok'));
    results.push(assert('REQ ρ: unknown source → invalid', R.system({ ...SYS, cable_rho_mode: 'foo' }).fields.cable_rho_mode === 'invalid', '', 'invalid'));
    const sTab = R.system({ ...SYS, cable_r_method: 'table', cable_rho_mode: null });
    const sTabOld = R.system({ ...SYS, cable_r_method: 'table' });
    results.push(assert('REQ ρ: table method needs no source, no note', sTab.ok && sTabOld.ok
      && Object.keys(sTab.notes).length === 0 && Object.keys(sTabOld.notes).length === 0, '', 'ok'));
    const sBad = R.system({ ...SYS, voltage: 0, freq: '55', tp: 0, station_name: '  ' });
    results.push(assert('REQ station: 0 kV, 55 Hz, Tp 0 invalid; blank name missing',
      sBad.fields.voltage === 'invalid' && sBad.fields.freq === 'invalid' && sBad.fields.tp === 'invalid'
      && sBad.fields.station_name === 'missing' && sBad.count === 4, JSON.stringify(sBad.fields), 'voltage,freq,tp,name'));

    // A new core of every type is blank and incomplete
    for (const t of ['overcurrent', 'metering', 'busbar', 'distance', 'transformer_diff', 'line_diff', 'generic', 'vt']) {
      const r = R.core({ kind: t === 'vt' ? 'vt' : 'ct', calc_type: t, inputs: {} });
      results.push(assert(`REQ blank ${t} core → incomplete, cable section marked`, !r.ok && r.count > 0
        && r.sections.cable > 0 && Object.values(r.fields).every((x) => x === 'missing'), r.count, '> 0'));
    }

    // Overcurrent: complete → ok; the class decides ALF or Vk
    const oc = { ...CT, ...RELAY, ...CABLE, ct_class_family: '5P', alf: 20 };
    results.push(assert('REQ overcurrent complete → ok', R.core({ kind: 'ct', calc_type: 'overcurrent', inputs: oc }).ok,
      keys(R.core({ kind: 'ct', calc_type: 'overcurrent', inputs: oc })), ''));
    const ocPx = R.core({ kind: 'ct', calc_type: 'overcurrent', inputs: { ...oc, ct_class_family: 'PX' } });
    results.push(assert('REQ PX class needs Vk, not ALF', keys(ocPx) === 'vk', keys(ocPx), 'vk'));
    const ocLegacy = R.core({ kind: 'ct', calc_type: 'overcurrent', inputs: { ...oc, ct_class_family: undefined, is_px: true, vk: 400 } });
    results.push(assert('REQ legacy is_px core counts as PX with its Vk', ocLegacy.ok, keys(ocLegacy), ''));
    // Generic (a file core, §10.6 F-GEN-PANEL): the values ct_generic.py
    // reads (Isr, Rct, Sn, class + ALF or Vk, cable); no Ip, no relay
    const gen = (inp) => R.core({ kind: 'ct', calc_type: 'generic', inputs: inp });
    const gn = { Is: 1, rct: 3, burden: 10, ...CABLE, ct_class_family: '5P', alf: 10 };
    results.push(assert('REQ generic complete (no Ip, no relay) → ok', gen(gn).ok, keys(gen(gn)), ''));
    results.push(assert('REQ generic blank: Is, rct, burden, class, ALF and the cable',
      keys(gen({})) === 'Is,alf,burden,cable_cross,cable_length,cable_mat,cable_topology,ct_class_family,rct', keys(gen({})),
      'Is,alf,burden,cable_cross,cable_length,cable_mat,cable_topology,ct_class_family,rct'));
    results.push(assert('REQ generic PX needs Vk', keys(gen({ ...gn, ct_class_family: 'PX' })) === 'vk', keys(gen({ ...gn, ct_class_family: 'PX' })), 'vk'));
    results.push(assert('REQ generic legacy is_px core (no class) with its Vk → ok',
      gen({ ...gn, ct_class_family: undefined, is_px: true, vk: 150 }).ok, keys(gen({ ...gn, ct_class_family: undefined, is_px: true, vk: 150 })), ''));
    // The class decides, as on the other class-row panels: a stored
    // is_px / is_px_class that disagrees with a picked class changes nothing
    const gSys = { cable_r_method: 'iec60287', cable_temp: 75 };
    const gRes = (inp) => JSON.stringify(CTCalc.calculate('generic', inp, gSys));
    results.push(assert('REQ generic class 5P with a stale is_px_class: the ALF path, as is_px false',
      gRes({ ...gn, is_px_class: true, is_px: true, vk: 150 }) === gRes(gn), 'differs', 'identical'));
    results.push(assert('REQ generic without a class: is_px / is_px_class as before (moduleCore unchanged)',
      gRes({ ...gn, ct_class_family: undefined, is_px_class: true, vk: 150 }) === JSON.stringify(CTPlausibility.apply('generic',
        { ...gn, ct_class_family: undefined, is_px_class: true, vk: 150 }, gSys,
        CTGeneric.calculate({ ...gn, ct_class_family: undefined, is_px_class: true, vk: 150 }, gSys))),
      'differs', 'identical'));
    const ocBad = R.core({ kind: 'ct', calc_type: 'overcurrent', inputs: { ...oc, Ip: 0, Is: 2, cable_cross: 3, relay_tal: 600 } });
    results.push(assert('REQ out of range / not an option → invalid (optional t_al too)',
      keys(ocBad) === 'Ip,Is,cable_cross,relay_tal' && Object.values(ocBad.fields).every((x) => x === 'invalid')
      && ocBad.sections.ct === 2 && ocBad.sections.cable === 1 && ocBad.sections.relay === 1, keys(ocBad), 'Ip,Is,cable_cross,relay_tal'));

    // Metering: Smin% only for a custom class without the extended range;
    // the bay's connection power (#155) on every metering core
    const mt = { ...CT, burden: 5, fs_factor: 5, meter_manufacturer: 'CEWE', device_burden: 0.1, min_safety_factor: 20,
      ...CABLE, attached_resistor: 0 };
    const CONN = { connection: { sn_mva: 400 } };
    const mtReq = (inputs, f = CONN) => R.core({ kind: 'ct', calc_type: 'metering', inputs }, f);
    const mtCustom = mtReq({ ...mt, mt_class: 'custom' });
    results.push(assert('REQ metering custom class needs Smin%', keys(mtCustom) === 'min_burden_percent', keys(mtCustom), 'min_burden_percent'));
    results.push(assert('REQ metering class 0.2S: Smin% from the class → ok',
      mtReq({ ...mt, mt_class: '0.2S' }).ok, '', ''));
    results.push(assert('REQ metering extended range: no Smin% → ok',
      mtReq({ ...mt, mt_class: 'custom', extended_burden_range: true }).ok, '', ''));
    const mtNoClass = mtReq({ ...mt, min_burden_percent: 25 });
    results.push(assert('REQ metering: the accuracy class must be picked', keys(mtNoClass) === 'mt_class', keys(mtNoClass), 'mt_class'));
    const mtNoR = mtReq({ ...mt, mt_class: '0.2', attached_resistor: undefined });
    results.push(assert('REQ metering: the attached resistor must be entered (0 is a value)',
      keys(mtNoR) === 'attached_resistor', keys(mtNoR), 'attached_resistor'));
    const mtNoConn = mtReq({ ...mt, mt_class: '0.2S' }, { connection: {} });
    results.push(assert('REQ metering #155: the connection power (bay) is required',
      keys(mtNoConn) === 'sn_mva' && mtNoConn.fields.sn_mva === 'missing' && mtNoConn.sections.conn === 1, keys(mtNoConn), 'sn_mva'));
    results.push(assert('REQ metering #155 without its bay: the connection power counts as missing (fails closed)',
      keys(mtReq({ ...mt, mt_class: '0.2S' }, null)) === 'sn_mva', keys(mtReq({ ...mt, mt_class: '0.2S' }, null)), 'sn_mva'));
    const mtBadConn = [0, -5, 6000, '45'].map((x) => mtReq({ ...mt, mt_class: '0.2S' }, { connection: { sn_mva: x } }).fields.sn_mva);
    results.push(assert('REQ metering #155: 0, negative, above 5000 MVA or text → invalid',
      mtBadConn.every((x) => x === 'invalid'), mtBadConn.join(), 'invalid ×4'));

    // Distance: line data (on the bay, #133) and, with AR, t_al and the AR card
    const dist = { ...CT, ...RELAY, ...CABLE, ct_class_family: '5P', alf: 20, zone1_setting: 0.85 };
    const LINEB = { r_per_km: 0.04, x_per_km: 0.2, line_length: 10 };
    const bayOf = (type, inputs, extra = {}) => ({ id: 'b', name: 'Bay', feeder_type: type === 'distance' ? 'line' : 'transformer',
      devices: [{ id: 'd', name: 'Dev', cores: [{ id: 'c', kind: 'ct', calc_type: type, inputs }] }], ...extra });
    const dBay = bayOf('distance', dist, { line: LINEB });
    const dNoLine = R.core({ kind: 'ct', calc_type: 'distance', inputs: dist }, bayOf('distance', dist, { line: { ...LINEB, line_length: undefined } }));
    results.push(assert('REQ distance: line data (bay) required', keys(dNoLine) === 'line_length' && dNoLine.sections.line === 1,
      keys(dNoLine), 'line_length'));
    const dNoBay = R.core({ kind: 'ct', calc_type: 'distance', inputs: dist });
    results.push(assert('REQ distance without its bay: the line data count as missing (fails closed)',
      keys(dNoBay) === 'line_length,r_per_km,x_per_km', keys(dNoBay), 'line_length,r_per_km,x_per_km'));
    const dKlim = R.core({ kind: 'ct', calc_type: 'distance', inputs: { ...dist, zone1_setting: undefined } }, dBay);
    results.push(assert('REQ distance: Klim stays on the core', keys(dKlim) === 'zone1_setting', keys(dKlim), 'zone1_setting'));
    const dAr = R.core({ kind: 'ct', calc_type: 'distance', inputs: { ...dist, auto_reclose_enabled: true } }, dBay);
    results.push(assert('REQ distance AR on: t_al and the AR inputs required',
      keys(dAr) === 'ar_ktf_preset,ar_t_prime,ar_tfr,ar_ts_mode,relay_tal' && dAr.sections.ar === 4, keys(dAr), 'AR + t_al'));
    const dArManual = R.core({ kind: 'ct', calc_type: 'distance', inputs: { ...dist, auto_reclose_enabled: true, relay_tal: 25,
      ar_t_prime: 0.1, ar_tfr: 0.4, ar_ts_mode: 'manual', ar_ktf_preset: 'iec_default' } }, dBay);
    results.push(assert('REQ distance AR manual Ts needs Ts', keys(dArManual) === 'ar_ts', keys(dArManual), 'ar_ts'));
    results.push(assert('REQ distance AR off: AR inputs not required, t_al optional',
      R.core({ kind: 'ct', calc_type: 'distance', inputs: dist }, dBay).ok, '', ''));
    // W7 (PORTING_PLAN.md §10.7): the C-O-C-O windows are the IED's measurement
    // time. A custom relay without one is not ready (no 25 ms default); a
    // picked IED fills it (CTRelayDB.apply) and the core is ready.
    const AR_IN = { auto_reclose_enabled: true, ar_t_prime: 0.1, ar_tfr: 0.4, ar_ts_mode: 'table', ar_ktf_preset: 'iec_default' };
    for (const [t, ied, pick, ms] of [['distance', 'SIPROTEC 5 7SA87', {}, 30], ['line_diff', 'SIPROTEC 5 7SD87', { relay_function: 'idiff' }, 12]]) {
      const inputs = { ...(t === 'distance' ? dist : { ...CT, ...RELAY, ...CABLE, ct_class_family: '5P', alf: 20 }), ...AR_IN };
      const bay = t === 'distance' ? bayOf(t, inputs, { line: LINEB }) : bayOf(t, inputs);
      const custom = { kind: 'ct', calc_type: t, inputs };
      const picked = { ...custom, inputs: CTRelayDB.apply({ ...inputs, ...pick, relay_model: ied }, t, '50') };
      results.push(assert(`REQ W7 ${t} AR, custom relay without t_al: only relay_tal missing, not ready; IED ${ied} picked: t_al ${picked.inputs.relay_tal} ms, ready`,
        keys(R.core(custom, bay)) === 'relay_tal' && R.core(custom, bay).fields.relay_tal === 'missing' && !R.ready(custom, SYS, bay)
          && picked.inputs.relay_tal === ms && R.ready(picked, SYS, bay),
        `${keys(R.core(custom, bay))} / ${R.ready(picked, SYS, bay)}`, 'relay_tal / true'));
    }
    // The operate-time choices of an IED with operate times (calc/relays.js)
    // are required as t_al is: with AR on distance / line diff, else optional
    {
      const inputs = { ...CT, ...RELAY, ...CABLE, ct_class_family: '5P', alf: 20, ...AR_IN };
      const bay = bayOf('line_diff', inputs);
      const ld = (extra) => R.core({ kind: 'ct', calc_type: 'line_diff',
        inputs: CTRelayDB.apply({ ...inputs, relay_model: 'SIPROTEC 5 7SD87', ...extra }, 'line_diff', '50') }, bay);
      const noFn = ld({}), fast2 = ld({ relay_function: 'idiff_fast_2' }), fast2d = ld({ relay_function: 'idiff_fast_2', relay_network_delay: 6 });
      results.push(assert('REQ 7SD87 line diff AR: function missing (and so t_al); IDIFF FAST 2 needs the network delay; then ready',
        keys(noFn) === 'relay_function,relay_tal' && keys(fast2) === 'relay_network_delay,relay_tal' && fast2d.ok
          && ld({ relay_function: 'gone' }).fields.relay_function === 'invalid',
        `${keys(noFn)} | ${keys(fast2)} | ${fast2d.ok}`, 'relay_function,relay_tal | relay_network_delay,relay_tal | true'));
      const ocCore = (extra) => R.core({ kind: 'ct', calc_type: 'overcurrent',
        inputs: CTRelayDB.apply({ ...oc, relay_model: 'SIPROTEC 5 7SJ86', ...extra }, 'overcurrent', '50') });
      const ocFn = ocCore({ relay_function: 'overcurrent' });
      results.push(assert('REQ 7SJ86 overcurrent: function and inrush detection optional (t_al not used); a bad value is invalid',
        ocCore({}).ok && ocFn.ok && !('relay_tal' in CTRelayDB.apply({ ...oc, relay_model: 'SIPROTEC 5 7SJ86', relay_function: 'overcurrent' }, 'overcurrent', '50'))
          && ocCore({ relay_function: 'overcurrent', relay_inrush: 'yes' }).fields.relay_inrush === 'invalid'
          && ocCore({ relay_function: 'overcurrent', relay_inrush: true }).ok,
        keys(ocFn), ''));
    }

    // Transformer differential: the bay's Sr, Z%, k and the linked winding's Ur and Isc,max,int (#133)
    const tdIn = { ...CT, ...RELAY, ...CABLE, ct_class_family: '5P', alf: 20 };
    const td = R.core({ kind: 'ct', calc_type: 'transformer_diff', inputs: tdIn }, bayOf('transformer_diff', tdIn));
    results.push(assert('REQ transformer diff, blank bay: Sr, Z%, k and the linked winding', td.sections.trafo === 4
      && keys(td) === 'inrush_factor,linked_winding,sr_mva,z_percent', keys(td), 'trafo'));
    const tdHV = { ...tdIn, linked_winding: 'HV' };
    const TB = { sr_mva: 160, z_percent: 7.92, inrush_factor: 8, ur_kv_HV: 150, isc_int_HV: 40000 };
    const tdBayHV = bayOf('transformer_diff', tdHV, { transformer: TB });
    const tdr = R.core({ kind: 'ct', calc_type: 'transformer_diff', inputs: tdHV }, tdBayHV);
    const bb = R.bay(tdBayHV);
    results.push(assert('REQ transformer diff: an HV core needs only HV; the bay is marked for the winding count and LV',
      tdr.ok && keys(bb) === 'isc_int_LV,ur_kv_LV,winding_count' && bb.sections.trafo === 3, `${keys(tdr)} | ${keys(bb)}`, 'core ok'));
    const tdLV = R.core({ kind: 'ct', calc_type: 'transformer_diff', inputs: { ...tdIn, linked_winding: 'LV' } }, tdBayHV);
    results.push(assert('REQ transformer diff: an LV core needs the LV winding', keys(tdLV) === 'isc_int_LV,ur_kv_LV', keys(tdLV), 'LV'));
    const bay2 = bayOf('transformer_diff', { ...tdIn, linked_winding: 'TV' }, { transformer: { ...TB, winding_count: '2' } });
    results.push(assert('REQ transformer diff: TV in a two-winding transformer is invalid; three windings ask for TV',
      R.core({ kind: 'ct', calc_type: 'transformer_diff', inputs: { ...tdIn, linked_winding: 'TV' } }, bay2).fields.linked_winding === 'invalid'
        && keys(R.bay(bayOf('transformer_diff', tdHV, { transformer: { ...TB, winding_count: '3' } }))) === 'isc_int_LV,isc_int_TV,ur_kv_LV,ur_kv_TV',
      '', 'invalid / TV'));
    results.push(assert('REQ a bay with no transformer_diff / distance core needs no bay data',
      R.bay(bayOf('overcurrent', oc)).ok && R.bay({ devices: [] }).ok, '', 'ok'));

    // VT core: the kind decides
    const vt = { secondary_voltage: 100, vt_class: '0.2', burden: 10, thermal_burden: 50, vt_burden_range: 'I',
      meter_manufacturer: 'CEWE', vt_supply_mode: 'aux', device_burden: 0.1, ...CABLE, attached_resistor: 0 };
    results.push(assert('REQ VT complete → ok', R.core({ kind: 'vt', calc_type: 'vt', inputs: vt }).ok, '', ''));
    const vtNoRange = R.core({ kind: 'vt', calc_type: 'overcurrent', inputs: { ...vt, vt_burden_range: undefined } });
    results.push(assert('REQ VT core (kind vt): the burden range must be picked', keys(vtNoRange) === 'vt_burden_range',
      keys(vtNoRange), 'vt_burden_range'));

    // ready(): station and core both complete
    const ocCore = { kind: 'ct', calc_type: 'overcurrent', inputs: oc };
    results.push(assert('REQ ready needs the station data too', R.ready(ocCore, SYS) && !R.ready(ocCore, { ...SYS, tp: null }),
      '', ''));

    // A complete core of every type calculates (no module default is needed)
    const full = {
      overcurrent: oc,
      busbar: { ...CT, ...RELAY, ...CABLE, alf: 20 },
      metering: { ...mt, mt_class: '0.2' },
      distance: dist,
      transformer_diff: { ...CT, ...RELAY, ...CABLE, ct_class_family: '5P', alf: 20, linked_winding: 'HV' },
      line_diff: { ...CT, ...RELAY, ...CABLE, ct_class_family: '5P', alf: 20 },
      vt,
    };
    const fullBay = { distance: dBay, transformer_diff: bayOf('transformer_diff', full.transformer_diff,
      { transformer: { sr_mva: 160, z_percent: 14, inrush_factor: 8, winding_count: '2', ur_kv_HV: 132, isc_int_HV: 20000, ur_kv_LV: 33, isc_int_LV: 20000 } }),
      metering: bayOf('metering', full.metering, CONN) };
    for (const [t, inputs] of Object.entries(full)) {
      const c = { kind: t === 'vt' ? 'vt' : 'ct', calc_type: t, inputs };
      const f = fullBay[t] || bayOf(t, inputs);
      const r = R.ready(c, SYS, f) ? CTCalc.calculate(t, inputs, CTBay.commonData(SYS, f)) : null;
      results.push(assert(`REQ complete ${t} core is ready and calculates`, r != null && typeof r.is_ok === 'boolean',
        r ? r.status : keys(R.core(c, f)), 'a result'));
    }
    results.push(assert('REQ the complete bays are complete', R.bay(fullBay.distance).ok && R.bay(fullBay.transformer_diff).ok
      && R.bay(fullBay.metering).ok, '', 'ok'));
    const mtBayBlank = R.bay(bayOf('metering', full.metering));
    results.push(assert('REQ #155 a bay with a metering CT core: its card asks for the connection power',
      keys(mtBayBlank) === 'sn_mva' && mtBayBlank.sections.conn === 1, keys(mtBayBlank), 'sn_mva'));
    return results;
  }

  // ── METERING RATIO (#155, calc/metering.js cond. 3): Ipr against the
  // connection's load current In = Sn,conn / (√3·U) ─────────────────────
  function testMeteringRatio() {
    const results = [];
    const M = CTMetering;
    const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
    const std = [[0.8, 1], [9, 10], [10, 10], [10.01, 12.5], [157.46, 200], [200, 200], [201, 250], [399, 400],
      [401, 500], [740, 750], [790, 1000], [1250, 1250], [1251, 1500], [6001, 7500], [7501, 10000]];
    const got = std.map(([i]) => M.standardIpr(i));
    results.push(assert('MR standard Ipr (IEC 61869-2 5.3.201: 10, 12.5, 15, 20, 25, 30, 40, 50, 60, 75 × 10ⁿ)',
      got.every((x, k) => x === std[k][1]), got.join(), std.map((x) => x[1]).join()));
    results.push(assert('MR no standard Ipr for 0 / NaN', M.standardIpr(0) === null && M.standardIpr(NaN) === null, '', 'null'));
    results.push(assert('MR In = Sn / (√3·U): 45 MVA at 165 kV = 157.46 A',
      near(M.loadCurrent(45, 165), 45000 / (Math.sqrt(3) * 165)) && Math.abs(M.loadCurrent(45, 165) - 157.46) < 0.01,
      M.loadCurrent(45, 165), '157.46'));

    const core = { Ip: 2000, Is: 1, rct: 2, burden: 5, mt_class: '0.2S', fs_factor: 5, extended_burden_range: true,
      device_burden: 0.1, min_safety_factor: 20, attached_resistor: 0,
      cable_length: 100, cable_cross: 4, cable_mat: 'cu', cable_topology: 'six_wire' };
    const sys = { voltage: 165, cable_r_method: 'iec60287', cable_temp: 20 };
    const run = (Ip, mva = 45, s = sys) => M.calculate({ ...core, Ip }, { ...s, remote_end: mva == null ? undefined : { connection_mva: mva } });
    const keys = (r) => r.warnings.map((w) => w[0]);
    const base = run(200, null);

    // The issue's case: a 45 MVA connection at 165 kV must not have a 2000/1 CT
    const r2000 = run(2000);
    results.push(assert('MR #155 45 MVA at 165 kV, 2000/1: cond. 3 fails, the core is NOT OK',
      r2000.cond3 === false && !r2000.is_ok && r2000.status === 'NOT_OK' && keys(r2000).includes('warning_ipr_above_standard')
        && r2000.Ipr_std === 200, `${r2000.cond3}/${r2000.status}/${keys(r2000)}`, 'false/NOT_OK/warning_ipr_above_standard'));
    const w = r2000.warnings.find((x) => x[0] === 'warning_ipr_above_standard');
    results.push(assert('MR remark args: Ipr, In, Sn,conn, U, Ipr,std (entered / rated values as text), In / Ipr %',
      w[1] === '2000' && near(w[2], r2000.I_load) && w[3] === '45' && w[4] === '165' && w[5] === '200' && w[6] === 7.9,
      JSON.stringify(w), '["2000", In, "45", "165", "200", 7.9]'));
    const r200 = run(200);
    results.push(assert('MR 200/1: the nearest standard value over the load → cond. 3 OK, verdict as cond. 1 ∧ cond. 2',
      r200.cond3 === true && r200.is_ok === (r200.cond1 && r200.cond2) && !keys(r200).some((k) => /ipr/.test(k)), `${r200.cond3}/${r200.is_ok}`, 'true'));
    const r175 = run(175);
    results.push(assert('MR 175 A (between In and the standard value) → OK', r175.cond3 === true, r175.cond3, 'true'));
    const r150 = run(150);
    results.push(assert('MR 150/1 below the load (157 A) → cond. 3 fails with warning_ipr_below_load',
      r150.cond3 === false && !r150.is_ok && keys(r150).includes('warning_ipr_below_load') && !keys(r150).includes('warning_ipr_above_standard'),
      `${r150.cond3}/${keys(r150)}`, 'false/warning_ipr_below_load'));
    const r250 = run(250);
    results.push(assert('MR 250/1 above the nearest standard value 200 A → fails', r250.cond3 === false, r250.cond3, 'false'));
    // In on a standard value: Ipr = In is the nearest
    const mvaAt400 = 400 * Math.sqrt(3) * 165 / 1000;
    results.push(assert('MR In exactly 400 A: Ipr 400 OK, 500 fails', run(400, mvaAt400).cond3 === true && run(500, mvaAt400).cond3 === false
      && run(400, mvaAt400).Ipr_std === 400, `${run(400, mvaAt400).cond3}/${run(500, mvaAt400).cond3}`, 'true/false'));

    // Steps: In, Ipr,std and cond. 3, and the conclusion names cond. 3
    const sk = r2000.steps.map((x) => x.key);
    const concl = r2000.steps.find((x) => x.key === 'conclusion');
    results.push(assert('MR steps i_load, ipr_std, cond3 before the conclusion',
      ['i_load', 'ipr_std', 'cond3'].every((k) => sk.includes(k)) && sk.indexOf('cond3') < sk.indexOf('conclusion')
        && /Cond\.3/.test(concl.latex) && /✗$/.test(concl.comparison.trim()), sk.join(), 'i_load,ipr_std,cond3'));

    // Not evaluated without the connection power or the voltage: cond3 null,
    // no step, no remark — the calculation is the one before #155
    const noV = run(2000, 45, { ...sys, voltage: undefined });
    results.push(assert('MR without the connection power / the voltage: cond. 3 not evaluated',
      base.cond3 === null && noV.cond3 === null && base.I_load === null && !base.steps.some((x) => x.key === 'cond3')
        && !/Cond\.3/.test(base.steps.find((x) => x.key === 'conclusion').latex), `${base.cond3}/${noV.cond3}`, 'null/null'));
    const { steps: s1, ...a } = M.calculate({ ...core, Ip: 2000 }, sys);
    const { steps: s2, ...b } = run(2000, null);
    results.push(assert('MR no connection: the result is unchanged by the new code path', JSON.stringify(a) === JSON.stringify(b), '', 'identical'));

    // The bay carries it to the calculation (CTBay.remoteEnd → connection_mva)
    const bay = { id: 'b', name: 'K1', devices: [{ id: 'd', cores: [{ id: 'c', kind: 'ct', calc_type: 'metering', inputs: core }] }],
      connection: { sn_mva: 45 } };
    const cd = CTBay.commonData(sys, bay);
    const viaBay = CTCalc.calculate('metering', core, cd);
    results.push(assert('MR the bay\'s connection power reaches the calc (CTBay.commonData)',
      cd.remote_end.connection_mva === 45 && viaBay.cond3 === false && viaBay.Ipr_std === 200, JSON.stringify(cd.remote_end), '{ connection_mva: 45 }'));
    results.push(assert('MR the remarks are CTSizer-only (EXTRA_WARNINGS)',
      M.EXTRA_WARNINGS.includes('warning_ipr_below_load') && M.EXTRA_WARNINGS.includes('warning_ipr_above_standard'), '', 'listed'));
    return results;
  }

  // ── BAY DATA (#133, calc/bay.js): transformer and line data on the bay ──
  function testBay() {
    const results = [];
    const B = CTBay;
    const td = (id, inputs, name = id) => ({ id, name, kind: 'ct', calc_type: 'transformer_diff', inputs });
    const feeder = (cores, extra = {}) => ({ id: 'f', name: 'T1', feeder_type: 'transformer',
      devices: [{ id: 'd', name: '87T', device_type: 'transformer_diff', cores }], ...extra });
    // Mapping: entered values only, no Ir / isc_ext
    const T = { sr_mva: 160, z_percent: 7.92, inrush_factor: 8, winding_count: '2', ur_kv_HV: 150, isc_int_HV: 40000, ur_kv_LV: 60, isc_int_LV: 32000 };
    const f1 = feeder([td('hv', { linked_winding: 'HV' }), td('lv', { linked_winding: 'LV' })], { transformer: T });
    const re = B.remoteEnd(f1);
    results.push(assert('BAY remote end: the entered values plus Isc,max,ext per winding (#134), no Ir',
      re.transformer_data.mva === 160 && re.transformer_data.z_percent === 7.92 && re.transformer_data.inrush_factor === 8
        && re.transformer_data.windings.HV.voltage === 150 && re.transformer_data.windings.HV.isc_int === 40000
        && re.transformer_data.windings.HV.isc_ext.toFixed(1) === '7775.8' && re.transformer_data.windings.LV.isc_ext.toFixed(1) === '19439.4'
        && !('Ir' in re.transformer_data.windings.HV) && !('TV' in re.transformer_data.windings),
      JSON.stringify(re), 'mva, z, k, HV/LV + isc_ext'));
    // #134: Ir and Isc,max,ext per winding (REF160 160 MVA, 150 / 60 kV, Z 7.92 %)
    const wc = B.windingCurrents(f1);
    results.push(assert('BAY windingCurrents REF160: Ir 615.8 / 1539.6 A, Isc,max,ext 7.776 / 19.439 kA',
      wc.HV.ir_a.toFixed(1) === '615.8' && wc.LV.ir_a.toFixed(1) === '1539.6' && (wc.HV.isc_ext_a / 1000).toFixed(3) === '7.776'
        && (wc.LV.isc_ext_a / 1000).toFixed(3) === '19.439' && !('TV' in wc), JSON.stringify(wc), '7.776 / 19.439'));
    // #134: no hidden It,max = 10000 A: transformer data without Z% gives no Isc,max,ext and no calculation
    const SYS134 = { voltage: 150, freq: '50', isc_sys: 40, tp: 100, cable_r_method: 'table', cable_temp: 25 };
    const noZ = CTCalc.calculate('transformer_diff', { Ip: 750, Is: 1, rct: 2.402, burden: 30, alf: 30, relay_burden: 0.1, linked_winding: 'HV',
      cable_length: 150, cable_cross: 4, cable_mat: 'cu', cable_topology: 'six_wire' },
      { ...SYS134, remote_end: { transformer_data: { mva: 160, windings: { HV: { voltage: 150, isc_int: 40000 } } } } });
    results.push(assert('BAY #134 no Z%: Isc,max,ext missing → not calculated, warned (no 10000 A fallback)',
      noZ && noZ.isc_ext_missing === true && noZ.is_ok === false && noZ.steps.length === 0
        && JSON.stringify(noZ.warnings) === '[["warning_isc_ext_missing"]]', JSON.stringify(noZ && noZ.warnings), 'isc_ext_missing'));
    const stp = CTCalc.calculate('transformer_diff', { Ip: 750, Is: 1, rct: 2.402, burden: 30, alf: 30, relay_burden: 0.1, relay_name: 'SIPROTEC 5 7UT86',
      linked_winding: 'HV', cable_length: 150, cable_cross: 4, cable_mat: 'cu', cable_topology: 'six_wire' }, B.commonData(SYS134, f1))
      .steps.find((x) => x.key === 'through_fault_current');
    results.push(assert('BAY #134 REF160 HV step: Isc,max,ext = Ir / (Z%/100) = 7.776 kA, labels EN/DA, substitution',
      stp && stp.result.toFixed(3) === '7.776' && stp.unit === 'kA' && stp.label_en.includes('HV winding') && stp.label_da.includes('HV-vikling')
        && stp.substitution === 'Ir = 160 MVA / (√3 · 150 kV) = 615.8 A; Isc,max,ext = 615.8 A / (7.92 / 100) = 7.776 kA',
      stp && stp.substitution, '7.776 kA'));
    results.push(assert('BAY windingCurrents: none without Sr; no Isc,max,ext without Z%',
      Object.keys(B.windingCurrents({ transformer: { ur_kv_HV: 150 } })).length === 0
        && B.windingCurrents({ transformer: { sr_mva: 160, ur_kv_HV: 150 } }).HV.isc_ext_a === null
        && B.windingCurrents({ transformer: { sr_mva: 160, ur_kv_HV: 150, z_percent: 0.5 } }).HV.isc_ext_a === null, '', 'none (also for Z% out of range)'));
    const SYS = { voltage: 150, freq: '50', isc_sys: 40, tp: 100, cable_r_method: 'table', cable_temp: 25 };
    results.push(assert('BAY commonData: the station data plus the remote end; the system itself without bay data',
      B.commonData(SYS, f1).remote_end === undefined ? false : B.commonData(SYS, f1).voltage === 150
        && B.commonData(SYS, { devices: [] }) === SYS, '', 'spread'));
    // REF160: Ir and Isc,max,ext derived as the per-core path does
    const hvD = CTTransformerDiff.data.extractTransformerData(B.commonData(SYS, f1), { linked_winding: 'HV' });
    const lvD = CTTransformerDiff.data.extractTransformerData(B.commonData(SYS, f1), { linked_winding: 'LV' });
    const hvC = CTTransformerDiff.data.applyBackwardsCompatibility(SYS, { trafo_power_mva: 160, trafo_voltage_kv: 150, trafo_z_percent: 7.92,
      inrush_factor: 8, trafo_ik_max: 40000 }, 'HV');
    results.push(assert('BAY REF160: HV Ir 0.6158 kA, It,max 7775.8 A, Isc,int 40 kA — the same floats as the per-core path',
      JSON.stringify(hvD) === JSON.stringify(hvC) && hvD[5].toFixed(1) === '7775.8', JSON.stringify(hvD), JSON.stringify(hvC)));
    results.push(assert('BAY REF160: LV It,max 19439.4 A at 60 kV, Isc,int 32 kA', lvD[5].toFixed(1) === '19439.4' && lvD[6] === 32000,
      JSON.stringify(lvD), '19439.4'));
    // Line
    const dist = (id, inputs) => ({ id, name: id, kind: 'ct', calc_type: 'distance', inputs });
    const lf = { id: 'l', name: 'L1', feeder_type: 'line', devices: [{ id: 'a', name: 'A', cores: [dist('a1', { zone1_setting: 0.85 })] },
      { id: 'b', name: 'B', cores: [dist('b1', { zone1_setting: 0.8 })] }], line: { r_per_km: 0.0423, x_per_km: 0.203, line_length: 6.4 } };
    results.push(assert('BAY line: R′L, X′L, lL as the remote end', JSON.stringify(B.remoteEnd(lf)) === JSON.stringify({ R_L_per_km: 0.0423, X_L_per_km: 0.203, lL: 6.4 }),
      JSON.stringify(B.remoteEnd(lf)), 'R_L, X_L, lL'));

    // Migration: agree → lifted, keys stripped; linked_winding / Klim stay
    const old = feeder([
      td('hv', { Ip: 600, trafo_power_mva: 100, trafo_z_percent: 12, inrush_factor: 8, trafo_voltage_kv: 132, trafo_ik_max: 31500, linked_winding: 'HV' }, 'CT Core HV'),
      td('lv', { Ip: 3000, trafo_power_mva: 100, trafo_z_percent: 12, inrush_factor: 8, trafo_voltage_kv: 33, trafo_ik_max: 25000, linked_winding: 'LV' }, 'CT Core LV'),
    ]);
    const m = B.migrateFeeder(old);
    const mc = m.devices[0].cores;
    results.push(assert('BAY migrate, cores agree: Sr / Z% / k once, each winding from its core, keys removed',
      JSON.stringify(m.transformer) === JSON.stringify({ sr_mva: 100, z_percent: 12, inrush_factor: 8, ur_kv_HV: 132, isc_int_HV: 31500, ur_kv_LV: 33, isc_int_LV: 25000 })
        && JSON.stringify(mc[0].inputs) === JSON.stringify({ Ip: 600, linked_winding: 'HV' }) && !m.bay_notes && !('winding_count' in m.transformer),
      JSON.stringify([m.transformer, mc[0].inputs, m.bay_notes]), 'lifted'));
    results.push(assert('BAY migrate is idempotent; a feeder with nothing to lift is returned as is',
      B.migrateFeeder(m) === m && B.migrateFeeder(f1) === f1 && B.migrateFeeders([f1]).length === 1, '', 'same'));
    // Conflict: never picked silently
    const conf = feeder([
      td('hv', { trafo_power_mva: 160, trafo_z_percent: 12, inrush_factor: 8, trafo_voltage_kv: 150, trafo_ik_max: 40000, linked_winding: 'HV', trafo_it_max: 7770 }, 'HV'),
      td('lv', { trafo_power_mva: 100, trafo_z_percent: 12, trafo_voltage_kv: 60, linked_winding: 'LV' }, 'LV'),
      td('x', { trafo_voltage_kv: 132 }, 'X'),
    ]);
    const mx = B.migrateFeeder(conf);
    const note = (k) => (mx.bay_notes || []).find((n) => n.kind === k);
    results.push(assert('BAY migrate conflict: Sr 160 / 100 left blank with a note naming both and their cores',
      !('sr_mva' in mx.transformer) && mx.transformer.z_percent === 12 && mx.transformer.inrush_factor === 8
        && JSON.stringify(note('conflict')) === JSON.stringify({ kind: 'conflict', part: 'transformer', field: 'sr_mva',
          values: [{ value: 160, cores: ['87T › HV'] }, { value: 100, cores: ['87T › LV'] }] }),
      JSON.stringify(mx.bay_notes), 'conflict note'));
    results.push(assert('BAY migrate: a core without a linked winding keeps its Ur (note); the It,max override is dropped (note)',
      note('unlinked').core === '87T › X' && note('unlinked').values.ur_kv === 132 && mx.devices[0].cores[2].inputs.trafo_voltage_kv === 132
        && note('unused').value === 7770 && !('trafo_it_max' in mx.devices[0].cores[0].inputs), JSON.stringify(mx.bay_notes), 'notes'));
    const conflictCores = [mx.devices[0].cores[0], mx.devices[0].cores[1]].map((c) => CTRequired.core(c, mx));
    results.push(assert('BAY migrate conflict: both cores incomplete (sr_mva missing) until the bay value is entered',
      conflictCores.every((r) => r.fields.sr_mva === 'missing'), conflictCores.map((r) => Object.keys(r.fields).join(',')).join(' | '), 'sr_mva'));
    const fixed = B.setField(mx, 'sr_mva', 160);
    results.push(assert('BAY setField: entering the value drops its conflict note, the other notes stay',
      fixed.transformer.sr_mva === 160 && !fixed.bay_notes.some((n) => n.kind === 'conflict') && fixed.bay_notes.length === 2
        && B.dismissNote(B.dismissNote(fixed, 0), 0).bay_notes === undefined, JSON.stringify(fixed.bay_notes), 'conflict gone'));
    // #133 review: an invalid value on an incomplete core does not vote (note), so it cannot block the agreeing cores
    const inv = B.migrateFeeder(feeder([
      td('a', { trafo_power_mva: 100, trafo_z_percent: 12, inrush_factor: 8, trafo_voltage_kv: 132, trafo_ik_max: 20000, linked_winding: 'HV' }, 'A'),
      td('b', { trafo_power_mva: 0, inrush_factor: 'x', linked_winding: 'LV' }, 'B')]));
    results.push(assert('BAY migrate: out-of-range / text values do not vote (invalid notes), the valid ones are lifted',
      inv.transformer.sr_mva === 100 && inv.transformer.inrush_factor === 8 && inv.bay_notes.filter((n) => n.kind === 'invalid').length === 2
        && !inv.bay_notes.some((n) => n.kind === 'conflict'),
      JSON.stringify(inv.bay_notes), 'invalid notes'));
    // Text in a bay field (hand-edited file) is invalid, never silently replaced by a calc default
    const txt = feeder([td('hv', { linked_winding: 'HV' })], { transformer: { sr_mva: '100', z_percent: 12, inrush_factor: 8, ur_kv_HV: 132, isc_int_HV: 20000 } });
    results.push(assert('BAY text value "100" in Sr → invalid (marked), the core not ready',
      CTRequired.core(txt.devices[0].cores[0], txt).fields.sr_mva === 'invalid' && CTRequired.bay(txt).fields.sr_mva === 'invalid', '', 'invalid'));
    // Two HV cores that disagree on Ur: the LV core still calculates
    const two = B.migrateFeeder(feeder([
      td('a', { trafo_power_mva: 100, trafo_z_percent: 12, inrush_factor: 8, trafo_voltage_kv: 132, trafo_ik_max: 20000, linked_winding: 'HV' }),
      td('b', { trafo_power_mva: 100, trafo_z_percent: 12, inrush_factor: 8, trafo_voltage_kv: 150, trafo_ik_max: 20000, linked_winding: 'HV' }),
      td('c', { trafo_power_mva: 100, trafo_z_percent: 12, inrush_factor: 8, trafo_voltage_kv: 33, trafo_ik_max: 20000, linked_winding: 'LV' })]));
    results.push(assert('BAY migrate: HV Ur 132 / 150 conflict; HV cores blocked, LV core complete',
      !('ur_kv_HV' in two.transformer) && two.transformer.isc_int_HV === 20000
        && CTRequired.core(two.devices[0].cores[0], two).fields.ur_kv_HV === 'missing'
        && !CTRequired.core(two.devices[0].cores[2], two).sections.trafo,
      JSON.stringify(two.transformer), 'HV conflict'));
    // Line migration: agree and conflict; Klim stays
    const lo = { id: 'l', name: 'L', feeder_type: 'line', devices: [
      { id: 'a', name: 'A', cores: [dist('a1', { r_per_km: 0.04, x_per_km: 0.2, line_length: 10, zone1_setting: 0.85 })] },
      { id: 'b', name: 'B', cores: [dist('b1', { r_per_km: 0.04, x_per_km: 0.2, line_length: 12, zone1_setting: 0.8 })] }] };
    const ml = B.migrateFeeder(lo);
    results.push(assert('BAY migrate line: R′L / X′L lifted, lL 10 / 12 conflict, Klim per core',
      ml.line.r_per_km === 0.04 && ml.line.x_per_km === 0.2 && !('line_length' in ml.line)
        && ml.bay_notes[0].field === 'line_length' && ml.devices[0].cores[0].inputs.zone1_setting === 0.85
        && JSON.stringify(ml.devices[1].cores[0].inputs) === JSON.stringify({ zone1_setting: 0.8 }), JSON.stringify(ml), 'line'));
    // Results unchanged for migrated cores that agreed (e2e golden cases): bit-identical, steps included
    const G = (typeof CT_GOLDEN !== 'undefined' && CT_GOLDEN.e2e) ? CT_GOLDEN.e2e : null;
    if (G) {
      for (const c of G.cases.filter((x) => x.calc_type === 'transformer_diff' || x.calc_type === 'distance')) {
        for (const withIk of c.calc_type === 'transformer_diff' ? [false, true] : [false]) {
          const inputs = withIk ? { ...c.inputs, trafo_ik_max: c.system.isc_sys * 1000 } : c.inputs;
          const f = B.migrateFeeder({ id: 'f', name: 'F', feeder_type: 'line', devices: [{ id: 'd', name: 'D',
            cores: [{ id: 'c', name: 'C', kind: 'ct', calc_type: c.calc_type, inputs }] }] });
          const before = CTCalc.calculate(c.calc_type, inputs, c.system);
          const after = CTCalc.calculate(c.calc_type, f.devices[0].cores[0].inputs, B.commonData(c.system, f));
          // the bay adds only the Isc,max,ext step (#134); every result value is identical
          const plain = (r) => r && JSON.stringify({ ...r, steps: r.steps.filter((x) => x.key !== 'through_fault_current') });
          results.push(assert(`BAY ${c.name}${withIk ? ' (Isc,int entered)' : ''}: the same result from the bay`,
            before && after && plain(before) === plain(after)
              && (c.calc_type !== 'transformer_diff' || after.steps.some((x) => x.key === 'through_fault_current')),
            before && before.status, after && after.status));
        }
      }
    }
    return results;
  }

  // ── 87T ZONE (#135, calc/transformer_diff/zone.js) and the REF160
  //    regression (reference calculation report, 7UT8) ──
  function testZone() {
    const results = [];
    const Z = CTTransformerDiff.zone;
    const SYS = { station_name: 'REF160', station_abbr: 'REF', voltage: 150, freq: '50', isc_sys: 40, isc_1ph: 40, tp: 100, cable_r_method: 'table', cable_temp: 25 };
    const ct = { Is: 1, alf: 30, ct_class_family: '5PR', ct_class_alf: 30, relay_manufacturer: 'Siemens', relay_model: 'SIPROTEC 5 7UT86', relay_burden: 0.1,
      cable_length: 150, cable_cross: 4, cable_mat: 'cu', cable_topology: 'six_wire' };
    const CT1 = { ...ct, Ip: 750, rct: 2.402, burden: 30, linked_winding: 'HV' };
    const CT2 = { ...ct, Ip: 2000, rct: 7.422, burden: 15, linked_winding: 'LV' };
    const bay = (cores, t = {}) => ({ id: 'f', name: 'REF160 T1', feeder_type: 'transformer',
      transformer: { sr_mva: 160, z_percent: 7.92, inrush_factor: 8, winding_count: '2', ur_kv_HV: 150, isc_int_HV: 40000, ur_kv_LV: 60, isc_int_LV: 32000, ...t },
      devices: [{ id: 'd', name: '87T', device_type: 'transformer_diff', cores }] });
    const core = (id, inputs, name = id) => ({ id, name, kind: 'ct', calc_type: 'transformer_diff', inputs });
    const run = (f, sys = SYS) => {
      const res = {};
      for (const c of f.devices[0].cores) {
        res[`f-d-${c.id}`] = CTRequired.ready(c, sys, f) ? CTCalc.calculate('transformer_diff', c.inputs, CTBay.commonData(sys, f)) : null;
      }
      return { res, zone: Z.calculate(f, f.devices[0], res) };
    };

    // REF160, table method: every number of the reference comparison
    const ref160 = bay([core('hv', CT1, 'CT1'), core('lv', CT2, 'CT2')]);
    const { res, zone } = run(ref160);
    const hv = res['f-d-hv'], lv = res['f-d-lv'];
    const f3 = (x) => x.toFixed(3), f2 = (x) => x.toFixed(2);
    results.push(assert('REF160 both cores calculated and OK', hv && lv && hv.is_ok && lv.is_ok, `${hv && hv.status}/${lv && lv.status}`, 'OK/OK'));
    results.push(assert('REF160 ALFo 248.470 / 75.308', f3(hv.alf_o) === '248.470' && f3(lv.alf_o) === '75.308', `${hv.alf_o}/${lv.alf_o}`, '248.470/75.308'));
    results.push(assert('REF160 Isc,max,ext 7.776 / 19.439 kA (= Ir / (Z%/100))', f3(hv.trafo_it_max / 1000) === '7.776' && f3(lv.trafo_it_max / 1000) === '19.439',
      `${hv.trafo_it_max}/${lv.trafo_it_max}`, '7776/19439'));
    results.push(assert('REF160 Req. 1 15.55 / 14.58', f2(hv.alf_ext_required) === '15.55' && f2(lv.alf_ext_required) === '14.58',
      `${hv.alf_ext_required}/${lv.alf_ext_required}`, '15.55/14.58'));
    results.push(assert('REF160 Req. 2 21.33 / 6.40', f2(hv.alf_int_required) === '21.33' && f2(lv.alf_int_required) === '6.40',
      `${hv.alf_int_required}/${lv.alf_int_required}`, '21.33/6.40'));
    results.push(assert('REF160 Fadap 1.218 / 1.299 (core and zone agree)', f3(hv.f_adap) === '1.218' && f3(lv.f_adap) === '1.299'
      && f3(zone.sides[0].fadap) === '1.218' && f3(zone.sides[1].fadap) === '1.299', `${hv.f_adap}/${lv.f_adap}`, '1.218/1.299'));
    results.push(assert('REF160 zone: Fadap ratio 1.067, information only (max_fadap_ratio null)', f3(zone.fadap_ratio) === '1.067' && zone.max_fadap_ratio === null
      && zone.checks.find((c) => c.id === 'fadap_ratio').ok === null && zone.remarks.some((r) => r[0] === 'zone_rm_ratio_info'),
      zone.fadap_ratio, 1.067));
    results.push(assert('REF160 zone: sides HV / LV complete, same Isr, verdict OK',
      zone.status === 'OK' && zone.is_ok === true && zone.sides.map((x) => x.winding).join(',') === 'HV,LV'
        && zone.checks.find((c) => c.id === 'sides').ok === true && zone.checks.find((c) => c.id === 'isr').ok === true
        && zone.sides.every((x) => x.req && x.req[1].ok && x.req[2].ok && x.req[3].ok && x.req[4].ok), JSON.stringify(zone.checks), 'OK'));
    results.push(assert('REF160 IED 1 s thermal check in the core results (53.33 A / 16 A, the IED check is part of the side verdict)',
      hv.ied_rating && hv.ied_rating.i_sec_rms.toFixed(2) === '53.33' && lv.ied_rating.i_sec_rms.toFixed(2) === '16.00',
      `${hv.ied_rating && hv.ied_rating.i_sec_rms}/${lv.ied_rating && lv.ied_rating.i_sec_rms}`, '53.33/16.00'));
    // With #132's manual ρ20 = 0.0185: ALFo 248.18 / 75.27 (reference 248.179 / 75.269)
    const man = run(ref160, { ...SYS, cable_r_method: 'iec60287', cable_rho_mode: 'manual', cable_rho20_cu: 0.0185, cable_rho20_al: 0.02826 });
    results.push(assert('REF160 manual ρ20 0.0185: ALFo 248.18 / 75.27 (reference 248.179 / 75.269), zone OK',
      f2(man.res['f-d-hv'].alf_o) === '248.18' && f2(man.res['f-d-lv'].alf_o) === '75.27' && man.zone.status === 'OK',
      `${man.res['f-d-hv'].alf_o}/${man.res['f-d-lv'].alf_o}`, '248.18/75.27'));
    // The ratio is Ipr,a·Ur,a / (Ipr,b·Ur,b): independent of Sref
    const s2 = run(bay([core('hv', CT1), core('lv', CT2)], { sr_mva: 100 })).zone;
    results.push(assert('ZONE Fadap ratio does not depend on Sref (100 MVA: 1.067)', f3(s2.fadap_ratio) === '1.067' && Math.abs(s2.fadap_ratio - (2000 * 60) / (750 * 150)) < 1e-12,
      s2.fadap_ratio, 1.0667));

    // Side checks
    const missing = run(bay([core('hv', CT1)])).zone;
    results.push(assert('ZONE a winding without a core fails (LV), with a remark', missing.status === 'NOT_OK'
      && missing.checks[0].ok === false && missing.remarks.some((r) => r[0] === 'zone_rm_missing_side' && r[1] === 'LV'), JSON.stringify(missing.remarks), 'LV missing'));
    const dbl = run(bay([core('a', CT1, 'A'), core('b', CT1, 'B'), core('lv', CT2)])).zone;
    results.push(assert('ZONE two cores on one winding fail, naming them', dbl.status === 'NOT_OK'
      && dbl.remarks.some((r) => r[0] === 'zone_rm_double_side' && r[1] === 'HV' && r[2] === 2 && r[3] === 'A, B'), JSON.stringify(dbl.remarks), 'HV ×2'));
    const tv = run(bay([core('hv', CT1), core('lv', CT2), core('tv', { ...CT2, linked_winding: 'TV' }, 'T')])).zone;
    results.push(assert('ZONE a core on a winding the transformer does not have fails', tv.status === 'NOT_OK'
      && tv.remarks.some((r) => r[0] === 'zone_rm_extra' && r[1] === 'T' && r[2] === 'TV'), JSON.stringify(tv.remarks), 'TV extra'));
    const isr = run(bay([core('hv', CT1), core('lv', { ...CT2, Is: 5, Ip: 2000 })])).zone;
    results.push(assert('ZONE different Isr on the sides fail, with a remark', isr.checks.find((c) => c.id === 'isr').ok === false
      && isr.status === 'NOT_OK' && isr.remarks.some((r) => r[0] === 'zone_rm_isr'), JSON.stringify(isr.remarks), 'isr'));
    const noCount = run(bay([core('hv', CT1), core('lv', CT2)], { winding_count: undefined })).zone;
    results.push(assert('ZONE no winding count on the bay: incomplete (cores still calculated), remark',
      noCount.status === 'INCOMPLETE' && noCount.is_ok === null && noCount.sides.every((x) => x.calculated) && noCount.remarks[0][0] === 'zone_rm_no_count',
      noCount.status, 'INCOMPLETE'));
    // #135 review: data still being entered is "not checked", never "not OK"
    const entering = run(bay([core('hv', CT1), core('lv', { ...CT2, linked_winding: undefined })])).zone;
    results.push(assert('ZONE a new core without its winding yet: incomplete, not NOT_OK', entering.status === 'INCOMPLETE'
      && entering.checks[0].ok === null && entering.remarks.some((r) => r[0] === 'zone_rm_unlinked'), entering.status, 'INCOMPLETE'));
    const empty = run({ ...bay([]) }).zone;
    results.push(assert('ZONE a device with no cores yet: incomplete', empty.status === 'INCOMPLETE', empty.status, 'INCOMPLETE'));
    const isrPending = run(bay([core('hv', CT1), core('lv', { ...CT2, Is: 5, rct: undefined })])).zone;
    results.push(assert('ZONE an Isr on a side not calculated yet is not a failure', isrPending.status === 'INCOMPLETE'
      && isrPending.checks.find((c) => c.id === 'isr').ok === true, isrPending.status, 'INCOMPLETE'));
    const notCalc = run(bay([core('hv', CT1), core('lv', { ...CT2, rct: undefined })])).zone;
    results.push(assert('ZONE a side core not calculated: incomplete, named', notCalc.status === 'INCOMPLETE'
      && notCalc.remarks.some((r) => r[0] === 'zone_rm_not_calc' && r[1] === 'lv'), JSON.stringify(notCalc.remarks), 'incomplete'));
    const fail = run(bay([core('hv', { ...CT1, alf: 5, ct_class_alf: 5 }), core('lv', CT2)])).zone;
    results.push(assert('ZONE a failing side core fails the zone, a remark names it', fail.status === 'NOT_OK' && fail.sides[0].core_ok === false
      && fail.checks.every((c) => c.ok !== false) && fail.remarks.some((r) => r[0] === 'zone_rm_side_failed' && r[1] === 'HV'), fail.status, 'NOT_OK'));
    // A limit set in the database (with its source, later) would be checked
    const R = CT_RELAY_DB_DATA.find((r) => r.name === 'SIPROTEC 5 7UT86');
    results.push(assert('ZONE relay DB: max_fadap_ratio is null (no source yet)', R.transformer_diff.max_fadap_ratio === null
      && CT_RELAY_DB_DATA.filter((r) => r.transformer_diff).every((r) => r.transformer_diff.max_fadap_ratio === null), R.transformer_diff.max_fadap_ratio, null));
    R.transformer_diff.max_fadap_ratio = 1.05;
    try {
      const lim = run(ref160).zone;
      results.push(assert('ZONE a database limit 1.05 would fail the ratio 1.067', lim.status === 'NOT_OK'
        && lim.checks.find((c) => c.id === 'fadap_ratio').ok === false && lim.remarks.some((r) => r[0] === 'zone_rm_ratio_exceeded'), lim.status, 'NOT_OK'));
    } finally { R.transformer_diff.max_fadap_ratio = null; }
    results.push(assert('ZONE not a transformer_diff device → null', Z.calculate(ref160, { device_type: 'distance', cores: [] }, {}) === null, '', 'null'));
    return results;
  }

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

    // Steps the four Phase-2 modules name differently from the Python tool's StepNames
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
        // a Vk core has no operating ALF row (alf_o None): null
        Vk_req: st.required_knee_point_voltage, alf_o: st.operational_alf ?? null,
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
      // a Vk core: the E.m.f. cards, no ALF ones (F-TP-PX)
      transformer_diff: (r) => (r.is_px ? ['EALF', 'Vk_req', 'emf_ok', 'Rc', 'margin']
        : ['EALF', 'Vk_req', 'emf_ok', 'ziegler_ok', 'alf_o', 'ALF_ziegler']),
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
      results.push(assert(`${tag} warnings`, pyWarnings(r.warnings).length === e.warnings.length
        && (c.calc_type === 'distance' || matchesExpected(pyWarnings(r.warnings), e.warnings)),
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
        const pass = v === null ? got === null : typeof v === 'boolean' ? got === v
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
        // so does distance's analytical-Ktd methodology note, and the text rows of
        // a method that does not apply (IEC N/A, Ziegler for a Vk core: F-TP-PX)
        const textRow = /^iec_requirement_|^ktd_methodology_description$/.test(s.key)
          || s.result === 'N/A' || s.status === 'not_applicable_px';
        if (typeof s.latex !== 'string' || (!s.latex && !textRow)) bad.push(`${s.key}: no latex`);
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
          // (a not-applicable row keeps the Python result token in `status`)
          if (!(s.result === sub || text === v || s.result === v || s.status === v)) bad.push(`${s.key}: ${JSON.stringify(s.result)} ≠ ${JSON.stringify(v || sub)}`);
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
        // the Python tool's GUI writes (CTCalc.moduleCore): ct_class and
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
      if (CTCalc.CLASS_ROW_TYPES.includes(c.calc_type)) {
        // F-TP-PX (PORTING_PLAN.md §10.6): the class decides Vk or ALF, as
        // the Python tool's data_io.py (is_px_class for PX / TPX / TPY / TPZ)
        const vkc = !!CTCalc.moduleCore(c.calc_type, c.inputs, c.system).is_px;
        results.push(assert(`${tag} module core is_px = Python is_px_class (class ${CTCalc.ctClassFamily(c.inputs)})`,
          vkc === !!c.python.core_data.is_px_class, vkc, !!c.python.core_data.is_px_class));
        if (c.inputs.ct_class_family != null) {
          // A stored is_px that disagrees with the class (the former "PX class
          // CT" box, or a TP core saved before F-TP-PX) changes nothing
          const same = (x) => JSON.stringify(CTCalc.calculate(c.calc_type, x, { ...c.system })) === JSON.stringify(r);
          results.push(assert(`${tag} stored is_px ${!vkc} or none gives the same result (the class decides)`,
            same({ ...c.inputs, is_px: !vkc }) && same((({ is_px, ...x }) => x)(c.inputs)), 'differs', 'identical'));
        }
      }
      if (c.calc_type === 'transformer_diff') {
        // F-TP-PX decision A2: no IED, but a Vk core: the IEC ALF method is not
        // applicable (the Python reference ran with an E.m.f.-only IED)
        const vkCore = !!c.python.core_data.is_px_class;
        results.push(assert(`${tag} IEC ALF method ${vkCore ? 'N/A (Vk core, A2)' : 'applies'}`,
          !c.inputs.relay_model && r.iec_method_applicable === !vkCore
            && (c.python.core_data.relay_name === (vkCore ? 'ABB RET670' : undefined)),
          r.iec_method_applicable, !vkCore));
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
        // ar_is_adequate (beyond Python, §10.6 F-LD-AR-UI): the UI's AR verdict
        // is the absence of Python's AR warning, and null without AR.
        results.push(assert(`${tag} ar_is_adequate = no Python AR warning`,
          r.ar_is_adequate === (ar ? !pyFail : null), r.ar_is_adequate, ar ? !pyFail : null));
        if (ar) {
          // The passing side: a higher ALF lifts the proposed Vk over EAL_AR.
          const hi = CTCalc.calculate('line_diff',
            { ...c.inputs, alf: Math.ceil(c.inputs.alf * r.eal_ar / r.proposed_vk) + 1 }, { ...c.system });
          const hiFail = hi.warnings.some((w) => [].concat(w)[0] === 'warning_auto_reclosure_eal_below_vk');
          results.push(assert(`${tag} ar_is_adequate true when proposed Vk ≥ EAL_AR`,
            hi.ar_is_adequate === true && !hiFail && hi.proposed_vk >= hi.eal_ar,
            { ar_is_adequate: hi.ar_is_adequate, proposed_vk: hi.proposed_vk, eal_ar: hi.eal_ar }, true));
        }
      }
    });

    // The golden covers what §10 B1 asks for
    const cover = (f) => [...new Set(G.cases.map(f))].sort().join(',');
    results.push(assert('E2E covers all eight calc types', types.size === 8, [...types].join(','), 8));
    results.push(assert('E2E covers a distance core with relay_tal and AR enabled, and old t_al cores',
      G.cases.some((c) => c.calc_type === 'distance' && c.inputs.relay_tal != null && c.inputs.auto_reclose_enabled)
        && G.cases.some((c) => c.calc_type === 'distance' && 't_al' in c.inputs && !('relay_tal' in c.inputs)),
      G.cases.filter((c) => c.calc_type === 'distance').map((c) => c.name).join(','), 'relay_tal + AR, t_al'));
    // W7 (PORTING_PLAN.md §10.7): t_al is required with AR on, so every AR
    // core carries it and the Python core_data gets it as both windows
    const arNoTal = G.cases.filter((c) => c.inputs.auto_reclose_enabled && (c.inputs.relay_tal == null
      || c.python.core_data.ar_t_al !== c.inputs.relay_tal / 1000 || c.python.core_data.ar_t_double_al !== c.inputs.relay_tal / 1000));
    results.push(assert('E2E every AR core has its relay t_al, and the Python ar_t_al = ar_t_double_al = t_al',
      arNoTal.length === 0 && G.cases.filter((c) => c.inputs.auto_reclose_enabled).length === 4,
      arNoTal.map((c) => c.name).join(',') || 'none', 'none'));
    results.push(assert('E2E covers distance AR cores of a gapped (PR) and a PX class',
      G.cases.some((c) => c.calc_type === 'distance' && c.inputs.auto_reclose_enabled && /PR$/.test(c.inputs.ct_class_family || ''))
        && G.cases.some((c) => c.calc_type === 'distance' && c.inputs.auto_reclose_enabled && c.inputs.ct_class_family === 'PX' && c.inputs.is_px),
      G.cases.filter((c) => c.calc_type === 'distance' && c.inputs.auto_reclose_enabled).map((c) => c.inputs.ct_class_family).join(','), 'PR + PX'));
    // F-TP-PX: a TPY distance AR core and a TPX core of another type
    results.push(assert('E2E covers a TPY distance AR core and a TPX core of another calc type',
      G.cases.some((c) => c.calc_type === 'distance' && c.inputs.auto_reclose_enabled && c.inputs.ct_class_family === 'TPY')
        && G.cases.some((c) => c.calc_type !== 'distance' && c.inputs.ct_class_family === 'TPX'),
      G.cases.filter((c) => /^TP/.test(c.inputs.ct_class_family || '')).map((c) => c.name).join(','), 'TPY distance AR + TPX'));
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

  // ── CTRelayDB (calc/relays.js ← the Python tool's data/relays.db) and the relay
  //    t_al reaching the C-O-C-O check ─────────────────────────────────────
  function testRelayDb() {
    const results = [];
    const DB = CTRelayDB;
    results.push(assert('RELAYDB 23 imported relays + SIPROTEC 5 7SL86 / 7SL87', DB.RELAYS.length === 25, DB.RELAYS.length, 25));
    // CT input ratings: the SIPROTEC 5 IEDs carry the Siemens datasheet's
    // (calc/relay_db.js); the rest is the original import (#113). Pinned so an
    // edit needs a source. 1 s / half wave / 10 s / 60 s / 2 min / 3 min /
    // continuous ×In, measuring range (A rms), SR
    const ratings = (n, isr) => { const c = DB.RELAYS.find((r) => r.name === n).ct_inputs[isr];
      return [c.thermal_1s_x_in, c.dynamic_capacity_x_in, c.thermal_10s_x_in, c.thermal_60s_x_in, c.thermal_120s_x_in,
        c.thermal_180s_x_in, c.thermal_continuous_x_in, c.measuring_range_max, c.measuring_range_rms, c.burden_va].join('/'); };
    const s5 = DB.RELAYS.filter((r) => r.series === 'SIPROTEC 5').map((r) => r.name);
    results.push(assert('RELAYDB SIPROTEC 5 (8 IEDs) Siemens datasheet: 1 A 500 A 1 s, 1250 A half wave, 150 A 10 s, 30 A 2 min, 25 A 3 min, 20 A continuous, 0–100 A rms, 0.1 VA; 5 A the same A as ×In',
      s5.length === 8 && s5.every((n) => ratings(n, '1') === '500/1250/150//30/25/20/100/true/0.1' && ratings(n, '5') === '100/250/30//6/5/4/500/true/0.1'),
      s5.map((n) => `${n}: ${ratings(n, '1')} | ${ratings(n, '5')}`).join('; '), 'datasheet'));
    results.push(assert('RELAYDB imported rows unchanged (REB500 1 A)', ratings('ABB REB500', '1') === '100/250/30/10///4/500//0.02',
      ratings('ABB REB500', '1'), '100/250/30/10///4/500//0.02'));
    results.push(assert('RELAYDB manufacturers', DB.manufacturers().join(',') === 'ABB,GE,SEL,Siemens',
      DB.manufacturers().join(','), 'ABB,GE,SEL,Siemens'));
    const sieDist = DB.list('Siemens', 'distance').map((r) => r.name).join(',');
    results.push(assert('RELAYDB Siemens distance IEDs (supported_applications)',
      sieDist === 'SIPROTEC 4 7SA522,SIPROTEC 5 7SA87,SIPROTEC 5 7SD87,SIPROTEC 5 7SL86,SIPROTEC 5 7SL87', sieDist, '7SA522, 7SA87, 7SD87, 7SL86, 7SL87'));
    const sieLd = DB.list('Siemens', 'line_diff').map((r) => r.name).join(',');
    const sieOc = DB.list('Siemens', 'overcurrent').map((r) => r.name).join(',');
    results.push(assert('RELAYDB Siemens line diff and overcurrent IEDs',
      sieLd === 'SIPROTEC 5 7SD87,SIPROTEC 5 7SL86,SIPROTEC 5 7SL87' && sieOc === 'SIPROTEC 5 7SA87,SIPROTEC 5 7SJ86,SIPROTEC 5 7SL86,SIPROTEC 5 7SL87',
      `${sieLd} | ${sieOc}`, '7SD87, 7SL86, 7SL87 | 7SA87, 7SJ86, 7SL86, 7SL87'));
    results.push(assert('RELAYDB metering / VT have no relay', !DB.supports('metering') && !DB.supports('vt'), 'supported', 'not'));
    // get_ct_specs(name, Isr).burden_va: the first row with that rated current
    const b1 = DB.lookup('SIPROTEC 5 7SA87', 1, 'distance', '50'), b5 = DB.lookup('SIPROTEC 5 7SA87', 5, 'distance', '60');
    results.push(assert('RELAYDB 7SA87 burden 1 A / 5 A 0.1 VA, distance t_al 30 ms (50 Hz) / 26 ms (60 Hz)',
      b1.burden_va === 0.1 && b5.burden_va === 0.1 && b1.tal_ms === 30 && b5.tal_ms === 26 && b1.tal_db,
      `${b1.burden_va} / ${b5.burden_va}, ${b1.tal_ms} / ${b5.tal_ms}`, '0.1 / 0.1, 30 / 26'));
    const core = { Is: 1, relay_model: 'SIPROTEC 5 7SA87', relay_burden: 0.4, relay_tal: 60 };
    const a1 = DB.apply(core, 'distance', '50'), a5 = DB.apply({ ...a1, Is: 5 }, 'distance', '50');
    results.push(assert('RELAYDB apply fills SR, t_al, manufacturer, model; a new Isr brings its burden',
      a1.relay_burden === 0.1 && a1.relay_tal === 30 && a1.relay_manufacturer === 'Siemens' && a1.relay_type === '7SA87'
        && a5.relay_burden === 0.1 && DB.apply(a1, 'distance', '50') === a1 && DB.apply(a1, 'distance', '60').relay_tal === 26,
      JSON.stringify([a1.relay_burden, a1.relay_tal, a5.relay_burden]), '[0.1,30,0.1]'));
    const noFreq = DB.apply(core, 'distance', null);
    results.push(assert('RELAYDB no rated frequency yet: a frequency-dependent t_al is blank (no default)',
      !('relay_tal' in noFreq) && noFreq.relay_burden === 0.1, noFreq.relay_tal, 'undefined'));
    const noCt = DB.apply({ Is: 1, relay_model: 'ABB REL670', relay_burden: 0.07 }, 'distance', '50');
    const custom = { Is: 1, relay_burden: 0.07, relay_tal: 40 };
    results.push(assert('RELAYDB no CT input in the DB keeps the typed SR; imported rows keep 25 ms; a custom relay is unchanged',
      noCt.relay_burden === 0.07 && noCt.relay_tal === 25 && DB.apply(custom, 'distance', '50') === custom, noCt.relay_burden, 0.07));

    // Operate times (SIPROTEC 5): function, rated frequency, inrush detection
    // and network delay → t_al; blank until every choice is entered
    const tal = (name, type, freq, c = {}) => DB.lookup(name, 1, type, freq, c).tal_ms;
    results.push(assert('RELAYDB 7SJ86 overcurrent: function needed; 25 / 22 ms, +10 ms with inrush; directional 37 / 31 ms',
      tal('SIPROTEC 5 7SJ86', 'overcurrent', '50') === null
        && tal('SIPROTEC 5 7SJ86', 'overcurrent', '50', { relay_function: 'overcurrent' }) === null
        && tal('SIPROTEC 5 7SJ86', 'overcurrent', '50', { relay_function: 'overcurrent', relay_inrush: false }) === 25
        && tal('SIPROTEC 5 7SJ86', 'overcurrent', '60', { relay_function: 'overcurrent', relay_inrush: false }) === 22
        && tal('SIPROTEC 5 7SJ86', 'overcurrent', '50', { relay_function: 'overcurrent', relay_inrush: true }) === 35
        && tal('SIPROTEC 5 7SJ86', 'overcurrent', '50', { relay_function: 'directional_overcurrent', relay_inrush: false }) === 37
        && tal('SIPROTEC 5 7SJ86', 'overcurrent', '60', { relay_function: 'directional_overcurrent', relay_inrush: true }) === 41,
      'see test', '25/22/35/37/41'));
    results.push(assert('RELAYDB 7SD87 / 7SL87 line diff: differential tripping 12 ms; IDIFF FAST 2 5 ms + network delay',
      tal('SIPROTEC 5 7SD87', 'line_diff', '50', { relay_function: 'idiff' }) === 12
        && tal('SIPROTEC 5 7SL87', 'line_diff', '60', { relay_function: 'idiff' }) === 12
        && tal('SIPROTEC 5 7SD87', 'line_diff', '50', { relay_function: 'idiff_fast_2' }) === null
        && tal('SIPROTEC 5 7SD87', 'line_diff', '50', { relay_function: 'idiff_fast_2', relay_network_delay: 6 }) === 11,
      'see test', '12/12/null/11'));
    results.push(assert('RELAYDB 7UT86 IDIFF 23 ms (+10 ms inrush), IDIFF FAST / unrestrained 8 ms',
      tal('SIPROTEC 5 7UT86', 'transformer_diff', '50', { relay_function: 'idiff', relay_inrush: false }) === 23
        && tal('SIPROTEC 5 7UT87', 'transformer_diff', '60', { relay_function: 'idiff', relay_inrush: true }) === 33
        && tal('SIPROTEC 5 7UT86', 'transformer_diff', '50', { relay_function: 'idiff_fast' }) === 8
        && tal('SIPROTEC 5 7UT86', 'transformer_diff', '50', { relay_function: 'idiff_unrestrained' }) === 8,
      'see test', '23/33/8/8'));
    const bb85 = DB.lookup('SIPROTEC 5 7SS85', 1, 'busbar', '50', {});
    const typed = { Is: 1, relay_model: 'SIPROTEC 5 7SS85', relay_tal: 40 };
    results.push(assert('RELAYDB 7SS85 busbar has no operate time: t_al typed, kept',
      bb85.tal_db === false && bb85.times === null && DB.apply(typed, 'busbar', '50').relay_tal === 40, bb85.tal_db, false));
    const ocNone = DB.apply({ Is: 1, relay_model: 'SIPROTEC 5 7SJ86', relay_tal: 25 }, 'overcurrent', '50');
    results.push(assert('RELAYDB apply removes a stored t_al until the operate-time choices are entered',
      !('relay_tal' in ocNone), ocNone.relay_tal, 'undefined'));
    // CTCalc.moduleCore takes the database t_al for the project frequency over
    // a stored one (a core not opened since the frequency changed)
    const stale = CTCalc.moduleCore('distance', { Is: 1, relay_model: 'SIPROTEC 5 7SA87', relay_tal: 30,
      auto_reclose_enabled: true }, { freq: '60' });
    results.push(assert('RELAYDB moduleCore: stored 30 ms, project 60 Hz → t_al 26 ms, C-O-C-O windows 0.026 s',
      stale.relay_tal === 26 && stale.ar_t_al === 0.026 && stale.ar_t_double_al === 0.026, stale.relay_tal, 26));

    // The relay t_al is the C-O-C-O window (CTCalc.moduleCore): it moves the
    // ODE check and EAL_AR. Blank: no 25 ms default (W7; CTRequired keeps
    // such a core from being calculated), a stored ar_t_al is kept
    const arCore = { Ip: 3000, Is: 1, rct: 3, burden: 15, relay_burden: 0.1, alf: 40, ct_class_family: '5PR',
      auto_reclose_enabled: true, ar_t_prime: 0.08, ar_tfr: 0.5, ar_ts: 1.0, ar_ktf_preset: 'iec_default',
      cable_length: 120, cable_cross: 4, cable_mat: 'cu' };
    const sys = { voltage: 132, freq: '50', isc_sys: 31.5, tp: 80 };
    const mBlank = CTCalc.moduleCore('distance', arCore, sys);
    const mStored = CTCalc.moduleCore('distance', { ...arCore, ar_t_al: 0.03, ar_t_double_al: 0.03 }, sys);
    const m60 = CTCalc.moduleCore('distance', { ...arCore, relay_tal: 60, ar_t_al: 0.2 }, sys);
    results.push(assert('RELAYDB t_al → ar_t_al / ar_t_double_al (overrides a stored ar_t_al); blank: no default, a stored ar_t_al kept',
      !('ar_t_al' in mBlank) && !('ar_t_double_al' in mBlank) && mStored.ar_t_al === 0.03 && mStored.ar_t_double_al === 0.03
        && m60.ar_t_al === 0.06 && m60.ar_t_double_al === 0.06,
      `${mBlank.ar_t_al}, ${mStored.ar_t_al}, ${m60.ar_t_al}`, 'undefined, 0.03, 0.06'));
    const ld = CTCalc.moduleCore('line_diff', { ...arCore, relay_tal: 40 }, sys);
    const off = CTCalc.moduleCore('distance', { ...arCore, auto_reclose_enabled: false, relay_tal: 40 }, sys);
    results.push(assert('RELAYDB t_al reaches the line diff AR too; no AR → no AR windows',
      ld.ar_t_al === 0.04 && off.ar_t_al === undefined, `${ld.ar_t_al}, ${off.ar_t_al}`, '0.04, undefined'));
    const ode = (tal) => CTCalc.calculate('distance', { ...arCore, relay_tal: tal }, sys)
      .steps.find((x) => x.key === 'auto_reclosure_ode_ktd').result;
    results.push(assert('RELAYDB a longer t_al gives a larger ODE Ktd', ode(60) > ode(25), ode(60), `> ${ode(25)}`));

    // W7 (PORTING_PLAN.md §10.7): the IED database sets the measurement time.
    // Two AR cores in one bay, one per IED: each is checked with its own
    // IED's time (picked → relay_tal → both C-O-C-O windows). The SIPROTEC 5
    // IED has its operate time (distance 30 ms at 50 Hz, line diff 12 ms);
    // the Python tool's IED is given that time, then 40 ms, for the test.
    const iedPair = [['distance', 'SIPROTEC 5 7SA87', 'ABB REL670', 'ar_ktd', {}, 30],
      ['line_diff', 'SIPROTEC 5 7SD87', 'ABB RED670', 'ktd_ar', { relay_function: 'idiff' }, 12]];
    for (const [t, fast, slow, ktdKey, pick, fastMs] of iedPair) {
      const run = (name) => {
        const inputs = DB.apply({ ...arCore, ...pick, relay_model: name }, t, sys.freq);
        const r = CTCalc.calculate(t, inputs, sys);
        return { tal: inputs.relay_tal, win: CTCalc.moduleCore(t, inputs, sys).ar_t_al, ktd: r[ktdKey], eal: r.eal_ar };
      };
      const slowRow = DB.byName(slow), saved = slowRow.measurement_time_ms;
      let same, diff;
      try {
        slowRow.measurement_time_ms = fastMs;
        same = [run(fast), run(slow)];
        slowRow.measurement_time_ms = 40;
        diff = [run(fast), run(slow)];
      } finally {
        slowRow.measurement_time_ms = saved;
      }
      results.push(assert(`RELAYDB W7 ${t}: IEDs ${fast} (${fastMs} ms) and ${slow} (40 ms) give their own windows, a larger Ktd and EAL_AR for the slower one; equal times give equal results`,
        diff[0].tal === fastMs && diff[1].tal === 40 && diff[0].win === fastMs / 1000 && diff[1].win === 0.04
          && diff[1].ktd > diff[0].ktd && diff[1].eal > diff[0].eal
          && same[0].ktd === same[1].ktd && same[0].eal === same[1].eal && same[0].ktd === diff[0].ktd,
        JSON.stringify(diff), 'fast < slow'));
    }
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
    // ── #136 named deltas: the golden is the Python tool's ct_ied_rating.py, kept as
    // it is; CTSizer adds (D1) the 1 s thermal check after the built-in
    // checks and (D2) drops the short-time "no fault duration" remark when it
    // runs. The golden IED cases run on the Python tool's relays.db's input ratings,
    // written out here: the same for every SIPROTEC 5 input there (CTSizer's
    // database has the Siemens datasheet's, calc/relay_db.js). 100·In is
    // relays.db's 1 s rating for every input.
    const RATING_1S_X_IN = 100;
    const PY_REF_INPUT = { measuring_range_max: 500, thermal_continuous_x_in: 4, thermal_1s_x_in: RATING_1S_X_IN,
      thermal_10s_x_in: 30, thermal_60s_x_in: 10, dynamic_capacity_x_in: 250 };
    const th1s = (limit, value) => ({ id: 'thermal_1s', kind: 'rms_max', value, limit, ok: value <= limit, reason: null });
    G.requirements.forEach((c, n) => {
      const { specs, isr, i_sec_rms, i_sec_peak } = c.input;
      const got = I.buildRequirements(specs, isr).map((r) => pin(I.evaluateRequirement(r, i_sec_rms, i_sec_peak)));
      const r1 = specs.ct_input && specs.ct_input.thermal_1s_x_in;
      const exp = r1 != null ? [...c.expected, th1s(r1 * isr, i_sec_rms)] : c.expected;   // D1
      results.push(assert(`IED build + evaluate requirements #${n + 1}`, checksMatch(got, exp),
        JSON.stringify(got), JSON.stringify(exp)));
    });

    let deltas = 0;
    const swapped = CT_RELAY_DB_DATA.filter((r) => r.series === 'SIPROTEC 5').map((r) => [r, r.ct_inputs]);
    swapped.forEach(([r]) => { r.ct_inputs = { 1: { ...PY_REF_INPUT }, 5: { ...PY_REF_INPUT } }; });
    try {
    G.calculate.forEach((c) => {
      const got = I.calculate(c.calc_type, c.inputs, c.system);
      const golden = c.expected;
      if (golden == null) {
        results.push(assert(`IED ${c.name}`, got === null, JSON.stringify(got), 'null'));
        return;
      }
      // The golden expectation with the #136 deltas applied
      const exp = { ...golden, checks: golden.checks.map((x) => ({ ...x })), step_keys: [...golden.step_keys] };
      if (golden.checks.some((x) => x.id === 'thermal_short_time')) {
        deltas++;
        const isr = c.inputs.Is ?? 1;
        let nw = golden.n_warnings;
        const st = exp.checks.find((x) => x.id === 'thermal_short_time');
        if (st.reason === 'no_thermal_duration') nw--;                                     // D2
        const r1 = RATING_1S_X_IN * isr;
        const t1 = th1s(r1, golden.i_sec_rms);                                             // D1
        exp.checks.push(t1);
        exp.step_keys.push('ied_thermal_1s_check');
        if (!t1.ok) nw++;
        exp.n_warnings = nw;
        const evaluated = exp.checks.filter((x) => x.ok != null);
        exp.status = evaluated.every((x) => x.ok) ? 'OK' : 'NOT_OK';
        results.push(assert(`IED ${c.name}: #136 changes no golden verdict`, exp.status === golden.status, exp.status, golden.status));
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
    } finally {
      swapped.forEach(([r, ct]) => { r.ct_inputs = ct; });
    }
    results.push(assert('IED #136 deltas applied to every golden case with input ratings', deltas === 12, deltas, 12));

    // CTCalc.calculate runs it after the module: a failed IED check fails the
    // core; a passing one leaves the module verdict; no IED → no ied_rating
    const sys = { voltage: 150, freq: '50', isc_sys: 40, tp: 100, cable_r_method: 'iec60287', cable_temp: 70 };
    const bb = { Ip: 2000, Is: 5, rct: 1, burden: 30, alf: 20, relay_burden: 0.2,
                 cable_length: 50, cable_cross: 4, cable_mat: 'cu' };
    // 400/5 A (SIPROTEC 5 datasheet, 5 A input): 500 A rms on the 500 A rms
    // measuring range and the 100·In 1 s rating, 1351 A peak > 1250 A dynamic
    // (ALF 180 so the busbar check itself passes; EALF 1980 V stays within
    // the 2 kV secondary voltage limit, calc/plausibility.js)
    const plain = CTCalc.calculate('busbar', { ...bb, Ip: 400, alf: 180 }, sys);
    const fail = CTCalc.calculate('busbar', { ...bb, Ip: 400, alf: 180, relay_model: 'SIPROTEC 5 7SS85' }, sys);
    results.push(assert('IED CTCalc: dynamic capacity exceeded fails the core (measuring range and 1 s at their limit pass)',
      plain.is_ok === true && !('ied_rating' in plain) && fail.is_ok === false && fail.status === 'NOT_OK'
        && fail.conclusion === 'ct_insufficient' && fail.ied_rating.status === 'NOT_OK'
        && fail.steps.some((st) => st.key === 'ied_dynamic_capacity_check' && st.is_ok === false)
        && fail.steps.some((st) => st.key === 'ied_measuring_range_check' && st.is_ok === true && st.comparison === '500.00 A ≤ 500.00 A')
        && approx(fail.margin, Math.min(plain.margin, (1250 / fail.ied_rating.i_sec_peak - 1) * 100), 1e-9),
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

    // ── #136: the 1 s thermal check as in the reference calculation (REF160, 7UT86) ──
    const sie = { voltage: 150, freq: '50', isc_sys: 40, tp: 100, cable_r_method: 'table', cable_temp: 25 };
    const tdBase = { Is: 1, alf: 30, relay_burden: 0.1, relay_model: 'SIPROTEC 5 7UT86', trafo_power_mva: 160,
      cable_length: 150, cable_cross: 4, cable_mat: 'cu' };
    const ref160 = {
      HV: CTCalc.calculate('transformer_diff', { ...tdBase, Ip: 750, rct: 2.402, burden: 30, trafo_voltage_kv: 150,
        trafo_z_percent: 7.92, trafo_ik_max: 40000 }, sie),
      LV: CTCalc.calculate('transformer_diff', { ...tdBase, Ip: 2000, rct: 7.422, burden: 15, trafo_voltage_kv: 60,
        trafo_z_percent: 7.92, trafo_ik_max: 32000 }, sie),
    };
    for (const [side, cmp] of [['HV', '53.33 A ≤ 500.00 A'], ['LV', '16.00 A ≤ 500.00 A']]) {
      const r = ref160[side], ied = r.ied_rating;
      const st = r.steps.find((x) => x.key === 'ied_thermal_1s_check');
      const t1 = ied.checks.find((x) => x.id === 'thermal_1s');
      const ts = ied.checks.find((x) => x.id === 'thermal_short_time');
      results.push(assert(`IED REF160 ${side}: "IED 1 s thermal check: ${cmp} OK" (reference: 500 A for 1 s)`,
        st && st.is_ok === true && st.comparison === cmp && st.label_en === 'IED 1 s thermal check'
          && st.label_da === 'IED 1 s termisk kontrol' && st.latex === 'I_{sec} \\le I_{th,1s}' && t1.limit === 500 && t1.ok === true,
        st && `${st.label_en}: ${st.comparison}`, cmp));
      results.push(assert(`IED REF160 ${side}: duration check kept (not evaluated), its remark replaced`,
        ts && ts.ok === null && ts.reason === 'no_thermal_duration'
          && !r.warnings.some((w) => w[0] === 'warning_ied_not_evaluated_no_thermal_duration')
          && ied.checks.find((x) => x.id === 'dynamic_capacity').limit === 1250 && ied.status === 'OK',
        JSON.stringify(r.warnings.filter((w) => String(w[0]).startsWith('warning_ied'))), 'no not-evaluated remark'));
    }
    results.push(assert('IED REF160: I_sec = 53.33 A (HV, 40 kA) and 16.00 A (LV, 32 kA)',
      ref160.HV.ied_rating.i_sec_rms.toFixed(2) === '53.33' && ref160.LV.ied_rating.i_sec_rms.toFixed(2) === '16.00',
      `${ref160.HV.ied_rating.i_sec_rms}/${ref160.LV.ied_rating.i_sec_rms}`, '53.33/16.00'));
    // A failing 1 s check: 7SS85 1 A, 50/1 at 40 kA → 800 A > 500 A (Siemens: 500 A for 1 s)
    const f1 = I.calculate('busbar', { Ip: 50, Is: 1, relay_model: 'SIPROTEC 5 7SS85' }, { isc_sys: 40, tp: 100, freq: '50' });
    const f1s = f1.steps.find((x) => x.key === 'ied_thermal_1s_check');
    results.push(assert('IED 1 s check fails: 800.00 A > 500.00 A, remark with the values',
      f1s && f1s.is_ok === false && f1s.comparison === '800.00 A > 500.00 A' && f1.status === 'NOT_OK'
        && f1.warnings.some((w) => w[0] === 'warning_ied_thermal_1s_exceeded' && w[2] === 800 && w[3] === 500),
      f1s && f1s.comparison, '800.00 A > 500.00 A'));
    // SIPROTEC 5 measuring range is stated RMS: checked against I_sec (rms).
    // 7SS85 1 A, 300/1 at 40 kA: 133.33 A > 100 A (its peak, 360 A, is within
    // the 1250 A dynamic rating)
    const mr = I.calculate('busbar', { Ip: 300, Is: 1, relay_model: 'SIPROTEC 5 7SS85' }, { isc_sys: 40, tp: 100, freq: '50' });
    const mrs = mr.steps.find((x) => x.key === 'ied_measuring_range_check');
    const mrc = mr.checks.find((x) => x.id === 'measuring_range');
    results.push(assert('IED SIPROTEC 5 measuring range (rms): 133.33 A > 100.00 A, I_sec ≤ I_range; dynamic and 1 s pass',
      mrs && mrs.is_ok === false && mrs.comparison === '133.33 A > 100.00 A' && mrs.latex === 'I_{sec} \\le I_{range}'
        && mrc.kind === 'rms_max' && mr.checks.find((x) => x.id === 'dynamic_capacity').ok === true
        && mr.checks.find((x) => x.id === 'thermal_1s').ok === true,
      mrs && mrs.comparison, '133.33 A > 100.00 A'));
    // The SIPROTEC 5 thermal ratings in A (1 s 500, 10 s 150, 2 min 30, 3 min
    // 25) with a fault duration: 100 s takes the 120 s rating, 200 s the 180 s
    const s5 = CTRelayDB.ctSpecs('SIPROTEC 5 7SS85', 1);
    const thermal = (t) => I.evaluateRequirement(I.buildRequirements({ ct_input: s5, thermal_duration_s: t, requirements: [] }, 1)
      .find((r) => r.id === 'thermal_short_time'), 10, 10);
    const t100 = thermal(100), t200 = thermal(200), t5 = thermal(5);
    results.push(assert('IED SIPROTEC 5 thermal ratings: 5 s → 10 s 150 A, 100 s → 120 s 30 A, 200 s → 180 s (longest) 25 A',
      t5.rated_duration_s === 10 && t5.rated_current_a === 150 && approx(t5.limit, 150 * Math.sqrt(2), 1e-9)
        && t100.rated_duration_s === 120 && t100.rated_current_a === 30 && approx(t100.limit, 30 * Math.sqrt(1.2), 1e-9)
        && t200.rated_duration_s === 180 && t200.rated_current_a === 25 && approx(t200.limit, 25 * Math.sqrt(0.9), 1e-9),
      JSON.stringify([t5, t100, t200].map((x) => [x.rated_duration_s, x.rated_current_a])), '[[10,150],[120,30],[180,25]]'));
    // Temporary database IEDs: a 1 s rating with a duration, only a 10 s rating,
    // and custom rows; the 1 s check needs a stated 1 s rating
    const tmp = (name, ct, extra = {}) => ({ name, manufacturer: 'Test', series: 'T', model: name, applications: ['busbar'],
      measurement_time_ms: 25, ct_inputs: { 1: ct }, ...extra });
    const TMP = [
      tmp('T136 1s+t', { thermal_1s_x_in: 100 }, { ied_thermal_duration_s: 0.5 }),
      tmp('T136 10s', { thermal_10s_x_in: 30 }),
      tmp('T136 10s+t', { thermal_10s_x_in: 30 }, { ied_thermal_duration_s: 2 }),
      tmp('T136 custom', { thermal_1s_x_in: 100 }, { requirements: [
        { label: 'own_i2t', kind: 'thermal_i2t', limit_value: 50, limit_unit: 'x_in', rating_duration_s: 1 },
        { label: 'thermal_1s', kind: 'rms_max', limit_value: 80, limit_unit: 'A' }] }),
    ];
    CT_RELAY_DB_DATA.push(...TMP);
    try {
      const run = (name) => I.calculate('busbar', { Ip: 2000, Is: 1, relay_model: name }, { isc_sys: 40, tp: 100, freq: '50' });
      const a = run('T136 1s+t');
      results.push(assert('IED 1 s rating + advised duration: both checks run (141.42 A and 100 A)',
        a.steps.some((x) => x.key === 'ied_thermal_short_time_check') && a.steps.some((x) => x.key === 'ied_thermal_1s_check')
          && approx(a.checks.find((x) => x.id === 'thermal_short_time').limit, 141.4213562, 1e-6),
        JSON.stringify(a.checks.map((x) => [x.id, x.limit])), 'both'));
      const b = run('T136 10s');
      results.push(assert('IED only a 10 s rating, no duration: no 1 s check, the not-evaluated remark stays',
        !b.checks.some((x) => x.id === 'thermal_1s') && b.warnings.some((w) => w[0] === 'warning_ied_not_evaluated_no_thermal_duration'),
        JSON.stringify(b.warnings), 'remark kept'));
      const c10 = run('T136 10s+t');
      results.push(assert('IED only a 10 s rating with a 2 s duration: short-time check 67.08 A, no 1 s check',
        approx(c10.checks.find((x) => x.id === 'thermal_short_time').limit, 67.0820393, 1e-6) && !c10.checks.some((x) => x.id === 'thermal_1s'),
        c10.checks.find((x) => x.id === 'thermal_short_time').limit, 67.08));
      const d = run('T136 custom');
      const own = d.checks.find((x) => x.id === 'own_i2t');
      const ownStep = d.steps.find((x) => x.key === 'ied_requirement_check_thermal_1s');
      results.push(assert('IED custom rows: their remark stays, a custom "thermal_1s" row keeps the generic label',
        own.reason === 'no_thermal_duration' && d.warnings.some((w) => w[0] === 'warning_ied_not_evaluated_no_thermal_duration' && w[2] === 'own_i2t')
          && ownStep && ownStep.label_en === 'IED-specific requirement: thermal_1s' && ownStep.latex === 'I_{sec} \\le I_{max}'
          && d.steps.some((x) => x.key === 'ied_thermal_1s_check'),
        JSON.stringify(d.warnings), 'custom rows unchanged'));
    } finally {
      CT_RELAY_DB_DATA.splice(CT_RELAY_DB_DATA.length - TMP.length, TMP.length);
    }
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
      { name: 'RctEstimate',    fn: testRctEstimate    },
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
      { name: 'Plausibility',   fn: testPlausibility   },
      { name: 'Required',       fn: testRequired       },
      { name: 'Bay',            fn: testBay            },
      { name: 'MeteringRatio',  fn: testMeteringRatio  },
      { name: 'Zone',           fn: testZone           },
      { name: 'LocalRules',     fn: testLocalRules     },
      { name: 'VtResistorLocation', fn: testVtResistorLocation },
      { name: 'FaultLevel',     fn: testFaultLevel     },
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
           testCtCalculations, testCableResConsistency, testIedRating, testPlausibility, testRequired };
})();
