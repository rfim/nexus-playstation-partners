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

  // For each step, short excerpts of the real code (at most 70 lines per step)
  // showing how a YAML rule becomes a GX expectation, a dbt test and the
  // reconcile logic. Excerpts are cut from the files by anchor text, so they
  // stay true to the code. `notes` pin explanations to lines; `story` says
  // what the excerpt means in each use case.
  const MAX_LINES = 70;
  const YAML = 'contracts/partners.yml';
  const PLAN = 'contracts/contract_plan.py';
  const DAG = 'airflow/dags/nexus_partner_analytics.py';
  const STEP_CODE = [
    { intro: 'A contract is a short YAML file the stakeholder owns. Four kinds of entry do all the work.',
      panes: [
        { label: 'Who owns it', file: YAML, find: 'contract: partners', count: 7,
          story: { playstation: 'Partner Success, for the partner scorecard', royalties: 'Finance and the partners, for royalty statements', certification: 'Partner and publishing QA, for the release checklist' },
          notes: [['stakeholder:', 'Who owns the contract and signs it off.'], ['owner_group:', 'The dbt group alerted when it breaks.']] },
        { label: 'A rule on a delivered file', file: YAML, find: '- id: P-03', count: 6,
          story: { playstation: 'P-03: partners only send known statuses', royalties: 'Currency must be USD, EUR, GBP or JPY', certification: 'An age rating for every region' },
          notes: [['dataset:', 'partner_submission_feed is a delivered file, so this is checked before it loads.'], ['values:', 'The only values allowed.']] },
        { label: 'A rule with a tolerance', file: YAML, find: '- id: P-09', count: 7,
          story: { playstation: 'P-09: 95% of reviews within 72 hours', royalties: '99% of sales have a valid SKU', certification: 'Build size under the limit' },
          notes: [['mostly:', 'At least 95% of rows must pass, not every row.']] },
        { label: 'A rule on a warehouse model', file: YAML, find: '- id: P-08', count: 5,
          story: { playstation: 'P-08: no review before submission', royalties: 'No sale before the release date', certification: 'Save data survives suspend and resume' },
          notes: [['expression:', 'Plain SQL that must be true for every row.']] },
        { label: 'A reconcile chain', file: YAML, find: '- id: R-P1', count: 8,
          story: { playstation: 'R-P1: feed = loaded = fact = scorecard', royalties: 'Store file = loaded sales = royalty mart', certification: 'Submitted = certified = on the store' },
          notes: [['tolerance:', 'How far the numbers may differ.'], ['rule: P-04', 'First hop: the row count GX saw in the delivered file.'], ['from fct_submission', 'Later hops: SQL on the warehouse.']] },
      ] },
    { intro: 'Four lines of routing decide, for every rule, the cheapest place to check it. A compiler then writes the files.',
      panes: [
        { label: 'route(): pick the engine', file: PLAN, find: 'def route(', count: 19,
          story: { playstation: 'P-03 and P-09 → GX, P-08 → dbt, P-06 → reused', royalties: 'Store-file checks and SKU ≥ 99% → GX; SKU maps to a title → dbt', certification: 'Submission checks → GX; devkit tests → dbt' },
          notes: [['if dataset["kind"] == "file"', 'Delivered file → Great Expectations: dbt cannot test what is not loaded yet.'], ['elif rule.get("mostly")', 'Tolerance or distribution → Great Expectations, which has these built in.'], ['engine, reason = "dbt", "set_based"', 'Anything else is SQL on a model → a dbt test.'], ['reused = existing.get(', 'If the project already runs the same test, reuse it.']] },
        { label: 'compile.py: write the files', file: 'contracts/compile.py', find: 'def render()', count: 9,
          notes: [['files[DBT_TESTS', 'One dbt test file per dbt rule.'], ['files[GX_SUITES', 'One GX suite file per dataset.']] },
      ] },
    { intro: 'One YAML rule, followed from the contract to the check that runs on the delivered file.',
      panes: [
        { label: 'The YAML rule', file: YAML, find: '- id: P-03', count: 6,
          story: { playstation: 'Only known statuses in the partner feed', royalties: 'Only known currencies in the store sales file', certification: 'An age rating for every region in the package' },
          notes: [['check: accepted_values', 'What must hold, in plain words.']] },
        { arrow: 'contract_plan.py maps it to a Great Expectations class', label: 'YAML → Python', file: PLAN, find: 'return gxe.ExpectColumnValuesToBeInSet', before: 1, count: 2,
          notes: [['ExpectColumnValuesToBeInSet', 'accepted_values becomes this expectation.']] },
        { arrow: 'saved in the generated suite', label: 'The expectation (JSON)', file: 'contracts/gx/expectations/partners__partner_submission_feed.json', find: '"expect_column_values_to_be_in_set"', before: 1, count: 15,
          notes: [['"value_set"', 'The allowed values, copied from the YAML.'], ['"severity"', 'critical: a failure stops the load.']] },
        { arrow: 'validate.py runs it on the file as delivered', label: 'Run the suite', file: 'contracts/validate.py', find: 'if meta["dataset_kind"] == "file":', count: 9,
          notes: [['add_csv_asset', 'Read the CSV as delivered, before dbt seed loads it.'], ['batch.validate(suite)', 'Run every expectation in the suite.']] },
        { label: '…and stop a bad file', file: 'contracts/validate.py', find: 'if blocking:', count: 2,
          notes: [['sys.exit', 'A non-zero exit: Airflow and CI stop here.']] },
      ] },
    { intro: 'A rule on a warehouse model becomes a dbt test: a query that returns the rows breaking the rule.',
      panes: [
        { label: 'The YAML rule', file: YAML, find: '- id: P-08', count: 5,
          story: { playstation: 'No review finishes before the build was submitted', royalties: 'No sale is dated before the title\'s release', certification: 'Save data survives suspend and resume' },
          notes: [['expression:', 'Must be true for every row.']] },
        { arrow: 'contract_plan.py turns it into a failing-rows query', label: 'YAML → SQL', file: PLAN, find: 'if check == "expression":', count: 2,
          notes: [['where not (', 'Select the rows where the rule is false.']] },
        { arrow: 'written as a dbt test in tests/contracts/', label: 'The dbt test', file: 'tests/contracts/contract_partners_p08.sql', find: '-- Generated', count: 8,
          notes: [["severity='error'", 'error holds the contract; warn only reports.'], ["ref('fct_submission')", 'dbt resolves the model, so lineage and run order work.'], ['where not (', 'Zero rows returned means the test passes.']] },
        { label: 'A cross-model rule', file: YAML, find: '- id: P-12', count: 6,
          story: { playstation: 'Titles on the scorecard add up to titles submitted', royalties: 'Every sale belongs to a partner title', certification: 'Every trophy can be unlocked' },
          notes: [['right:', 'The total it must agree with, from another model.']] },
        { arrow: 'becomes', label: 'The dbt test', file: 'tests/contracts/contract_partners_p12.sql', find: 'with contract_side as (', count: 9,
          notes: [['contract_side as', 'The total on the scorecard.'], ['reference_side as', 'The same total from the fact table.'], ['abs(c.value - r.value) > 0', 'Any difference is a failing row.']] },
      ] },
    { intro: 'At the end of the day the same number is measured at every hop. The chains and both engines\' results give one verdict.',
      panes: [
        { label: 'The YAML chain', file: YAML, find: '- id: R-P1', count: 8,
          story: { playstation: 'Feed = loaded table = fact = scorecard', royalties: 'Store file = loaded sales = royalty mart', certification: 'Submitted = certified = on the store' },
          notes: [['rule: P-04', 'Measured by GX on the delivered file.'], ['sql:', 'Measured with SQL in the warehouse.']] },
        { arrow: 'reconcile.py measures every hop', label: '_reconcile(): one chain', file: 'contracts/reconcile.py', find: 'def _reconcile(', count: 13,
          notes: [['if "rule" in m:', 'A file hop: the value GX observed.'], ['con.execute(sql)', 'A warehouse hop: run the SQL on the dbt build.'], ['spread = round(max(values) - min(values)', 'How far apart the hops are.'], ['status = "match"', 'Within tolerance means the chain matches.']] },
        { arrow: 'then one verdict per contract', label: 'The verdict', file: 'contracts/reconcile.py', find: 'failed = [r["id"]', count: 3,
          notes: [['failed = ', 'Any failed error rule or broken chain.'], ['warned = ', 'Rules with severity warn.'], ['verdict = ', 'held, signed off with warnings, or signed off.']] },
      ] },
    { intro: 'The sign-off runs in the daily DAG and in CI. A held contract fails both, so nothing publishes.',
      panes: [
        { label: 'Before the load', file: DAG, find: 'check_files = BashOperator(', count: 5,
          notes: [['validate.py --scope files', 'GX on the delivered files; a failure stops the DAG before dbt seed.']] },
        { label: 'After the test gate', file: DAG, find: 'with TaskGroup(group_id="contracts")', count: 13,
          story: { playstation: 'Sign off the partner scorecard', royalties: 'Sign off the royalty statements', certification: 'Approve the release' },
          notes: [['validate.py --scope models', 'GX tolerance checks on the built models.'], ['bash_command=contracts("reconcile.py")', 'The sign-off. A held contract fails this task.'], ['outlets=[CONTRACT_RESULTS]', 'Other DAGs can wait on the signed-off results.']] },
        { label: 'The run order', file: DAG, find: 'validate >> check_files', count: 1,
          notes: [['signoff >> publish', 'Nothing publishes until the contracts are signed off.']] },
        { label: 'CI, on every push', file: '.github/workflows/ci.yml', find: 'Sign off the stakeholder contracts', count: 5,
          notes: [['reconcile.py --check', 'Fails the build if a contract is held or its results are stale.']] },
      ] },
  ];
  let extraFiles = null;
  const loadExtra = () => (extraFiles ??= Promise.all(
    ['assets/airflow_code.json', 'assets/code.json'].map((u) => fetch(u).then((r) => r.json()).catch(() => ({ folders: [] }))),
  ).then((sets) => sets.flatMap((d) => d.folders.flatMap((f) => f.files))));

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

    // The code behind the current step: short, annotated excerpts.
    const code = el('section', 'gxs-code');
    code.setAttribute('aria-label', 'The code behind this step');
    const ownFiles = [
      ...(data?.contracts ?? []).map((c) => ({ path: c.path, language: 'yaml', code: c.source })),
      ...(data?.files ?? []),
    ];
    const langFor = (path) => (path.endsWith('.py') ? 'python' : path.endsWith('.sql') ? 'sql' : path.endsWith('.json') ? 'json' : 'yaml');
    function excerpt(pane, pool) {
      const file = pool.find((f) => f.path === pane.file);
      if (!file) return null;
      const all = file.code.split('\n');
      const at = all.findIndex((l) => l.includes(pane.find));
      if (at < 0) return null;
      const from = Math.max(0, at - (pane.before ?? 0));
      return { file, from, lines: all.slice(from, from + pane.count) };
    }
    function renderCode() {
      const i = step;
      const spec = STEP_CODE[i];
      const draw = (pool) => {
        if (i !== step) return;
        const head = el('div', 'gxs-code-head');
        head.append(el('p', 'gxc-eyebrow', `The code behind step ${i + 1} · ${STATIONS[i].title}`), el('p', 'gxs-note', spec.intro));
        const panes = [];
        let total = 0;
        let pin = 0;
        for (const pane of spec.panes) {
          const ex = excerpt(pane, pool);
          if (!ex) continue;
          total += ex.lines.length;
          if (pane.arrow) panes.push(el('p', 'gxs-arrow', `↓ ${pane.arrow}`));
          const box = el('figure', 'gxs-pane');
          const cap = el('figcaption');
          const span = ex.lines.length > 1 ? `${ex.from + 1}–${ex.from + ex.lines.length}` : `${ex.from + 1}`;
          const gh = el('a', '', `${pane.file}:${span} ↗`);
          gh.href = `https://github.com/rfim/nexus-playstation-partners/blob/main/${pane.file}#L${ex.from + 1}${ex.lines.length > 1 ? `-L${ex.from + ex.lines.length}` : ''}`;
          gh.target = '_blank'; gh.rel = 'noopener noreferrer';
          cap.append(el('strong', '', pane.label), gh);
          box.append(cap);
          const story = pane.story && (pane.story[current.key] ?? pane.story.default);
          if (story) { const p = el('p', 'gxs-pane-story'); p.append(el('span', '', `${current.tab}: `), document.createTextNode(story)); box.append(p); }
          const pins = new Map();
          const notes = [];
          for (const [find, text] of pane.notes ?? []) {
            const idx = ex.lines.findIndex((l) => l.includes(find));
            if (idx < 0) continue;
            pin += 1;
            if (!pins.has(idx)) pins.set(idx, pin);
            notes.push([pin, text]);
          }
          const pre = el('pre', 'gxs-pane-code');
          const out = window.NexusHighlight ? window.NexusHighlight.highlightLines(ex.lines.join('\n'), langFor(pane.file)) : ex.lines;
          pre.innerHTML = out.map((l, n) => `<span class="code-line${pins.has(n) ? ' is-marked' : ''}">${pins.has(n) ? `<b class="gxs-pin">${pins.get(n)}</b>` : ''}<span class="code-ln">${ex.from + n + 1}</span>${l}</span>`).join('');
          box.append(pre);
          if (notes.length) {
            const ol = el('ol', 'gxs-notes');
            notes.forEach(([n, text]) => { const li = el('li'); li.append(el('b', 'gxs-pin gxs-pin-static', String(n)), el('span', '', text)); ol.append(li); });
            box.append(ol);
          }
          panes.push(box);
        }
        head.append(el('p', 'gxs-lines', `${total} lines of real code, cut from the repository (max ${MAX_LINES})`));
        code.replaceChildren(head, ...panes);
      };
      if (spec.panes.some((pn) => !ownFiles.some((f) => f.path === pn.file))) loadExtra().then((extra) => draw([...ownFiles, ...extra]));
      else draw(ownFiles);
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
