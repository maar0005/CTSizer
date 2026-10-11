'use strict';

// ctsizer-fingerprint.js — the fingerprint of a project: SHA-256 of its
// content (station data, bays, project name and report document fields) in a
// canonical JSON form, so the same project always gives the same value.
//
// Saved in every .ctvt file ("fingerprint": "sha256:…") and printed in the
// RTF report, so a report can be matched to the exact project file it was
// made from. On import the value is recomputed: a missing or different one is
// reported to the user (the file is still imported). It is a checksum, not a
// signature — anyone can recompute it — so it shows that a file was changed,
// never who changed it. The user's settings are not part of it.
const CTSFingerprint = (() => {
  // Canonical JSON: object keys sorted, undefined dropped, otherwise as
  // JSON.stringify (non-finite numbers become null).
  function canon(v) {
    if (v === undefined) return 'null';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort()
      .map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }

  // SHA-256 (FIPS 180-4), synchronous and dependency-free: the Web Crypto
  // digest is asynchronous and needs a secure context.
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  function sha256Hex(str) {
    const bytes = new TextEncoder().encode(str);
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const len = bytes.length;
    const padded = ((len + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(padded);
    m.set(bytes);
    m[len] = 0x80;
    const dv = new DataView(m.buffer);
    const bits = len * 8;
    dv.setUint32(padded - 8, Math.floor(bits / 0x100000000));
    dv.setUint32(padded - 4, bits >>> 0);
    const w = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let i = 0; i < padded; i += 64) {
      for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
      for (let t = 16; t < 64; t++) {
        const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let t = 0; t < 64; t++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map(x => x.toString(16).padStart(8, '0')).join('');
  }

  // The content a fingerprint covers; the same from the app's state and from
  // a validated file (an empty project name counts as no name).
  const content = ({ system, feeders, projName, report }) =>
    ({ system: system ?? null, feeders: Array.isArray(feeders) ? feeders : [], projName: projName || '', report: report ?? {} });

  const of = state => 'sha256:' + sha256Hex(canon(content(state)));
  const short = fp => String(fp || '').replace(/^sha256:/, '').slice(0, 16);
  // 'ok' | 'missing' | 'mismatch' for a file with a `fingerprint` field.
  const check = file => !file || typeof file.fingerprint !== 'string' ? 'missing' : of(file) === file.fingerprint ? 'ok' : 'mismatch';

  return { canon, sha256Hex, of, short, check };
})();

if (typeof window !== 'undefined') window.CTSFingerprint = CTSFingerprint;
