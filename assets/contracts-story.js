// Animated walk-through of a data contract, from YAML to the end-of-day sign-off,
// told through three use cases. The PlayStation case reads its numbers from the
// live build (assets/contracts.json); the other two are illustrative.
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
        key: 'insurance',
        tab: 'Insurance loss ratio',
        tag: 'From Lifepal',
        intro: 'Loss ratio is claims paid out divided by premium earned. If it is wrong, the business misprices policies or looks more or less profitable than it is. Finance and the insurer partners agree one contract for it.',
        subtitles: ['Loss-ratio contract', 'Pick the checker', 'Claims file arrives', 'Warehouse tests', 'Claims and premium tie-out', 'Finance signs off'],
        tokens: ['claims.csv', 'premiums.csv'],
        steps: [
          { text: 'Finance and the insurers write down what "loss ratio" means and what the data must look like. Nobody writes tests by hand.',
            example: { kind: 'code', lang: 'yaml', code: `contract: loss_ratio
stakeholder: Finance + insurer partners
metric: claims incurred / earned premium, by product and month
rules:
  - claims_file: claim_id is unique
  - claims_file: claim_amount >= 0
  - claims_file: diagnosis_code present (mostly: 0.98)
  - fct_claim: every claim matches a policy
  - fct_claim: claim date inside the policy's cover
  - mart_loss_ratio: loss_ratio between 0 and 3` } },
          { text: 'Each rule goes where it is cheapest to check: rules on the delivered file to Great Expectations, SQL rules on warehouse tables to dbt.',
            example: { kind: 'routes', rows: [
              ['claim_id is unique (in the file)', 'gx', 'file not loaded yet'],
              ['diagnosis code present, mostly 98%', 'gx', 'a tolerance'],
              ['every claim matches a policy', 'dbt', 'a join, in SQL'],
              ['claim date inside cover', 'dbt', 'a row check, in SQL'],
            ] } },
          { text: 'The insurer\'s claims file is checked as delivered, before it loads. A broken or resent file never reaches the warehouse.',
            example: { kind: 'checks', rows: [['1,204 claims in the file', 'pass'], ['claim_id unique', 'pass'], ['amounts never negative', 'pass'], ['98.9% have a diagnosis code (needs 98%)', 'pass']] } },
          { text: 'Loaded and joined to policies, the claims are tested with SQL inside dbt build. A failure stops the loss-ratio mart from rebuilding.',
            example: { kind: 'checks', rows: [['every claim matches a policy', 'pass'], ['claim date inside the policy\'s cover', 'pass'], ['loss ratio between 0 and 3', 'pass']] } },
          { text: 'Passing tests are not enough: the money must tie out. The same total is measured at every hop, from the insurer\'s file to the number Finance reads.',
            example: { kind: 'chain', rows: [['Insurer file', 'Rp 1.28 bn'], ['Loaded claims', 'Rp 1.28 bn'], ['Loss-ratio mart', 'Rp 1.28 bn']], note: 'Premiums tie out the same way: policy system Rp 2.00 bn = earned premium in the mart.' } },
          { text: 'Every rule passed and every total tied out, so the day is signed off.',
            example: { kind: 'stamp', status: 'ok', big: '64.0%', label: 'loss ratio, signed off for Finance at 23:00', note: 'Rp 1.28 bn claims / Rp 2.00 bn earned premium' } },
        ],
        bad: {
          at: 2,
          label: 'The insurer resends yesterday\'s file',
          step: { text: 'The file arrives with yesterday\'s claims in it again. Great Expectations stops it at the door, before anything loads.',
            example: { kind: 'checks', rows: [['1,516 claims in the file', 'pass'], ['claim_id unique: 312 duplicates', 'fail'], ['amounts never negative', 'pass']] } },
          stamp: { status: 'held', big: '63.1%', label: 'Finance keeps yesterday\'s signed-off loss ratio', note: 'The insurer is asked for a corrected file. Without the gate, the double-counted claims would push the ratio to about 80%.' },
        },
      },
      {
        key: 'bakery',
        tab: 'Bakery (simple analogy)',
        tag: 'Analogy',
        intro: 'The same idea in a corner shop. The bakery delivers bread every morning, and the shop manager needs to trust what is on the shelves and in the till by closing time.',
        subtitles: ['The agreed order', 'Who checks what', 'Back-door check', 'Shelf check', 'Closing-time count', 'Manager signs the sheet'],
        tokens: ['bread crate', 'pastry crate'],
        steps: [
          { text: 'The shop and the bakery agree an order in writing: how much, how fresh, how labelled. That written order is the contract.',
            example: { kind: 'code', lang: 'yaml', code: `contract: morning_bread
stakeholder: Shop manager
rules:
  - delivery: 110 to 130 loaves
  - delivery: no mouldy loaves (mostly: 0.99)
  - shelf: every loaf has a price tag
  - shelf: price is above cost` } },
          { text: 'Checks on the delivery happen at the back door (Great Expectations). Checks on what is already in the shop happen on the shelves (dbt).',
            example: { kind: 'routes', rows: [
              ['count the loaves', 'gx', 'at the back door'],
              ['look for mould', 'gx', 'at the back door'],
              ['every loaf has a price tag', 'dbt', 'on the shelf'],
              ['price above cost', 'dbt', 'on the shelf'],
            ] } },
          { text: 'Before anything goes on a shelf, someone counts the crates and looks at the bread. Bad bread is refused at the door, not found by a customer.',
            example: { kind: 'checks', rows: [['120 loaves (needs 110 to 130)', 'pass'], ['0 mouldy', 'pass']] } },
          { text: 'Inside, staff walk the shelves: every loaf priced, and priced above cost.',
            example: { kind: 'checks', rows: [['every loaf has a price tag', 'pass'], ['every price above cost', 'pass']] } },
          { text: 'At closing time the numbers must agree: what arrived equals what was sold plus what is left.',
            example: { kind: 'chain', rows: [['Delivery note', '120'], ['Counted at the door', '120'], ['Sold 97 + left 23', '120']], note: 'The till is counted the same way: cash in the drawer = the till receipts.' } },
          { text: 'Everything agrees, so the manager signs the day sheet.',
            example: { kind: 'stamp', status: 'ok', big: '120 / 120', label: 'loaves accounted for; day signed off', note: 'The shop opens tomorrow trusting today\'s numbers.' } },
        ],
        bad: {
          at: 2,
          label: 'A crate of mouldy bread',
          step: { text: 'One crate is mouldy. It is refused at the back door, so it never reaches a shelf or a customer.',
            example: { kind: 'checks', rows: [['120 loaves', 'pass'], ['mouldy: 20 loaves, only 83% good (needs 99%)', 'fail']] } },
          stamp: { status: 'held', big: '100 / 120', label: 'loaves on the shelf; short delivery noted, bakery called', note: 'Nobody bought mouldy bread, and the sheet explains the gap.' },
        },
      },
      {
        key: 'playstation',
        tab: 'PlayStation partners',
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

  function mount(data) {
    clearTimeout(timer);
    const all = cases(data);
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

    root.append(head, intro, stage, progress, panel, controls);

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
      badText.textContent = `Bad day: ${current.bad.label.toLowerCase()}`;
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
