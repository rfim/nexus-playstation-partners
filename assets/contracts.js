// Data contracts view: stakeholder YAML contracts, where each rule runs (dbt or
// Great Expectations), the results, and the end-of-day reconciliation. Everything
// comes from assets/contracts.json, written by contracts/reconcile.py in CI.
(() => {
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const embedded = window.parent !== window;
  const toWorkspace = (m) => window.parent.postMessage({ source: 'nexus-platform', ...m }, location.origin);
  const BASE = 'https://github.com/rfim/nexus-playstation-partners/blob/main/';
  const VERDICT = { signed_off: 'Signed off', signed_off_with_warnings: 'Signed off with warnings', held: 'Held' };
  const STATUS = { pass: 'Passed', warn: 'Warning', fail: 'Failed' };
  const ICON = { pass: '✓', warn: '!', fail: '✕', match: '✓', mismatch: '✕' };
  const ENGINE_SHORT = { gx: 'GX', dbt: 'dbt', dbt_existing: 'dbt · reused' };
  const fmt = (v) => (typeof v === 'number' ? v.toLocaleString('en-GB', { maximumFractionDigits: 4 }) : String(v));
  const hl = (code, lang) => (window.NexusHighlight ? window.NexusHighlight.highlight(code, lang) : code.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]));
  const hlLines = (code, lang) => (window.NexusHighlight ? window.NexusHighlight.highlightLines(code, lang) : code.split('\n'));

  let data = null;
  let section = 'signoff';
  let current = null;
  let tab = 'rules';
  let ruleId = null;
  let engineFilter = 'all';
  let openFile = null;

  fetch('assets/contracts.json').then((r) => r.json()).then((d) => {
    data = d;
    data.contracts.sort((a, b) => a.title.localeCompare(b.title));
    current = data.contracts.find((c) => c.contract === 'partners') ?? data.contracts[0];
    const params = new URLSearchParams(location.search);
    if (params.get('contract')) pick(params.get('contract'), params.get('rule'));
    showSection(params.get('section') || section);
    inbox.splice(0).forEach(handle);
  }).catch(() => { $('#gxc-main').replaceChildren(el('p', 'gxc-loading', 'Could not load assets/contracts.json.')); });

  // ---- Messages from the workspace ------------------------------------------
  const inbox = [];
  const handle = (msg) => {
    if (msg.type === 'contracts-open') { pick(msg.contract, msg.rule); showSection('contracts'); }
  };
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.data?.source !== 'nexus-sql') return;
    if (data) handle(event.data); else inbox.push(event.data);
  });
  document.querySelectorAll('.gxc-nav [data-section]').forEach((b) => b.addEventListener('click', () => showSection(b.dataset.section)));

  function pick(contract, rule) {
    current = data.contracts.find((c) => c.contract === contract) ?? current;
    ruleId = rule && current.rules.some((r) => r.id === rule) ? rule : null;
    if (ruleId) tab = 'rules';
  }

  function showSection(name) {
    section = ['signoff', 'contracts', 'code'].includes(name) ? name : 'signoff';
    document.querySelectorAll('.gxc-nav [data-section]').forEach((b) => b.classList.toggle('is-active', b.dataset.section === section));
    const host = $('#gxc-main');
    if (section === 'signoff') renderSignoff(host);
    if (section === 'contracts') renderContract(host);
    if (section === 'code') renderCode(host);
    host.scrollTop = 0;
  }

  function crumbs(...parts) {
    const c = el('div', 'gxc-crumbs');
    c.append(el('span', '', 'Contracts → Great Expectations + dbt tests'));
    parts.forEach((p) => c.append(el('b', '', '›'), el('strong', '', p)));
    c.append(el('em', 'gxc-demo', `Synthetic data · results from the CI build · business date ${data.business_date}`));
    return c;
  }

  const verdictBadge = (v) => el('span', `gxc-verdict gxc-v-${v}`, VERDICT[v]);
  const engineChip = (e) => el('span', `gxc-engine gxc-e-${e}`, ENGINE_SHORT[e]);
  const statusIcon = (s) => { const i = el('span', `gxc-status gxc-s-${s}`, ICON[s]); i.title = STATUS[s] ?? s; return i; };

  function button(label, cls, onClick) {
    const b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function openSql(title, sql) {
    if (embedded) toWorkspace({ type: 'open-sql', title, kind: 'query', sql });
    else location.href = "sql.html?preset=contracts";
  }

  function openAirflow(task) {
    if (embedded) toWorkspace({ type: 'open-view', view: 'airflow', task });
    else location.href = `sql.html?view=airflow`;
  }

  // ---- Sign-off: the end-of-day board ----------------------------------------
  function renderSignoff(host) {
    const s = data.summary;
    const overall = data.contracts.some((c) => c.verdict === 'held') ? 'held'
      : data.contracts.some((c) => c.verdict === 'signed_off_with_warnings') ? 'signed_off_with_warnings' : 'signed_off';
    const head = el('header', 'gxc-head');
    const title = el('div');
    title.append(el('h1', '', 'End-of-day sign-off'),
      el('p', 'gxc-sub', `Each stakeholder owns a YAML contract. Every rule compiles to a dbt test or a Great Expectations expectation, whichever is cheaper to run. At the end of the day both engines' results, and the file-to-mart reconcile chains, give one verdict per stakeholder.`));
    head.append(title, verdictBadge(overall));

    // The pipeline, left to right.
    const flow = el('ol', 'gxc-flow');
    const step = (n, label, value, note, onClick, cls = '') => {
      const li = el('li', `gxc-step ${cls}`);
      const b = el(onClick ? 'button' : 'div', 'gxc-step-card');
      if (onClick) { b.type = 'button'; b.addEventListener('click', onClick); }
      b.append(el('span', 'gxc-step-n', n), el('strong', '', label), el('b', 'gxc-step-value', value), el('small', '', note));
      li.append(b);
      return li;
    };
    const engines = el('li', 'gxc-step gxc-step-split');
    const gxCard = el('button', 'gxc-step-card gxc-step-gx');
    gxCard.type = 'button';
    gxCard.append(el('span', 'gxc-step-n', '3a'), el('strong', '', 'Great Expectations'), el('b', 'gxc-step-value', `${s.engines.gx} expectations`), el('small', '', 'delivered files, tolerances, distributions'));
    gxCard.addEventListener('click', () => { openFile = firstFile('contracts/gx/'); showSection('code'); });
    const dbtCard = el('button', 'gxc-step-card gxc-step-dbt');
    dbtCard.type = 'button';
    dbtCard.append(el('span', 'gxc-step-n', '3b'), el('strong', '', 'dbt tests'), el('b', 'gxc-step-value', `${s.engines.dbt} generated + ${s.engines.dbt_existing} reused`), el('small', '', 'set-based SQL inside dbt build'));
    dbtCard.addEventListener('click', () => { openFile = firstFile('tests/contracts/'); showSection('code'); });
    engines.append(gxCard, dbtCard);
    flow.append(
      step('1', 'Stakeholder YAML', `${s.contracts} contracts · ${s.rules} rules`, 'contracts/*.yml, owned by Partners and Finance', () => { tab = 'yaml'; showSection('contracts'); }),
      step('2', 'Compile and route', 'contract_plan.py', 'picks the cheaper engine per rule', () => { openFile = data.files.find((f) => f.path === 'contracts/contract_plan.py'); showSection('code'); }),
      engines,
      step('4', 'Reconcile', `${s.reconciled} of ${s.reconciliations} chains match`, 'file → loaded table → mart', () => { tab = 'reconcile'; showSection('contracts'); }),
      step('5', 'Sign-off', `${s.status.pass} pass · ${s.status.warn} warn · ${s.status.fail} fail`, VERDICT[overall], null, `gxc-step-final gxc-v-${overall}`),
    );

    // One card per stakeholder.
    const cards = el('div', 'gxc-cards');
    for (const c of data.contracts) {
      const card = el('article', 'gxc-card');
      const top = el('div', 'gxc-card-top');
      top.append(el('span', 'gxc-eyebrow', c.contract), verdictBadge(c.verdict));
      card.append(top, el('h2', '', c.title), el('p', 'gxc-card-who', c.stakeholder));
      const counts = (key, values) => values.map((v) => c.rules.filter((r) => r[key] === v).length);
      const [pass, warn, fail] = counts('status', ['pass', 'warn', 'fail']);
      const bar = el('div', 'gxc-bar');
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', `${pass} passed, ${warn} warnings, ${fail} failed`);
      [['pass', pass], ['warn', warn], ['fail', fail]].forEach(([k, n]) => { if (n) { const seg = el('i', `gxc-s-${k}`); seg.style.flex = n; seg.title = `${n} ${STATUS[k].toLowerCase()}`; bar.append(seg); } });
      const [g, d, x] = counts('engine', ['gx', 'dbt', 'dbt_existing']);
      const dl = el('dl', 'gxc-kv');
      const kv = (k, v) => { dl.append(el('dt', '', k), el('dd', '', v)); };
      kv('Rules', `${pass} passed · ${warn} warning${warn === 1 ? '' : 's'} · ${fail} failed`);
      kv('Engines', `${g} GX · ${d} dbt generated · ${x} dbt reused`);
      kv('Reconcile', `${c.reconcile.filter((r) => r.status === 'match').length} of ${c.reconcile.length} chains match`);
      kv('Consumer', c.consumer);
      kv('Sign-off by', `${c.sla.signed_off_by} · owner ${c.owner_group}`);
      card.append(bar, dl);
      const flagged = c.rules.filter((r) => r.status !== 'pass');
      if (flagged.length) {
        const ul = el('ul', 'gxc-flagged');
        flagged.forEach((r) => {
          const li = el('li');
          li.append(statusIcon(r.status), button(`${r.id}`, 'gxc-link', () => { pick(c.contract, r.id); showSection('contracts'); }), el('span', '', ` ${r.description} (${r.observed})`));
          ul.append(li);
        });
        card.append(ul);
      }
      const actions = el('div', 'gxc-actions');
      actions.append(
        button('Open contract', 'gxc-btn gxc-btn-primary', () => { pick(c.contract); tab = 'rules'; showSection('contracts'); }),
        button('Query results in SQL ↗', 'gxc-btn', () => openSql(`${c.contract} contract`, `-- ${c.title}: every rule, where it ran and what it found\nselect rule_id, engine, status, severity, dataset, "check", observed, description\nfrom contract_rules\nwhere contract = '${c.contract}'\norder by status <> 'pass' desc, rule_id`)),
      );
      card.append(actions);
      cards.append(card);
    }

    // Routing policy with counts.
    const policy = el('section', 'gxc-panel-box');
    policy.append(el('h2', 'gxc-box-title', 'Where each rule runs'), el('p', 'gxc-note', 'contract_plan.py applies these in order. The stakeholder writes what must hold; the platform team decides how it is checked.'));
    const table = el('table', 'gxc-table');
    table.innerHTML = '<thead><tr><th>Rule</th><th>Engine</th><th>Why</th><th class="num">Rules</th></tr></thead>';
    const tbody = el('tbody');
    const ROUTES = [
      ['boundary', 'gx', 'On a delivered file'],
      ['tolerance', 'gx', 'Tolerance or distribution (mostly, mean, sum, row count)'],
      ['set_based', 'dbt', 'Set-based SQL on a model'],
      ['reuse', 'dbt_existing', 'Same as a test the project already has'],
    ];
    const all = data.contracts.flatMap((c) => c.rules);
    for (const [reason, engine, label] of ROUTES) {
      const tr = el('tr');
      const td = el('td'); td.append(engineChip(engine));
      tr.append(el('td', '', label), td, el('td', 'gxc-why', data.reasons[reason]), el('td', 'num', String(all.filter((r) => r.reason === reason).length)));
      tbody.append(tr);
    }
    table.append(tbody);
    policy.append(table);

    // Where it runs in the daily DAG.
    const dag = el('section', 'gxc-panel-box');
    dag.append(el('h2', 'gxc-box-title', 'In the daily Airflow run'), el('p', 'gxc-note', 'Great Expectations checks the delivered files before they load. After the dbt test gate, the model checks and the reconciliation give the sign-off, and publishing waits for it. Select a task to open it in the Airflow tab.'));
    const chain = el('ol', 'gxc-dag');
    [
      ['dbt_parse', ''], ['validate_contract_files', 'gx'], ['ingest_sources', ''], ['transform.*', ''], ['test_gate', 'dbt'],
      ['contracts.validate_contract_models', 'gx'], ['contracts.reconcile_contracts', 'signoff'], ['publish.*', ''],
    ].forEach(([task, kind]) => {
      const li = el('li');
      const b = button(task, `gxc-task ${kind ? `gxc-task-${kind}` : ''}`, () => openAirflow(task.endsWith('*') ? null : task));
      li.append(b);
      chain.append(li);
    });
    dag.append(chain);

    host.replaceChildren(crumbs('End-of-day sign-off'), head, flow, cards, policy, dag);
  }

  // ---- One contract: rules, YAML, reconciliation ------------------------------
  function renderContract(host) {
    const c = current;
    const switcher = el('div', 'gxc-switch');
    switcher.setAttribute('role', 'group');
    switcher.setAttribute('aria-label', 'Contract');
    data.contracts.forEach((x) => {
      const b = button('', `gxc-pill${x === c ? ' is-active' : ''}`, () => { pick(x.contract); ruleId = null; renderContract(host); });
      b.append(el('i', `gxc-dot gxc-v-${x.verdict}`), document.createTextNode(x.title));
      b.setAttribute('aria-pressed', String(x === c));
      switcher.append(b);
    });

    const head = el('header', 'gxc-head');
    const title = el('div');
    const h1 = el('h1', '', c.title);
    h1.append(el('span', 'gxc-version', `v${c.version}`));
    title.append(h1, el('p', 'gxc-sub', `${c.path} · owned by ${c.stakeholder}`));
    head.append(title, verdictBadge(c.verdict));

    const facts = el('dl', 'gxc-facts');
    [['Consumer', c.consumer], ['Owner group', c.owner_group], ['Refreshed by', c.sla.refreshed_by], ['Signed off by', c.sla.signed_off_by], ['If breached', c.sla.breach]]
      .forEach(([k, v]) => { const d = el('div'); d.append(el('dt', '', k), el('dd', '', v)); facts.append(d); });

    const tabs = el('div', 'gxc-tabs');
    tabs.setAttribute('role', 'tablist');
    [['rules', `Rules (${c.rules.length})`], ['yaml', 'Contract YAML'], ['reconcile', `Reconciliation (${c.reconcile.length})`]].forEach(([key, label]) => {
      const b = button(label, '', () => { tab = key; renderContract(host); });
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(tab === key));
      tabs.append(b);
    });

    const body = el('div', `gxc-body${tab === 'reconcile' ? ' is-wide' : ''}`);
    const pane = el('section', 'gxc-pane');
    if (tab === 'rules') pane.append(rulesPane(c, host));
    if (tab === 'yaml') pane.append(yamlPane(c));
    if (tab === 'reconcile') pane.append(reconcilePane(c));
    body.append(pane);
    if (tab !== 'reconcile') body.append(rulePanel(c, host));

    host.replaceChildren(crumbs('Contracts', c.contract), switcher, head, facts, tabs, body);
    if (tab === 'yaml') pane.querySelector('.is-marked')?.scrollIntoView({ block: 'center' });
  }

  function rulesPane(c, host) {
    const wrap = el('div');
    const filters = el('div', 'gxc-filters');
    [['all', 'All engines'], ['gx', 'Great Expectations'], ['dbt', 'dbt']].forEach(([key, label]) => {
      const b = button(label, `gxc-chip${engineFilter === key ? ' is-active' : ''}`, () => { engineFilter = key; renderContract(host); });
      b.setAttribute('aria-pressed', String(engineFilter === key));
      filters.append(b);
    });
    wrap.append(filters);
    for (const ds of c.datasets) {
      const rules = c.rules.filter((r) => r.dataset === ds.name && (engineFilter === 'all' || r.engine.startsWith(engineFilter)));
      if (!rules.length) continue;
      const group = el('div', 'gxc-dataset');
      group.append(el('span', `gxc-kind gxc-kind-${ds.kind}`, ds.kind === 'file' ? 'delivered file' : 'dbt model'), el('strong', '', ds.name));
      if (ds.path) group.append(el('code', '', ds.path));
      wrap.append(group);
      const table = el('table', 'gxc-table gxc-rules');
      table.innerHTML = '<colgroup><col class="c-s"><col class="c-rule"><col class="c-check"><col class="c-eng"><col class="c-obs"></colgroup><thead><tr><th class="sr">Status</th><th>Rule</th><th>Check</th><th>Engine</th><th>Observed</th></tr></thead>';
      const tbody = el('tbody');
      for (const r of rules) {
        const tr = el('tr', r.id === ruleId ? 'is-selected' : '');
        tr.tabIndex = 0;
        const select = () => { ruleId = r.id; renderContract(host); };
        tr.addEventListener('click', select);
        tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } });
        const s = el('td'); s.append(statusIcon(r.status));
        const rule = el('td'); rule.append(el('b', 'gxc-id', r.id), el('span', '', r.description));
        const target = r.check === 'columns_match' ? `${r.column.split(', ').length} columns` : r.column;
        const check = el('td', 'gxc-mono', target ? `${r.check}(${target})` : r.check);
        const eng = el('td'); eng.append(engineChip(r.engine));
        tr.append(s, rule, check, eng, el('td', 'gxc-observed', r.observed));
        tbody.append(tr);
      }
      table.append(tbody);
      wrap.append(table);
    }
    return wrap;
  }

  function ruleLines(c, id) {
    const lines = c.source.split('\n');
    const start = lines.findIndex((l) => l.trim() === `- id: ${id}`);
    if (start < 0) return [-1, -1];
    let end = start + 1;
    while (end < lines.length && !/^\s*- id:/.test(lines[end]) && /^\s{4,}\S/.test(lines[end])) end += 1;
    return [start, end - 1];
  }

  function yamlPane(c) {
    const viewer = el('div', 'gxc-code');
    const head = el('div', 'gxc-code-head');
    const gh = el('a', '', 'GitHub ↗');
    gh.href = BASE + c.path; gh.target = '_blank'; gh.rel = 'noopener noreferrer';
    head.append(el('span', '', c.path), gh);
    const [from, to] = ruleId ? ruleLines(c, ruleId) : [-1, -1];
    const pre = el('pre');
    pre.innerHTML = hlLines(c.source.replace(/\n$/, ''), 'yaml')
      .map((l, i) => `<span class="code-line${i >= from && i <= to ? ' is-marked' : ''}"><span class="code-ln">${i + 1}</span>${l}</span>`).join('');
    viewer.append(head, pre);
    return viewer;
  }

  function rulePanel(c, host) {
    const panel = el('aside', 'gxc-side');
    const r = c.rules.find((x) => x.id === ruleId);
    if (!r) {
      panel.append(el('p', 'gxc-eyebrow', 'Select a rule'), el('p', 'gxc-note', 'Choose a rule to see why it runs where it does, the test or expectation generated from it, and what it found in the latest build.'));
      const legend = el('dl', 'gxc-kv');
      ['gx', 'dbt', 'dbt_existing'].forEach((e) => { const dt = el('dt'); dt.append(engineChip(e)); legend.append(dt, el('dd', '', data.engines[e])); });
      panel.append(legend);
      return panel;
    }
    panel.append(el('p', 'gxc-eyebrow', `${c.contract} · ${r.id}`), el('h2', '', r.description));
    const badges = el('div', 'gxc-badges');
    badges.append(statusIcon(r.status), el('span', '', `${STATUS[r.status]} · ${r.observed}`));
    panel.append(badges);
    const dl = el('dl', 'gxc-kv');
    [['Dataset', `${r.dataset} (${r.dataset_kind === 'file' ? 'delivered file' : 'dbt model'})`], ['Check', r.column ? `${r.check} on ${r.column}` : r.check], ['Severity', r.severity === 'warn' ? 'warn: reported, does not stop the run' : 'error: holds the contract']]
      .forEach(([k, v]) => dl.append(el('dt', '', k), el('dd', '', v)));
    panel.append(dl);
    const why = el('div', `gxc-why-box gxc-e-${r.engine}-box`);
    const whyHead = el('p', 'gxc-mini', 'Routed to ');
    whyHead.append(engineChip(r.engine));
    why.append(whyHead, el('p', '', data.reasons[r.reason]));
    panel.append(why);
    panel.append(el('p', 'gxc-mini', r.engine === 'gx' ? 'Generated expectation' : r.engine === 'dbt' ? 'Generated dbt test' : 'Existing dbt test'));
    const file = el('p', 'gxc-file', r.artifact.path);
    const pre = el('pre', 'gxc-snippet');
    pre.innerHTML = hl(r.artifact.code.replace(/\n$/, ''), r.artifact.language);
    panel.append(file, pre);
    const actions = el('div', 'gxc-actions');
    if (r.sql) actions.append(button('Run the test query ↗', 'gxc-btn gxc-btn-primary', () => openSql(`${r.id} failing rows`, `-- ${c.contract} ${r.id}: ${r.description}\n-- The dbt test's query: any row returned is a failure.\n${r.sql}`)));
    actions.append(button('Show in YAML', 'gxc-btn', () => { tab = 'yaml'; renderContract(host); }));
    const src = data.files.find((f) => f.path === r.artifact.path);
    if (src) actions.append(button('Open file', 'gxc-btn', () => { openFile = src; showSection('code'); }));
    panel.append(actions);
    return panel;
  }

  function reconcilePane(c) {
    const wrap = el('div', 'gxc-recs');
    wrap.append(el('p', 'gxc-note', 'Passing rules do not prove that the number a stakeholder reads is the number that was delivered. Each chain takes the same measure at every hop, from the delivered file to the mart, and must agree within its tolerance.'));
    for (const rec of c.reconcile) {
      const card = el('article', `gxc-rec gxc-rec-${rec.status}`);
      const top = el('div', 'gxc-rec-top');
      const t = el('div');
      t.append(el('span', 'gxc-eyebrow', rec.id), el('h3', '', rec.title));
      const st = el('span', `gxc-verdict gxc-v-${rec.status === 'match' ? 'signed_off' : 'held'}`, rec.status === 'match' ? 'Reconciled' : 'Mismatch');
      top.append(t, st);
      const chain = el('ol', 'gxc-chain');
      rec.measures.forEach((m) => {
        const li = el('li', 'gxc-measure');
        li.append(el('span', `gxc-engine gxc-e-${m.engine === 'gx' ? 'gx' : 'sql'}`, m.engine === 'gx' ? 'GX observed' : 'SQL'), el('b', '', fmt(m.value)), el('small', '', m.label));
        li.title = m.source;
        chain.append(li);
      });
      const foot = el('p', 'gxc-rec-foot', `Spread ${fmt(rec.spread ?? 0)} · tolerance ${fmt(rec.tolerance)}`);
      const sql = rec.measures.map((m) => (m.engine === 'gx'
        ? `select '${m.label.replace(/'/g, "''")}' as measure, ${m.value} as value  -- observed by Great Expectations on the delivered file`
        : `select '${m.label.replace(/'/g, "''")}' as measure, (${m.source}) as value`)).join('\nunion all\n');
      const actions = el('div', 'gxc-actions');
      actions.append(button('Recompute in SQL ↗', 'gxc-btn', () => openSql(`${rec.id} reconcile`, `-- ${c.contract} ${rec.id}: ${rec.title}\n-- Every hop must agree within ${rec.tolerance}.\n${sql}`)));
      card.append(top, chain, foot, actions);
      wrap.append(card);
    }
    const sign = el('div', `gxc-signbox gxc-v-${c.verdict}`);
    sign.append(el('strong', '', `${VERDICT[c.verdict]} for ${data.business_date}`),
      el('span', '', c.verdict === 'held' ? `Held by ${c.failed.join(', ')}. The run fails and nothing publishes.`
        : c.warned.length ? `Warnings: ${c.warned.join(', ')}. Reported to ${c.owner_group}; publishing continues.` : 'Every rule passed and every chain matched.'));
    wrap.append(sign);
    return wrap;
  }

  // ---- Code: the YAML, compiler, runners and every generated file -------------
  function firstFile(prefix) { return data.files.find((f) => f.path.startsWith(prefix)); }

  function renderCode(host) {
    const contracts = data.contracts.map((c) => ({ path: c.path, language: 'yaml', code: c.source }));
    const folders = [
      ['contracts (stakeholder YAML)', contracts],
      ['contracts (tooling)', data.files.filter((f) => f.path.startsWith('contracts/') && !f.path.startsWith('contracts/gx/'))],
      ['generated · dbt tests', data.files.filter((f) => f.path.startsWith('tests/contracts/'))],
      ['generated · GX suites', data.files.filter((f) => f.path.startsWith('contracts/gx/'))],
    ];
    const all = folders.flatMap(([, f]) => f);
    openFile = all.find((f) => f.path === openFile?.path) ?? contracts[0];
    const layout = el('div', 'gxc-files');
    const tree = el('nav', 'gxc-tree');
    tree.setAttribute('aria-label', 'Contract files');
    for (const [label, files] of folders) {
      tree.append(el('p', 'gxc-tree-folder', label));
      files.forEach((f) => {
        const b = button(f.path.split('/').pop(), `gxc-tree-file gxc-lang-${f.language}${f.path === openFile.path ? ' is-active' : ''}`, () => { openFile = f; renderCode(host); });
        b.title = f.path;
        tree.append(b);
      });
    }
    const viewer = el('div', 'gxc-code');
    const head = el('div', 'gxc-code-head');
    const gh = el('a', '', 'GitHub ↗');
    gh.href = BASE + openFile.path; gh.target = '_blank'; gh.rel = 'noopener noreferrer';
    head.append(el('span', '', openFile.path), gh);
    const pre = el('pre');
    pre.innerHTML = hlLines(openFile.code.replace(/\n$/, ''), openFile.language === 'markdown' ? 'md' : openFile.language)
      .map((l, i) => `<span class="code-line"><span class="code-ln">${i + 1}</span>${l}</span>`).join('');
    viewer.append(head, pre);
    layout.append(tree, viewer);
    const intro = el('p', 'gxc-note', 'Stakeholders edit only the YAML. contracts/compile.py writes every file under "generated", and CI fails if they drift from the contracts.');
    host.replaceChildren(crumbs('Code'), el('h1', 'gxc-section-title', 'Contracts, compiler and generated tests'), intro, layout);
  }
})();
