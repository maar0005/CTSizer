'use strict';
/**
 * rct_estimate.js — CTRctEstimate: a rule-of-thumb estimate of the CT
 * secondary winding resistance Rct (CTSizer-only, no counterpart in the Python tool).
 * Revision 2026-10-20 of the r_turn table (external review, PR #152).
 *
 * Rct is often unknown: IEC 61869-2 does not require it on a class P / PR or
 * metering nameplate, and a CT that is being specified does not exist yet.
 * With `rct_estimate: true` (the "Estimate Rct" box under Rct) CTCalc.moduleCore
 * takes Rct from this table instead of the typed `rct`:
 *
 *   Rct ≈ N · r_turn,   N = Np · Ipn / Isn
 *
 * r_turn in mΩ per secondary turn at 75 °C, by Isn and the station voltage.
 * Np (`rct_np`, typed with the estimate) is the number of primary turns: 1 for
 * ring, bushing, GIS and bar-primary CTs, > 1 for a wound or series-connected
 * primary.
 *
 * Scope: made for P, PR and metering cores (and unknown classes), where Rct
 * is not a rated value and the data is best. For PX, PXR, TPX, TPY and TPZ
 * Rct is part of the rating / test report (IEC 61869-2) and the data is too
 * thin: the same table is used, but the estimate is flagged as very
 * uncertain (reliable: false, note rct_note_uncertain). No Rct_max is
 * calculated; 2 A secondaries are not supported (Isn 1 or 5 A).
 *
 * Calibration (REF160 nameplates, 5PR, 1 A):
 *   750/1 @ 150 kV: 750 × 3.5 = 2.625 Ω vs 2.402 Ω (+9 %)
 *   2000/1 @ 60 kV: 2000 × 3.5 = 7.000 Ω vs 7.422 Ω (−6 %)
 *
 * Sources (mΩ/turn at 75 °C):
 *   [cal]   REF160 nameplates: 3.20, 3.71
 *   [svk]   Svenska kraftnät TR01-04E rev. 5, Table 7, limits ≤ 4.0–5.0
 *   [ng]    National Grid TS 3.02.04, Schedule 10, PX limits ≤ 2.0–2.5
 *   [optcl] OPTCL CT specification 2019, PS limits ≤ 4.2–5.0
 *   [telk]  TELK, Operational features and optimisation of CTs, PS limits ≤ 5.0
 *   [arc]   Arcteq AN00003, 600/1 example: 3.33
 *   [sie]   Siemens 7UT8 CT requirements: 2.0, and a 5 VA 5P30 outlier at 14.4
 *   [ge]    GE Vernova Electrical Utility Reference Guide, JAS-0C table p. 15, 5 A: 1.62–2.83
 *   [abb]   Ganesan (ABB), Selection of CTs & wire sizing, 5 A: 2.47 and 1.25
 *   [cig]   CIGRE A3-11154 (2024) Table 1, 2000 A metering CT: 1 A 6.1, 5 A 1.04
 *   [tb394] CIGRE TB 394 (2009) §1.2.1.1.1 (i): Rct follows from turns, Ts and heat dissipation
 * (URLs in README.md, "Rct estimate".)
 *
 * basis per cell: 'data' (verified values in the band), 'limits' (utility
 * upper limits only; value kept from the earlier pass), 'derived' (no data in
 * the band; carried over from the band with data). min / max: the range of
 * the verified values and limits, pooled over the bands.
 */

