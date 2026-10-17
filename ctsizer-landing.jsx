// ctsizer-landing.jsx — Landing page and Privacy Policy.
// The first screen of every page load: what CTSizer is, how it works, how it
// handles data and where it stands under the EU AI Act. The user acknowledges
// the description and the Privacy Policy and continues to the Terms and
// Conditions (ctsizer-terms.jsx). Like the terms, the acknowledgement is held
// in memory only and is asked for again on every page load.
(() => {
const { useState, useEffect, useMemo } = React;

// Shared by the gates: `home()` returns to this landing page from the project
// list or a project (the logo); `termsOk` remembers, for this page load only,
// that the terms were accepted, so they are not asked for again on the way back.
const GateContext = React.createContext({ home: null, termsOk: false, acceptTerms: () => {} });

const PRIVACY_VERSION   = '1.0';
const PRIVACY_EFFECTIVE = '2026-10-10';
const REPO_URL = 'https://github.com/maar0005/CTSizer';
const REPO_NAME = 'maar0005/CTSizer';
const PRIVACY_EMAIL = 'privacy@ctsizer.com';
const OWNER = 'Maarten L. Kamstrup';

// ── Landing text ──────────────────────────────────────────────────────────
const TEXT = {
  en: {
    tagline: 'CT/VT dimensioning for protection and metering',
    beta_h: 'Beta version — still under development',
    beta: 'CTSizer is still under development and is released as a beta version. Do not rely 100% on all calculations: '
      + 'errors may still occur, so check every result independently before you use it.',
    intro: 'CTSizer is a free web tool for sizing current transformers (CTs) and voltage transformers (VTs) '
      + 'to IEC 61869. Enter the station, its bays and the protection devices, and CTSizer checks knee-point '
      + 'voltage, accuracy limit factor, burden and transient dimensioning — with every formula and calculation step shown.',
    pills: ['No account', 'No cookies', 'No tracking', 'Runs in your browser', 'Open source', 'English / Dansk'],
    apps_h: 'What you can dimension',
    apps: [
      ['Overcurrent protection', 'ALF and burden check of protection cores.'],
      ['Distance protection', 'Transient dimensioning, line data and C-O-C-O auto-reclosure analysis.'],
      ['Line differential', 'Knee-point requirements with transient dimensioning, incl. auto-reclosure.'],
      ['Transformer differential', 'HV and LV cores with through-fault and internal-fault requirements.'],
      ['Busbar protection', 'Class P and PX cores, ALF and knee-point checks.'],
      ['Metering', 'Instrument security factor and minimum burden.'],
      ['Voltage transformers', 'Burden, voltage drop and thermal checks.'],
      ['Report export', 'RTF documentation report with every step, chart and verdict.'],
    ],
    how_h: 'How it works',
    how: [
      ['Projects', 'Every project is kept on its own in your browser. Start a new one or open an existing one from the project list.'],
      ['Station data', 'Nominal voltage, frequency, system fault current and primary time constant.'],
      ['Bays', 'Add a feeder and pick its purpose first — line, transformer, cable or busbar.'],
      ['Devices and cores', 'Add the protection and metering devices of the bay and enter CT/VT and relay data.'],
      ['Results', 'Pass/fail per core, the full calculation with formulas, saturation and fault waveform charts.'],
      ['Report', 'Save the project as a .ctvt file and export the documentation report.'],
    ],
    who_h: 'Who it is for',
    who: 'CTSizer is an engineering aid for qualified protection and metering engineers. It is not a certified '
      + 'design tool: results are based on simplified models and interpretations of standards and must always be '
      + 'checked independently. The Terms and Conditions on the next page set out the conditions of use.',
    privacy_h: 'Your data and privacy',
    privacy: [
      'Calculations run entirely in your browser. Projects, settings and templates are stored only in your browser\'s local storage and in files you save yourself — we never receive them.',
      'There is no account, no cookies, no analytics, no advertising and no tracking.',
      'Everything — fonts and program libraries included — is served from ctsizer.com itself. No third-party server is contacted; only the website host sees technical data such as your IP address.',
      'Feedback is sent only if you choose to. You review the report before it is sent, and it goes privately to the developer.',
    ],
    ai_h: 'Artificial intelligence — EU AI Act',
    ai: [
      'CTSizer does not contain or use artificial intelligence. Every result is computed by deterministic, rule-based formulas from published standards and manufacturer guidance: the same inputs always give the same results, and every step is shown so it can be checked.',
      'CTSizer is therefore not an AI system under the EU Artificial Intelligence Act (Regulation (EU) 2024/1689), and it makes no automated decisions about people. Parts of the source code were written with AI-assisted programming tools; the calculations are verified against reference results by an automated test suite.',
    ],
    read_privacy: 'Read the full Privacy Policy',
    ack: 'I have read the description of CTSizer and the Privacy Policy.',
    continue: 'Continue to Terms and Conditions',
    continue_back: 'Continue to your projects',
    oss_h: 'Free and open source',
    oss: 'CTSizer is a non-commercial spare-time project. The complete source code is public under the GNU AGPL-3.0 licence — read how every result is calculated, report an issue or contribute.',
    oss_cta: 'View on GitHub',
    oss_licence: 'Licence: GNU AGPL-3.0',
    contact: 'Privacy questions',
    privacy_link: 'Privacy Policy',
  },
  da: {
    tagline: 'CT/VT-dimensionering til beskyttelse og måling',
    beta_h: 'Betaversion — stadig under udvikling',
    beta: 'CTSizer er stadig under udvikling og udgives som betaversion. Du bør ikke stole 100 % på alle beregninger: '
      + 'der kan stadig være fejl, så kontrollér altid resultaterne uafhængigt, før du bruger dem.',
    intro: 'CTSizer er et gratis webværktøj til dimensionering af strømtransformere (CT) og spændingstransformere (VT) '
      + 'efter IEC 61869. Angiv stationen, dens felter og beskyttelsesudstyret, og CTSizer kontrollerer knæpunktsspænding, '
      + 'nøjagtighedsgrænsefaktor, byrde og transient dimensionering — med alle formler og beregningstrin vist.',
    pills: ['Ingen konto', 'Ingen cookies', 'Ingen sporing', 'Kører i din browser', 'Open source', 'English / Dansk'],
    apps_h: 'Hvad du kan dimensionere',
    apps: [
      ['Overstrømsbeskyttelse', 'ALF- og byrdekontrol af beskyttelseskerner.'],
      ['Distancebeskyttelse', 'Transient dimensionering, linjedata og C-O-C-O genindkoblingsanalyse.'],
      ['Linjedifferential', 'Knæpunktskrav med transient dimensionering, inkl. genindkobling.'],
      ['Transformatordifferential', 'HV- og LV-kerner med krav ved gennemgående og interne fejl.'],
      ['Samleskinnebeskyttelse', 'Klasse P- og PX-kerner, ALF- og knæpunktskontrol.'],
      ['Måling', 'Instrumentsikkerhedsfaktor og minimumsbyrde.'],
      ['Spændingstransformere', 'Byrde, spændingsfald og termisk kontrol.'],
      ['Rapporteksport', 'RTF-dokumentationsrapport med alle trin, grafer og konklusioner.'],
    ],
    how_h: 'Sådan virker det',
    how: [
      ['Projekter', 'Hvert projekt gemmes for sig i din browser. Start et nyt, eller åbn et eksisterende fra projektlisten.'],
      ['Stationsdata', 'Nominel spænding, frekvens, systemkortslutningsstrøm og primær tidskonstant.'],
      ['Felter', 'Tilføj en feeder, og vælg først dens formål — linje, transformer, kabel eller samleskinne.'],
      ['Udstyr og kerner', 'Tilføj feltets beskyttelses- og måleudstyr, og angiv CT/VT- og relædata.'],
      ['Resultater', 'Bestået/ikke bestået pr. kerne, hele beregningen med formler, mætnings- og fejlkurver.'],
      ['Rapport', 'Gem projektet som .ctvt-fil, og eksportér dokumentationsrapporten.'],
    ],
    who_h: 'Hvem er det til',
    who: 'CTSizer er et ingeniørværktøj til kvalificerede beskyttelses- og måleingeniører. Det er ikke et certificeret '
      + 'designværktøj: resultaterne bygger på forenklede modeller og fortolkninger af standarder og skal altid kontrolleres '
      + 'uafhængigt. Vilkår og betingelser på næste side fastsætter betingelserne for brug.',
    privacy_h: 'Dine data og privatliv',
    privacy: [
      'Beregningerne kører udelukkende i din browser. Projekter, indstillinger og skabeloner gemmes kun i browserens lokale lager og i filer, du selv gemmer — vi modtager dem aldrig.',
      'Der er ingen konto, ingen cookies, ingen statistik, ingen annoncer og ingen sporing.',
      'Alt — også skrifttyper og programbiblioteker — leveres fra ctsizer.com selv. Ingen tredjepartsserver kontaktes; kun webhotellet ser tekniske data som din IP-adresse.',
      'Feedback sendes kun, hvis du selv vælger det. Du gennemser rapporten, før den sendes, og den går privat til udvikleren.',
    ],
    ai_h: 'Kunstig intelligens — EU\'s AI-forordning',
    ai: [
      'CTSizer indeholder og bruger ikke kunstig intelligens. Alle resultater beregnes med deterministiske, regelbaserede formler fra publicerede standarder og producentvejledninger: de samme inddata giver altid de samme resultater, og alle trin vises, så de kan kontrolleres.',
      'CTSizer er derfor ikke et AI-system efter EU\'s forordning om kunstig intelligens (forordning (EU) 2024/1689), og det træffer ingen automatiske afgørelser om personer. Dele af kildekoden er skrevet med AI-assisterede programmeringsværktøjer; beregningerne verificeres mod referenceresultater af en automatisk testsuite.',
    ],
    read_privacy: 'Læs hele privatlivspolitikken',
    ack: 'Jeg har læst beskrivelsen af CTSizer og privatlivspolitikken.',
    continue: 'Fortsæt til Vilkår og betingelser',
    continue_back: 'Fortsæt til dine projekter',
    oss_h: 'Gratis og open source',
    oss: 'CTSizer er et ikke-kommercielt fritidsprojekt. Hele kildekoden er offentlig under licensen GNU AGPL-3.0 — se, hvordan hvert resultat beregnes, rapportér en fejl, eller bidrag.',
    oss_cta: 'Se på GitHub',
    oss_licence: 'Licens: GNU AGPL-3.0',
    contact: 'Spørgsmål om privatliv',
    privacy_link: 'Privatlivspolitik',
  },
};

// ── Privacy Policy text ───────────────────────────────────────────────────
// English is the governing version. Each section: { h, p:[...] }; a paragraph
// given as an array is rendered as a bullet list.
const PRIVACY = {
  en: {
    title: 'Privacy Policy',
    version: `Version ${PRIVACY_VERSION} · effective ${PRIVACY_EFFECTIVE}`,
    sections: [
      { h: '1. Who is responsible', p: [
        `This Privacy Policy explains how personal data is processed when you use CTSizer at ctsizer.com ("CTSizer", "we", "us"). CTSizer is a free, non-commercial spare-time project, developed and run by ${OWNER} as a private individual — not a company. ${OWNER} is the data controller under the EU General Data Protection Regulation (GDPR).`,
        `Contact for all privacy questions and requests: ${PRIVACY_EMAIL}. Please use this address rather than a public GitHub issue for anything that contains personal data.`,
        `CTSizer is open source under the GNU Affero General Public License v3.0. The complete source code — including everything this policy describes — is public at ${REPO_URL}, so anyone can check exactly what the software does.`,
      ]},
      { h: '2. Summary', p: [[
        'CTSizer has no user accounts and no log-in.',
        'CTSizer sets no cookies and uses no analytics, advertising, fingerprinting or other tracking.',
        'All calculations run locally in your browser. Your projects, settings and templates are never sent to us.',
        'Everything the page needs — fonts and program libraries included — is served from ctsizer.com itself; no third-party server is contacted. Technical data (such as your IP address) is processed only by our hosting provider (section 4).',
        'Feedback is sent only if you actively choose to send it (section 5).',
      ]]},
      { h: '3. Data stored in your browser', p: [
        'CTSizer stores the following in your browser\'s local storage (localStorage and sessionStorage) on your own device:',
        [
          'your projects: station data, bays, devices, cores, inputs and report document fields;',
          'your user and company settings (name, initials, company, department, address and logo), used only to fill in the reports you export;',
          'your preferences (language and theme) and any templates you save;',
          'the email address you enter in the feedback dialog, if any, so you need not type it again;',
          'an activity log of your recent actions and any script errors, kept in sessionStorage only and deleted when you close the browser tab. It is used only if you choose to include it in a feedback report.',
        ],
        'This data stays on your device. We cannot see, access or recover it. Storing it is strictly necessary to provide the function you have asked for (keeping your work between visits), so no consent is required for it. You can delete a project in the project list at any time, and you can delete all CTSizer data by clearing the site data for ctsizer.com in your browser settings. Anyone with access to your browser profile can see this data, so protect your device accordingly.',
      ]},
      { h: '4. Website hosting and server logs', p: [
        'When you open CTSizer, your browser requests the website files from our hosting provider, Simply.com (Denmark, EU), which acts as our data processor. To deliver the files and protect the service against misuse, the web server processes technical data: IP address, date and time of the request, requested file, HTTP status, transferred data volume, referring page and browser/operating-system identification (user agent).',
        'Legal basis: our legitimate interest in delivering a secure and functioning website (GDPR Article 6(1)(f)). Server logs are kept by the hosting provider for a limited period for operation and security purposes and are then deleted. We do not combine them with other data or use them to identify you.',
      ]},
      { h: '5. Feedback', p: [
        'The "Give feedback" function builds a report in your browser. Nothing is sent until you choose an action. You review the full text first, and you choose whether to include your project data and the activity log. Your personal user and company settings are never included.',
        'If you choose Send, the report, and your email address if you enter one, is stored as an issue in a private GitHub repository (GitHub, Inc., USA) that only we can access. Your email address is used only to reply to you about your feedback.',
        `If you instead choose to open it on GitHub, the report is published as a public issue under your GitHub account in ${REPO_NAME}, subject to GitHub's privacy statement; your email address is left out. You can also copy or download the report and share it however you prefer.`,
        'Legal basis: your request to have your feedback handled and our legitimate interest in improving CTSizer (GDPR Article 6(1)(f)). Feedback is kept for as long as it is relevant for the development of CTSizer.',
      ]},
      { h: '6. Files and reports you save', p: [
        'Project files (.ctvt), feedback reports and RTF reports are created in your browser and saved where you choose. We never receive them. A project file contains your user and company settings so that reports can be reproduced; consider this before sharing it.',
      ]},
      { h: '7. Artificial intelligence and automated decisions', p: [
        'CTSizer does not contain or use artificial intelligence and makes no automated decisions or profiling within the meaning of GDPR Article 22. All results are computed by deterministic, rule-based formulas from published standards and manufacturer guidance, and every calculation step is shown.',
        'We have assessed CTSizer against the EU Artificial Intelligence Act (Regulation (EU) 2024/1689). CTSizer is not an AI system within the meaning of Article 3(1): it does not infer outputs by machine learning or by logic- and knowledge-based approaches beyond fixed, explicitly programmed engineering formulas. The obligations for AI systems — including the transparency obligations of Article 50 and the rules for high-risk AI systems used as safety components in critical infrastructure (Annex III, point 2) — therefore do not apply to CTSizer in its current form.',
        'Parts of the source code and documentation were written with AI-assisted programming tools. This does not make the software an AI system; the calculation modules are verified against reference results by an automated test suite. If AI-based features are ever added, this policy will be updated and you will be informed before they are used.',
      ]},
      { h: '8. Your rights', p: [
        `Under the GDPR you have the right to access your personal data, to have it rectified or erased, to restrict or object to its processing, and to data portability. As CTSizer stores your data only on your own device, you exercise most of these rights directly in your browser (section 3). For data processed by the hosting provider, contact us at ${PRIVACY_EMAIL}.`,
        'You have the right to lodge a complaint with a supervisory authority. In Denmark this is Datatilsynet, Carl Jacobsens Vej 35, 2500 Valby, www.datatilsynet.dk.',
      ]},
      { h: '9. Children', p: [
        'CTSizer is a professional engineering tool and is not directed at children.',
      ]},
      { h: '10. Security', p: [
        'CTSizer is delivered over an encrypted HTTPS connection. Every file comes from our own server, your browser checks the program libraries against fixed integrity hashes, and the public source code can be reviewed by anyone.',
      ]},
      { h: '11. Changes to this policy', p: [
        'We may update this Privacy Policy when CTSizer or the law changes. The current version and its effective date are always shown at the top and on the landing page. If the English and Danish versions differ, the English version prevails.',
      ]},
    ],
    btn_close: 'Close',
  },
  da: {
    title: 'Privatlivspolitik',
    version: `Version ${PRIVACY_VERSION} · gældende fra ${PRIVACY_EFFECTIVE}`,
    sections: [
      { h: '1. Hvem er ansvarlig', p: [
        `Denne privatlivspolitik beskriver, hvordan personoplysninger behandles, når du bruger CTSizer på ctsizer.com ("CTSizer", "vi", "os"). CTSizer er et gratis, ikke-kommercielt fritidsprojekt, der udvikles og drives af ${OWNER} som privatperson — ikke som virksomhed. ${OWNER} er dataansvarlig efter EU's databeskyttelsesforordning (GDPR).`,
        `Kontakt ved alle spørgsmål og henvendelser om privatliv: ${PRIVACY_EMAIL}. Brug venligst denne adresse i stedet for et offentligt GitHub-issue til alt, der indeholder personoplysninger.`,
        `CTSizer er open source under GNU Affero General Public License v3.0. Hele kildekoden — herunder alt, hvad denne politik beskriver — er offentlig på ${REPO_URL}, så alle kan kontrollere præcis, hvad softwaren gør.`,
      ]},
      { h: '2. Kort fortalt', p: [[
        'CTSizer har ingen brugerkonti og intet login.',
        'CTSizer sætter ingen cookies og bruger ingen statistik, annoncering, fingerprinting eller anden sporing.',
        'Alle beregninger kører lokalt i din browser. Dine projekter, indstillinger og skabeloner sendes aldrig til os.',
        'Alt, hvad siden bruger — også skrifttyper og programbiblioteker — leveres fra ctsizer.com selv; ingen tredjepartsserver kontaktes. Tekniske data (som din IP-adresse) behandles kun af vores webhotel (afsnit 4).',
        'Feedback sendes kun, hvis du aktivt vælger at sende den (afsnit 5).',
      ]]},
      { h: '3. Data gemt i din browser', p: [
        'CTSizer gemmer følgende i browserens lokale lager (localStorage og sessionStorage) på din egen enhed:',
        [
          'dine projekter: stationsdata, felter, udstyr, kerner, inddata og rapportens dokumentfelter;',
          'dine bruger- og virksomhedsindstillinger (navn, initialer, virksomhed, afdeling, adresse og logo), som kun bruges til at udfylde de rapporter, du eksporterer;',
          'dine præferencer (sprog og tema) og eventuelle skabeloner, du gemmer;',
          'den e-mailadresse, du eventuelt skriver i feedbackdialogen, så du ikke skal skrive den igen;',
          'en aktivitetslog over dine seneste handlinger og eventuelle scriptfejl, som kun gemmes i sessionStorage og slettes, når du lukker browserfanen. Den bruges kun, hvis du vælger at medtage den i en feedbackrapport.',
        ],
        'Disse data forbliver på din enhed. Vi kan ikke se, tilgå eller gendanne dem. Lagringen er strengt nødvendig for at levere den funktion, du har bedt om (at bevare dit arbejde mellem besøg), og kræver derfor ikke samtykke. Du kan til enhver tid slette et projekt i projektlisten, og du kan slette alle CTSizer-data ved at rydde webstedsdata for ctsizer.com i browserens indstillinger. Alle med adgang til din browserprofil kan se disse data, så beskyt din enhed derefter.',
      ]},
      { h: '4. Webhotel og serverlogs', p: [
        'Når du åbner CTSizer, henter din browser hjemmesidens filer fra vores webhotel, Simply.com (Danmark, EU), som er vores databehandler. For at levere filerne og beskytte tjenesten mod misbrug behandler webserveren tekniske data: IP-adresse, dato og tidspunkt for forespørgslen, den forespurgte fil, HTTP-status, overført datamængde, henvisende side og identifikation af browser og styresystem (user agent).',
        'Retsgrundlag: vores legitime interesse i at levere en sikker og velfungerende hjemmeside (GDPR artikel 6, stk. 1, litra f). Serverlogs opbevares af webhotellet i en begrænset periode af drifts- og sikkerhedshensyn og slettes derefter. Vi kombinerer dem ikke med andre data og bruger dem ikke til at identificere dig.',
      ]},
      { h: '5. Feedback', p: [
        'Funktionen "Giv feedback" opbygger en rapport i din browser. Intet sendes, før du vælger en handling. Du gennemser hele teksten først, og du vælger, om projektdata og aktivitetslog skal medtages. Dine personlige bruger- og virksomhedsindstillinger medtages aldrig.',
        'Hvis du vælger Send, gemmes rapporten, og din e-mailadresse, hvis du skriver en, som et issue i et privat GitHub-repository (GitHub, Inc., USA), som kun vi har adgang til. Din e-mailadresse bruges kun til at svare dig om din feedback.',
        `Hvis du i stedet vælger at oprette den på GitHub, offentliggøres rapporten som et offentligt issue under din GitHub-konto i ${REPO_NAME} efter GitHubs privatlivserklæring; din e-mailadresse udelades. Du kan også kopiere eller downloade rapporten og dele den, som du foretrækker.`,
        'Retsgrundlag: din anmodning om at få din feedback behandlet og vores legitime interesse i at forbedre CTSizer (GDPR artikel 6, stk. 1, litra f). Feedback opbevares, så længe den er relevant for udviklingen af CTSizer.',
      ]},
      { h: '6. Filer og rapporter, du gemmer', p: [
        'Projektfiler (.ctvt), feedbackrapporter og RTF-rapporter oprettes i din browser og gemmes, hvor du vælger. Vi modtager dem aldrig. En projektfil indeholder dine bruger- og virksomhedsindstillinger, så rapporter kan genskabes; tænk over det, før du deler den.',
      ]},
      { h: '7. Kunstig intelligens og automatiske afgørelser', p: [
        'CTSizer indeholder og bruger ikke kunstig intelligens og træffer ingen automatiske afgørelser og foretager ingen profilering efter GDPR artikel 22. Alle resultater beregnes med deterministiske, regelbaserede formler fra publicerede standarder og producentvejledninger, og alle beregningstrin vises.',
        'Vi har vurderet CTSizer i forhold til EU\'s forordning om kunstig intelligens (forordning (EU) 2024/1689). CTSizer er ikke et AI-system efter artikel 3, nr. 1: det udleder ikke output ved maskinlæring eller ved logik- og videnbaserede metoder ud over faste, eksplicit programmerede ingeniørformler. Forpligtelserne for AI-systemer — herunder gennemsigtighedsforpligtelserne i artikel 50 og reglerne for højrisiko-AI-systemer, der bruges som sikkerhedskomponenter i kritisk infrastruktur (bilag III, punkt 2) — gælder derfor ikke for CTSizer i sin nuværende form.',
        'Dele af kildekoden og dokumentationen er skrevet med AI-assisterede programmeringsværktøjer. Det gør ikke softwaren til et AI-system; beregningsmodulerne verificeres mod referenceresultater af en automatisk testsuite. Hvis der nogensinde tilføjes AI-baserede funktioner, opdateres denne politik, og du informeres, før de tages i brug.',
      ]},
      { h: '8. Dine rettigheder', p: [
        `Efter GDPR har du ret til indsigt i dine personoplysninger, til at få dem berigtiget eller slettet, til at begrænse eller gøre indsigelse mod behandlingen og til dataportabilitet. Da CTSizer kun gemmer dine data på din egen enhed, udøver du de fleste af disse rettigheder direkte i din browser (afsnit 3). For data behandlet af webhotellet kan du kontakte os på ${PRIVACY_EMAIL}.`,
        'Du har ret til at klage til en tilsynsmyndighed. I Danmark er det Datatilsynet, Carl Jacobsens Vej 35, 2500 Valby, www.datatilsynet.dk.',
      ]},
      { h: '9. Børn', p: [
        'CTSizer er et professionelt ingeniørværktøj og er ikke rettet mod børn.',
      ]},
      { h: '10. Sikkerhed', p: [
        'CTSizer leveres over en krypteret HTTPS-forbindelse. Alle filer kommer fra vores egen server, din browser kontrollerer programbibliotekerne mod faste integritets-hashes, og den offentlige kildekode kan gennemgås af alle.',
      ]},
      { h: '11. Ændringer af denne politik', p: [
        'Vi kan opdatere denne privatlivspolitik, når CTSizer eller lovgivningen ændres. Den gældende version og dens ikrafttrædelsesdato vises altid øverst og på forsiden. Hvis den engelske og den danske version afviger fra hinanden, har den engelske version forrang.',
      ]},
    ],
    btn_close: 'Luk',
  },
};

const txt = lang => TEXT[lang] || TEXT.en;
const ptxt = lang => PRIVACY[lang] || PRIVACY.en;

function readJSON(key, def) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? def; } catch { return def; }
}

