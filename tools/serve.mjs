#!/usr/bin/env node
// tools/serve.mjs DIR [PORT] — serve a directory as the web server would,
// including the response headers set in DIR/.htaccess ("Header always set"),
// so the Content-Security-Policy can be checked in a browser. For local
// checks and the end-to-end scripts (tools/browser-e2e.cjs, tools/flow-e2e.cjs
// take the URL as their first argument). Prints the URL; Ctrl-C stops it.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, extname, normalize } from 'node:path';

const dir = resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || 0);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.jsx': 'text/babel', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain',
  '.xml': 'application/xml', '.php': 'text/plain' };

const headers = [];
const ht = join(dir, '.htaccess');
if (existsSync(ht)) {
  for (const m of readFileSync(ht, 'utf8').matchAll(/^\s*Header always set (\S+) "([^"]*)"/gm)) headers.push([m[1], m[2]]);
}

const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = join(dir, normalize(p));
  if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile() || /\.htaccess$|feedback-config/.test(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return;
  }
  for (const [k, v] of headers) res.setHeader(k, v);
  res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
});
server.listen(port, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${server.address().port}/index.html  (${dir}, ${headers.length} headers from .htaccess)`);
});
