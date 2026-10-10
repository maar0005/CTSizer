'use strict';
/**
 * transformer_diff/burden_calculation.js — Port of
 * calculations/ct_transformer_differential/burden_calculation.py
 *
 * Thin burden helpers for the transformer differential package: material
 * lookup / resistivity (bridged to the unified CTMaterials functions, exactly
 * as the Python bridges to calculations.materials), cable burden (from the
 * CTCableRes lead resistance, PORTING_PLAN.md §9), CT internal burden, total
 * burden and operating ALF. Python tuple returns are
 * returned as JS arrays in the same order so main.js can destructure 1:1.
 * Extends the CTTransformerDiff namespace (calc/transformer_diff.js, loaded
 * first); consumed by calc/transformer_diff/main.js.
 */

CTTransformerDiff.burden = (() => {
  // ── get_material_properties(cable_material) → [rho_20, alpha] ─────────
  function getMaterialProperties(cableMaterial) {
    const { rho20, alpha } = CTMaterials.getMaterialProps(cableMaterial);
    return [rho20, alpha];
  }

  // ── calculate_resistivity_at_temp(cable_material, cable_temp) → rho_t ─
  function calculateResistivityAtTemp(cableMaterial, cableTemp) {
    return CTMaterials.calcResistivityAtTemp(cableMaterial, cableTemp).rho_temp;
  }

  // ── calculate_cable_burden(...) → [s_wire, rho_t] — onto CTCableRes ────
  // `cableRes` is the core's CTCableRes.lead() result (PORTING_PLAN.md §9.6
  // 9C), so the burden follows the project method:
  //   S_wire = R_lead × Isr²   (R_lead = k_wire × R_c = r_loop)
  //   ρ_T    = R′_T × A / 1000 (Ω·mm²/m) — the resistivity equivalent to the
  //            toolbox R′_T, so k_wire·ρ_T·l_wire/a_wire·Isr² is this S_wire.
  //            Under iec60287 it is the Python ρ_T = ρ20·(1 + α(T − 20)).
  function calculateCableBurden(cableRes, cableCrossSection, secondaryCurrent) {
    const s_wire = cableRes.r_loop * secondaryCurrent ** 2;
    const rho_t = cableRes.r_per_km_at_temp * cableCrossSection / 1000;
    return [s_wire, rho_t];
  }

  // ── calculate_ct_internal_burden(rct, secondary_current) ──────────────
  // Sct = Rct × Isr²
  function calculateCtInternalBurden(rct, secondaryCurrent) {
    return rct * secondaryCurrent ** 2;
  }

  // ── calculate_total_burden(relay_burden, s_wire) ──────────────────────
  // Stotal = Srelay + Sadd + Swire  (Sadd = 0, no additional burdens)
  function calculateTotalBurden(relayBurden, sWire) {
    return relayBurden + sWire;
  }

  // ── calculate_operating_alf(alf, burden_va, s_ct, s_total) ────────────
  // ALF_O = ALF_r × (Sr + Sct) / (Stotal + Sct); null when alf is null.
  function calculateOperatingAlf(alf, burdenVa, sCt, sTotal) {
    if (alf === null || alf === undefined) return null;
    return alf * (burdenVa + sCt) / (sTotal + sCt);
  }

  return {
    getMaterialProperties, calculateResistivityAtTemp, calculateCableBurden,
    calculateCtInternalBurden, calculateTotalBurden, calculateOperatingAlf,
  };
})();