// Theme before App mounts: mirror App's ctsizer_theme / useAutoTheme logic.
function applyStoredTheme() {
  const mode = readJSON('ctsizer_theme', 'light');
  const dark = mode === 'auto' ? window.matchMedia('(prefers-color-scheme: dark)').matches : mode === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

// ── Shared pieces ─────────────────────────────────────────────────────────
const btnSt = (primary, disabled) => ({
  padding: '10px 22px', borderRadius: 7, cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: 'var(--font-head)', fontSize: 14, fontWeight: 600,
  border: primary ? 'none' : '1px solid var(--border-2)',
  background: primary ? (disabled ? 'var(--surface-3)' : 'var(--accent)') : 'var(--surface-2)',
  color: primary ? (disabled ? 'var(--text-muted)' : '#fff') : 'var(--text-dim)',
});
const linkBtn = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)',
                  fontFamily: 'var(--font-body)', fontSize: 13, textDecoration: 'underline' };

function LangToggle({ lang, setLang }) {
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      {[['en', 'EN'], ['da', 'DA']].map(([l, label]) => (
        <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l}
          style={{ padding: '4px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 11,
                   fontFamily: 'var(--font-mono)', fontWeight: 600,
                   background: lang === l ? 'var(--accent-glow)' : 'var(--surface-2)',
                   color: lang === l ? 'var(--accent)' : 'var(--text-muted)',
                   border: `1px solid ${lang === l ? 'var(--accent)' : 'var(--border-2)'}` }}>{label}</button>
      ))}
    </div>
  );
}

