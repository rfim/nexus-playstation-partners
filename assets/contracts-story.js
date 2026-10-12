// Animated walk-through of a data contract, from YAML to the end-of-day sign-off,
// told through three PlayStation use cases. Partner submissions reads its numbers
// from the live build (assets/contracts.json); royalties and certification are
// illustrative.
(() => {
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const hl = (code, lang) => (window.NexusHighlight ? window.NexusHighlight.highlight(code, lang) : code.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]));

  const STATIONS = [
    { key: 'contract', title: 'Contract', glyph: '☰' },
    { key: 'route', title: 'Route', glyph: '⇄' },
    { key: 'gx', title: 'GX at the door', glyph: 'GX' },
    { key: 'dbt', title: 'dbt inside', glyph: 'dbt' },
    { key: 'reconcile', title: 'Reconcile', glyph: '=' },
    { key: 'signoff', title: 'Sign-off', glyph: '✓' },
  ];

  // Each case: station subtitles, the tokens that travel, six steps, and a bad day.
  // A step's example is one of: code, routes, checks, chain, stamp.
  function cases(data) {
    const partners = data?.contracts.find((c) => c.contract === 'partners');
    const finance = data?.contracts.find((c) => c.contract === 'finance');
    const rule = (c, id) => c?.rules.find((r) => r.id === id);
    const chain = (c, id) => (c?.reconcile.find((r) => r.id === id)?.measures ?? []).map((m) => [m.label, String(m.value)]);
    const feedRows = rule(partners, 'P-04')?.value ?? 9;

    return [
      {
        key: 'royalties',
        tab: 'Partner royalties',
        tag: 'PS Store → Finance',
        intro: 'Each month PlayStation pays partners their share of PS Store sales. If the statement is wrong, a partner is overpaid or underpaid, and that is money and trust. Finance and the partners agree one contract for it. Figures are illustrative.',
        subtitles: ['Royalty contract', 'Pick the checker', 'Store sales file arrives', 'Warehouse tests', 'Sales tie out to payout', 'Statement signed off'],
        tokens: ['store_sales.csv', 'rev_share.csv'],
        steps: [
          { text: 'Finance and the partners write down how a royalty is calculated and what the sales data must look like. Nobody writes tests by hand.',
            example: { kind: 'code', lang: 'yaml', code: `contract: partner_royalties
stakeholder: Finance + partners
metric: royalty = net PS Store sales x revenue share, by title and month
rules:
  - store_sales_file: transaction_id is unique
  - store_sales_file: currency in [USD, EUR, GBP, JPY]
  - store_sales_file: sku is valid (mostly: 0.99)
  - fct_store_sale: every sku maps to a partner title
  - fct_store_sale: no sale before the title's release date
  - mart_royalty: revenue share between 0 and 100%` } },
          { text: 'Each rule goes where it is cheapest to check: rules on the delivered sales file to Great Expectations, SQL rules on warehouse tables to dbt.',
            example: { kind: 'routes', rows: [
              ['transaction_id is unique (in the file)', 'gx', 'file not loaded yet'],
              ['sku is valid, mostly 99%', 'gx', 'a tolerance'],
              ['every sku maps to a partner title', 'dbt', 'a join, in SQL'],
              ['no sale before release', 'dbt', 'a row check, in SQL'],
            ] } },
          { text: 'The PS Store sales file is checked as delivered, before it loads. A broken or resent file never reaches the warehouse.',
            example: { kind: 'checks', rows: [['48,200 transactions in the file', 'pass'], ['transaction_id unique', 'pass'], ['currencies all expected', 'pass'], ['99.6% have a valid SKU (needs 99%)', 'pass']] } },
          { text: 'Loaded and joined to titles, the sales are tested with SQL inside dbt build. A failure stops the royalty mart from rebuilding.',
            example: { kind: 'checks', rows: [['every SKU maps to a partner title', 'pass'], ['no sale before the release date', 'pass'], ['revenue share between 0 and 100%', 'pass']] } },
          { text: 'Passing tests are not enough: the money must tie out. The same total is measured at every hop, from the store file to the statement the partner receives.',
            example: { kind: 'chain', rows: [['PS Store file', '$1.93m'], ['Loaded sales', '$1.93m'], ['Royalty mart', '$1.93m']], note: 'Payouts tie out the same way: the sum of partner statements = net sales x each title\'s share.' } },
          { text: 'Every rule passed and every total tied out, so the statements are signed off.',
            example: { kind: 'stamp', status: 'ok', big: '$1.35m', label: 'partner royalties for September, signed off for Finance', note: '$1.93m net sales at a 70% revenue share' } },
        ],
        bad: {
          at: 2,
          label: 'The store resends a day of sales',
          step: { text: 'The file arrives with one day\'s sales in it twice. Great Expectations stops it at the door, before anything loads.',
            example: { kind: 'checks', rows: [['52,300 transactions in the file', 'pass'], ['transaction_id unique: 4,100 duplicates', 'fail'], ['currencies all expected', 'pass']] } },
          stamp: { status: 'held', big: 'Held', label: 'September statements wait for a corrected file', note: 'Without the gate, the duplicated day would overpay partners by about $115k.' },
        },
      },
      {
        key: 'certification',
        tab: 'Game certification',
        tag: 'Simple analogy',
        intro: 'Every game goes through certification before it reaches the PS Store: an agreed checklist, automatic checks when the build is submitted, testing on devkits, and an approval at the end. A data contract is the same idea, applied to data. This is an analogy, not Sony\'s real checklist.',
        subtitles: ['The cert checklist', 'Who checks what', 'Checks on submission', 'Testing on devkits', 'Same build everywhere', 'Release approved'],
        tokens: ['build v1.02', 'store metadata'],
        steps: [
          { text: 'The partner and publishing QA agree a checklist before anything is submitted. A data contract is that checklist, written for data.',
            example: { kind: 'code', lang: 'yaml', code: `contract: release_checklist   # an analogy
stakeholder: Partner + publishing QA
rules:
  - submission: package format is valid
  - submission: age rating present for every region
  - submission: build size under the limit
  - devkit: every trophy can be unlocked
  - devkit: save data survives suspend and resume` } },
          { text: 'Checks on the uploaded package run automatically at submission (Great Expectations). Checks that need the game running happen on devkits (dbt).',
            example: { kind: 'routes', rows: [
              ['package format valid', 'gx', 'at submission'],
              ['age rating for every region', 'gx', 'at submission'],
              ['every trophy unlockable', 'dbt', 'on a devkit'],
              ['save survives suspend and resume', 'dbt', 'on a devkit'],
            ] } },
          { text: 'The moment the build is uploaded, the package is checked. A broken package goes straight back to the partner and never wastes a tester\'s day.',
            example: { kind: 'checks', rows: [['package format valid', 'pass'], ['age ratings: EU, US, JP, ASIA', 'pass'], ['size 38.4 GB (limit 100 GB)', 'pass']] } },
          { text: 'Testers play the build on devkits: trophies, save data, suspend and resume.',
            example: { kind: 'checks', rows: [['52 of 52 trophies unlockable', 'pass'], ['save data survives suspend and resume', 'pass']] } },
          { text: 'Before release, the build is the same at every step: the one submitted is the one certified is the one on the store.',
            example: { kind: 'chain', rows: [['Submitted', 'v1.02 · 9f3a'], ['Certified', 'v1.02 · 9f3a'], ['On PS Store', 'v1.02 · 9f3a']], note: 'The same version and checksum at every step, like the same total from file to mart.' } },
          { text: 'Every check passed and the build matches everywhere, so the release is approved.',
            example: { kind: 'stamp', status: 'ok', big: 'v1.02', label: 'approved for release on PS Store', note: 'First-pass approval, the number the partner scorecard tracks.' } },
        ],
        bad: {
          at: 2,
          label: 'The age rating for Japan is missing',
          step: { text: 'The package has no Japanese age rating. It is returned at submission, before any devkit testing, like S001\'s metadata_incomplete rejection in this site\'s data.',
            example: { kind: 'checks', rows: [['package format valid', 'pass'], ['age ratings: JP missing', 'fail']] } },
          stamp: { status: 'held', big: 'Returned', label: 'build v1.02 goes back to the partner', note: 'Resubmission adds days to time to shelf, which the resubmission-cost mart measures.' },
        },
      },
      {
        key: 'playstation',
        tab: 'Partner submissions',
        tag: 'This build, live',
        intro: 'What this site runs. Partners send a daily submission feed, and the partner scorecard must match it. These numbers come from the latest CI build.',
        subtitles: ['contracts/partners.yml', 'contract_plan.py', 'validate.py --scope files', 'dbt build', 'R-P1 and R-P2', 'Partner scorecard'],
        tokens: ['submission feed', 'billing export'],
        steps: [
          { text: `Partner Success owns contracts/partners.yml (${partners?.rules.length ?? 13} rules). Finance owns finance.yml (${finance?.rules.length ?? 11} rules).`,
            example: { kind: 'code', lang: 'yaml', code: (partners?.source ?? '').split('\n').slice(0, 14).join('\n') + '\n  …' } },
          { text: `contract_plan.py routed ${data?.summary.engines.gx ?? 13} rules to Great Expectations, generated ${data?.summary.engines.dbt ?? 7} dbt tests and reused ${data?.summary.engines.dbt_existing ?? 4} existing ones.`,
            example: { kind: 'routes', rows: [
              ['P-02 submission ids follow S###', 'gx', 'delivered file'],
              ['P-09 95% of reviews within 72h', 'gx', 'a tolerance'],
              ['P-06 submission_id unique', 'dbt_existing', 'already tested'],
              ['P-12 titles add up across models', 'dbt', 'cross-model SQL'],
            ] } },
          { text: 'Great Expectations checks raw_submissions.csv as delivered, before dbt seed loads it.',
            example: { kind: 'checks', rows: ['P-01', 'P-02', 'P-03', 'P-04', 'P-05'].map((id) => [`${id} ${rule(partners, id)?.description ?? ''} (${rule(partners, id)?.observed ?? ''})`, rule(partners, id)?.status ?? 'pass']) } },
          { text: 'The generated dbt tests run inside dbt build, next to the project\'s own tests.',
            example: { kind: 'checks', rows: ['P-08', 'P-10', 'P-11', 'P-12'].map((id) => [`${id} ${rule(partners, id)?.description ?? ''}`, rule(partners, id)?.status ?? 'pass']) } },
          { text: 'R-P1: every submission partners sent reaches their scorecard.',
            example: { kind: 'chain', rows: chain(partners, 'R-P1').length ? chain(partners, 'R-P1') : [['Partner feed', String(feedRows)]], note: 'Finance\'s chain does the same for credits: billed = daily burn = budget vs actual.' } },
          { text: 'Partners is signed off. Finance is signed off with one warning (F-09: a warehouse is forecast over budget).',
            example: { kind: 'stamp', status: partners?.verdict === 'held' ? 'held' : 'ok', big: `${data?.summary.status.pass ?? 23} / ${data?.summary.rules ?? 24}`, label: `rules passed for ${data?.business_date ?? 'the business date'}`, note: `${data?.summary.reconciled ?? 4} of ${data?.summary.reconciliations ?? 4} reconcile chains match · ${data?.summary.status.warn ?? 1} warning` } },
        ],
        bad: {
          at: 2,
          label: 'A partner sends an unknown status',
          step: { text: 'The feed arrives with status "in_review", which the contract does not allow. P-03 fails, validate.py exits non-zero, and the DAG never runs dbt seed.',
            example: { kind: 'checks', rows: [['P-01 column layout', 'pass'], ['P-03 status in approved, rejected, pending: 2 rows "in_review"', 'fail']] } },
          stamp: { status: 'held', big: 'Held', label: 'partners contract; nothing publishes', note: 'The portal keeps yesterday\'s scorecard until the partner resends the feed.' },
        },
      },
    ];
  }

  let timer = null;

  // The real files behind each step, the same for every use case: this is the
  // pipeline that runs. A string ending in "/" takes every file in that folder.
  const STEP_FILES = [
    ['contracts/partners.yml', 'contracts/finance.yml'],
    ['contracts/contract_plan.py', 'contracts/compile.py'],
    ['contracts/validate.py', 'contracts/gx/expectations/'],
    ['tests/contracts/'],
    ['contracts/reconcile.py'],
    ['airflow/dags/nexus_partner_analytics.py', '.github/workflows/ci.yml'],
  ];
  const STEP_NOTES = [
    'The stakeholder contracts. These are the only files people edit.',
    'Routing decides each rule\'s engine; compile.py writes the dbt tests and GX suites.',
    'The GX runner and every generated expectation suite.',
    'Every dbt test generated from the contracts. dbt build runs them with the project\'s own tests.',
    'Joins dbt and GX results, checks each reconcile chain and writes the verdicts.',
    'Where the sign-off runs: the daily Airflow DAG and the CI workflow. A held contract fails both.',
  ];
  // Story words → repository code, per step. `find` is text on the line to mark;
  // story labels are per use case (playstation, royalties, certification).
  const TRANSLATE = [
    [
      { story: { playstation: 'Partner Success owns the contract', royalties: 'Finance and the partners agree the contract', certification: 'Partner and publishing QA agree the checklist' },
        code: 'Who owns the contract. A royalties or certification contract would be one more YAML file like this.', file: 'contracts/partners.yml', find: 'stakeholder:' },
      { story: { playstation: 'The partner submission feed', royalties: 'The PS Store sales file', certification: 'The uploaded build package' },
        code: 'A dataset with kind: file is checked as delivered, before it loads.', file: 'contracts/partners.yml', find: 'kind: file', span: 3 },
      { story: { playstation: 'P-03: only known statuses', royalties: 'currency in USD, EUR, GBP, JPY', certification: 'age rating present for every region' },
        code: 'One rule: a check, its column and the allowed values.', file: 'contracts/partners.yml', find: '- id: P-03', span: 5 },
      { story: { playstation: 'P-09: 95% of reviews within 72h', royalties: 'valid SKU, mostly 99%', certification: 'size under the limit' },
        code: 'A rule with a tolerance: mostly is the share of rows that must pass.', file: 'contracts/partners.yml', find: '- id: P-09', span: 6 },
      { story: { playstation: 'R-P1: feed = scorecard', royalties: 'store file = loaded sales = royalty mart', certification: 'same build from submission to store' },
        code: 'A reconcile chain: the same measure at every hop, within a tolerance.', file: 'contracts/partners.yml', find: '- id: R-P1', span: 7 },
    ],
    [
      { story: { playstation: 'P-02 on the delivered feed', royalties: 'transaction_id unique in the store file', certification: 'checks on submission' },
        code: 'Rule 1: a file that is not loaded yet goes to Great Expectations.', file: 'contracts/contract_plan.py', find: 'if dataset["kind"] == "file":', span: 2 },
      { story: { playstation: 'P-09, mostly 95%', royalties: 'valid SKU, mostly 99%', certification: 'size under a limit' },
        code: 'Rule 2: a tolerance or distribution goes to Great Expectations.', file: 'contracts/contract_plan.py', find: 'elif rule.get("mostly") is not None', span: 2 },
      { story: { playstation: 'P-12 titles add up across models', royalties: 'every SKU maps to a title', certification: 'testing on devkits' },
        code: 'Rule 3: set-based SQL on a model becomes a dbt test.', file: 'contracts/contract_plan.py', find: 'engine, reason = "dbt", "set_based"' },
      { story: { playstation: 'P-06 already tested by the project', royalties: 'a check Finance already runs', certification: 'a check QA already runs' },
        code: 'If the same dbt test exists, the contract links to it instead of testing twice.', file: 'contracts/contract_plan.py', find: 'engine, reason = "dbt_existing", "reuse"' },
      { story: { default: 'Nobody writes the tests by hand' },
        code: 'compile.py writes one dbt test per dbt rule and one GX suite per dataset.', file: 'contracts/compile.py', find: 'files[DBT_TESTS', span: 4 },
    ],
    [
      { story: { playstation: 'raw_submissions.csv as delivered', royalties: 'the store sales file as delivered', certification: 'the package as uploaded' },
        code: 'The file is read straight from disk, before dbt seed loads it.', file: 'contracts/validate.py', find: 'asset = files.add_csv_asset', span: 2 },
      { story: { default: 'Run every check on it' },
        code: 'Great Expectations validates the batch against the generated suite.', file: 'contracts/validate.py', find: 'validation = batch.validate(suite)' },
      { story: { playstation: 'P-03: status in the allowed set', royalties: 'currency in the allowed set', certification: 'age rating for each region' },
        code: 'The generated expectation for an accepted-values rule.', file: 'partners__partner_submission_feed.json', find: '"expect_column_values_to_be_in_set"', span: 9 },
      { story: { playstation: 'A bad feed never loads', royalties: 'A resent file never loads', certification: 'A broken package goes back' },
        code: 'An error-severity failure exits non-zero, so the DAG stops before ingest.', file: 'contracts/validate.py', find: 'sys.exit("Blocking expectations failed', span: 1 },
    ],
    [
      { story: { playstation: 'P-08: no review before submission', royalties: 'no sale before release', certification: 'save data survives suspend and resume' },
        code: 'A row-level rule: any row returned is a failure.', file: 'contract_partners_p08.sql', find: 'where not (', span: 1 },
      { story: { playstation: 'P-12: titles add up across models', royalties: 'every sale belongs to a partner title', certification: 'every trophy can be unlocked' },
        code: 'A cross-model check: two totals that must agree.', file: 'contract_partners_p12.sql', find: 'with contract_side as (', span: 9 },
      { story: { playstation: 'F-08: dollars = credits x price', royalties: 'royalty = net sales x revenue share', certification: 'price matches the agreed SKU' },
        code: 'A formula check against a dbt var, the contracted price.', file: 'contract_finance_f08.sql', find: 'where not (', span: 1 },
      { story: { playstation: 'F-09: forecast over budget is a warning', royalties: 'a late file is a warning, not a stop', certification: 'a minor issue is noted, not a fail' },
        code: "severity='warn': reported, but dbt build still passes.", file: 'contract_finance_f09.sql', find: "severity='warn'" },
    ],
    [
      { story: { playstation: 'Feed → loaded → fact → scorecard', royalties: 'Store file → loaded → royalty mart', certification: 'Submitted → certified → on the store' },
        code: 'Each reconcile chain is checked measure by measure.', file: 'contracts/reconcile.py', find: 'def _reconcile(', span: 1 },
      { story: { playstation: 'The count GX saw in the feed', royalties: 'The total GX saw in the file', certification: 'The checksum seen at submission' },
        code: 'A measure can be the value Great Expectations observed on the delivered file.', file: 'contracts/reconcile.py', find: 'value, source = rules[m["rule"]]["value"]' },
      { story: { default: 'The same number in the warehouse' },
        code: 'Or a SQL query against the dbt build.', file: 'contracts/reconcile.py', find: 'value, source = _num(con.execute(sql)' },
      { story: { default: 'Must agree within tolerance' },
        code: 'The spread across every hop must be within the tolerance.', file: 'contracts/reconcile.py', find: 'status = "match" if spread', span: 1 },
      { story: { default: 'Signed off, with warnings, or held' },
        code: 'One verdict per contract from both engines and the chains.', file: 'contracts/reconcile.py', find: 'verdict = "held" if failed', span: 1 },
    ],
    [
      { story: { default: 'Check the delivery at the door' },
        code: 'The DAG runs the GX file check before the load.', file: 'airflow/dags/nexus_partner_analytics.py', find: 'task_id="validate_contract_files"', span: 3 },
      { story: { playstation: 'Sign off the partner scorecard', royalties: 'Sign off the royalty statements', certification: 'Approve the release' },
        code: 'After the test gate, the reconciler gives the daily sign-off.', file: 'airflow/dags/nexus_partner_analytics.py', find: 'task_id="reconcile_contracts"', span: 4 },
      { story: { playstation: 'The portal waits for the sign-off', royalties: 'No statement goes out unsigned', certification: 'Nothing ships unapproved' },
        code: 'Publishing is downstream of the sign-off, so a held contract stops it.', file: 'airflow/dags/nexus_partner_analytics.py', find: 'test_gate >> signoff >> publish' },
      { story: { default: 'Every change is checked the same way' },
        code: 'CI runs the same sign-off on every push and fails if a contract is held.', file: '.github/workflows/ci.yml', find: 'contracts/reconcile.py --check' },
    ],
  ];
  let extraFiles = null;
  const loadExtra = () => (extraFiles ??= Promise.all(
    ['assets/airflow_code.json', 'assets/code.json'].map((u) => fetch(u).then((r) => r.json()).catch(() => ({ folders: [] }))),
  ).then((sets) => sets.flatMap((d) => d.folders.flatMap((f) => f.files))));
  const langOf = (f) => (f.language === 'markdown' ? 'md' : f.language === 'yml' ? 'yaml' : f.language);

  function mount(data) {
    clearTimeout(timer);
    const all = cases(data);
    all.unshift(all.pop()); // the live build first
    let current = all[0];
    let step = 0;
    let bad = false;
    let playing = !reduced();

    const root = el('section', 'gxs');
    root.setAttribute('aria-label', 'How a data contract works, step by step');
    const head = el('div', 'gxs-head');
    const titleBox = el('div');
    titleBox.append(el('p', 'gxc-eyebrow', 'How it works'), el('h2', 'gxs-title', 'One contract, from YAML to sign-off'));
    const picker = el('div', 'gxs-cases');
    picker.setAttribute('role', 'tablist');
    picker.setAttribute('aria-label', 'Use case');
    head.append(titleBox, picker);

    const intro = el('p', 'gxs-intro');
    const stage = el('ol', 'gxs-stage');
    const stations = STATIONS.map((s, i) => {
      const li = el('li', `gxs-station gxs-st-${s.key}`);
      const b = el('button', 'gxs-st-btn');
      b.type = 'button';
      b.append(el('span', 'gxs-glyph', s.glyph), el('strong', '', `${i + 1} · ${s.title}`), el('small', 'gxs-sub', ''));
      b.addEventListener('click', () => { pause(); go(i); });
      const tray = el('div', 'gxs-tray');
      li.append(b, tray);
      stage.append(li);
      return { li, sub: b.querySelector('.gxs-sub'), tray, btn: b };
    });
    const progress = el('div', 'gxs-progress');
    const bar = el('i');
    progress.append(bar);

    const panel = el('div', 'gxs-panel');
    panel.setAttribute('aria-live', 'polite');
    const controls = el('div', 'gxs-controls');
    const prev = el('button', 'gxc-btn', '‹ Back');
    const play = el('button', 'gxc-btn gxc-btn-primary', '');
    const next = el('button', 'gxc-btn', 'Next ›');
    const badLabel = el('label', 'gxs-bad');
    const badBox = el('input');
    badBox.type = 'checkbox';
    const badText = el('span', '', '');
    badLabel.append(badBox, el('span', 'gxs-bad-switch'), badText);
    [prev, play, next].forEach((b) => { b.type = 'button'; });
    controls.append(prev, play, next, badLabel);

    // The full code behind the current step, always shown, with a translation
    // table mapping the story's words to the lines that do the work.
    const code = el('section', 'gxs-code');
    code.setAttribute('aria-label', 'The code behind this step');
    let codeFile = {};
    const ownFiles = [
      ...(data?.contracts ?? []).map((c) => ({ path: c.path, language: 'yaml', code: c.source })),
      ...(data?.files ?? []),
    ];
    function filesFor(i, extra = []) {
      const pool = [...ownFiles, ...extra];
      return STEP_FILES[i].flatMap((want) => (want.endsWith('/')
        ? pool.filter((f) => f.path.startsWith(want)).sort((x, y) => x.path.localeCompare(y.path))
        : pool.filter((f) => f.path === want).slice(0, 1)));
    }
    // Resolve a translation row to a file and line range by searching for its anchor text.
    function locate(row, files) {
      const file = files.find((f) => f.path === row.file || (row.file.endsWith('/') && f.path.startsWith(row.file)) || f.path.endsWith(`/${row.file}`));
      if (!file) return null;
      const idx = file.code.split('\n').findIndex((l) => l.includes(row.find));
      return idx < 0 ? null : { file, from: idx, to: idx + (row.span ?? 1) - 1 };
    }
    function renderCode() {
      const i = step;
      const draw = (files) => {
        if (i !== step) return;
        const rows = (TRANSLATE[i] ?? []).map((r) => ({ ...r, at: locate(r, files) })).filter((r) => r.at);
        const chosen = files.find((f) => f.path === codeFile[i]) ?? rows[0]?.at.file ?? files[0];
        const marked = new Map();
        rows.forEach((r, n) => { if (r.at.file === chosen) for (let l = r.at.from; l <= r.at.to; l += 1) marked.set(l, n + 1); });

        const head = el('div', 'gxs-code-head');
        head.append(el('p', 'gxc-eyebrow', `The code behind step ${i + 1} · ${STATIONS[i].title}`), el('p', 'gxs-note', STEP_NOTES[i]));

        const table = el('table', 'gxc-table gxs-translate');
        table.innerHTML = `<thead><tr><th class="sr">#</th><th>In the story (${current.tab})</th><th>In this repository</th><th>Where</th></tr></thead>`;
        const tbody = el('tbody');
        rows.forEach((r, n) => {
          const tr = el('tr', r.at.file === chosen ? 'is-here' : '');
          const where = el('td');
          const jump = el('button', 'gxs-jump', `${r.at.file.path.split('/').pop()}:${r.at.from + 1}`);
          jump.type = 'button';
          jump.title = `Show ${r.at.file.path}, line ${r.at.from + 1}`;
          jump.addEventListener('click', () => {
            pause();
            codeFile[i] = r.at.file.path;
            renderCode();
            requestAnimationFrame(() => code.querySelector(`[data-line="${r.at.from}"]`)?.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }));
          });
          where.append(jump);
          const num = el('td'); num.append(el('b', 'gxs-pin gxs-pin-static', String(n + 1)));
          tr.append(num, el('td', 'gxs-story', r.story[current.key] ?? r.story.default), el('td', '', r.code), where);
          tbody.append(tr);
        });
        table.append(tbody);

        const chips = el('div', 'gxs-code-files');
        files.forEach((f) => {
          const c = el('button', `gxs-code-chip${f === chosen ? ' is-active' : ''}`, f.path);
          c.type = 'button';
          c.addEventListener('click', () => { pause(); codeFile[i] = f.path; renderCode(); });
          chips.append(c);
        });

        const viewer = el('div', 'gxc-code');
        const vh = el('div', 'gxc-code-head');
        const gh = el('a', '', 'GitHub ↗');
        gh.href = `https://github.com/rfim/nexus-playstation-partners/blob/main/${chosen?.path ?? ''}`;
        gh.target = '_blank'; gh.rel = 'noopener noreferrer';
        vh.append(el('span', '', chosen ? `${chosen.path} · ${chosen.code.replace(/\n$/, '').split('\n').length} lines, full file` : 'Loading…'), gh);
        const pre = el('pre');
        if (chosen) {
          const out = window.NexusHighlight ? window.NexusHighlight.highlightLines(chosen.code.replace(/\n$/, ''), langOf(chosen)) : chosen.code.split('\n');
          pre.innerHTML = out.map((l, n) => {
            const mark = marked.get(n);
            return `<span class="code-line${mark ? ' is-marked' : ''}" data-line="${n}">${mark && !marked.has(n - 1) ? `<b class="gxs-pin">${mark}</b>` : ''}<span class="code-ln">${n + 1}</span>${l}</span>`;
          }).join('');
        }
        viewer.append(vh, pre);
        code.replaceChildren(head, table, chips, viewer);
      };
      if (STEP_FILES[i].some((w) => w.startsWith('airflow/') || w.startsWith('.github/'))) loadExtra().then((extra) => draw(filesFor(i, extra)));
      else draw(filesFor(i));
    }
    // Reading the code pauses the animation, so the file never changes underneath.
    ['pointerdown', 'wheel', 'touchstart'].forEach((ev) => code.addEventListener(ev, () => { if (playing) pause(); }, { passive: true }));

    root.append(head, intro, stage, progress, panel, controls, code);

    let tokens = [];

    function renderCase() {
      picker.replaceChildren(...all.map((c) => {
        const b = el('button', `gxs-case${c === current ? ' is-active' : ''}`);
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(c === current));
        b.append(el('span', '', c.tab), el('small', '', c.tag));
        b.addEventListener('click', () => { current = c; bad = false; badBox.checked = false; renderCase(); go(0); if (!reduced()) start(); });
        return b;
      }));
      intro.textContent = current.intro;
      stations.forEach((s, i) => { s.sub.textContent = current.subtitles[i]; });
      badText.textContent = `Bad day: ${current.bad.label[0].toLowerCase()}${current.bad.label.slice(1)}`;
      tokens.forEach((t) => t.remove());
      tokens = current.tokens.map((label) => el('span', 'gxs-token', label));
      stations[0].tray.append(...tokens);
    }

    // FLIP: move tokens to another tray and animate from where they were.
    function moveTokens(target) {
      const before = tokens.map((t) => t.getBoundingClientRect());
      target.append(...tokens);
      if (reduced()) return;
      tokens.forEach((t, i) => {
        const after = t.getBoundingClientRect();
        const dx = before[i].left - after.left;
        const dy = before[i].top - after.top;
        if (!dx && !dy) return;
        t.style.transition = 'none';
        t.style.transform = `translate(${dx}px, ${dy}px)`;
        t.getBoundingClientRect();
        t.style.transition = '';
        t.style.transform = '';
      });
    }

    function stepFor(i) {
      if (bad && i === current.bad.at) return current.bad.step;
      if (bad && i === 5) return { text: 'The contract is held: it is not signed off, so nothing publishes and the stakeholder keeps the last good number.', example: { kind: 'stamp', ...current.bad.stamp } };
      if (bad && i > current.bad.at) return { text: 'Skipped: the bad delivery was stopped at the door, so nothing after it runs.', example: { kind: 'skipped' } };
      return current.steps[i];
    }

    function example(ex) {
      const box = el('div', `gxs-ex gxs-ex-${ex.kind}`);
      if (ex.kind === 'code') {
        const pre = el('pre', 'gxc-snippet');
        pre.innerHTML = hl(ex.code, ex.lang);
        box.append(pre);
      }
      if (ex.kind === 'routes') {
        ex.rows.forEach(([rule, engine, why]) => {
          const row = el('div', 'gxs-route');
          row.append(el('span', '', rule), el('i', '', '→'), el('span', `gxc-engine gxc-e-${engine}`, engine === 'gx' ? 'GX' : engine === 'dbt' ? 'dbt' : 'dbt · reused'), el('small', '', why));
          box.append(row);
        });
      }
      if (ex.kind === 'checks') {
        ex.rows.forEach(([label, status], i) => {
          const row = el('div', `gxs-check gxs-check-${status}`);
          row.style.setProperty('--d', `${i * 0.18}s`);
          row.append(el('span', `gxc-status gxc-s-${status}`, status === 'pass' ? '✓' : status === 'warn' ? '!' : '✕'), el('span', '', label));
          box.append(row);
        });
      }
      if (ex.kind === 'chain') {
        const ol = el('ol', 'gxs-chain');
        ex.rows.forEach(([label, value], i) => {
          const li = el('li');
          li.style.setProperty('--d', `${i * 0.25}s`);
          li.append(el('b', '', value), el('small', '', label));
          ol.append(li);
        });
        box.append(ol);
        if (ex.note) box.append(el('p', 'gxs-note', ex.note));
      }
      if (ex.kind === 'stamp') {
        const stamp = el('div', `gxs-stamp gxs-stamp-${ex.status}`);
        stamp.append(el('span', 'gxs-stamp-mark', ex.status === 'ok' ? 'SIGNED OFF' : 'HELD'), el('b', '', ex.big), el('span', '', ex.label));
        box.append(stamp);
        if (ex.note) box.append(el('p', 'gxs-note', ex.note));
      }
      if (ex.kind === 'skipped') box.append(el('p', 'gxs-note', 'In the DAG these tasks show as upstream_failed; CI goes red.'));
      return box;
    }

    function go(i) {
      step = Math.max(0, Math.min(5, i));
      const stopAt = bad ? current.bad.at : 5;
      stations.forEach((s, j) => {
        s.li.classList.toggle('is-active', j === step);
        s.li.classList.toggle('is-done', j < step && !(bad && j >= current.bad.at));
        s.li.classList.toggle('is-failed', bad && j === current.bad.at && step >= j);
        s.li.classList.toggle('is-skipped', bad && j > stopAt && j < 5 && step >= j);
        s.li.classList.toggle('is-held', bad && j === 5 && step === 5);
        s.btn.setAttribute('aria-current', j === step ? 'step' : 'false');
      });
      // Tokens travel with the run until the step where a bad day stops them.
      moveTokens(stations[bad ? Math.min(step, stopAt) : step].tray);
      tokens.forEach((t) => t.classList.toggle('is-bad', bad && step >= current.bad.at));
      tokens.forEach((t) => t.classList.toggle('is-ok', !bad && step === 5));
      bar.style.width = `${(step / 5) * 100}%`;
      const s = stepFor(step);
      const title = el('p', 'gxs-step-title');
      title.append(el('span', 'gxs-step-n', `Step ${step + 1} of 6`), el('strong', '', `${STATIONS[step].title} · ${current.subtitles[step]}`));
      panel.replaceChildren(title, el('p', 'gxs-step-text', s.text), example(s.example));
      renderCode();
      prev.disabled = step === 0;
      next.disabled = step === 5;
      play.textContent = playing ? '❚❚ Pause' : step === 5 ? '↺ Replay' : '▶ Play';
    }

    function tick() {
      clearTimeout(timer);
      if (!playing) return;
      timer = setTimeout(() => {
        if (!root.isConnected) return;
        if (step < 5) { go(step + 1); tick(); } else { playing = false; go(step); }
      }, 3600);
    }
    function start() { playing = true; if (step === 5) go(0); else go(step); tick(); }
    function pause() { playing = false; clearTimeout(timer); go(step); }

    play.addEventListener('click', () => (playing ? pause() : start()));
    prev.addEventListener('click', () => { pause(); go(step - 1); });
    next.addEventListener('click', () => { pause(); go(step + 1); });
    badBox.addEventListener('change', () => { bad = badBox.checked; go(step); if (!playing && step < current.bad.at) start(); });

    renderCase();
    requestAnimationFrame(() => { go(0); tick(); });
    return root;
  }

  window.ContractsStory = { mount };
})();