const CTRctEstimate = (() => {
  // Columns: system voltage bands (kV, upper limit inclusive), as the Ts table
  // (calc/auto_reclosure/ts_table.js)
  const BANDS = [
    { max_kv: 36,       label: '≤ 36 kV' },
    { max_kv: 72.5,     label: '50–60 kV' },
    { max_kv: 170,      label: '110–150 kV' },
    { max_kv: 245,      label: '220 kV' },
    { max_kv: Infinity, label: '≥ 400 kV' },
  ];

  // r_turn (mΩ/turn at 75 °C) per band, its range and basis, per Isn
  const TABLE = {
    1: { r: [3.5, 3.5, 3.5, 4.0, 4.0], min: [2.0, 2.0, 2.0, 2.0, 2.0], max: [5.0, 5.0, 5.0, 5.0, 5.0],
         basis: ['data', 'data', 'data', 'limits', 'limits'] },
    5: { r: [2.5, 2.5, 2.5, 2.5, 2.5], min: [1.0, 1.0, 1.0, 1.0, 1.0], max: [2.8, 2.8, 2.8, 2.8, 2.8],
         basis: ['data', 'derived', 'derived', 'derived', 'derived'] },
  };

  // Classes whose Rct is a rated value (prefix of the designation): the
  // estimate is very uncertain there
  const RATED_RCT_CLASSES = ['PX', 'PXR', 'TPX', 'TPY', 'TPZ'];

  // Ipn below this with Np = 1: the CT may have several primary turns
  // (engineering judgement, not sourced)
  const WOUND_PRIMARY_WARN_IPN = 600;

  // The band index for a voltage (kV); a missing / invalid voltage → null
  function bandIndex(kv) {
    const v = Number(kv);
    if (kv == null || !Number.isFinite(v) || v <= 0) return null;
    return BANDS.findIndex((b) => v <= b.max_kv);
  }

  // A class designation, normalised: '5PR30', 'TPY 20x12,5', '0,2S' → upper
  // case, no spaces, decimal point
  const normClass = (c) => String(c ?? '').toUpperCase().replace(/\s+/g, '').replace(/,/g, '.');

  // The class the core shows (a legacy core with only is_px is PX); none → ''
  function coreClass(core) {
    if (core?.ct_class_family != null && core.ct_class_family !== '') return normClass(core.ct_class_family);
    return core?.is_px === true || core?.is_px_class === true ? 'PX' : '';
  }

  // The estimate is backed by enough data: P, PR, metering and unknown
  // classes; not a class whose Rct is a rated value
  function reliable(core) {
    const c = coreClass(core);
    return !RATED_RCT_CLASSES.some((k) => c.startsWith(k));
  }

  // lookup(core, kv) → the table cell { isn, bandIndex, band, rTurn, min, max,
  // basis, reliable } for the core's Isn and the voltage, or null without a
  // valid Is (1 / 5 A) or voltage. Needs no Ip or Np (the info table
  // highlights it before the box is ticked).
  function lookup(core, kv) {
    const isn = Number(core?.Is);
    const bi = bandIndex(kv);
    if ((isn !== 1 && isn !== 5) || bi == null) return null;
    const t = TABLE[isn];
    return { isn, bandIndex: bi, band: BANDS[bi], rTurn: t.r[bi], min: t.min[bi], max: t.max[bi], basis: t.basis[bi],
      reliable: reliable(core) };
  }

  // estimate(core, kv) → the cell plus { np, n, rct, rctMin, rctMax,
  // woundPrimary }, or null as lookup() or without a valid Ip or Np (rct_np,
  // ≥ 1). Ω, rounded to whole mΩ.
  function estimate(core, kv) {
    const cell = lookup(core, kv);
    const ip = Number(core?.Ip), np = Number(core?.rct_np);
    if (!cell || !(ip > 0) || core?.rct_np == null || core.rct_np === '' || !(np >= 1)) return null;
    const n = np * ip / cell.isn;
    const ohm = (r) => Math.round(n * r) / 1000;
    return { ...cell, np, n, rct: ohm(cell.rTurn), rctMin: ohm(cell.min), rctMax: ohm(cell.max),
      woundPrimary: np === 1 && ip < WOUND_PRIMARY_WARN_IPN };
  }

  // notes(e, type) → the notes for an estimate (CTSI18n keys), shown under
  // it in the panel and as remarks in the RTF; level 'warn' for the very
  // uncertain classes, else 'info'
  function notes(e, type) {
    if (!e) return [];
    return [
      !e.reliable && { key: 'rct_note_uncertain', level: 'warn' },
      { key: 'rct_note_spread', level: 'info' },
      e.isn === 1 && e.bandIndex >= 3 && { key: 'rct_note_hv1', level: 'info' },
      e.isn === 5 && { key: 'rct_note_isn5', level: 'info' },
      type === 'metering' && { key: 'rct_note_metering', level: 'info' },
      e.woundPrimary && { key: 'rct_note_wound', level: 'info' },
    ].filter(Boolean);
  }

  return { BANDS, TABLE, RATED_RCT_CLASSES, WOUND_PRIMARY_WARN_IPN, bandIndex, normClass, reliable, lookup, estimate, notes };
})();
