'use strict';
/**
 * transformer_diff.js — the CTTransformerDiff namespace for the transformer
 * differential package (calculations/ct_transformer_differential/).
 *
 * The sub-files in calc/transformer_diff/ extend it, and
 * calc/transformer_diff/main.js sets CTTransformerDiff.calculate. The legacy
 * simplified calculate() that lived here (its own cable resistance via
 * CTMaterials.cableResistance) is removed (PORTING_PLAN.md §9.6 9D, D5).
 */

const CTTransformerDiff = {};
