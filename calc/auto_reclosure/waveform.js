'use strict';
/**
 * auto_reclosure/waveform.js — Port of calculations/ct_auto_reclosure/waveform.py
 *
 * Simplified C-O-C-O transient waveforms for UI/report visualization (NOT a
 * substitute for full electromagnetic transient simulation):
 * - generateCocoTransient: AC sinusoid + exponentially-decaying DC offset
 *   (time constant T_p), re-established independently at the second fault.
 * - generateCocoFlux: normalized secondary linked flux, numerically integrated
 *   (implicit Euler) from the IEC 61869-100 §5.2.3 ODE T_s·dψ/dt + ψ = i_p_norm,
 *   using the worst-case (θ=0, max DC offset) normalized primary current.
 * Extends the CTAutoReclosure namespace (calc/auto_reclosure.js, loaded first).
 * Previously hand-duplicated in ctsizer-draw.js (drawArWaveform) — this is now
 * their single source; ctsizer-draw.js calls these directly.
 */

(() => {
  // numpy.arange(0, t3+dt, dt) sample count: ceil((t3+dt)/dt), epsilon-guarded
  // against float overshoot at the boundary.
  function sampleCount(t3, dt) {
    return Math.ceil(t3 / dt + 1 - 1e-9);
  }

  // ── generate_coco_transient ──────────────────────────────────────────
  function generateCocoTransient(
    t_prime, tfr, t_double_al,
    fs = 50.0, dt = 1e-4, idc_ratio = 0.6, idc_tau = 0.05, amplitude = 1.0, tp = null
  ) {
    const tau_dc = tp !== null ? tp : idc_tau;

    const t1 = t_prime;
    const t2 = t_prime + tfr;
    const t3 = t2 + t_double_al;

    const omega = 2 * Math.PI * fs;
    const idc0 = idc_ratio * amplitude;
    const n = sampleCount(t3, dt);

    const times = new Array(n);
    const waveform = new Array(n);

    for (let k = 0; k < n; k++) {
      const t = k * dt;
      times[k] = t;
      if (t <= t1) {
        // First fault: AC + DC offset decaying with T_p
        waveform[k] = amplitude * Math.sin(omega * t) + idc0 * Math.exp(-t / tau_dc);
      } else if (t < t2) {
        // Open period: small remnant
        waveform[k] = 0.05 * amplitude * Math.sin(omega * t);
      } else {
        // Second fault: NEW AC + NEW DC offset, independent fault inception
        const t_rel = t - t2;
        waveform[k] = amplitude * Math.sin(omega * t) + idc0 * Math.exp(-t_rel / tau_dc);
      }
    }

    return { times, waveform };
  }

  // ── generate_coco_flux ───────────────────────────────────────────────
  // `kr` (remanence factor) is unused in the ODE — passed through for parity
  // with the Python signature only (caller applies it elsewhere).
  function generateCocoFlux(
    t_prime, tfr, t_double_al, tp, ts,
    frequency = 50.0, dt = 1e-4, time_constant_class = 'low', kr = 0.10
  ) {
    const omega = 2.0 * Math.PI * frequency;
    const sqrt2 = Math.SQRT2;

    const t1 = t_prime;
    const t2 = t_prime + tfr;
    const t3 = t2 + t_double_al;
    const n = sampleCount(t3, dt);

    // Normalized primary current, worst case theta=0 (max DC offset):
    // i_p_norm(t) = sqrt(2) × [exp(-t/Tp) - cos(ωt)]
    function iPrimaryFault1(t) { return sqrt2 * (Math.exp(-t / tp) - Math.cos(omega * t)); }
    function iPrimaryFault2(t_rel) { return sqrt2 * (Math.exp(-t_rel / tp) - Math.cos(omega * t_rel)); }

    // Implicit Euler: Ts·(ψ[k]-ψ[k-1])/dt + ψ[k] = i_p[k]
    //              => ψ[k] = (Ts·ψ[k-1] + dt·i_p[k]) / (Ts + dt)
    const coeff = ts / (ts + dt);
    const driveCoeff = dt / (ts + dt);

    const times = new Array(n);
    const flux = new Array(n);
    times[0] = 0;
    flux[0] = 0;

    for (let k = 1; k < n; k++) {
      const t = k * dt;
      times[k] = t;
      if (t <= t1) {
        flux[k] = coeff * flux[k - 1] + driveCoeff * iPrimaryFault1(t);
      } else if (t < t2) {
        // Open period — no primary current. Both gapped (low) and non-gapped
        // (high) classes decay identically here; the T_s magnitude (not this
        // class label) is what makes non-gapped flux decay negligibly slowly.
        flux[k] = coeff * flux[k - 1];
      } else {
        const t_rel = t - t2;
        flux[k] = coeff * flux[k - 1] + driveCoeff * iPrimaryFault2(t_rel);
      }
    }

    return { times, flux };
  }

  CTAutoReclosure.generateCocoTransient = generateCocoTransient;
  CTAutoReclosure.generateCocoFlux = generateCocoFlux;
})();
