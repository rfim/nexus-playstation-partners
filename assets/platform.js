// Platform cost and lineage, rendered from assets/platform.json (exported from the dbt build).
(() => {
  const $ = (selector) => document.querySelector(selector);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const usd = (v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const num = (v, digits = 2) => Number(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  // Embedded in the SQL workspace (sql.html) as its lineage tab.
  const params = new URLSearchParams(location.search);
  const EMBED = window.parent !== window && params.get('view') === 'lineage' ? 'lineage' : null;
  if (EMBED) document.documentElement.classList.add('pf-embed', `pf-embed-${EMBED}`);
  const toWorkspace = (message) => window.parent.postMessage({ source: 'nexus-platform', ...message }, location.origin);
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.data?.source !== 'nexus-sql') return;
    if (event.data.type === 'lineage-select') document.dispatchEvent(new CustomEvent('lineage:select', { detail: event.data.id }));
  });

  const dayLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  // Categorical slots in fixed order; colour follows the entity, never its rank.
  const WAREHOUSES = [
    ['NEXUS_LOAD_WH', '#2a78d6'],
    ['NEXUS_DBT_WH', '#eb6834'],
    ['NEXUS_BI_WH', '#1baf7a'],
    ['NEXUS_CI_WH', '#eda100'],
  ];
  const WH_COLOR = Object.fromEntries(WAREHOUSES);
  const LAYERS = [
    ['source', 'Source', '#2a78d6'],
    ['seed', 'Seed', '#eb6834'],
    ['staging', 'Staging', '#1baf7a'],
    ['snapshot', 'Snapshot', '#eda100'],
    ['intermediate', 'Intermediate', '#e87ba4'],
    ['platform', 'Platform cost', '#008300'],
    ['marts', 'Marts', '#6250d6'],
    ['exposure', 'Dashboard', '#e34948'],
  ];
  const LAYER = Object.fromEntries(LAYERS.map(([key, label, color]) => [key, { label, color }]));
  const COST_RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'];
  const STATUS = {
    ok: { icon: '✓', label: 'Within budget', cls: 'good' },
    notify: { icon: '!', label: 'Notify: over 75%', cls: 'warning' },
    forecast_over: { icon: '▲', label: 'Forecast over budget', cls: 'serious' },
    suspended: { icon: '■', label: 'Suspended', cls: 'critical' },
  };

  let data = null;
  let snippets = null;

  fetch('assets/platform.json')
    .then((r) => r.json())
    .then((json) => {
      data = json;
      renderStats();
      renderBudget();
      renderDaily();
      renderUsers();
      renderModels();
      renderLineage();
    })
    .catch(() => { $('#pf-stats').textContent = 'Platform data could not be loaded.'; });

  setupCodeDialog();

  function renderStats() {
    const { summary, as_of_date: asOf, days_elapsed: elapsed, days_in_month: days, credit_price_usd: price } = data.cost;
    const budgetUsedPct = (100 * summary.credits_mtd) / summary.budget_credits;
    const items = [
      ['SPENT THIS MONTH', usd(summary.cost_usd_mtd), `${num(summary.credits_mtd)} credits`],
      ['FORECAST AT MONTH END', usd(summary.forecast_usd), `against a ${usd(summary.budget_usd)} budget`],
      ['BUDGET USED', `${num(budgetUsedPct, 0)}%`, `${elapsed} of ${days} days elapsed`],
      ['DBT BUILD COST', usd(summary.dbt_cost_usd_mtd), 'allocated across every model'],
      ['ANOMALIES', String(summary.anomalies), 'days above 2× the trailing week'],
    ];
    $('#pf-stats').replaceChildren(...items.map(([label, value, note]) => {
      const card = el('div');
      card.append(el('span', '', label), el('strong', '', value), el('small', '', note));
      return card;
    }));
    $('#pf-clock').textContent = `Month to date at ${dayLabel(asOf)} 2026, priced at an illustrative ${usd(price)} per credit. All values are synthetic.`;
  }

  function renderBudget() {
    const wrap = $('#pf-budget');
    const order = WAREHOUSES.map(([name]) => name);
    const rows = [...data.cost.budget].sort((a, b) => order.indexOf(a.warehouse_name) - order.indexOf(b.warehouse_name));
    const scaleMax = Math.max(125, ...rows.map((r) => r.forecast_pct_of_budget + 5));
    const pos = (pct) => `${Math.min(100, (100 * pct) / scaleMax)}%`;
    wrap.replaceChildren(...rows.map((r) => {
      const status = STATUS[r.budget_status];
      const card = el('article', 'pf-budget-card');
      const head = el('div', 'pf-budget-head');
      const title = el('div');
      const swatch = el('i', 'pf-swatch');
      swatch.style.background = WH_COLOR[r.warehouse_name];
      const name = el('h3');
      name.append(swatch, document.createTextNode(r.warehouse_name));
      title.append(name, el('small', '', `${r.workload} · ${r.resource_monitor}`));
      const badge = el('span', `pf-status pf-status-${status.cls}`);
      badge.append(el('b', '', status.icon), document.createTextNode(status.label));
      head.append(title, badge);

      const track = el('div', 'pf-track');
      track.setAttribute('role', 'img');
      track.setAttribute('aria-label', `${r.pct_of_budget_used}% of budget used, forecast ${r.forecast_pct_of_budget}%`);
      const fill = el('span', 'pf-fill');
      fill.style.width = pos(r.pct_of_budget_used);
      fill.style.background = WH_COLOR[r.warehouse_name];
      const forecast = el('span', 'pf-forecast');
      forecast.style.left = pos(r.forecast_pct_of_budget);
      forecast.title = `Forecast ${r.forecast_pct_of_budget}%`;
      track.append(fill, forecast);
      for (const [pct, label] of [[75, '75%'], [100, '100%']]) {
        const tick = el('span', 'pf-tick');
        tick.style.left = pos(pct);
        tick.dataset.label = label;
        track.append(tick);
      }
      const figures = el('div', 'pf-budget-figures');
      figures.append(
        el('span', '', `${num(r.credits_used_mtd)} of ${r.credit_quota} credits · ${usd(r.cost_usd_mtd)}`),
        el('strong', '', `${num(r.pct_of_budget_used, 1)}%`),
      );
      const forecastLine = el('p', 'pf-budget-forecast', `Forecast ${num(r.forecast_credits_month_end)} credits (${num(r.forecast_pct_of_budget, 1)}%) by month end`);
      card.append(head, figures, track, forecastLine);
      return card;
    }));
  }

  function renderDaily() {
    const rows = data.cost.daily;
    const dates = [...new Set(rows.map((r) => r.usage_date))];
    const byDate = dates.map((date) => {
      const entry = { date };
      for (const [name] of WAREHOUSES) {
        const row = rows.find((r) => r.usage_date === date && r.warehouse_name === name);
        entry[name] = row ? row.credits_used : 0;
        if (row?.is_anomaly) entry.anomaly = { name, ratio: row.credits_used / row.trailing_7d_avg_credits };
      }
      entry.total = WAREHOUSES.reduce((s, [name]) => s + entry[name], 0);
      return entry;
    });

    const legend = $('#pf-daily-legend');
    legend.replaceChildren(...WAREHOUSES.map(([name, color]) => {
      const item = el('span');
      const sw = el('i', 'pf-swatch');
      sw.style.background = color;
      item.append(sw, document.createTextNode(name.replace('NEXUS_', '').replace('_WH', '')));
      return item;
    }));

    const container = $('#pf-daily-chart');
    const draw = () => {
      container.replaceChildren();
      const width = container.clientWidth || 800;
      const height = 280;
      const m = { top: 28, right: 12, bottom: 28, left: 40 };
      const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%').attr('height', height);
      const x = d3.scaleBand().domain(dates).range([m.left, width - m.right]).paddingInner(0.22);
      const y = d3.scaleLinear().domain([0, d3.max(byDate, (d) => d.total) * 1.12]).nice().range([height - m.bottom, m.top]);
      svg.append('g').attr('class', 'pf-grid').selectAll('line').data(y.ticks(4)).join('line')
        .attr('x1', m.left).attr('x2', width - m.right).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
      svg.append('g').attr('class', 'pf-axis').attr('transform', `translate(${m.left - 6},0)`).selectAll('text').data(y.ticks(4)).join('text')
        .attr('y', (d) => y(d)).attr('dy', '0.32em').attr('text-anchor', 'end').text((d) => d);
      const tickEvery = width < 520 ? 7 : 3;
      svg.append('g').attr('class', 'pf-axis').selectAll('text').data(dates.filter((_, i) => i % tickEvery === 0)).join('text')
        .attr('x', (d) => x(d) + x.bandwidth() / 2).attr('y', height - 8).attr('text-anchor', 'middle').text((d) => dayLabel(d));
      const stack = d3.stack().keys(WAREHOUSES.map(([n]) => n))(byDate);
      svg.append('g').selectAll('g').data(stack).join('g').attr('fill', (s) => WH_COLOR[s.key])
        .selectAll('rect').data((s) => s).join('rect')
        .attr('x', (d) => x(d.data.date)).attr('width', x.bandwidth())
        .attr('y', (d) => y(d[1])).attr('height', (d) => Math.max(0, y(d[0]) - y(d[1]) - 1))
        .attr('class', 'pf-seg');
      const anomaly = byDate.find((d) => d.anomaly);
      if (anomaly) {
        const ax = x(anomaly.date) + x.bandwidth() / 2;
        svg.append('text').attr('class', 'pf-annot').attr('x', ax).attr('y', y(anomaly.total) - 8).attr('text-anchor', ax > width - 140 ? 'end' : 'middle')
          .text(`${anomaly.anomaly.name.replace('NEXUS_', '')} ${num(anomaly.anomaly.ratio, 1)}× its week`);
      }
      // Hover: one hit target per day, wider than the bar.
      const tip = d3.select(container).append('div').attr('class', 'pf-tip').style('opacity', 0);
      svg.append('g').selectAll('rect').data(byDate).join('rect')
        .attr('x', (d) => x(d.date) - (x.step() - x.bandwidth()) / 2).attr('width', x.step())
        .attr('y', m.top).attr('height', height - m.top - m.bottom).attr('fill', 'transparent')
        .on('mousemove', (event, d) => {
          const lines = WAREHOUSES.map(([n, c]) => `<span><i style="background:${c}"></i>${n.replace('NEXUS_', '')}<b>${num(d[n], 3)}</b></span>`).join('');
          tip.html(`<strong>${dayLabel(d.date)}</strong>${lines}<em>${num(d.total, 3)} credits · ${usd(d.total * data.cost.credit_price_usd)}</em>`)
            .style('opacity', 1);
          const [px] = d3.pointer(event, container);
          tip.style('left', `${Math.min(px + 14, container.clientWidth - 190)}px`).style('top', '20px');
        })
        .on('mouseleave', () => tip.style('opacity', 0));
    };
    draw();
    let timer;
    window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(draw, 150); });

    const anomaly = byDate.find((d) => d.anomaly);
    $('#pf-daily-note').textContent = anomaly
      ? `On ${dayLabel(anomaly.date)} the dbt warehouse burned ${num(anomaly.anomaly.ratio, 1)} times its trailing seven-day average: a full-refresh backfill after a contract change. mart_cost_daily flags any warehouse-day above 2×. BI spend grows through the month as dashboard use rises, which is what pushes its forecast over budget.`
      : 'No anomalous days this month.';

    const table = el('table', 'pf-table');
    table.innerHTML = `<thead><tr><th scope="col">Date</th>${WAREHOUSES.map(([n]) => `<th scope="col" class="num">${n.replace('NEXUS_', '')}</th>`).join('')}<th scope="col" class="num">Total</th></tr></thead>`;
    const body = el('tbody');
    for (const d of byDate) {
      const tr = el('tr');
      tr.innerHTML = `<th scope="row">${dayLabel(d.date)}${d.anomaly ? ' <span class="pf-flag">anomaly</span>' : ''}</th>${WAREHOUSES.map(([n]) => `<td class="num">${num(d[n], 3)}</td>`).join('')}<td class="num">${num(d.total, 3)}</td>`;
      body.append(tr);
    }
    table.append(body);
    $('#pf-daily-table').replaceChildren(table);
  }

  function renderUsers() {
    const table = el('table', 'pf-table');
    table.innerHTML = '<thead><tr><th scope="col">User · role</th><th scope="col">Warehouse</th><th scope="col" class="num">Queries</th><th scope="col" class="num">Credits</th><th scope="col" class="num">Cost</th></tr></thead>';
    const body = el('tbody');
    for (const r of data.cost.by_user) {
      const tr = el('tr');
      const who = el('th');
      who.scope = 'row';
      who.append(el('strong', '', r.user_name), el('small', '', r.role_name));
      const wh = el('td', 'pf-wh');
      const sw = el('i', 'pf-swatch');
      sw.style.background = WH_COLOR[r.warehouse_name];
      wh.append(sw, document.createTextNode(r.warehouse_name.replace('NEXUS_', '')));
      tr.append(who, wh, el('td', 'num', r.query_count.toLocaleString('en-US')), el('td', 'num', num(r.credits_attributed, 3)), el('td', 'num', usd(r.cost_usd)));
      body.append(tr);
    }
    table.append(body);
    $('#pf-users').replaceChildren(table);
  }

  function renderModels() {
    const list = $('#pf-models');
    const rows = data.cost.by_model.slice(0, 10);
    const max = rows[0]?.cost_usd_mtd || 1;
    list.replaceChildren(...rows.map((r) => {
      const li = el('li');
      const button = el('button', 'pf-model');
      button.type = 'button';
      button.title = `${r.runs} runs · average ${num(r.avg_execution_seconds, 1)}s · slowest ${num(r.max_execution_seconds, 1)}s`;
      const label = el('span', 'pf-model-name');
      label.innerHTML = r.model_name.replace(/_/g, '_<wbr>');
      const bar = el('span', 'pf-model-bar');
      bar.style.setProperty('--w', `${(100 * r.cost_usd_mtd) / max}%`);
      button.append(label, bar, el('span', 'pf-model-value', `${usd(r.cost_usd_mtd)} · ${num(r.pct_of_dbt_cost, 1)}%`));
      button.addEventListener('click', () => {
        const node = data.lineage.nodes.find((n) => n.name === r.model_name);
        if (node) {
          document.dispatchEvent(new CustomEvent('lineage:select', { detail: node.id }));
          $('#lineage').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      li.append(button);
      return li;
    }));
    const rest = data.cost.by_model.length - rows.length;
    if (rest > 0) list.append(el('li', 'pf-models-more', `+ ${rest} smaller models in mart_cost_by_model`));
  }

  function renderLineage() {
    const { nodes, edges } = data.lineage;
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const parents = {};
    const children = {};
    for (const n of nodes) { parents[n.id] = []; children[n.id] = []; }
    for (const e of edges) { parents[e.to].push(e.from); children[e.from].push(e.to); }
    const walk = (start, next) => {
      const seen = new Set();
      const stack = [...next[start]];
      while (stack.length) {
        const id = stack.pop();
        if (!seen.has(id)) { seen.add(id); stack.push(...next[id]); }
      }
      return seen;
    };

    const layerOrder = LAYERS.map(([key]) => key);
    const columns = d3.groups(nodes, (n) => n.depth).sort((a, b) => a[0] - b[0]);
    for (const [, col] of columns) col.sort((a, b) => layerOrder.indexOf(a.layer) - layerOrder.indexOf(b.layer) || a.name.localeCompare(b.name));
    const nodeW = 186;
    const nodeH = 26;
    const colGap = 34;
    const rowGap = 8;
    const pad = 16;
    const tallest = d3.max(columns, ([, col]) => col.length);
    const width = pad * 2 + columns.length * nodeW + (columns.length - 1) * colGap;
    const height = pad * 2 + 22 + tallest * (nodeH + rowGap);
    const position = {};
    columns.forEach(([depth, col], ci) => {
      const offset = ((tallest - col.length) * (nodeH + rowGap)) / 2;
      col.forEach((n, ri) => {
        position[n.id] = { x: pad + ci * (nodeW + colGap), y: pad + 22 + offset + ri * (nodeH + rowGap), depth };
      });
    });

    const costs = nodes.map((n) => n.cost_usd_mtd).filter((v) => v != null);
    const costScale = d3.scaleQuantize().domain([0, d3.max(costs)]).range(COST_RAMP);
    let colorMode = 'layer';
    let selected = null;

    const svg = d3.select('#pf-graph').append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%').style('min-width', '960px');
    svg.append('g').attr('class', 'pf-col-labels').selectAll('text').data(columns).join('text')
      .attr('x', (_, i) => pad + i * (nodeW + colGap)).attr('y', pad + 8).text(([depth]) => (depth === 0 ? 'INPUTS' : `HOP ${depth}`));
    const link = svg.append('g').attr('class', 'pf-links').selectAll('path').data(edges).join('path')
      .attr('d', (e) => {
        const a = position[e.from];
        const b = position[e.to];
        const x1 = a.x + nodeW;
        const y1 = a.y + nodeH / 2;
        const x2 = b.x;
        const y2 = b.y + nodeH / 2;
        const mid = (x1 + x2) / 2;
        return `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
      });
    const node = svg.append('g').selectAll('g').data(nodes).join('g')
      .attr('class', 'pf-gnode').attr('transform', (n) => `translate(${position[n.id].x},${position[n.id].y})`)
      .attr('tabindex', 0).attr('role', 'button').attr('aria-label', (n) => `${n.name}, ${LAYER[n.layer]?.label ?? n.layer}`)
      .on('click', (_, n) => select(n.id))
      .on('keydown', (event, n) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(n.id); } });
    node.append('rect').attr('class', 'pf-gbox').attr('width', nodeW).attr('height', nodeH).attr('rx', 5);
    node.append('rect').attr('class', 'pf-gstripe').attr('width', 6).attr('height', nodeH).attr('rx', 3);
    node.append('text').attr('x', 13).attr('y', nodeH / 2).attr('dy', '0.34em')
      .text((n) => (n.name.length > 27 ? `${n.name.slice(0, 26)}…` : n.name));
    node.append('title').text((n) => n.name);

    const paint = () => {
      node.select('.pf-gstripe').attr('fill', (n) => (colorMode === 'layer' ? LAYER[n.layer]?.color : n.cost_usd_mtd != null ? costScale(n.cost_usd_mtd) : '#d5dde8'));
      node.select('.pf-gbox').attr('fill', (n) => (colorMode === 'cost' && n.cost_usd_mtd != null ? `${costScale(n.cost_usd_mtd)}55` : '#fff'));
      renderGraphLegend();
    };

    function renderGraphLegend() {
      const wrap = $('#pf-graph-legend');
      if (colorMode === 'layer') {
        wrap.replaceChildren(...LAYERS.map(([, label, color]) => {
          const item = el('span');
          const sw = el('i', 'pf-swatch');
          sw.style.background = color;
          item.append(sw, document.createTextNode(label));
          return item;
        }));
      } else {
        const [lo, hi] = costScale.domain();
        const ramp = el('span', 'pf-ramp');
        COST_RAMP.forEach((c) => { const i = el('i'); i.style.background = c; ramp.append(i); });
        const none = el('span');
        const sw = el('i', 'pf-swatch');
        sw.style.background = '#d5dde8';
        none.append(sw, document.createTextNode('No build cost (inputs, views over seeds, dashboards)'));
        wrap.replaceChildren(el('span', '', `Build cost this month ${usd(lo)}`), ramp, el('span', '', usd(hi)), none);
      }
    }

    function select(id) {
      selected = id;
      const up = id ? walk(id, parents) : new Set();
      const down = id ? walk(id, children) : new Set();
      node.classed('is-selected', (n) => n.id === id)
        .classed('is-up', (n) => up.has(n.id))
        .classed('is-down', (n) => down.has(n.id))
        .classed('is-dim', (n) => id && n.id !== id && !up.has(n.id) && !down.has(n.id));
      link.classed('is-up', (e) => id && (up.has(e.from) || e.from === id) && (up.has(e.to) || e.to === id) && !down.has(e.from))
        .classed('is-down', (e) => id && (down.has(e.to)) && (down.has(e.from) || e.from === id))
        .classed('is-dim', (e) => id && !((up.has(e.from) || e.from === id) && (up.has(e.to) || e.to === id)) && !(down.has(e.to) && (down.has(e.from) || e.from === id)));
      $('#pf-node-select').value = id || '';
      renderNode(id, up, down);
      if (id) {
        const p = position[id];
        const box = $('#pf-graph');
        const scale = box.querySelector('svg').getBoundingClientRect().width / width;
        if (box.scrollWidth > box.clientWidth) box.scrollTo({ left: Math.max(0, (p.x + nodeW / 2) * scale - box.clientWidth / 2), behavior: 'smooth' });
      }
    }

    function renderNode(id, up, down) {
      const panel = $('#pf-node');
      if (!id) {
        panel.replaceChildren(el('span', 'pf-eyebrow', 'IMPACT ANALYSIS'), el('h3', '', 'Select a node'), el('p', 'pf-note', 'Pick any source, model or dashboard to see what it reads, what reads it, and what a change would put at risk. Try partner_platform.raw_submissions.'));
        return;
      }
      const n = byId[id];
      const downModels = [...down].filter((d) => byId[d].type === 'model');
      const downDash = [...down].filter((d) => byId[d].type === 'exposure').map((d) => byId[d].name);
      const layerLabel = (LAYER[n.layer]?.label ?? n.layer).toUpperCase();
      const head = el('span', 'pf-eyebrow', n.type === n.layer ? layerLabel : `${layerLabel} · ${n.type.toUpperCase()}`);
      const facts = el('dl', 'pf-facts');
      const add = (k, v) => { if (v !== null && v !== undefined && v !== '') facts.append(el('dt', '', k), el('dd', '', v)); };
      add('Owner', n.owner);
      add('Access', n.access);
      add('Materialized', n.materialized);
      add('Classification', n.classification?.replace('_', ' '));
      add('Contract', n.type === 'model' ? (n.contract_enforced ? 'Enforced' : 'None') : null);
      add('Build cost', n.cost_usd_mtd != null ? `${usd(n.cost_usd_mtd)} this month` : null);
      add('Reads', `${up.size} upstream node${up.size === 1 ? '' : 's'}`);
      add('Breaks if changed', `${downModels.length} model${downModels.length === 1 ? '' : 's'}, ${downDash.length} dashboard${downDash.length === 1 ? '' : 's'}`);
      const parts = [head, el('h3', '', n.name)];
      if (n.description) parts.push(el('p', 'pf-note', n.description));
      parts.push(facts);
      if (downDash.length) {
        const risk = el('p', 'pf-risk');
        risk.append(el('b', '', '!'), document.createTextNode(`Feeds ${downDash.join(', ')}`));
        parts.push(risk);
      }
      if (EMBED) {
        const actions = el('div', 'pf-sql-actions');
        const table = n.type === 'source' ? n.name.split('.').pop() : n.name;
        if (n.type !== 'exposure') {
          const preview = el('button', 'pf-sql-button', 'Preview in a SQL tab');
          preview.type = 'button';
          preview.addEventListener('click', () => toWorkspace({ type: 'open-sql', title: table, kind: 'table', sql: `select *\nfrom ${table}\nlimit 50;` }));
          actions.append(preview);
        }
        const impact = el('button', 'pf-sql-button', 'Impact query in a SQL tab');
        impact.type = 'button';
        impact.addEventListener('click', () => toWorkspace({
          type: 'open-sql',
          title: `Impact: ${table}`,
          kind: 'example',
          sql: `-- Everything downstream of ${n.name}, walking the dbt lineage graph.
with recursive downstream(node_id, hops) as (
  select node_id, 0 from lineage_nodes where name = '${n.name}'
  union
  select e.to_node, d.hops + 1
  from downstream d join lineage_edges e on e.from_node = d.node_id
)
select n.name, n.type, n.layer, n.owning_group, n.cost_usd_mtd, min(d.hops) as hops
from downstream d join lineage_nodes n using (node_id)
where d.hops > 0
group by all
order by hops, n.name;`,
        }));
        actions.append(impact);
        parts.push(actions);
      }
      const a = el('a', 'pf-link', 'Open source ↗');
      a.href = n.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      parts.push(a);
      panel.replaceChildren(...parts);
    }

    const selectBox = $('#pf-node-select');
    selectBox.append(new Option('Choose a node…', ''));
    for (const [key, label] of LAYERS) {
      const group = document.createElement('optgroup');
      group.label = label;
      nodes.filter((n) => n.layer === key).sort((a, b) => a.name.localeCompare(b.name)).forEach((n) => group.append(new Option(n.name, n.id)));
      if (group.children.length) selectBox.append(group);
    }
    selectBox.addEventListener('change', () => select(selectBox.value || null));
    $('#pf-clear').addEventListener('click', () => select(null));
    document.querySelectorAll('.pf-toggle button').forEach((button) => button.addEventListener('click', () => {
      colorMode = button.dataset.color;
      document.querySelectorAll('.pf-toggle button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      paint();
    }));
    document.addEventListener('lineage:select', (event) => select(event.detail));
    paint();
    select(null);
  }

  function setupCodeDialog() {
    const dialog = $('#code-dialog');
    document.querySelectorAll('[data-snippet]').forEach((button) => {
      button.addEventListener('click', async () => {
        snippets ??= await fetch('assets/snippets.json').then((r) => r.json());
        const s = snippets[button.dataset.snippet];
        if (!s) return;
        $('#dialog-title').textContent = s.title;
        $('#dialog-description').textContent = s.description;
        $('#dialog-file').textContent = s.filename;
        $('#dialog-language').textContent = s.language.toUpperCase();
        $('#dialog-code').textContent = s.code;
        $('#dialog-link').href = s.link;
        dialog.showModal();
      });
    });
    $('#dialog-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  }
})();
