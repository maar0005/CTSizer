'use strict';

// ctsizer-version.js — The CTSizer version, shown on the landing page, in the
// top bar of the calculation page and in the footer of the RTF report.
// Raise VERSION on a release. BUILD and BUILD_DATE are 'dev' / '' in the
// repository; the deploy workflow (.github/workflows/deploy.yml) stamps the
// commit and date of the deployed build into them.
const CTSVersion = (() => {
  const VERSION    = '0.9.0';
  const STAGE      = 'Beta';    // '' once CTSizer leaves beta
  const BUILD      = '589730e';
  const BUILD_DATE = '2026-10-15';

  // "v0.9.0 Beta"
  const short = () => `v${VERSION}${STAGE ? ' ' + STAGE : ''}`;
  // "CTSizer v0.9.0 Beta (build 1a2b3c4, 2026-10-10)"
  const full = () => {
    const build = [`build ${BUILD}`, BUILD_DATE].filter(Boolean).join(', ');
    return `CTSizer ${short()} (${build})`;
  };

  return { VERSION, STAGE, BUILD, BUILD_DATE, isBeta: !!STAGE, short, full };
})();

if (typeof window !== 'undefined') window.CTSVersion = CTSVersion;
