# CTSizer

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
- `calc/tests.js` — the self-test the app runs in the browser.
- `feedback.php` — the server-side relay for the "Give feedback" dialog.
- `vendor/`, `fonts/` — React, Babel, KaTeX and the fonts, served locally (no CDN).

## Run it locally

There is no build step. Serve the folder with any static web server, for
example

    python3 -m http.server 8000

and open <http://localhost:8000/>.

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
