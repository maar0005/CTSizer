# CTSizer

![Tests: 5,840 passed](https://img.shields.io/badge/tests-5840%20passed-brightgreen)

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
- `calc/golden/` — the golden test vectors (see **Tests** and `TESTS.md`).
- `tools/run-tests.mjs` — runs the test suite with Node.js.
- `feedback.php` — the server-side relay for the "Give feedback" dialog.
- `.htaccess` — the security headers (Content Security Policy and the rest) the site is served with.
- `vendor/`, `fonts/` — React, Babel, KaTeX and the fonts, served locally (no CDN).
- `tools/build-deploy.mjs` — builds the deployed site (see **The deployed build**).
- `SECURITY.md` — how to report a security problem.

## Run it locally

There is no build step for development: `index.html` loads the `.jsx` files
and Babel compiles them in the browser. Serve the folder with any static web
server, for example

    python3 -m http.server 8000

and open <http://localhost:8000/>.

## The deployed build

What ctsizer.com serves is this source after `tools/build-deploy.mjs`: the
`.jsx` files are compiled ahead of time with the same Babel and the same
options the browser would use, the page loads the production builds of React,
Babel is left out, and the Content Security Policy in `.htaccess` is tightened
to `script-src 'self'`. Reproduce it with

    node tools/build-deploy.mjs deploy
    node tools/serve.mjs deploy 8000

and open <http://127.0.0.1:8000/>.

## Tests

Every release of ctsizer.com passes the whole test suite before it is
published: **5,840 checks in 53 test groups**, all passing
on this commit. **[TESTS.md](TESTS.md)** lists every test group, what it
checks and how many checks it has, with links to the test code.

5,162 of the checks are golden tests. The 42 files in
`calc/golden/` hold inputs and the expected results, produced by running the
Python reference implementation that the CTSizer calculations were ported
from. The JavaScript calculation engine is checked against those numbers, so
each result is pinned to the reference instead of to hand-derived values. The
other 678 checks are worked out by hand.

Run the suite yourself with Node.js 18 or newer:

    node tools/run-tests.mjs

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
