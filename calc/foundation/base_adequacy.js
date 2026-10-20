'use strict';
/**
 * foundation/base_adequacy.js — Port of calculations/ct_base.py (lines 476–759)
 *
 * Core-adequacy checking and CT-class recommendation: validates an offered
 * E_ALF/Vk against the application's requirement (IEC 61869-2 Clause
 * 5.6.202), quantifies the ALF-reduction benefit of low-remanence cores for
 * auto-reclosure duty, and recommends a CT class from application/Tp/voltage.
 * Depends on CTBaseClasses (CT_CLASS_DESCRIPTIONS, estimateAlfFromVoltage,
 * extractAlfFromClass).
 */
const CTBaseAdequacy = (() => {

  // ct_base.check_core_adequacy — margin >=10% required; <20% gets a
  // low-margin warning. Inadequate distance cores (Tp>=80ms) get ALF/TPY/
  // burden suggestions; inadequate differential cores get a PX suggestion.
  function checkCoreAdequacy(requiredEalfOrVk, offeredEalfOrVk, coreClass, application, tp = null, tAl = null) {
    const margin = offeredEalfOrVk - requiredEalfOrVk;
    const marginPct = requiredEalfOrVk > 0
      ? (margin / requiredEalfOrVk) * 100
      : (offeredEalfOrVk > 0 ? 100.0 : 0.0);

    const adequate = marginPct >= 10;
    const recommendations = [];
    const alternativeCores = [];

    if (!adequate) {
      const deficit = Math.abs(margin);
      const deficitPct = Math.abs(marginPct);

      recommendations.push({
        key: 'core_inadequate',
        params: { required: requiredEalfOrVk, offered: offeredEalfOrVk, deficit, deficit_pct: deficitPct },
      });

      if (application && application.toLowerCase().includes('distance') && tp && tp >= 80) {
        recommendations.push({ key: 'core_inadequate_high_tp', params: { tp } });

        const currentAlf = CTBaseClasses.estimateAlfFromVoltage(offeredEalfOrVk, coreClass);
        const requiredAlf = CTBaseClasses.estimateAlfFromVoltage(requiredEalfOrVk, coreClass);
        const suggestedAlf = Math.ceil(requiredAlf * 1.15);

        alternativeCores.push({
          class: coreClass,
          alf: suggestedAlf,
          burden_va: CTBaseClasses.extractAlfFromClass(coreClass),
          reason_key: 'core_recommendation_increase_alf',
          reason_params: { current_alf: Math.trunc(currentAlf), suggested_alf: suggestedAlf },
        });

        if (coreClass.includes('PR') || coreClass.includes('P')) {
          alternativeCores.push({
            class: 'TPY',
            specification: tAl ? `TPY, t_al=${tAl}ms` : 'TPY',
            reason_key: 'core_recommendation_switch_tpy',
          });
        }

        alternativeCores.push({
          class: coreClass,
          alf: Math.trunc(currentAlf),
          burden_va: 60,
          reason_key: 'core_recommendation_increase_burden',
        });
      } else if (application && application.toLowerCase().includes('differential')) {
        recommendations.push({ key: 'core_inadequate_differential' });
        alternativeCores.push({
          class: 'PX',
          vk: Math.ceil(requiredEalfOrVk * 1.15),
          reason_key: 'core_recommendation_px_class',
        });
      }
    } else if (marginPct < 20) {
      recommendations.push({ key: 'core_margin_low', params: { margin_pct: marginPct } });
    }

    return {
      adequate,
      margin_v: margin,
      margin_pct: marginPct,
      recommendations,
      alternative_cores: alternativeCores,
    };
  }

  // ct_base.calculate_remanence_benefit — IEC 61869-2 Clause 5.6.202.3: PR/
  // TPX/TPY/TPZ cores have <10% remanent flux vs up to 80% for standard
  // cores. For C-O-C-O duty, K_rem = 1/(1-K_r); a C-O cycle sees no benefit
  // (core demagnetizes before the next event).
  function calculateRemanenceBenefit(kTdBase, dutyCycle = 'C-O-C-O', coreClass = '5PR') {
    const upper = coreClass.toUpperCase();
    const isLowRemanence = ['PR', 'TPX', 'TPY', 'TPZ'].some((cls) => upper.includes(cls));
    const kRemanenceLow = 0.10;
    const kRemanenceStandard = 0.80;

    let kTdWithRemanence, kTdLowRemanence, alfReductionPct, explanationKey;
    if (dutyCycle === 'C-O-C-O') {
      const kRemStandard = 1.0 / (1.0 - kRemanenceStandard);
      const kRemLow = 1.0 / (1.0 - kRemanenceLow);
      kTdWithRemanence = kTdBase * kRemStandard;
      kTdLowRemanence = kTdBase * kRemLow;
      alfReductionPct = ((kTdWithRemanence - kTdLowRemanence) / kTdWithRemanence) * 100;
      explanationKey = 'remanence_benefit_coco';
    } else {
      kTdWithRemanence = kTdBase;
      kTdLowRemanence = kTdBase;
      alfReductionPct = 0.0;
      explanationKey = 'remanence_benefit_co';
    }

    return {
      k_td_base: kTdBase,
      k_td_with_remanence: kTdWithRemanence,
      k_td_low_remanence: kTdLowRemanence,
      alf_reduction_pct: alfReductionPct,
      k_remanence_standard: kRemanenceStandard,
      k_remanence_low: kRemanenceLow,
      duty_cycle: dutyCycle,
      is_low_remanence: isLowRemanence,
      explanation_key: explanationKey,
    };
  }

  // ct_base.recommend_ct_class — class guidance from application/Tp/voltage.
  // Distance: Tp<50→5P, Tp<80→5PR (with AR) or 5P, Tp>=80→TPY (EHV, 5PR
  // alternative) or 5PR. Differential→PX. Overcurrent/other→5P.
  function recommendCtClass(application, tp, voltageLevel, dutyCycle = 'C-O') {
    const recommendations = [];
    const appLower = application.toLowerCase();
    let recommendedClass, reasonKey;

    if (appLower === 'distance') {
      if (tp < 50) {
        recommendedClass = '5P';
        reasonKey = 'recommend_5p_low_tp';
      } else if (tp < 80) {
        if (dutyCycle === 'C-O-C-O') {
          recommendedClass = '5PR';
          reasonKey = 'recommend_5pr_medium_tp_ar';
        } else {
          recommendedClass = '5P';
          reasonKey = 'recommend_5p_medium_tp_no_ar';
        }
      } else if (voltageLevel >= 220) {
        recommendedClass = 'TPY';
        reasonKey = 'recommend_tpy_high_tp_ehv';

        const alternativeClass = '5PR';
        recommendations.push({
          class: alternativeClass,
          reason_key: 'recommend_5pr_alternative_high_tp',
          rank: 2,
          class_info: CTBaseClasses.CT_CLASS_DESCRIPTIONS[alternativeClass] || {},
        });
      } else {
        recommendedClass = '5PR';
        reasonKey = 'recommend_5pr_high_tp';
      }
    } else if (appLower === 'differential') {
      recommendedClass = 'PX';
      reasonKey = 'recommend_px_differential';
    } else if (appLower === 'overcurrent') {
      recommendedClass = '5P';
      reasonKey = 'recommend_5p_overcurrent';
    } else {
      recommendedClass = '5P';
      reasonKey = 'recommend_5p_general';
    }

    recommendations.unshift({
      class: recommendedClass,
      reason_key: reasonKey,
      rank: 1,
      class_info: CTBaseClasses.CT_CLASS_DESCRIPTIONS[recommendedClass] || {},
    });

    return {
      primary_recommendation: recommendedClass,
      all_recommendations: recommendations,
      tp,
      application,
      voltage_level: voltageLevel,
      duty_cycle: dutyCycle,
    };
  }

  return { checkCoreAdequacy, calculateRemanenceBenefit, recommendCtClass };
})();
