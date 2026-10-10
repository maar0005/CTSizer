'use strict';
/**
 * line_diff.js — the CTLineDiff namespace for the line differential package
 * (calculations/ct_line_differential/).
 *
 * The sub-files in calc/line_diff/ extend it, and calc/line_diff/main.js sets
 * CTLineDiff.calculate. The legacy simplified calculate() that lived here
 * (its own cable resistance via CTMaterials.cableResistance) is removed
 * (PORTING_PLAN.md §9.6 9D, D5).
 */

const CTLineDiff = {};
