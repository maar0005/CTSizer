# CTSizer

![Tests: 5,809 passed](https://img.shields.io/badge/tests-5809%20passed-brightgreen)

CTSizer is a free web application for dimensioning current transformers (CT)
and voltage transformers (VT) for protection and metering. It runs at
**[ctsizer.com](https://ctsizer.com)**.

Everything is calculated in your browser. Projects are stored only on your own
device, and every result can be followed step by step in the formula view and
in the exported report.

CTSizer is a personal, non-commercial project by Maarten L. Kamstrup. I am not
a JavaScript expert, so suggestions for the code are very welcome.

## This repository

This repository holds the source code of the website exactly as it is
published: each commit is a release of ctsizer.com, and its message names the
version and build shown in the app.

- `index.html` — the page; it loads every script in order.
- `ctsizer-*.jsx`, `ctsizer-*.js` — the user interface, report export and texts (EN/DA).
- `calc/` — the calculation engine, one module per protection or metering function.
- `calc/tests.js` — the test suite; the app also runs it in the browser.
- `calc/golden/` — the golden test vectors (see **Tests**).
- `tools/run-tests.mjs` — runs the test suite with Node.js.
- `feedback.php` — the server-side relay for the "Give feedback" dialog.
- `vendor/`, `fonts/` — React, Babel, KaTeX and the fonts, served locally (no CDN).

## Run it locally

There is no build step. Serve the folder with any static web server, for
example

    python3 -m http.server 8000

and open <http://localhost:8000/>.

## Tests

Every release of ctsizer.com passes the whole test suite before it is
published: **5,809 checks in 52 test groups**, all passing
on this commit.

Most of them are golden tests. The 42 files in `calc/golden/` hold
inputs and the expected results, produced by running the Python reference
implementation that the CTSizer calculations were ported from. The JavaScript
calculation engine is checked against those numbers, so each result is pinned
to the reference instead of to hand-derived values. `calc/golden/e2e.json` runs
complete bays end to end.

Run the suite yourself with Node.js 18 or newer:

    node tools/run-tests.mjs

<details>
<summary>Checks per test group</summary>

| Test group | Checks |
|---|---:|
| Foundation | 79 |
| Materials | 57 |
| CableResCore | 121 |
| CableResTable | 925 |
| CableResIec60287 | 923 |
| CableResTopology | 65 |
| Overcurrent | 136 |
| Metering | 136 |
| Busbar | 133 |
| Generic | 102 |
| DistanceMain | 298 |
| DistanceData | 27 |
| DistanceCableResistance | 15 |
| DistanceFaultCalculation | 22 |
| DistanceTransientFactors | 35 |
| DistanceKneePoint | 10 |
| DistanceRelay | 8 |
| DistanceAutoReclosureExt | 36 |
| DistanceFormatting | 14 |
| AutoReclosure | 13 |
| ArTsTable | 26 |
| AutoReclosurePresets | 25 |
| AutoReclosureComputation | 20 |
| AutoReclosureWaveform | 12 |
| TransformerDiffMain | 686 |
| TransformerDiffPresets | 7 |
| TransformerDiffData | 32 |
| TransformerDiffBurden | 21 |
| TransformerDiffMethodsEmf | 28 |
| TransformerDiffMethodsIec61869 | 31 |
| TransformerDiffMethodsZiegler | 18 |
| TransformerDiffFormatting | 45 |
| LineDiffMain | 206 |
| LineDiffData | 22 |
| LineDiffEmfCalculation | 22 |
| LineDiffKneePoint | 9 |
| LineDiffAutoReclosureExt | 12 |
| LineDiffFormatting | 29 |
| VtData | 23 |
| VtPresets | 16 |
| VtImpedance | 72 |
| VtCurrentBurden | 71 |
| VtVoltageAnalysis | 56 |
| VtThermal | 50 |
| VtValidation | 58 |
| VtFormatting | 23 |
| VtCalculator | 593 |
| CtCalculations | 122 |
| CableResConsistency | 19 |
| RelayDb | 10 |
| IedRating | 33 |
| EndToEnd | 257 |

</details>

## Feedback

Use **Give feedback** in the app, or open an issue in this repository.

## Licence

CTSizer is free software: you can redistribute it and/or modify it under the
terms of the GNU Affero General Public License, version 3 (`LICENSE`). Anyone
who runs a modified version as a website must offer its source code to the
users of that site. Copyright © 2026 Maarten L. Kamstrup.

Third-party files keep their own licences: `vendor/*/LICENSE` (MIT) and
`fonts/OFL.txt` (SIL Open Font License 1.1).

Privacy questions: privacy@ctsizer.com.