// GitHub mark (Primer Octicons "mark-github", 16 × 16)
function GitHubMark({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
    </svg>
  );
}

// Open-source card at the bottom of the landing page: the public repository.
function OpenSourceCard({ L }) {
  const [hover, setHover] = useState(false);
  return (
    <section aria-labelledby="ctsizer-oss-title"
      style={{ ...card, padding: 0, overflow: 'hidden', display: 'flex', flexWrap: 'wrap',
               background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)', borderColor: 'var(--border-2)' }}>
      <div style={{ flex: '1 1 340px', padding: 22, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <span style={{ width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                       background: 'var(--text)', color: 'var(--bg)', flexShrink: 0 }}>
          <GitHubMark size={28}/>
        </span>
        <div style={{ minWidth: 0 }}>
          <h2 id="ctsizer-oss-title" style={{ fontFamily: 'var(--font-head)', fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            {L.oss_h}
          </h2>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-dim)', marginBottom: 10, maxWidth: 560 }}>{L.oss}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', background: 'var(--surface-3)',
                           border: '1px solid var(--border-2)', borderRadius: 6, padding: '3px 8px' }}>{REPO_NAME}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', background: 'var(--green-bg)',
                           border: '1px solid var(--green)', borderRadius: 20, padding: '2px 9px' }}>{L.oss_licence}</span>
          </div>
        </div>
      </div>
      <div style={{ flex: '0 1 auto', padding: 22, display: 'flex', alignItems: 'center' }}>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer"
          onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
          onFocus={() => setHover(true)} onBlur={() => setHover(false)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '11px 20px', borderRadius: 8,
                   background: 'var(--text)', color: 'var(--bg)', textDecoration: 'none', whiteSpace: 'nowrap',
                   fontFamily: 'var(--font-head)', fontSize: 14, fontWeight: 600,
                   boxShadow: hover ? '0 6px 18px rgba(0,0,0,0.22)' : '0 1px 3px rgba(0,0,0,0.12)',
                   transform: hover ? 'translateY(-1px)' : 'none', transition: 'transform 0.15s, box-shadow 0.15s' }}>
          <GitHubMark size={18}/>
          {L.oss_cta}
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    </section>
  );
}

