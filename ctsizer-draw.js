'use strict';
/**
 * ctsizer-draw.js
 * Canvas drawing helpers:
 * - Single-fault waveform: currents + core flux vs saturation flux (t_al, t_sat)
 * - C-O-C-O AR dual subplot (Kssc×Ktd / IEC 61869-100 + current transient)
 * Port of ui/ct_widget/ar_preview.py's plotting logic. The underlying
 * waveform/flux generation (ct_auto_reclosure/waveform.py) lives in
 * calc/auto_reclosure/waveform.js (CTAutoReclosure.generateCoco{Transient,Flux}),
 * called directly from drawArWaveform below.
 */

const CTSDraw = (() => {

  // ── Colour helpers ────────────────────────────────────────────────────
  const C = {
    dark: {
      bg:      '#050b14', grid:   'rgba(255,255,255,0.035)', zero: 'rgba(255,255,255,0.12)',
      axis:    'rgba(255,255,255,0.25)', tick:  'rgba(255,255,255,0.2)',
      primary: '#38bdf8', sec_ok: '#10b981', sec_fail: '#f43f5e',
      alfo:    '#f59e0b', mw:    'rgba(16,185,129,0.10)', trip: '#f43f5e',
      dc_fill: 'rgba(56,189,248,0.06)', text: 'rgba(255,255,255,0.55)',
    },
    light: {
      bg:      '#f4f7fb', grid:   'rgba(0,0,0,0.04)',       zero: 'rgba(0,0,0,0.12)',
      axis:    'rgba(0,0,0,0.3)',       tick:  'rgba(0,0,0,0.2)',
      primary: '#0284c7', sec_ok: '#059669', sec_fail: '#dc2626',
      alfo:    '#d97706', mw:    'rgba(5,150,105,0.09)',  trip: '#dc2626',
      dc_fill: 'rgba(2,132,199,0.06)',  text: 'rgba(0,0,0,0.5)',
    },
  };

  function col(theme, key) { return C[theme]?.[key] ?? C.dark[key]; }

  // ── Canvas resize helper ──────────────────────────────────────────────
  // Pixel ratio: the screen's, or the canvas's own `data-dpr` (the RTF report
  // draws its charts off-screen at a fixed ratio, ctsizer-export.jsx).
  function dprOf(canvas) { return +canvas.dataset?.dpr || window.devicePixelRatio || 1; }

  function resizeCanvas(canvas) {
    const dpr  = dprOf(canvas);
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return false;
    if (canvas.width !== Math.round(rect.width * dpr)) {
      canvas.width  = Math.round(rect.width  * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.getContext('2d').scale(dpr, dpr);
    }
    return true;
  }

  // ── Low-level plotting utilities ──────────────────────────────────────
  function plotLine(ctx, arr, cW, ml, cy, amp, color, lw, alpha = 1) {
    const n = arr.length;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = ml + cW * i / (n - 1);
      const y = cy - arr[i] * amp;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawGrid(ctx, W, H, ml, mr, mt, mb, theme) {
    const cW = W - ml - mr, cH = H - mt - mb;
    ctx.fillStyle = col(theme, 'bg');
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = col(theme, 'grid');
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const y = mt + cH * i / 8;
      ctx.beginPath(); ctx.moveTo(ml, y); ctx.lineTo(ml + cW, y); ctx.stroke();
    }
  }

  function drawZero(ctx, ml, cW, cy, theme) {
    ctx.save(); ctx.strokeStyle = col(theme, 'zero');
    ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(ml, cy); ctx.lineTo(ml + cW, cy); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }

  function drawTimeAxis(ctx, ml, cW, mt, cH, totalMs, theme) {
    const steps = 5;
    ctx.fillStyle = col(theme, 'axis');
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i <= steps; i++) {
      const x = ml + cW * i / steps;
      const ms = Math.round(totalMs * i / steps);
      ctx.fillText(`${ms}ms`, x, mt + cH + 18);
    }
  }

  function drawYAxis(ctx, ml, mt, cH, yMin, yMax, label, theme) {
    ctx.fillStyle = col(theme, 'axis');
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const y = mt + cH * i / ticks;
      const v = yMax - (yMax - yMin) * i / ticks;
      ctx.fillText(v.toFixed(1), ml - 4, y + 3);
    }
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = col(theme, 'tick');
    ctx.translate(12, mt + cH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  function drawVLine(ctx, x, mt, cH, color, dash = []) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.globalAlpha = 0.55; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(x, mt); ctx.lineTo(x, mt + cH); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }

  function drawHLine(ctx, y, ml, cW, color, lw = 1.5, dash = []) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw;
    ctx.globalAlpha = 0.85; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(ml, y); ctx.lineTo(ml + cW, y); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }

  function fillSpan(ctx, x1, x2, mt, cH, color) {
    ctx.save(); ctx.fillStyle = color;
    ctx.fillRect(x1, mt, x2 - x1, cH);
    ctx.restore();
  }

  function label(ctx, text, x, y, color, align = 'left', font = '9px JetBrains Mono, monospace') {
    ctx.save(); ctx.fillStyle = color; ctx.font = font; ctx.textAlign = align;
    ctx.fillText(text, x, y); ctx.restore();
  }

  // ── computeKtdFromFlux: flux → Kssc×K_td(t) ──────────────────────────
  // K_td(t) = ψ_raw(t) × √(1+(ωTs)²) / √2
  function computeKtdTrace(flux, ts_s, kssc, fs = 50) {
    const omega    = 2 * Math.PI * fs;
    const ktdFactor = Math.sqrt(1 + (omega * ts_s) ** 2) / Math.SQRT2;
    return flux.map(f => kssc * f * ktdFactor);
  }

  // ── Find time to saturation (first crossing of ALFo during measurement window)
  function findTsat(times, ksscKtd, t_al_s, t2_s, alfo) {
    // First measurement window
    for (let k = 0; k < times.length; k++) {
      if (times[k] <= t_al_s && ksscKtd[k] > alfo) return { t: times[k], window: 1 };
    }
    // Second measurement window
    for (let k = 0; k < times.length; k++) {
      const t = times[k];
      if (t >= t2_s && t <= t2_s + t_al_s && ksscKtd[k] > alfo) return { t, window: 2 };
    }
    return null;
  }

  // ── Draw AR dual subplot ───────────────────────────────────────────────
  function drawArWaveform(canvas, arParams, theme, lang) {
    if (!resizeCanvas(canvas)) return;
    const T = k => CTSI18n.t(lang, k);
    const ctx = canvas.getContext('2d');
    const W = canvas.width / dprOf(canvas);
    const H = canvas.height / dprOf(canvas);

    const {
      tp_ms = 100, ts_s = 1.0, t_prime_s = 0.1, tfr_s = 0.4,
      t_double_al_s, t_al_ms = 60, kssc = 20, alfo = null, is_ok = null,
      ct_class = '5P', amplitude = 1.0,
    } = arParams;

    const tp_s     = tp_ms / 1000;
    const t_al_s   = t_al_ms / 1000;
    const t_dal    = t_double_al_s ?? t_prime_s;
    const tcClass  = CTBaseClasses.mapClassToTimeConstant(ct_class);
    const t2_s     = t_prime_s + tfr_s;
    const totalS   = t2_s + t_dal;
    const totalMs  = Math.round(totalS * 1000);

    // Generate waveforms (calc/auto_reclosure/waveform.js ← ct_auto_reclosure/waveform.py).
    // The flux uses the ODE check's step (1e-4 s, distance/auto_reclosure_ext.js),
    // so the window peaks drawn here are the ones in its Formula Steps row.
    const fluxData = CTAutoReclosure.generateCocoFlux(t_prime_s, tfr_s, t_dal, tp_s, ts_s, 50, 1e-4, tcClass);
    const currData = CTAutoReclosure.generateCocoTransient(t_prime_s, tfr_s, t_dal, 50, 5e-4, 0.6, 0.05, amplitude, tp_s);

    const ksscKtd = computeKtdTrace(fluxData.flux, ts_s, kssc);

    // Layout
    const ml = 54, mr = 12, gap = 26;
    const topH  = (H - gap) * 0.52;
    const botH  = (H - gap) * 0.48;
    const mt1   = 14;
    const mt2   = mt1 + topH + gap;
    const cW    = W - ml - mr;

    // Background
    ctx.fillStyle = col(theme, 'bg');
    ctx.fillRect(0, 0, W, H);

    // ── TOP: Kssc × K_td(t) vs ALFo ──────────────────────────────────
    const yMaxTop  = alfo != null ? Math.max(...ksscKtd, alfo) * 1.25 : Math.max(...ksscKtd, 1) * 1.25;
    const yMinTop  = Math.min(Math.min(...ksscKtd) * 1.05, 0);
    const cy1      = mt1 + topH * (-yMinTop) / (yMaxTop - yMinTop);

    const toX = (t) => ml + cW * t / totalS;
    const toY1= (v) => mt1 + topH * (1 - (v - yMinTop) / (yMaxTop - yMinTop));
    const toY2= (v) => {
      const absMax = Math.max(...currData.waveform.map(Math.abs), 0.01);
      return mt2 + botH / 2 - (v / absMax) * botH * 0.42;
    };

    // Grid lines top
    ctx.strokeStyle = col(theme, 'grid'); ctx.lineWidth = 0.6;
    for (let i = 0; i <= 5; i++) {
      const y = mt1 + topH * i / 5;
      ctx.beginPath(); ctx.moveTo(ml, y); ctx.lineTo(ml + cW, y); ctx.stroke();
    }

    // Measurement window shading
    fillSpan(ctx, toX(0), toX(t_al_s), mt1, topH, col(theme, 'mw'));
    fillSpan(ctx, toX(t2_s), toX(t2_s + t_al_s), mt1, topH, col(theme, 'mw'));
    // Also shade for bottom
    fillSpan(ctx, toX(0), toX(t_al_s), mt2, botH, col(theme, 'mw'));
    fillSpan(ctx, toX(t2_s), toX(t2_s + t_al_s), mt2, botH, col(theme, 'mw'));

    // Dead time shading (open period)
    ctx.save(); ctx.fillStyle = col(theme, 'grid'); ctx.globalAlpha = 0.3;
    ctx.fillRect(toX(t_prime_s), mt1, toX(t2_s) - toX(t_prime_s), topH);
    ctx.fillRect(toX(t_prime_s), mt2, toX(t2_s) - toX(t_prime_s), botH);
    ctx.restore();

    // Boundary lines
    drawVLine(ctx, toX(t_prime_s), mt1, topH + gap + botH, col(theme, 'tick'), [5, 4]);
    drawVLine(ctx, toX(t2_s),      mt1, topH + gap + botH, col(theme, 'tick'), [5, 4]);
    drawVLine(ctx, toX(t_al_s),    mt1, topH, col(theme, 'sec_ok'), [3, 3]);
    drawVLine(ctx, toX(t2_s + t_al_s), mt1, topH, col(theme, 'sec_ok'), [3, 3]);

    // ALFo horizontal line
    if (alfo != null && alfo > 0) {
      const yAlfo = toY1(alfo);
      drawHLine(ctx, yAlfo, ml, cW, col(theme, 'alfo'), 1.5, [6, 4]);
      label(ctx, `ALFo = ${alfo.toFixed(1)}`, ml + cW - 4, yAlfo - 4, col(theme, 'alfo'), 'right');
    }

    // Kssc×Ktd curve
    ctx.save();
    ctx.strokeStyle = col(theme, 'primary');
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let k = 0; k < fluxData.times.length; k++) {
      const x = toX(fluxData.times[k]);
      const y = toY1(ksscKtd[k]);
      k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // Tsat marker
    if (alfo != null) {
      const tsat = findTsat(fluxData.times, ksscKtd, t_al_s, t2_s, alfo);
      if (tsat) {
        const xts = toX(tsat.t);
        const yts = toY1(alfo);
        ctx.save();
        ctx.fillStyle = col(theme, 'sec_fail');
        ctx.beginPath(); ctx.arc(xts, yts, 4, 0, 2 * Math.PI); ctx.fill();
        ctx.restore();
        label(ctx, `t_sat=${Math.round(tsat.t*1000)}ms`, xts + 5, yts - 4, col(theme, 'sec_fail'));
      }
    }

    // Measure window peaks + verdict
    const n = fluxData.times.length;
    let peak1 = 0, peak2 = 0;
    for (let k = 0; k < n; k++) {
      const t = fluxData.times[k];
      if (t <= t_al_s) peak1 = Math.max(peak1, ksscKtd[k]);
      if (t >= t2_s && t <= t2_s + t_al_s) peak2 = Math.max(peak2, ksscKtd[k]);
    }
    const peakW = Math.max(peak1, peak2);
    // The verdict is the verified result's (ode_is_ok) when the caller has it.
    const isOk  = is_ok != null ? is_ok : alfo != null ? peakW <= alfo : null;
    const ktd1  = kssc > 0 ? peak1 / kssc : 0;
    const ktd2  = kssc > 0 ? peak2 / kssc : 0;

    const verdictColor = isOk === true ? col(theme, 'sec_ok') : isOk === false ? col(theme, 'sec_fail') : col(theme, 'text');
    const verdictTxt   = isOk === true ? '✓ OK' : isOk === false ? '✗ FAIL' : '';
    const summaryTxt   = `1st MW: K×Ktd=${peak1.toFixed(1)}  |  2nd MW: K×Ktd=${peak2.toFixed(1)}${alfo ? `  |  ALFo=${alfo.toFixed(1)}` : ''}  ${verdictTxt}`;
    label(ctx, summaryTxt, ml + 4, mt1 + 11, verdictColor);

    // Title
    label(ctx, `IEC 61869-100 — Kssc×K_td(t) vs ALFo  (Ts=${ts_s.toFixed2? ts_s.toFixed(2) : ts_s}s, Tp=${tp_ms}ms, ${ct_class})`,
      ml + cW / 2, mt1 + 22, col(theme, 'tick'), 'center');
    label(ctx, 'Kssc×K_td', 12, mt1 + topH / 2, col(theme, 'tick'), 'center');

    // Y-axis ticks top
    ctx.fillStyle = col(theme, 'tick');
    ctx.font = '8px JetBrains Mono,monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const v = yMinTop + (yMaxTop - yMinTop) * (1 - i / 4);
      ctx.fillText(v.toFixed(0), ml - 3, mt1 + topH * i / 4 + 3);
    }

    // ── Labels: t_prime, dead time, t2 ────────────────────────────────
    label(ctx, `t'=${Math.round(t_prime_s*1000)}ms`, toX(t_prime_s) + 3, mt1 + topH - 4, col(theme, 'tick'));
    label(ctx, `Dead\n${Math.round(tfr_s*1000)}ms`, toX(t_prime_s + tfr_s/2), mt1 + topH/2, col(theme, 'tick'), 'center');
    label(ctx, `t_al=${t_al_ms}ms`, toX(t_al_s / 2), mt1 + topH - 4, col(theme, 'sec_ok'), 'center');

    // ── BOTTOM: Secondary current C-O-C-O ─────────────────────────────
    const absMax = Math.max(...currData.waveform.map(Math.abs), 0.01);
    ctx.save();
    ctx.strokeStyle = col(theme, 'sec_ok');
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const nC = currData.waveform.length;
    for (let k = 0; k < nC; k++) {
      const t = currData.times[k];
      const x = toX(t);
      const y = toY2(currData.waveform[k]);
      k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // Zero line bottom
    drawHLine(ctx, toY2(0), ml, cW, col(theme, 'zero'), 0.8, [3, 3]);

    // Title bottom
    label(ctx, `Secondary current (C-O-C-O) — Isec,peak = ${absMax.toFixed(2)} pu`,
      ml + cW / 2, mt2 + 11, col(theme, 'tick'), 'center');

    // Time axis (shared)
    ctx.fillStyle = col(theme, 'axis');
    ctx.font = '9px JetBrains Mono,monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i <= 5; i++) {
      const t = totalS * i / 5;
      const x = toX(t);
      ctx.fillText(`${Math.round(t*1000)}ms`, x, mt2 + botH + 14);
    }
    ctx.fillStyle = col(theme, 'tick');
    ctx.font = '9px JetBrains Mono,monospace'; ctx.textAlign = 'center';
    ctx.fillText('Time', ml + cW / 2, mt2 + botH + 26);

    // Legend
    ctx.font = '9px JetBrains Mono,monospace'; ctx.textAlign = 'left';
    let lx = ml + 4, ly = mt2 + botH - 12;
    ctx.fillStyle = col(theme, 'mw'); ctx.fillRect(lx, ly, 14, 6);
    ctx.fillStyle = col(theme, 'text'); ctx.fillText(`Meas. window (${t_al_ms}ms)`, lx + 17, ly + 6);
  }

  // ── Fault waveform model (single fault, ideal-saturation core) ─────────
  // Fully offset fault current in pu of its symmetrical peak:
  //   i_p(t) = e^(-t/Tp) − cos ωt
  // The core flux needed to drive i_p through the (resistive) burden, in pu of
  // the symmetrical AC flux peak:  ψ(t) = ω∫i_p dt = ωTp(1 − e^(-t/Tp)) − sin ωt.
  // The verdict's offered / required ratio (Vk or ALF: both scale the flux the
  // core can hold) places the saturation flux:  ψsat = ratio × ψreq, where
  // ψreq is the peak flux the requirement covers — up to t_al when the relay
  // time is known, else over the whole window. ratio ≥ 1 therefore keeps the
  // CT unsaturated through t_al and ratio < 1 saturates it before.
  // Ideal core: while |ψ| sits at ψsat and i_p drives it further, the
  // secondary current is lost (i_s = 0, flux held); it transforms again as
  // soon as i_p reverses. iac is the symmetrical secondary current without the
  // DC offset (−cos ωt), the part a CT transforms even when the DC is lost.
  // → { times, ip, iac, is, psi, psiIdeal, sat, psiReq, psiSat, tSat }
  function faultWaveformModel({ tp_ms = 100, t_al_ms = null, ratio = null, totalS = 0.1, n = 1000 } = {}) {
    const f = 50, omega = 2 * Math.PI * f;
    const Tp = Math.max(tp_ms, 1e-3) / 1000;
    const dt = totalS / (n - 1);
    const times = [], ip = [], iac = [], psiIdeal = [];
    for (let k = 0; k < n; k++) {
      const t = k * dt, dc = Math.exp(-t / Tp);
      times.push(t);
      ip.push(dc - Math.cos(omega * t));
      iac.push(-Math.cos(omega * t));
      psiIdeal.push(omega * Tp * (1 - dc) - Math.sin(omega * t));
    }
    const tReq = t_al_ms != null && t_al_ms > 0 ? Math.min(t_al_ms / 1000, totalS) : totalS;
    let psiReq = 0;
    for (let k = 0; k < n && times[k] <= tReq + 1e-12; k++) psiReq = Math.max(psiReq, Math.abs(psiIdeal[k]));
    const psiSat = ratio != null && Number.isFinite(ratio) ? Math.max(ratio, 0) * psiReq : null;

    const is_ = [], psi = [], sat = [];
    let flux = 0, tSat = null;
    for (let k = 0; k < n; k++) {
      if (k > 0) {
        const d = omega * (ip[k] + ip[k - 1]) / 2 * dt;
        flux += d;
      }
      let s = false;
      if (psiSat != null && Math.abs(flux) > psiSat * (1 + 1e-9)) {
        flux = Math.sign(flux) * psiSat;
        s = true;
      }
      // Still pinned at ψsat while i_p keeps driving the flux outward.
      if (!s && psiSat != null && k > 0 && sat[k - 1] && Math.sign(ip[k]) === Math.sign(flux)
          && Math.abs(flux) >= psiSat * (1 - 1e-9)) s = true;
      if (s && tSat == null) tSat = times[k];
      sat.push(s);
      psi.push(flux);
      is_.push(s ? 0 : ip[k]);
    }
    return { times, ip, iac, is: is_, psi, psiIdeal, sat, psiReq, psiSat, tSat, tReq };
  }

  // ── Draw single fault waveform ─────────────────────────────────────────
  // Two panels on one time axis (faultWaveformModel above):
  //   top    — primary current (with DC offset, referred to the secondary),
  //            its symmetrical AC part without DC, and the CT's secondary
  //            current; the current lost to saturation is shaded red
  //   bottom — core flux against the ± saturation flux line, with the flux
  //            the CT would need without saturation (dashed) and ψ(t_al)
  // Shared: the relay time t_al (green when the CT stays unsaturated through
  // it, red otherwise), the first saturation t_sat, Tp and an optional trip.
  function drawFaultWaveform(canvas, params, theme, lang) {
    if (!resizeCanvas(canvas)) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width / dprOf(canvas);
    const H = canvas.height / dprOf(canvas);
    const T = k => CTSI18n.t(lang, k);

    const {
      tp_ms = 100, trip_ms = null, t_al_ms = null,
      ALF_act = null, ALF_req = null, ratio: satRatio = null,
    } = params || {};
    // The offered / required ratio: params.ratio (any core type), else the
    // overcurrent ALF_act / ALF_req; none → no saturation check is drawn.
    const ratio = satRatio != null ? satRatio
                : ALF_act != null && ALF_req != null && ALF_req > 0 ? ALF_act / ALF_req : null;

    const f = 50;
    const cycles = Math.max(5, Math.ceil(((t_al_ms ?? 0) / 1000) * 1.6 * f));
    const totalS = cycles / f;
    const m = faultWaveformModel({ tp_ms, t_al_ms, ratio, totalS });
    const t_al_s = t_al_ms != null && t_al_ms > 0 ? t_al_ms / 1000 : null;
    const hasCheck = m.psiSat != null;
    const satInRelay = hasCheck && m.tSat != null && (t_al_s == null || m.tSat <= t_al_s + 1e-9);
    const ok = hasCheck ? !satInRelay : null;
    const n = m.times.length;

    // Layout: two panels, shared time axis
    const ml = 50, mr = 14, mt1 = 18, gap = 18, mb = 30;
    const plotH = H - mt1 - gap - mb;
    const h1 = plotH * 0.5, h2 = plotH * 0.5;
    const mt2 = mt1 + h1 + gap;
    const cW = W - ml - mr;
    const toX = t => ml + cW * t / totalS;

    // Top scale (current, pu of the symmetrical peak)
    const iMax = Math.max(...m.ip) * 1.12, iMin = Math.min(Math.min(...m.ip), -1) * 1.12;
    const toY1 = v => mt1 + h1 * (iMax - v) / (iMax - iMin);
    // Bottom scale (flux, pu of the symmetrical AC flux)
    const idealMax = Math.max(...m.psiIdeal);
    const fMax = Math.max(idealMax, m.psiSat ?? 0) * 1.12;
    const showNegSat = hasCheck && m.psiSat < fMax * 0.45;
    const fMin = -Math.max(1.3, showNegSat ? m.psiSat * 1.2 : 0);
    const toY2 = v => mt2 + h2 * (fMax - v) / (fMax - fMin);

    // Background + grid
    ctx.fillStyle = col(theme, 'bg'); ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = col(theme, 'grid'); ctx.lineWidth = 0.6;
    for (const [top, h] of [[mt1, h1], [mt2, h2]]) {
      for (let i = 0; i <= 4; i++) {
        const y = top + h * i / 4;
        ctx.beginPath(); ctx.moveTo(ml, y); ctx.lineTo(ml + cW, y); ctx.stroke();
      }
    }

    // Relay time window (both panels)
    const okCol = col(theme, 'sec_ok'), failCol = col(theme, 'sec_fail');
    if (t_al_s != null) {
      const span = ok === false ? 'rgba(244,63,94,0.10)' : col(theme, 'mw');
      fillSpan(ctx, toX(0), toX(t_al_s), mt1, h1, span);
      fillSpan(ctx, toX(0), toX(t_al_s), mt2, h2, span);
      drawVLine(ctx, toX(t_al_s), mt1, h1 + gap + h2, ok === false ? failCol : okCol, [3, 3]);
      label(ctx, `t_al=${t_al_ms}ms`, toX(t_al_s) + 3, mt2 + h2 - 4, ok === false ? failCol : okCol);
    }

    // ── TOP: currents ──────────────────────────────────────────────────
    drawZero(ctx, ml, cW, toY1(0), theme);

    // Current lost to saturation (between i_p and i_s = 0)
    ctx.save(); ctx.fillStyle = failCol; ctx.globalAlpha = 0.22;
    for (let k = 0; k < n; k++) {
      if (!m.sat[k]) continue;
      let e = k; while (e + 1 < n && m.sat[e + 1]) e++;
      ctx.beginPath(); ctx.moveTo(toX(m.times[k]), toY1(0));
      for (let j = k; j <= e; j++) ctx.lineTo(toX(m.times[j]), toY1(m.ip[j]));
      ctx.lineTo(toX(m.times[e]), toY1(0)); ctx.closePath(); ctx.fill();
      k = e;
    }
    ctx.restore();

    // DC envelope
    ctx.save(); ctx.strokeStyle = col(theme, 'primary'); ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1; ctx.setLineDash([5, 5]); ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const x = toX(m.times[k]), y = toY1(Math.exp(-m.times[k] / (tp_ms / 1000)));
      k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.restore();

    // Primary (faint) and secondary (bold)
    const primCol = col(theme, 'primary');
    const secCol = m.tSat != null ? failCol : okCol;
    const trace = (arr, toY, color, lw, alpha, dash = []) => {
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.globalAlpha = alpha;
      ctx.lineJoin = 'round'; ctx.setLineDash(dash); ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const x = toX(m.times[k]), y = toY(arr[k]);
        k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.restore();
    };
    trace(m.ip, toY1, primCol, 1.2, 0.6);
    trace(m.iac, toY1, col(theme, 'alfo'), 1.1, 0.8, [2, 2]);
    trace(m.is, toY1, secCol, 2.2, 0.95);

    // Status
    let status = null, statusCol = col(theme, 'text');
    if (hasCheck) {
      status = m.tSat == null ? T('wave_no_sat')
             : t_al_s == null ? T('wave_saturating')
             : satInRelay ? T('wave_sat_within') : T('wave_sat_after');
      statusCol = ok ? okCol : failCol;
    }
    if (status) label(ctx, status, ml + cW - 3, mt1 + 11, statusCol, 'right', 'bold 10px JetBrains Mono, monospace');

    // Legend (top)
    ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'left';
    let lx = ml + 6;
    const ly = mt1 + 11;
    const legend = (color, text, alpha = 1, box = false) => {
      ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
      box ? ctx.fillRect(lx, ly - 7, 10, 8) : ctx.fillRect(lx, ly - 4, 12, 2.5);
      ctx.restore();
      label(ctx, text, lx + 15, ly, col(theme, 'text'));
      lx += 15 + ctx.measureText(text).width + 12;
    };
    legend(primCol, T('wave_primary'), 0.6);
    legend(col(theme, 'alfo'), T('wave_ac_only'), 0.8);
    legend(secCol, T('wave_secondary'));
    if (m.tSat != null) legend(failCol, T('wave_lost'), 0.3, true);

    // ── BOTTOM: core flux vs saturation flux ───────────────────────────
    drawZero(ctx, ml, cW, toY2(0), theme);
    const fluxCol = col(theme, 'alfo');
    trace(m.psiIdeal, toY2, col(theme, 'text'), 1, 0.7, [4, 3]);
    trace(m.psi, toY2, primCol, 2, 0.95);

    if (hasCheck) {
      const ySat = toY2(m.psiSat);
      drawHLine(ctx, ySat, ml, cW, failCol, 1.4, [7, 4]);
      label(ctx, `${T('wave_sat_limit')} ψsat=${m.psiSat.toFixed(2)}`, ml + cW - 3, ySat - 3, failCol, 'right');
      if (showNegSat) drawHLine(ctx, toY2(-m.psiSat), ml, cW, failCol, 1.4, [7, 4]);
      // The flux the requirement covers (at t_al, or the window peak)
      const yReq = toY2(m.psiReq);
      if (Math.abs(yReq - ySat) > 10) {
        drawHLine(ctx, yReq, ml, cW, fluxCol, 1, [2, 3]);
        label(ctx, `${T('wave_psi_req')}=${m.psiReq.toFixed(2)}`, ml + 4, yReq - 3, fluxCol);
      }
      // Offered / required readout
      label(ctx, `ψsat / ψreq = ${(m.psiSat / m.psiReq * 100).toFixed(1)}%`,
        ml + cW - 3, mt1 + 24, ok ? okCol : failCol, 'right');
    }

    // Legend (bottom)
    lx = ml + 6;
    const ly2 = mt2 + 11;
    const legend2 = (color, text, dash) => {
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(lx, ly2 - 3); ctx.lineTo(lx + 14, ly2 - 3); ctx.stroke(); ctx.restore();
      label(ctx, text, lx + 18, ly2, col(theme, 'text'));
      ctx.font = '9px JetBrains Mono, monospace';
      lx += 18 + ctx.measureText(text).width + 12;
    };
    legend2(primCol, T('wave_flux'), []);
    legend2(col(theme, 'text'), T('wave_flux_ideal'), [4, 3]);

    // First saturation (both panels)
    if (m.tSat != null) {
      const xs = toX(m.tSat);
      drawVLine(ctx, xs, mt1, h1 + gap + h2, failCol, [2, 2]);
      ctx.save(); ctx.fillStyle = failCol;
      ctx.beginPath(); ctx.arc(xs, toY2(m.psi[m.times.findIndex(t => t >= m.tSat)]), 3.5, 0, 2 * Math.PI); ctx.fill();
      ctx.restore();
      label(ctx, `t_sat=${(m.tSat * 1000).toFixed(1)}ms`, xs + 3, mt1 + h1 - 4, failCol);
    }

    // Tp
    const Tp = tp_ms / 1000;
    if (toX(Tp) < ml + cW - 20) {
      drawVLine(ctx, toX(Tp), mt1, h1 * 0.3, primCol, [3, 3]);
      label(ctx, `Tp=${tp_ms}ms`, toX(Tp) + 3, mt1 + h1 * 0.3, primCol);
    }

    // Trip time
    if (trip_ms != null) {
      const xTrip = toX(trip_ms / 1000);
      drawVLine(ctx, xTrip, mt1, h1 + gap + h2, col(theme, 'trip'), [6, 4]);
      label(ctx, `Trip ${trip_ms}ms`, xTrip + 3, mt1 + 22, col(theme, 'trip'));
    }

    // Axes
    ctx.fillStyle = col(theme, 'axis'); ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'right';
    for (const [toY, vals] of [[toY1, [iMax, iMin, 0]], [toY2, [fMax, fMin, 0]]]) {
      const used = [];
      for (const v of vals) {
        const y = toY(v);
        if (used.some(u => Math.abs(u - y) < 10)) continue;
        used.push(y); ctx.fillText(v.toFixed(1), ml - 4, y + 3);
      }
    }
    ctx.textAlign = 'center';
    for (let i = 0; i <= 5; i++) {
      ctx.fillText(`${Math.round(totalS * 1000 * i / 5)}ms`, ml + cW * i / 5, mt2 + h2 + 16);
    }
    for (const [txt, top, h] of [['i(t) [pu]', mt1, h1], ['ψ(t) [pu]', mt2, h2]]) {
      ctx.save(); ctx.fillStyle = col(theme, 'tick'); ctx.textAlign = 'center';
      ctx.translate(11, top + h / 2); ctx.rotate(-Math.PI / 2);
      ctx.fillText(txt, 0, 0); ctx.restore();
    }
  }

  // ── Protection scheme diagrams ─────────────────────────────────────────
  const SCHEMES = {
    line: `<g font-family="JetBrains Mono,monospace" font-size="9">
      <rect x="10" y="8" width="180" height="6" rx="2" fill="var(--accent)" opacity=".7"/>
      <text x="100" y="6" text-anchor="middle" fill="var(--accent)" font-size="8">BUSBAR</text>
      <line x1="60" y1="14" x2="60" y2="32" stroke="var(--text-dim)" stroke-width="2"/>
      <circle cx="60" cy="40" r="8" fill="none" stroke="var(--accent)" stroke-width="1.5"/>
      <line x1="60" y1="32" x2="60" y2="48" stroke="var(--text-dim)" stroke-width="2"/>
      <text x="74" y="43" fill="var(--text-muted)" font-size="8">CT</text>
      <rect x="54" y="52" width="12" height="10" rx="1" fill="none" stroke="var(--text-dim)" stroke-width="1.5"/>
      <line x1="60" y1="48" x2="60" y2="52" stroke="var(--text-dim)" stroke-width="2"/>
      <line x1="60" y1="62" x2="60" y2="72" stroke="var(--text-dim)" stroke-width="2"/>
      <text x="74" y="60" fill="var(--text-muted)" font-size="8">CB</text>
      <line x1="60" y1="72" x2="60" y2="90" stroke="var(--text-dim)" stroke-width="2"/>
      <line x1="40" y1="90" x2="120" y2="90" stroke="var(--text-dim)" stroke-width="2" stroke-dasharray="6,3"/>
      <text x="130" y="93" fill="var(--text-muted)" font-size="8">LINE</text>
    </g>`,
    transformer: `<g font-family="JetBrains Mono,monospace" font-size="9">
      <rect x="10" y="4" width="180" height="5" rx="2" fill="var(--accent)" opacity=".7"/>
      <text x="100" y="3" text-anchor="middle" fill="var(--accent)" font-size="8">HV BUSBAR</text>
      <line x1="70" y1="9" x2="70" y2="22" stroke="var(--text-dim)" stroke-width="2"/>
      <circle cx="70" cy="29" r="7" fill="none" stroke="var(--accent)" stroke-width="1.5"/>
      <line x1="70" y1="22" x2="70" y2="36" stroke="var(--text-dim)" stroke-width="2"/>
      <text x="82" y="32" fill="var(--text-muted)" font-size="8">HV CT</text>
      <rect x="64" y="40" width="12" height="9" rx="1" fill="none" stroke="var(--text-dim)" stroke-width="1.5"/>
      <line x1="70" y1="36" x2="70" y2="40" stroke="var(--text-dim)" stroke-width="2"/>
      <line x1="70" y1="49" x2="70" y2="58" stroke="var(--text-dim)" stroke-width="2"/>
      <text x="82" y="48" fill="var(--text-muted)" font-size="8">CB</text>
      <ellipse cx="70" cy="65" rx="10" ry="7" fill="none" stroke="var(--text-dim)" stroke-width="1.5"/>
      <ellipse cx="70" cy="78" rx="10" ry="7" fill="none" stroke="#22d3ee" stroke-width="1.5"/>
      <line x1="70" y1="85" x2="70" y2="94" stroke="var(--text-dim)" stroke-width="2"/>
      <text x="86" y="73" fill="var(--text-muted)" font-size="8">TRAFO</text>
      <circle cx="70" cy="101" r="7" fill="none" stroke="#22d3ee" stroke-width="1.5"/>
      <line x1="70" y1="94" x2="70" y2="108" stroke="var(--text-dim)" stroke-width="2"/>
      <text x="82" y="104" fill="var(--text-muted)" font-size="8">LV CT</text>
      <line x1="70" y1="108" x2="70" y2="116" stroke="var(--text-dim)" stroke-width="2"/>
      <rect x="10" y="116" width="180" height="5" rx="2" fill="#22d3ee" opacity=".5"/>
      <text x="100" y="130" text-anchor="middle" fill="var(--text-muted)" font-size="8">LV BUSBAR</text>
    </g>`,
    cable: `<g font-family="JetBrains Mono,monospace" font-size="9">
      <rect x="10" y="8" width="180" height="6" rx="2" fill="var(--accent)" opacity=".7"/>
      <text x="100" y="6" text-anchor="middle" fill="var(--accent)" font-size="8">BUSBAR</text>
      <line x1="60" y1="14" x2="60" y2="32" stroke="var(--text-dim)" stroke-width="2"/>
      <circle cx="60" cy="40" r="8" fill="none" stroke="var(--accent)" stroke-width="1.5"/>
      <line x1="60" y1="32" x2="60" y2="48" stroke="var(--text-dim)" stroke-width="2"/>
      <rect x="54" y="52" width="12" height="10" rx="1" fill="none" stroke="var(--text-dim)" stroke-width="1.5"/>
      <line x1="60" y1="48" x2="60" y2="52" stroke="var(--text-dim)" stroke-width="2"/>
      <line x1="60" y1="62" x2="60" y2="72" stroke="var(--text-dim)" stroke-width="2"/>
      <line x1="60" y1="72" x2="60" y2="90" stroke="var(--text-dim)" stroke-width="2"/>
      <line x1="40" y1="90" x2="120" y2="90" stroke="var(--text-dim)" stroke-width="3"/>
      <text x="130" y="93" fill="var(--text-muted)" font-size="8">CABLE</text>
    </g>`,
    busbar: `<g font-family="JetBrains Mono,monospace" font-size="9">
      <rect x="10" y="8" width="180" height="6" rx="2" fill="var(--accent)" opacity=".7"/>
      <text x="100" y="6" text-anchor="middle" fill="var(--accent)" font-size="8">PROTECTED BUSBAR</text>
      <line x1="60" y1="14" x2="60" y2="32" stroke="var(--text-dim)" stroke-width="2"/>
      <circle cx="60" cy="40" r="8" fill="none" stroke="var(--accent)" stroke-width="1.5"/>
      <line x1="60" y1="32" x2="60" y2="48" stroke="var(--text-dim)" stroke-width="2"/>
      <line x1="130" y1="14" x2="130" y2="32" stroke="var(--text-dim)" stroke-width="2"/>
      <circle cx="130" cy="40" r="8" fill="none" stroke="var(--accent)" stroke-width="1.5"/>
      <line x1="130" y1="32" x2="130" y2="48" stroke="var(--text-dim)" stroke-width="2"/>
      <text x="100" y="65" text-anchor="middle" fill="var(--text-muted)" font-size="8">BUSBAR PROTECTION</text>
    </g>`,
  };

  return {
    drawFaultWaveform, drawArWaveform, faultWaveformModel,
    computeKtdTrace, findTsat,
    SCHEMES,
  };
})();
