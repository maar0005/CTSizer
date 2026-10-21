'use strict';
/**
 * foundation/fault_level.js — The project's fault level (not a port).
 *
 * System Data carries two maximum fault currents (kA): `isc_sys`, the 3-phase
 * Ik3 max, and `isc_1ph`, the 1-phase-to-earth Ik1 max. In a solidly earthed
 * network with Z0 < Z1, Ik1 > Ik3 (IEC 60909-0). Line differential checks the
 * 3-phase and 1-phase cases separately; the single-case modules (overcurrent,
 * busbar, distance, transformer differential) pair the worst (1-phase) lead
 * with the larger of the two currents (governingKa).
 *
 * primaryTimeConstants() is the Tp helper of the System Data panel: Tp3 and
 * Tp1 from the substation busbar's sequence (Thevenin) impedances.
 */
const CTFaultLevel = (() => {

  const isPos = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0;

  // The design fault current (kA): Ik1 when it is above Ik3, else Ik3. A
  // project without Ik1 (the direct calls of the golden tests) gives Ik3.
  function governingKa(ik3Ka, ik1Ka) {
    return isPos(ik1Ka) && !(ik1Ka <= ik3Ka) ? ik1Ka : ik3Ka;
  }

  // The step that shows Ik1 governing; null when Ik3 does (no new row, so
  // the existing results stay as they were).
  function governingStep(ik3Ka, ik1Ka) {
    if (governingKa(ik3Ka, ik1Ka) === ik3Ka) return null;
    return CTStep.make({
      key: 'ik_governing',
      label_en: 'Design fault current: the 1-phase-to-earth fault current is the larger',
      label_da: 'Dimensionerende fejlstrøm: den 1-fasede jordfejlstrøm er størst',
      latex: 'I_{k,max}=\\max(I_{k3,max},\\,I_{k1,max})',
      result: ik1Ka, unit: 'kA', precision: 2,
      variables: { Ik3_max: ik3Ka, Ik1_max: ik1Ka },
    });
  }

  // Tp from the sequence impedances (Ω) at the substation busbar, IEC 60909-0:
  //   Tp3 = X1 / (ω·R1)
  //   Tp1 = (X1 + X2 + X0) / (ω·(R1 + R2 + R0))
  // in ms; null for a case with a missing input or a resistance sum ≤ 0.
  // `missing` lists each case's blank inputs, for the panel.
  function primaryTimeConstants(z, freq) {
    z = z || {};
    const omega = 2 * Math.PI * freq;
    const num = (k) => typeof z[k] === 'number' && Number.isFinite(z[k]);
    const lack = (keys) => keys.filter((k) => !num(k));
    const keys3 = ['r1', 'x1'];
    const keys1 = ['r1', 'x1', 'r2', 'x2', 'r0', 'x0'];
    const missing = { tp3: lack(keys3), tp1: lack(keys1) };
    const ok = isPos(omega);
    const tp3 = ok && !missing.tp3.length && z.r1 > 0
      ? z.x1 / (omega * z.r1) * 1000 : null;
    const rSum = z.r1 + z.r2 + z.r0;
    const tp1 = ok && !missing.tp1.length && rSum > 0
      ? (z.x1 + z.x2 + z.x0) / (omega * rSum) * 1000 : null;
    return { tp3, tp1, missing };
  }

  return { governingKa, governingStep, primaryTimeConstants };
})();
