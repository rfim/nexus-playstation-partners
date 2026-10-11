// Governance catalog rendered from assets/governance.json (exported from the dbt manifest).
(() => {
  const root = document.querySelector('#governance');
  if (!root) return;

  const CLASSES = {
    public: { label: 'Public', note: 'Safe to publish; invented teaching data.' },
    internal: { label: 'Internal', note: 'Platform logic and cross-partner aggregates.' },
    partner_confidential: { label: 'Partner confidential', note: 'Partner-level outcomes; shared with that partner only.' },
  };
  const FILTERS = {
    all: () => true,
    public: (m) => m.access === 'public',
    protected: (m) => m.access === 'protected',
    contract: (m) => m.contract_enforced,
    exposed: (m) => m.exposures.length > 0,
  };
  let models = [];
  let filter = 'all';
  let selected = null;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const badge = (kind, value, label = value) => el('span', `gov-badge gov-${kind}-${value}`, label);

  fetch('assets/governance.json')
    .then((response) => response.json())
    .then((data) => {
      models = data.models;
      renderStats(data.summary);
      renderGroups(data.groups);
      renderClasses(data.models);
      selected = models.find((m) => m.name === 'mart_partner_publishing') ?? models[0];
      renderRows();
      renderDetail();
    })
    .catch(() => {
      root.querySelector('#gov-rows').innerHTML = '<tr><td colspan="6">Governance data could not be loaded.</td></tr>';
    });

  root.querySelector('#gov-filters').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-filter]');
    if (!button) return;
    filter = button.dataset.filter;
    root.querySelectorAll('#gov-filters button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    renderRows();
  });

  function renderStats(summary) {
    const items = [
      ['MODELS', summary.models, 'each with an owning group'],
      ['PUBLIC', summary.public_models, 'consumer-facing interface'],
      ['CONTRACTS', summary.contracts_enforced, 'enforced at build time'],
      ['DATA TESTS', summary.data_tests, 'run on every build'],
      ['EXPOSURES', summary.exposures, 'dashboards with owners'],
      ['GROUPS', summary.groups, 'accountable owners'],
    ];
    const wrap = root.querySelector('#gov-stats');
    wrap.replaceChildren(...items.map(([label, value, note]) => {
      const card = el('div');
      card.append(el('span', '', label), el('strong', '', String(value)), el('small', '', note));
      return card;
    }));
  }

  function renderGroups(groups) {
    const wrap = root.querySelector('#gov-groups');
    wrap.replaceChildren(...groups.map((group) => {
      const card = el('article', 'gov-group');
      card.append(
        el('span', 'panel-eyebrow', `GROUP · ${group.models} MODELS`),
        el('h3', '', group.name),
        el('p', '', group.responsibility),
        el('small', '', `${group.owner} · ${group.email}`),
      );
      return card;
    }));
  }

  function renderClasses(list) {
    const counts = {};
    for (const model of list) {
      for (const column of model.columns) counts[column.classification] = (counts[column.classification] ?? 0) + 1;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    const wrap = root.querySelector('#gov-classes');
    wrap.replaceChildren(...Object.entries(CLASSES).map(([key, info]) => {
      const row = el('div', 'gov-class-row');
      const bar = el('i', `gov-bar gov-class-${key}`);
      bar.style.setProperty('--share', `${Math.round((100 * (counts[key] ?? 0)) / total)}%`);
      const text = el('div');
      text.append(el('strong', '', info.label), el('small', '', info.note));
      row.append(text, el('span', 'gov-count', `${counts[key] ?? 0} columns`), bar);
      return row;
    }));
  }

  function renderRows() {
    const body = root.querySelector('#gov-rows');
    const visible = models.filter(FILTERS[filter]);
    body.replaceChildren(...visible.map((model) => {
      const row = el('tr');
      row.tabIndex = 0;
      row.setAttribute('aria-selected', String(model === selected));
      const name = el('th');
      name.scope = 'row';
      const strong = el('strong');
      // dbt names are identifiers; let long ones wrap at underscores rather than mid-word.
      strong.innerHTML = model.name.replace(/_/g, '_<wbr>');
      name.append(strong, el('small', '', `${model.layer} · ${model.materialized}`));
      const contract = el('td');
      contract.append(model.contract_enforced ? badge('contract', 'yes', 'Enforced') : el('span', 'gov-muted', '—'));
      const access = el('td');
      access.append(badge('access', model.access));
      const cls = el('td');
      cls.append(badge('class', model.classification, CLASSES[model.classification]?.label ?? model.classification));
      row.append(name, el('td', 'gov-owner', model.group), access, contract, cls, el('td', 'num', String(model.tests)));
      const choose = () => { selected = model; renderRows(); renderDetail(); };
      row.addEventListener('click', choose);
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); }
      });
      return row;
    }));
    if (!visible.length) body.innerHTML = '<tr><td colspan="6">No models match this filter.</td></tr>';
  }

  function renderDetail() {
    const panel = root.querySelector('#gov-detail');
    if (!selected) return panel.replaceChildren();
    const m = selected;
    const head = el('div', 'gov-detail-head');
    head.append(el('span', 'panel-eyebrow', `${m.layer.toUpperCase()} · ${m.owner}`), el('h3', '', m.name));
    const badges = el('div', 'gov-badges');
    badges.append(
      badge('access', m.access),
      m.contract_enforced ? badge('contract', 'yes', 'Contract enforced') : badge('contract', 'no', 'No contract'),
      badge('class', m.classification, CLASSES[m.classification]?.label ?? m.classification),
    );
    const lineage = el('dl', 'gov-lineage');
    const addLine = (label, values) => {
      lineage.append(el('dt', '', label), el('dd', '', values.length ? values.join(', ') : '—'));
    };
    addLine('Reads', [...m.sources.map((s) => `source ${s}`), ...m.upstream]);
    addLine('Feeds dashboards', m.exposures);
    const table = el('table', 'gov-columns');
    table.innerHTML = '<caption class="visually-hidden">Columns</caption><thead><tr><th scope="col">Column</th><th scope="col">Type</th><th scope="col">Class</th><th scope="col">Enforced</th></tr></thead>';
    const body = el('tbody');
    for (const column of m.columns) {
      const row = el('tr');
      const name = el('th', '', column.name);
      name.scope = 'row';
      if (column.description) name.title = column.description;
      const cls = el('td');
      cls.append(badge('class', column.classification, CLASSES[column.classification]?.label ?? column.classification));
      const checks = [...column.constraints.map((c) => c.replace('_', ' ')), ...column.tests.map((t) => `test: ${t.replace('_', ' ')}`)];
      row.append(name, el('td', 'gov-type', column.data_type), cls, el('td', 'gov-checks', checks.join(' · ') || '—'));
      body.append(row);
    }
    table.append(body);
    const link = el('a', 'gov-link', 'Open model source ↗');
    link.href = m.source_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    panel.replaceChildren(head, el('p', 'gov-desc', m.description || 'No description yet.'), badges, lineage, el('div', 'gov-columns-wrap'), link);
    panel.querySelector('.gov-columns-wrap').append(table);
  }
})();
