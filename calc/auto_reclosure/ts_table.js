'use strict';
/**
 * auto_reclosure/ts_table.js — Typical secondary time constant Ts by CT class
 * and voltage level (CTSizer-only, no counterpart in the Python tool).
 *
 * The C-O-C-O checks (distance, line diff) need Ts, which a CT data sheet
 * rarely gives and most users do not know. With `ar_ts_mode: 'table'` (the AR
 * card's default) CTCalc.moduleCore takes Ts from this table, for the core's
 * class and the project voltage; `'manual'` uses the typed `ar_ts`.
 *
 * Engineering estimate, not a standard table:
 * - Ts = L_m / (R_ct + R_b). A closed (non-gapped) core has a very large
 *   magnetising inductance (Ts of seconds); an air gap (PR, TPY) limits
 *   remanence and shortens Ts; TPZ is defined by IEC 61869-2 as a linear core
 *   with Ts = 60 ms (± 10 %), whatever the voltage.
 * - The 110–150 kV column is the Python tool's get_typical_ts (ct_base.py: 5P / PX
 *   5.0 s, PR 1.0 s, TPZ 0.06 s), the level it is used at.
 * - Closed cores: higher voltage levels use larger cores and higher ratios
 *   (L_m grows with the turns squared and the core section), so Ts grows with
 *   the voltage, each cell at the upper end of the typical range (a longer Ts
 *   lets less flux decay in the dead time and gives a larger C-O-C-O Ktd).
 * - Gapped cores (PR, TPY): the air gap, chosen for K_R ≤ 10 %, sets L_m, so Ts
 *   is a design value rather than a result of core size: flat 1.0 s from
 *   110 kV up (the Python tool's value; typical 0.5–1.5 s), lower below.
 * - Unknown classes use the closed-core row.
 */

(() => {
  // Columns: nominal system voltage bands (kV, upper limit inclusive)
  const BANDS = [
    { max_kv: 36,       label: '≤ 36 kV' },
    { max_kv: 72.5,     label: '50–60 kV' },
    { max_kv: 170,      label: '110–150 kV' },
    { max_kv: 245,      label: '220 kV' },
    { max_kv: Infinity, label: '≥ 400 kV' },
  ];

  // Rows: core construction groups, Ts (s) per band
  const GROUPS = [
    { id: 'closed', label: 'Closed core', classes: ['5P', '10P', 'PX', 'TPX'], ts: [2.0, 3.0, 5.0, 7.0, 10.0] },
    { id: 'gapped', label: 'Low remanence (gapped)', classes: ['5PR', '10PR', 'TPY'], ts: [0.5, 0.7, 1.0, 1.0, 1.0] },
    { id: 'linear', label: 'Linear (TPZ)', classes: ['TPZ'], ts: [0.06, 0.06, 0.06, 0.06, 0.06] },
  ];

  // The band index for a voltage (kV); a missing / invalid voltage → 110–150 kV
  function bandIndex(kv) {
    const v = Number(kv);
    if (!Number.isFinite(v) || v <= 0) return 2;
    return BANDS.findIndex((b) => v <= b.max_kv);
  }

  // The row for a class (case-insensitive); unknown → closed core
  function groupIndex(ctClass) {
    const c = String(ctClass ?? '').toUpperCase();
    const i = GROUPS.findIndex((g) => g.classes.includes(c));
    return i < 0 ? 0 : i;
  }

  // estimateTs(ctClass, kv) → { ts, group, band, groupIndex, bandIndex }
  function estimateTs(ctClass, kv) {
    const gi = groupIndex(ctClass);
    const bi = bandIndex(kv);
    return { ts: GROUPS[gi].ts[bi], group: GROUPS[gi], band: BANDS[bi], groupIndex: gi, bandIndex: bi };
  }

  CTAutoReclosure.TS_TABLE = { BANDS, GROUPS };
  CTAutoReclosure.estimateTs = estimateTs;
})();
