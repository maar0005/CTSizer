# Security

CTSizer is a free, non-commercial project run by one person. Reports are
welcome and will be answered.

## Reporting a vulnerability

Email **privacy@ctsizer.com**. Please do not open a public GitHub issue for a
security problem. Include what you found, how to reproduce it and, if you
have one, a suggested fix. You will get a reply within two weeks; fixes go
live with the next release of ctsizer.com. `https://ctsizer.com/.well-known/security.txt`
carries the same contact.

## Scope

- the web application at ctsizer.com (`index.html`, `ctsizer-*`, `calc/`)
- the feedback relay `feedback.php`
- the deploy workflow and the public mirror

Only the latest release at ctsizer.com is supported.

## What is in place

- No accounts, cookies, database or third-party resources; everything is
  calculated in the browser and stored on the user's device.
- React, KaTeX and the fonts are served from the site with Subresource
  Integrity hashes. `package.json` pins the vendored versions so Dependabot
  reports advisories; `tools/gen_vendor.py` copies the files.
- The deployed site is compiled ahead of time (`tools/build-deploy.mjs`),
  so it runs without `eval` under the Content Security Policy in `.htaccess`.
- The feedback relay keeps its GitHub token server-side, accepts only
  same-site JSON requests, caps sizes, rate-limits by salted hashes of the
  visitor address and writes to a private repository.
- Every release passes the calculation test suite and two headless browser
  end-to-end runs before it is deployed.
