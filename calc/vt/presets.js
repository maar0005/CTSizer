'use strict';
/**
 * vt/presets.js — Port of calculations/vt_calculations/presets.py
 *
 * VT presets and constants: voltage-drop limits per VT accuracy class (%),
 * default thermal burdens (VA), and the per-class definitions (max voltage
 * error %, max phase error in minutes, Danish description/application text
 * verbatim). Pure data — the Python source has no functions, only the three
 * module-level dicts re-exported by vt_calculations/__init__.py.
 *
 * Extends the CTVT namespace created by calc/vt/data.js. Consumed by
 * calc/vt/voltage_analysis.js (VOLTAGE_DROP_LIMITS);
 * not wired into calc/index.js.
 */

var CTVT = CTVT || {};

CTVT.presets = (() => {
  // Spændingsfald grænser baseret på VT klasse (%)
  const VOLTAGE_DROP_LIMITS = {
    '0.1': 0.1,
    '0.2': 0.2,
    '0.5': 0.5,
    '1.0': 1.0,
    '3P': 3.0,
  };

  // Standard termisk byrde værdier (VA)
  // Termisk byrde er typisk højere end nøjagtighedsbyrde
  const THERMAL_BURDEN_DEFAULTS = {
    small: 25,       // Små VT'er
    medium: 50,      // Mellem VT'er (standard)
    large: 100,      // Store VT'er
  };

  // VT klasse definitioner
  const CLASS_DEFINITIONS = {
    '0.1': {
      description: 'Klasse 0.1 - Højeste nøjagtighed',
      max_voltage_error: 0.1,      // % af nominel spænding
      max_phase_error: 5,          // minutter
      typical_applications: 'Præcisionsmålinger, kalibrering',
    },
    '0.2': {
      description: 'Klasse 0.2 - Høj nøjagtighed',
      max_voltage_error: 0.2,
      max_phase_error: 10,
      typical_applications: 'Energimåling, beskyttelse',
    },
    '0.5': {
      description: 'Klasse 0.5 - Standard nøjagtighed',
      max_voltage_error: 0.5,
      max_phase_error: 20,
      typical_applications: 'Almindelig måling og beskyttelse',
    },
    '1.0': {
      description: 'Klasse 1.0 - Basis nøjagtighed',
      max_voltage_error: 1.0,
      max_phase_error: 40,
      typical_applications: 'Indikering, simpel beskyttelse',
    },
    '3P': {
      description: 'Klasse 3P - Beskyttelse',
      max_voltage_error: 3.0,
      max_phase_error: 120,
      typical_applications: 'Beskyttelsessystemer',
    },
  };

  return { VOLTAGE_DROP_LIMITS, THERMAL_BURDEN_DEFAULTS, CLASS_DEFINITIONS };
})();
