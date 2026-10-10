'use strict';
/**
 * distance.js — the CTDistance namespace for the distance protection package
 * (calculations/ct_distance/).
 *
 * The sub-files in calc/distance/ extend it, and calc/distance/main.js sets
 * CTDistance.calculate. The legacy simplified calculate() and the helpers
 * only it used are removed (PORTING_PLAN.md §9.6 9D, D5), and so is the
 * legacy C-O-C-O check calcAutoReclosure / offeredEalf that fed the results
 * panel's AR badge (§10.6 F-AR): the UI now reads the AR values from
 * CTDistance.calculate (calc/distance/auto_reclosure_ext.js).
 */

const CTDistance = {};