// Version print next to the logo: "v0.9.0 Beta" (the full version in the tooltip).
const betaBadgeSt = { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                      padding: '2px 7px', borderRadius: 4, background: 'var(--amber)', color: '#1a1206', flexShrink: 0 };
function VersionBadge({ note }) {
  const V = window.CTSVersion;
  if (!V) return null;
  return (
    <span title={note ? `${V.full()}\n${note}` : V.full()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>v{V.VERSION}</span>
      {V.isBeta && <span style={betaBadgeSt}>{V.STAGE.toUpperCase()}</span>}
    </span>
  );
}

function SectionTitle({ children }) {
  return <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 20, fontWeight: 700, color: 'var(--text)',
                      marginBottom: 14 }}>{children}</h2>;
}

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 };

// ── Privacy Policy ────────────────────────────────────────────────────────
function PrivacyDocument({ lang }) {
  const P = ptxt(lang);
  const pSt = { fontSize: 13, lineHeight: 1.6, color: 'var(--text-dim)', marginBottom: 8 };
  return (
    <div>
      {P.sections.map(s => (
        <section key={s.h} style={{ marginBottom: 14 }}>
          <h3 style={{ fontFamily: 'var(--font-head)', fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{s.h}</h3>
          {s.p.map((p, i) => Array.isArray(p)
            ? <ul key={i} style={{ ...pSt, paddingLeft: 20 }}>{p.map((li, j) => <li key={j} style={{ marginBottom: 3 }}>{li}</li>)}</ul>
            : <p key={i} style={pSt}>{p}</p>)}
        </section>
      ))}
    </div>
  );
}

// Modal viewer: from the landing page, the project list and Settings.
function PrivacyViewer({ lang, onClose }) {
  const P = ptxt(lang);
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ctsizer-privacy-title"
      style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.45)',
               display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 820, maxHeight: '100%', display: 'flex', flexDirection: 'column',
                 background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10,
                 boxShadow: '0 8px 32px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <img src="logo/icon.svg" alt="" width="30" height="30" style={{ borderRadius: 6, flexShrink: 0 }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="ctsizer-privacy-title"
              style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
              CTSizer — {P.title}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{P.version}</div>
          </div>
        </div>
        <div tabIndex={0} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 20px' }}>
          <PrivacyDocument lang={lang}/>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px', display: 'flex',
                      justifyContent: 'flex-end', background: 'var(--surface-2)' }}>
          <button style={{ ...btnSt(true, false), padding: '8px 20px', fontSize: 13 }} onClick={onClose}>{P.btn_close}</button>
        </div>
      </div>
    </div>
  );
}

