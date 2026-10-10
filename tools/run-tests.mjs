#!/usr/bin/env node
/**
 * run-tests.mjs — Headless runner for the CTSizer calculation test suite.
 *
 * The calc/*.js modules are plain <script> globals (no imports/exports). This
 * runner loads them — in the exact order index.html does — into one shared VM
 * scope, injects the golden fixtures as CT_GOLDEN, runs CTTests.run(), and
 * exits non-zero on any failure. It lets each porting session verify a module
 * without opening a browser.
 *
 * It also runs the cable-resistance grep gate (PORTING_PLAN.md §9.6 9D): no
 * source file outside calc/foundation/cable_resistance/ and calc/materials.js
 * may reference the resistance internals (IEC_60228, getWiringFactor, K_WIRE,
 * calcWireResistance, cableResistance(). Every module gets its lead
 * resistance from CTCableRes.lead() instead.
 *
 * Usage:  node tools/run-tests.mjs
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename, relative, sep } from 'node:path';
import vm from 'node:vm';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const root = join(toolsDir, '..');

// 1. Derive the calc/*.js load order straight from index.html (single source
//    of truth — no drift between the browser and the test runner).
const html = readFileSync(join(root, 'index.html'), 'utf8');
const order = [...html.matchAll(/src="(calc\/[^"]+\.js)"/g)].map((m) => m[1]);
if (order.length === 0) {
  console.error('[run-tests] no calc/*.js <script> tags found in index.html');
  process.exit(2);
}

// 2. Load golden fixtures → CT_GOLDEN, keyed by filename without .json.
const goldenDir = join(root, 'calc', 'golden');
const golden = {};
if (existsSync(goldenDir)) {
  for (const f of readdirSync(goldenDir)) {
    if (f.endsWith('.json')) {
      golden[basename(f, '.json')] = JSON.parse(readFileSync(join(goldenDir, f), 'utf8'));
    }
  }
}

// 3. Concatenate into one script so each top-level `const CTxxx = ...` is
//    visible to later files (incl. tests.js). `window` stays undefined, so the
//    in-browser auto-run guard in tests.js is skipped; we call run() ourselves.
let src = `const CT_GOLDEN = ${JSON.stringify(golden)};\n`;
for (const rel of order) {
  src += `\n// ===== ${rel} =====\n${readFileSync(join(root, rel), 'utf8')}\n`;
}
src += `\nglobalThis.__ctresult = CTTests.run();\n`;

// 4. Execute in an isolated context.
const sandbox = { console };
vm.createContext(sandbox);
try {
  vm.runInContext(src, sandbox, { filename: 'ctsizer-tests-bundle.js' });
} catch (e) {
  console.error('[run-tests] bundle threw:', e);
  process.exit(1);
}

// 5. Cable-resistance grep gate (PORTING_PLAN.md §9.6 9D). Scans every
//    .js/.jsx/.mjs/.cjs/.html file in the repo. The toolbox and materials.js
//    (its data and constants source) are exempt. calc/tests.js may name the
//    four internals that materials.js still exports, as `CTMaterials.<name>`
//    only, because testMaterials checks that golden-verified port itself.
const GATE = [/\bIEC_60228\b/g, /\bgetWiringFactor\b/g, /\bK_WIRE\b/g,
  /\bcalcWireResistance\b/g, /\bcableResistance\(/g];
const GATE_EXEMPT = ['calc/foundation/cable_resistance/', 'calc/materials.js',
  'calc/golden/', 'tools/run-tests.mjs'];
const GATE_TESTS = 'calc/tests.js';
const GATE_TESTS_ALLOWED = new Set(['IEC_60228', 'getWiringFactor', 'K_WIRE', 'calcWireResistance']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx|mjs|cjs|html)$/.test(name)) out.push(p);
  }
  return out;
}

const gateHits = [];
let gateFiles = 0;
for (const file of walk(root)) {
  const rel = relative(root, file).split(sep).join('/');
  if (GATE_EXEMPT.some((x) => (x.endsWith('/') ? rel.startsWith(x) : rel === x))) continue;
  gateFiles++;
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    for (const re of GATE) {
      for (const m of line.matchAll(re)) {
        const name = m[0].replace('(', '');
        const allowed = rel === GATE_TESTS && GATE_TESTS_ALLOWED.has(name)
          && line.slice(0, m.index).endsWith('CTMaterials.');
        if (!allowed) gateHits.push(`${rel}:${i + 1}: ${m[0]}`);
      }
    }
  });
}
if (gateHits.length) {
  console.error(`[run-tests] ✗ cable-resistance gate: ${gateHits.length} reference(s) outside the toolbox`);
  gateHits.forEach((h) => console.error(`[run-tests]     ${h}`));
} else {
  console.log(`[run-tests] ✅ cable-resistance gate: ${gateFiles} files scanned, no references outside the toolbox`);
}

const res = sandbox.__ctresult || { totalPass: 0, totalFail: 1 };
const failed = res.totalFail > 0 || gateHits.length > 0;
console.log(`[run-tests] ${failed ? 'FAIL' : 'PASS'} — ${res.totalPass} passed, ${res.totalFail} failed` +
  (gateHits.length ? `, grep gate: ${gateHits.length} hit(s)` : ''));
process.exit(failed ? 1 : 0);
