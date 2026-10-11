// dbt project browser: every file from assets/code.json, with each model's build cost
// from assets/platform.json (both exported from the dbt build).
(() => {
  const $ = (selector) => document.querySelector(selector);
  const embedded = window.parent !== window;
  const toWorkspace = (message) => window.parent.postMessage({ source: 'nexus-platform', ...message }, location.origin);
  let base = '';
  let current = null;
  let cost = null;
  let models = {};
  let lineage = null;
  const usd = (v) => `$${Number(v).toFixed(2)}`;

  Promise.all([
    fetch('assets/code.json').then((r) => r.json()),
    fetch('assets/platform.json').then((r) => r.json()).catch(() => null),
    fetch('assets/governance.json').then((r) => r.json()).catch(() => null),
  ])
    .then(([data, platform, governance]) => {
      base = data.base;
      cost = platform?.cost ?? null;
      lineage = platform?.lineage ?? null;
      models = Object.fromEntries((governance?.models ?? []).map((m) => [m.name, m]));
      renderTree(data.folders);
      const wanted = new URLSearchParams(location.search).get('file');
      const first = data.folders.flatMap((f) => f.files).find((f) => f.path === wanted)
        ?? data.folders.find((f) => f.folder === 'models/marts')?.files[0];
      if (first) show(first);
    })
    .catch(() => { $('#code-files').textContent = 'Source could not be loaded.'; });

  $('#code-filter').addEventListener('input', (event) => {
    const needle = event.target.value.trim().toLowerCase();
    const pinned = document.querySelector('.code-pinned');
    if (pinned) pinned.hidden = Boolean(needle) && !pinned.dataset.search.includes(needle);
    const empty = document.querySelector('.code-empty');
    let total = 0;
    for (const group of document.querySelectorAll('.code-group')) {
      let any = false;
      for (const item of group.querySelectorAll('.code-file')) {
        const hit = !needle || item.dataset.search.includes(needle);
        item.hidden = !hit;
        any ||= hit;
      }
      group.hidden = !any;
      total += group.querySelectorAll('.code-file:not([hidden])').length;
      if (needle) group.open = true;
    }
    if (empty) empty.hidden = total > 0 || (pinned && !pinned.hidden);
  });

  function renderTree(folders) {
    const nav = $('#code-files');
    nav.replaceChildren();
    if (cost) {
      const overview = document.createElement('button');
      overview.type = 'button';
      overview.className = 'code-file code-pinned';
      overview.dataset.path = '#cost';
      overview.dataset.search = 'build cost budget credits warehouse';
      overview.textContent = 'Build cost';
      overview.addEventListener('click', showCost);
      nav.append(overview);
    }
    for (const folder of folders) {
      const group = document.createElement('details');
      group.className = 'code-group';
      group.open = folder.folder.startsWith('models/') || folder.folder === 'macros';
      const summary = document.createElement('summary');
      summary.innerHTML = '<span></span><small></small>';
      summary.querySelector('span').textContent = folder.folder;
      summary.querySelector('small').textContent = folder.files.length;
      group.append(summary);
      for (const file of folder.files) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `code-file code-lang-${file.language}`;
        // File names wrap at underscores rather than mid-word.
        button.innerHTML = file.path.split('/').pop().replace(/[&<>]/g, '').replace(/_/g, '_<wbr>');
        button.title = file.path;
        button.dataset.path = file.path;
        button.dataset.search = `${file.path}\n${file.code}`.toLowerCase();
        button.addEventListener('click', () => show(file));
        group.append(button);
      }
      nav.append(group);
    }
    const empty = document.createElement('p');
    empty.className = 'code-empty';
    empty.hidden = true;
    empty.textContent = 'No file or code matches that filter.';
    nav.append(empty);
  }

  function show(file) {
    current = file;
    $('#code-overview').hidden = true;
    $('.code-body').hidden = false;
    document.querySelectorAll('.code-file').forEach((b) => b.classList.toggle('is-active', b.dataset.path === file.path));
    const parts = file.path.split('/');
    $('#code-folder').textContent = parts.length > 1 ? `${parts.slice(0, -1).join('/')}/` : '';
    $('#code-path').textContent = parts.at(-1);
    // Colour by language (SQL with dbt Jinja, Python, YAML), one line per row with its number.
    const lines = window.NexusHighlight.highlightLines(file.code.replace(/\n$/, ''), file.language);
    $('#code-text').innerHTML = lines.map((line, i) => `<span class="code-line"><span class="code-ln">${i + 1}</span>${line}</span>`).join('');
    const actions = $('#code-actions');
    actions.replaceChildren();
    const model = file.path.match(/^(?:models\/[^/]+|snapshots)\/(\w+)\.sql$/)?.[1];
    renderMeta(model);
    renderCostStrip(model);
    if (model && embedded) {
      actions.append(button('Preview output in a SQL tab', () => toWorkspace({ type: 'open-sql', title: model, kind: 'table', sql: `select *\nfrom ${model}\nlimit 50;` })));
      actions.append(button('Show in lineage', () => toWorkspace({
        type: 'open-view', view: 'lineage',
        id: file.path.startsWith('snapshots/') ? `snapshot.nexus_partner_analytics.${model}` : `model.nexus_partner_analytics.${model}`,
      })));
    }
    const link = document.createElement('a');
    link.href = base + file.path;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'GitHub ↗';
    actions.append(link);
  }

  function renderCostStrip(model) {
    const strip = $('#code-cost');
    const row = model && cost?.by_model.find((r) => r.model_name === model);
    strip.hidden = !row;
    if (!row) return;
    strip.replaceChildren(...[
      ['Build cost this month', usd(row.cost_usd_mtd)],
      ['Share of dbt cost', `${row.pct_of_dbt_cost}%`],
      ['Average run', `${row.avg_execution_seconds}s`],
      ['Slowest run', `${row.max_execution_seconds}s`],
      ['Runs', row.runs],
    ].map(([label, value]) => {
      const item = document.createElement('div');
      item.innerHTML = '<span></span><strong></strong>';
      item.querySelector('span').textContent = label;
      item.querySelector('strong').textContent = value;
      return item;
    }));
  }

  function renderMeta(model) {
    const meta = $('#code-meta');
    const m = model && models[model];
    const node = model && lineage?.nodes.find((n) => n.name === model && (n.type === 'model' || n.type === 'snapshot'));
    meta.hidden = !(m || node);
    if (meta.hidden) return;
    meta.replaceChildren();
    if (m?.description || node?.description) meta.append(text('p', 'meta-desc', m?.description || node.description));
    const chips = document.createElement('div');
    chips.className = 'meta-chips';
    const chip = (label, value, tone = '') => {
      if (value === undefined || value === null || value === '') return;
      const c = document.createElement('span');
      c.className = `meta-chip ${tone}`;
      c.append(text('small', '', label), text('b', '', value));
      chips.append(c);
    };
    chip('layer', m?.layer ?? node?.layer);
    chip('materialized', m?.materialized ?? node?.materialized);
    chip('owner', m?.group ?? node?.group);
    chip('access', m?.access ?? node?.access, `tone-${m?.access ?? node?.access}`);
    if (m) chip('contract', m.contract_enforced ? 'enforced' : 'none', m.contract_enforced ? 'tone-contract' : '');
    chip('class', (m?.classification ?? node?.classification)?.replace('_', ' '), `tone-${m?.classification ?? node?.classification}`);
    if (m) chip('tests', m.tests);
    meta.append(chips);
    if (node && lineage) {
      const byId = Object.fromEntries(lineage.nodes.map((n) => [n.id, n]));
      const ups = lineage.edges.filter((e) => e.to === node.id).map((e) => byId[e.from]);
      const downs = lineage.edges.filter((e) => e.from === node.id).map((e) => byId[e.to]);
      meta.append(linkRow('Reads', ups), linkRow('Used by', downs));
    }
  }

  function linkRow(label, nodes) {
    const row = document.createElement('div');
    row.className = 'meta-links';
    row.append(text('span', 'meta-label', label));
    if (!nodes.length) row.append(text('em', '', 'nothing yet'));
    for (const n of nodes) {
      const file = [...document.querySelectorAll('.code-file')].find((f) => f.dataset.path.endsWith(`/${n.name}.sql`));
      const item = document.createElement(file ? 'button' : 'span');
      item.className = `meta-node meta-${n.type}`;
      item.textContent = n.name;
      if (file) {
        item.type = 'button';
        item.title = `Open ${file.dataset.path}`;
        item.addEventListener('click', () => file.click());
      } else {
        item.title = n.type === 'exposure' ? 'Dashboard (dbt exposure)' : `${n.type}`;
      }
      row.append(item);
    }
    return row;
  }

  function text(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value;
    return node;
  }

  function showCost() {
    current = null;
    $('#code-meta').hidden = true;
    document.querySelectorAll('.code-file').forEach((b) => b.classList.toggle('is-active', b.dataset.path === '#cost'));
    $('#code-folder').textContent = 'platform cost · ';
    $('#code-path').textContent = `month to date at ${cost.as_of_date}`;
    $('#code-cost').hidden = true;
    $('.code-body').hidden = true;
    const actions = $('#code-actions');
    actions.replaceChildren();
    if (embedded) {
      actions.append(button('Query cost by model in a SQL tab', () => toWorkspace({
        type: 'open-sql', title: 'mart_cost_by_model', kind: 'table',
        sql: 'select *\nfrom mart_cost_by_model\norder by cost_usd_mtd desc;',
      })));
    }
    const view = $('#code-overview');
    view.hidden = false;
    const s = cost.summary;
    const max = Math.max(...cost.by_model.map((r) => r.cost_usd_mtd));
    const status = { ok: 'Within budget', notify: 'Over 75%', forecast_over: 'Forecast over budget', suspended: 'Suspended' };
    view.innerHTML = `
      <div class="ov-stats">
        <div><span>Platform spend</span><strong>${usd(s.cost_usd_mtd)}</strong><small>of ${usd(s.budget_usd)} budget</small></div>
        <div><span>Forecast month end</span><strong>${usd(s.forecast_usd)}</strong><small>straight-line run rate</small></div>
        <div><span>dbt build cost</span><strong>${usd(s.dbt_cost_usd_mtd)}</strong><small>split across ${cost.by_model.length} models</small></div>
      </div>
      <h3>Warehouses</h3>
      <table class="ov-table"><thead><tr><th>Warehouse</th><th>Workload</th><th class="num">Used</th><th class="num">Forecast</th><th>Status</th></tr></thead><tbody>
        ${cost.budget.map((w) => `<tr><td>${w.warehouse_name}</td><td>${w.workload}</td><td class="num">${w.pct_of_budget_used}%</td><td class="num">${w.forecast_pct_of_budget}%</td><td><span class="ov-status ov-${w.budget_status}">${status[w.budget_status] ?? w.budget_status}</span></td></tr>`).join('')}
      </tbody></table>
      <h3>Build cost by model</h3>
      <div class="ov-models"></div>
      <p class="ov-note">Invented credits shaped like Snowflake usage views, priced at an illustrative ${usd(cost.credit_price_usd)} per credit. Select a model to open its SQL.</p>`;
    const list = view.querySelector('.ov-models');
    for (const r of cost.by_model) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ov-model';
      b.innerHTML = '<span class="ov-name"></span><span class="ov-bar"></span><span class="ov-value"></span>';
      b.querySelector('.ov-name').innerHTML = r.model_name.replace(/_/g, '_<wbr>');
      b.querySelector('.ov-bar').style.setProperty('--w', `${(100 * r.cost_usd_mtd) / max}%`);
      b.querySelector('.ov-value').textContent = `${usd(r.cost_usd_mtd)} · ${r.pct_of_dbt_cost}%`;
      b.addEventListener('click', () => {
        const target = [...document.querySelectorAll('.code-file')].find((f) => f.dataset.path.endsWith(`/${r.model_name}.sql`));
        target?.click();
      });
      list.append(b);
    }
  }

  function button(label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.data?.source !== 'nexus-sql') return;
    if (event.data.type === 'code-open') {
      const target = document.querySelector(`.code-file[data-path="${CSS.escape(event.data.path)}"]`);
      target?.click();
    }
  });
})();