// ── Landing page ──────────────────────────────────────────────────────────
function LandingPage({ lang, setLang, onContinue, returning }) {
  const L = txt(lang);
  const [ack, setAck] = useState(!!returning);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const wrap = { maxWidth: 1040, margin: '0 auto', padding: '0 16px' };

  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ ...wrap, display: 'flex', alignItems: 'center', gap: 10, height: 54 }}>
          <img src="logo/icon.svg" alt="" width="28" height="28"/>
          <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 18, color: 'var(--accent)', letterSpacing: '-0.3px' }}>
            CT<span style={{ color: 'var(--text-dim)' }}>Sizer</span>
          </span>
          <VersionBadge/>
          <div style={{ marginLeft: 'auto' }}><LangToggle lang={lang} setLang={setLang}/></div>
        </div>
      </header>

      <main style={{ ...wrap, paddingTop: 40, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 40 }}>
        {/* Hero */}
        <section>
          {window.CTSVersion?.isBeta && (
            <div role="note" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 16px',
                                      marginBottom: 22, borderRadius: 8, border: '1px solid var(--amber)',
                                      background: 'var(--amber-bg)', maxWidth: 760 }}>
              <span style={{ ...betaBadgeSt, marginTop: 2 }}>BETA</span>
              <div>
                <div style={{ fontFamily: 'var(--font-head)', fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>
                  {L.beta_h}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-dim)' }}>{L.beta}</div>
              </div>
            </div>
          )}
          <h1 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(26px, 5vw, 40px)', fontWeight: 700,
                       color: 'var(--text)', lineHeight: 1.15, marginBottom: 14, maxWidth: 760 }}>
            {L.tagline}
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--text-dim)', maxWidth: 760, marginBottom: 18 }}>{L.intro}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {L.pills.map(p => (
              <span key={p} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, padding: '4px 10px',
                                     borderRadius: 20, background: 'var(--accent-glow)', color: 'var(--accent)',
                                     border: '1px solid var(--accent)' }}>{p}</span>
            ))}
          </div>
        </section>

        {/* Applications */}
        <section>
          <SectionTitle>{L.apps_h}</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {L.apps.map(([h, d]) => (
              <div key={h} style={card}>
                <div style={{ fontFamily: 'var(--font-head)', fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{h}</div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-dim)' }}>{d}</div>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
            IEC 61869-2 · IEC 61869-3 · IEC TR 61869-100 · IEC 60228 · IEC 60287
          </div>
        </section>

        {/* How it works */}
        <section>
          <SectionTitle>{L.how_h}</SectionTitle>
          <ol style={{ listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {L.how.map(([h, d], i) => (
              <li key={h} style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', display: 'flex',
                               alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)',
                               fontSize: 12, fontWeight: 700, background: 'var(--accent-glow)', color: 'var(--accent)',
                               border: '1px solid var(--accent)' }}>{i + 1}</span>
                <div>
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{h}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-dim)' }}>{d}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Who / privacy / AI */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
          <div style={{ ...card, borderColor: 'var(--amber)' }}>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{L.who_h}</h2>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-dim)' }}>{L.who}</p>
          </div>
          <div style={card}>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{L.privacy_h}</h2>
            <ul style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-dim)', paddingLeft: 18, marginBottom: 8 }}>
              {L.privacy.map(p => <li key={p} style={{ marginBottom: 4 }}>{p}</li>)}
            </ul>
            <button style={linkBtn} onClick={() => setShowPrivacy(true)}>{L.read_privacy}</button>
          </div>
          <div style={card}>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{L.ai_h}</h2>
            {L.ai.map(p => <p key={p} style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-dim)', marginBottom: 8 }}>{p}</p>)}
          </div>
        </section>

        {/* Acknowledge and continue */}
        <section style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--surface-2)' }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.5,
                          color: 'var(--text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)}
              style={{ marginTop: 3, flexShrink: 0, width: 16, height: 16 }}/>
            <span>{L.ack} <button style={linkBtn} onClick={e => { e.preventDefault(); setShowPrivacy(true); }}>
              ({L.privacy_link})</button></span>
          </label>
          <div>
            <button style={btnSt(true, !ack)} disabled={!ack} onClick={() => ack && onContinue()}>{returning ? L.continue_back : L.continue} →</button>
          </div>
        </section>
        <OpenSourceCard L={L}/>
      </main>

      <footer style={{ borderTop: '1px solid var(--border)' }}>
        <div style={{ ...wrap, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', padding: '16px',
                      fontSize: 12, color: 'var(--text-muted)' }}>
          <span>© 2026 {OWNER} · AGPL-3.0</span>
          {window.CTSVersion && <span style={{ fontFamily: 'var(--font-mono)' }}>{window.CTSVersion.full()}</span>}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
            <GitHubMark size={14}/> {REPO_NAME}
          </a>
          <a href={`mailto:${PRIVACY_EMAIL}`} style={{ color: 'var(--text-muted)' }}>{L.contact}: {PRIVACY_EMAIL}</a>
          <button style={{ ...linkBtn, color: 'var(--text-muted)', fontSize: 12 }} onClick={() => setShowPrivacy(true)}>{L.privacy_link}</button>
        </div>
      </footer>

      {showPrivacy && <PrivacyViewer lang={lang} onClose={() => setShowPrivacy(false)}/>}
    </div>
  );
}

// ── Gate: renders children only after the landing page has been passed ───
// Deliberately not persisted, like the terms: every page load starts here.
function LandingGate({ children }) {
  const [passed, setPassed] = useState(false);
  const [lang, setLangState] = useState(() => readJSON('ctsizer_lang', 'en'));
  // Set once the user has passed this page and accepted the terms (this page load only).
  const [termsOk, setTermsOk] = useState(false);

  // Language picked here carries over to the terms and the app.
  const setLang = l => {
    setLangState(l);
    try { localStorage.setItem('ctsizer_lang', JSON.stringify(l)); } catch { /* ignore */ }
  };

  useEffect(() => { if (!passed) applyStoredTheme(); }, [passed]);
  // <html lang> follows the language shown (screen readers, search engines).
  useEffect(() => { if (!passed) document.documentElement.lang = lang; }, [lang, passed]);

  const gate = useMemo(() => ({
    home: () => { setLangState(readJSON('ctsizer_lang', 'en')); window.scrollTo(0, 0); setPassed(false); },
    termsOk,
    acceptTerms: () => setTermsOk(true),
  }), [termsOk]);

  // Returning unmounts the terms and the project list; they mount afresh on Continue.
  if (passed) return <GateContext.Provider value={gate}>{children}</GateContext.Provider>;
  return <LandingPage lang={lang} setLang={setLang} returning={termsOk}
    onContinue={() => { window.scrollTo(0, 0); setPassed(true); }}/>;
}

window.CTSPrivacy = { PRIVACY_VERSION, PRIVACY_EFFECTIVE };
window.CTSVersionBadge = VersionBadge;
Object.assign(window, { LandingGate, PrivacyViewer, CTSGateContext: GateContext });
})();
