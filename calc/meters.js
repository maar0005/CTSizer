'use strict';
/**
 * meters.js — CTMeterDB: meter presets for the Meter / Relay / IED card of the
 * metering CT and VT cores (issue #125).
 *
 * A preset is a starting point, never read-only (unlike CTRelayDB): picking
 * one fills the core's editable fields, and the user can then type the value
 * of a specific meter variant. The core keys:
 *   meter_manufacturer, meter_model (preset id, '' = custom), meter_tag,
 *   device_burden      — the meter's burden [VA/phase] on the CT current
 *                        circuit (metering core) or on the VT (VT core),
 *   min_safety_factor  — Fmin, the meter's overcurrent withstand factor
 *                        (metering core; IEC 61869-2 does not define it,
 *                        it comes from the meter datasheet),
 *   vt_supply_mode     — 'aux' (auxiliary supply) or 'self' (powered from
 *                        the VT) on a VT core.
 *
 * Per preset: ct_burden_va (current circuit), vt_burden_va per supply mode
 * (voltage circuit, plus the supply drawn from the VT when self-powered) and
 * fmin. CEWE Prometer 100 datasheet, "Burden": < 0.1 VA/phase for the voltage
 * and current circuits; self-powered < 6 VA/phase on the VT supply. Maximum
 * withstand 20 × Imax for 0.5 s (Secure Meters datasheet), so Fmin = 20.
 */

const CTMeterDB = (() => {
  // Burden of a meter without a preset, per VT supply mode [VA/phase]
  const SUPPLY_DEFAULT_VA = { aux: 0.1, self: 6 };
  // Defaults of a metering core's meter (CEWE Prometer 100)
  const DEFAULT_CT_BURDEN_VA = 0.1;
  const DEFAULT_FMIN = 20;

  const METERS = [
    {
      id: 'cewe_prometer_100', manufacturer: 'CEWE', model: 'Prometer 100',
      ct_burden_va: 0.1,
      vt_burden_va: { aux: 0.1, self: 6 },
      fmin: 20,
    },
  ];

  const byId = (id) => METERS.find((m) => m.id === id) || null;
  const manufacturers = () => [...new Set(METERS.map((m) => m.manufacturer))].sort();
  const list = (manufacturer) => METERS.filter((m) => !manufacturer || m.manufacturer === manufacturer);
  const supplyMode = (core) => ((core && core.vt_supply_mode) === 'self' ? 'self' : 'aux');

  // The values a preset (or, with none, the supply-mode default) gives a core
  // of this calc type: { device_burden[, min_safety_factor] }.
  function presetValues(id, calcType, mode = 'aux') {
    const m = byId(id);
    if (calcType === 'vt') {
      const va = m ? m.vt_burden_va[mode] : SUPPLY_DEFAULT_VA[mode];
      return { device_burden: va ?? SUPPLY_DEFAULT_VA.aux };
    }
    if (!m) return null;
    return { device_burden: m.ct_burden_va, min_safety_factor: m.fmin };
  }

  // Fields of the core that differ from its preset (the "modified from
  // preset" note); [] when no preset is picked.
  function modifiedFields(core, calcType) {
    if (!core || !byId(core.meter_model)) return [];
    const want = presetValues(core.meter_model, calcType, supplyMode(core));
    return Object.keys(want).filter((k) => core[k] != null && Number(core[k]) !== want[k]);
  }

  return {
    METERS, SUPPLY_DEFAULT_VA, DEFAULT_CT_BURDEN_VA, DEFAULT_FMIN,
    byId, manufacturers, list, supplyMode, presetValues, modifiedFields,
  };
})();
