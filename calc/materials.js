'use strict';
/**
 * materials.js — Exact port of calculations/materials.py
 * IEC 60287-1:2006 cable resistance calculations + IEC 60228 table
 */

const CTMaterials = (() => {

  // ── Constants (IEC 60287-1:2006) ──────────────────────────────────────
  const COPPER_RESISTIVITY_20C    = 0.017241;  // Ω·mm²/m
  const ALUMINUM_RESISTIVITY_20C  = 0.02826;   // Ω·mm²/m
  const COPPER_TEMP_COEFFICIENT   = 0.00393;   // K⁻¹
  const ALUMINUM_TEMP_COEFFICIENT = 0.00403;   // K⁻¹
  const MAX_CONDUCTOR_TEMP        = 75.0;      // °C per IEC 61869-1
  const SECURITY_FACTOR_C         = 1.1;       // IEC 60909

  // ── Material properties lookup (materials.MATERIAL_PROPERTIES) ────────
  const MATERIAL_PROPERTIES = {
    'Kobber (Cu)': {
      resistivity_20c: COPPER_RESISTIVITY_20C,
      temp_coefficient: COPPER_TEMP_COEFFICIENT,
      name: 'Kobber',
      name_en: 'Copper',
    },
    'Aluminium (Al)': {
      resistivity_20c: ALUMINUM_RESISTIVITY_20C,
      temp_coefficient: ALUMINUM_TEMP_COEFFICIENT,
      name: 'Aluminium',
      name_en: 'Aluminum',
    },
  };

  // ── Wiring configuration (materials.get_wiring_factor / K_WIRE) ───────
  // Always ×2 (go + return) for now. Future: 4-/6-wire topologies depending
  // on wiring scheme + fault type.
  function getWiringFactor() {
    return 2;
  }
  const K_WIRE = 2; // legacy alias — prefer getWiringFactor()

  // ── IEC 60228 Table 2 — Class 2 stranded, max DC resistance at 20°C (Ω/km) ──
  // Format: cross_section_mm2 → [copper, aluminum]  (null = not available)
  const IEC_60228 = {
    0.5:  [36.0,   null],
    0.75: [24.5,   null],
    1.0:  [18.1,   null],
    1.5:  [12.1,   19.5],
    2.5:  [7.41,   12.1],
    4:    [4.61,   7.41],
    6:    [3.08,   4.61],
    10:   [1.83,   3.08],
    16:   [1.15,   1.91],
    25:   [0.727,  1.20],
    35:   [0.524,  0.868],
    50:   [0.387,  0.641],
    70:   [0.268,  0.443],
    95:   [0.193,  0.320],
    120:  [0.153,  0.253],
    150:  [0.124,  0.206],
    185:  [0.0991, 0.164],
    240:  [0.0754, 0.125],
    300:  [0.0601, 0.100],
  };

  // ── Material detection (language-independent: chemical symbol only) ───
  // Tri-state: true/false, or null when material is empty/undefined (N/A).
  function isCopperMaterial(material) {
    if (!material) return null;
    return material.includes('(Cu)');
  }
  function isAluminumMaterial(material) {
    if (!material) return null;
    return material.includes('(Al)');
  }

  // ── Get material properties (materials.get_material_properties) ──────
  // Word-based detection (kobber/copper/aluminium/aluminum or chemical
  // symbol, case-insensitive); defaults to copper when material is empty
  // or unrecognised (conservative for burden calculation).
  function getMaterialProps(material) {
    const lower = material ? material.toLowerCase() : '';
    if (!lower || lower.includes('kobber') || lower.includes('copper') || lower.includes('(cu)')) {
      return { rho20: COPPER_RESISTIVITY_20C, alpha: COPPER_TEMP_COEFFICIENT, name: 'Kobber' };
    }
    if (lower.includes('aluminium') || lower.includes('aluminum') || lower.includes('(al)')) {
      return { rho20: ALUMINUM_RESISTIVITY_20C, alpha: ALUMINUM_TEMP_COEFFICIENT, name: 'Aluminium' };
    }
    return { rho20: COPPER_RESISTIVITY_20C, alpha: COPPER_TEMP_COEFFICIENT, name: 'Kobber' };
  }

  // ── Get DC resistance/km at 20°C (IEC 60228 table, fallback IEC 60287) ──
  function getDcResistancePerKm(material, crossSectionMm2) {
    const entry = IEC_60228[crossSectionMm2];
    if (entry) {
      const isAl = isAluminumMaterial(material);
      if (isAl && entry[1] !== null) return entry[1];
      if (!isAl) return entry[0];
    }
    // Fallback: calculate from pure resistivity (IEC 60287) for
    // non-standard cross-sections (e.g. 5mm²)
    const { rho20 } = getMaterialProps(material);
    return rho20 / crossSectionMm2 * 1000;
  }

  // ── Resistivity at temperature ─────────────────────────────────────────
  // ρ(T) = ρ₂₀ × (1 + α × (T − 20))
  function calcResistivityAtTemp(material, tempC) {
    const { rho20, alpha } = getMaterialProps(material);
    return { rho_temp: rho20 * (1 + alpha * (tempC - 20)), alpha };
  }

  // ── Resistance at temperature, from an arbitrary Ω/km value ───────────
  // R(T) = R₂₀ × (1 + α × (T − 20)) — same law applied to a resistance
  // value instead of a resistivity (scales a user-supplied Ω/km figure
  // rather than recomputing it from cross-section).
  function calcResistanceAtTemp(dcResistance20, cableTemp, cableMaterial) {
    const { alpha } = getMaterialProps(cableMaterial);
    return { r_temp: dcResistance20 * (1 + alpha * (cableTemp - 20)), alpha };
  }

  // ── Single conductor resistance (Ω) ───────────────────────────────────
  // R_one = ρ(T) × L[m] / A[mm²]
  function calcSingleConductorResistance(material, tempC, lengthM, crossMm2) {
    const { rho_temp, alpha } = calcResistivityAtTemp(material, tempC);
    const { name } = getMaterialProps(material);
    return { r_one: rho_temp * lengthM / crossMm2, rho_temp, alpha, material_name: name };
  }

  // ── Total lead resistance (go + return) ───────────────────────────────
  function calcWireResistance(material, tempC, lengthM, crossMm2) {
    const single = calcSingleConductorResistance(material, tempC, lengthM, crossMm2);
    return {
      r_wire: getWiringFactor() * single.r_one,
      rho_temp: single.rho_temp,
      alpha: single.alpha,
      material_name: single.material_name,
    };
  }

  // ── Cable burden (VA) ─────────────────────────────────────────────────
  // S_wire = R_wire × I²
  function calcCableBurden(material, tempC, lengthM, crossMm2, secondaryCurrent) {
    const { r_wire, rho_temp } = calcWireResistance(material, tempC, lengthM, crossMm2);
    return { burden: r_wire * secondaryCurrent * secondaryCurrent, rho_temp };
  }

  // ── Validate input resistivity against the physical/IEC 60228 constant ──
  // Flags inputs that deviate >10% from the expected standard value.
  function validateCableResistivity(dcResistance20, crossSection, cableMaterial) {
    if (crossSection <= 0) {
      return { is_valid: false, expected: 0, deviation_pct: 100, warning: 'Invalid cross-section: must be > 0' };
    }

    const { name: materialName } = getMaterialProps(cableMaterial);
    const expectedRho = getDcResistancePerKm(cableMaterial, crossSection);
    const deviationPct = Math.abs((dcResistance20 - expectedRho) / expectedRho * 100);

    let warning = null;
    if (deviationPct > 10) {
      warning = `ADVARSEL: Kabelmodstand ved 20°C (${dcResistance20.toFixed(4)} Ω/km) ` +
        `afviger ${deviationPct.toFixed(1)}% fra standard ${materialName} ` +
        `værdi (${expectedRho.toFixed(4)} Ω/km). ` +
        `Verificer input eller kabelspecifikation.`;
    }

    return { is_valid: deviationPct <= 10, expected: expectedRho, deviation_pct: deviationPct, warning };
  }

  return {
    COPPER_RESISTIVITY_20C, ALUMINUM_RESISTIVITY_20C,
    COPPER_TEMP_COEFFICIENT, ALUMINUM_TEMP_COEFFICIENT,
    MAX_CONDUCTOR_TEMP, SECURITY_FACTOR_C,
    MATERIAL_PROPERTIES, K_WIRE, IEC_60228,
    getWiringFactor,
    isCopperMaterial, isAluminumMaterial,
    getMaterialProps, getDcResistancePerKm,
    calcResistivityAtTemp, calcResistanceAtTemp,
    calcSingleConductorResistance, calcWireResistance,
    calcCableBurden, validateCableResistivity,
  };
})();
