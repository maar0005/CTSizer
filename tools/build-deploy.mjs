#!/usr/bin/env node
// tools/build-deploy.mjs OUT — build the deployed site into OUT.
//
// The repository has no build step: index.html loads the .jsx files and
// Babel compiles them in the browser. For the deployed site this script
//   1. copies the public part of the site (tools/build-public.sh),
//   2. compiles every <script type="text/babel"> file with the vendored
//      Babel, using exactly the options Babel's script-tag loader uses in the
//      browser (presets react + env, the same three plugins), so the deployed
//      code is the code a visitor's browser would have produced,
//   3. switches index.html to the compiled files and to the production
//      builds of React and ReactDOM (with their integrity hashes), and drops
//      Babel from the page and from OUT,
//   4. tightens the Content-Security-Policy in OUT/.htaccess: the deployed
//      page needs neither 'unsafe-eval' nor 'unsafe-inline' for scripts.
//
// Usage:  node tools/build-deploy.mjs OUT        (OUT must not exist)
// Check the result with tools/serve.mjs OUT and the e2e scripts.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = process.argv[2];
if (!out) { console.error('usage: node tools/build-deploy.mjs OUT'); process.exit(2); }
const OUT = resolve(out);

execFileSync(join(root, 'tools', 'build-public.sh'), [OUT], { stdio: 'inherit', cwd: root });

const require = createRequire(import.meta.url);
const Babel = require(join(root, 'vendor', 'babel', 'babel.min.js'));

// The options of @babel/standalone's transformScriptTags for a classic
// <script type="text/babel"> (no data-presets / data-plugins / data-targets).
const babelOptions = (filename) => ({
  filename,
  presets: ['react', 'env'],
  plugins: ['transform-class-properties', 'transform-object-rest-spread', 'transform-flow-strip-types'],
  targets: { browsers: undefined },
  sourceMaps: false,
  sourceFileName: filename,
});

const sri = (file) => 'sha384-' + createHash('sha384').update(readFileSync(file)).digest('base64');
const fail = (msg) => { console.error(`build-deploy: ${msg}`); process.exit(1); };

const htmlPath = join(OUT, 'index.html');
let html = readFileSync(htmlPath, 'utf8');

// 2. Compile the .jsx files.
const jsxTags = [...html.matchAll(/<script type="text\/babel" src="([^"]+\.jsx)"><\/script>/g)];
if (jsxTags.length === 0) fail('no <script type="text/babel"> tags in index.html');
for (const [tag, src] of jsxTags) {
  const jsPath = src.replace(/\.jsx$/, '.js');
  if (existsSync(join(OUT, jsPath))) fail(`${jsPath} already exists; cannot compile ${src} over it`);
  const code = readFileSync(join(OUT, src), 'utf8');
  const { code: js } = Babel.transform(code, babelOptions(src));
  writeFileSync(join(OUT, jsPath), `// Compiled from ${src} by tools/build-deploy.mjs — edit the .jsx in the repository.\n${js}\n`);
  unlinkSync(join(OUT, src));
  html = html.replace(tag, `<script src="${jsPath}"></script>`);
  console.log(`  ${src} → ${jsPath}`);
}

// 3. Production React, no Babel.
const swap = (dev, prod) => {
  const re = new RegExp(`<script src="${dev.replace(/[.]/g, '\\.')}" integrity="[^"]*"></script>`);
  if (!re.test(html)) fail(`index.html does not load ${dev}`);
  if (!existsSync(join(OUT, prod))) fail(`${prod} is not in vendor/ (run tools/gen_vendor.py)`);
  html = html.replace(re, `<script src="${prod}" integrity="${sri(join(OUT, prod))}"></script>`);
  unlinkSync(join(OUT, dev));
  console.log(`  ${dev} → ${prod}`);
};
swap('vendor/react/react.development.js', 'vendor/react/react.production.min.js');
swap('vendor/react-dom/react-dom.development.js', 'vendor/react-dom/react-dom.production.min.js');
const babelTag = /\n *<script src="vendor\/babel\/babel\.min\.js" integrity="[^"]*"><\/script>/;
if (!babelTag.test(html)) fail('index.html does not load vendor/babel/babel.min.js');
html = html.replace(babelTag, '');
rmSync(join(OUT, 'vendor', 'babel'), { recursive: true });
html = html.replace(/\n +This is the development page: Babel compiles[\s\S]*?drops Babel\. -->/, '\n       Built by tools/build-deploy.mjs: the .jsx files are compiled ahead of time. -->');
if (/text\/babel|babel\.min\.js/.test(html)) fail('index.html still references Babel');
writeFileSync(htmlPath, html);

// 4. Strict script-src.
const htPath = join(OUT, '.htaccess');
let ht = readFileSync(htPath, 'utf8');
const loose = "script-src 'self' 'unsafe-eval' 'unsafe-inline';";
if (!ht.includes(loose)) fail(".htaccess does not carry the expected script-src");
ht = ht.replace(loose, "script-src 'self';");
writeFileSync(htPath, ht);

// Every script and stylesheet index.html references must exist.
for (const [, f] of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) {
  if (!existsSync(join(OUT, f))) fail(`index.html needs ${f}`);
}
console.log(`build-deploy: wrote ${OUT}`);
