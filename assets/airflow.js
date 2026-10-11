// Airflow-style view of the NEXUS DAG. The structure comes from assets/airflow.json
// (exported from the DAG itself); runs replay airflow/recorded_run.json, captured from
// a real `airflow dags test`. Nothing executes in the browser.
(() => {
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const embedded = window.parent !== window;
  const toWorkspace = (m) => window.parent.postMessage({ source: 'nexus-platform', ...m }, location.origin);
  const LABEL = {
    none: 'no status', scheduled: 'scheduled', queued: 'queued', running: 'running', success: 'success',
    up_for_retry: 'up for retry', failed: 'failed', upstream_failed: 'upstream failed',
  };
  const fmtDur = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${s.toFixed(1)}s`);

  let dag = null;
  let byId = {};
  let order = [];
  let source = '';
  let runs = [];
  let tab = 'grid';
  let selection = { run: 0, task: 'test_gate' };
  let panelTab = 'details';
  let timers = [];
  let active = null;

  Promise.all([
    fetch('assets/airflow.json').then((r) => r.json()),
    fetch('assets/code.json').then((r) => r.json()).catch(() => null),
  ]).then(([data, code]) => {
    dag = data;
    byId = Object.fromEntries(dag.tasks.map((t) => [t.task_id, t]));
    order = topoOrder();
    source = code?.folders.flatMap((f) => f.files).find((f) => f.path === dag.source)?.code ?? '';
    runs = [recordedRun()];
    selection = { run: 0, task: new URLSearchParams(location.search).get('task') || 'test_gate' };
    renderHeader();
    render();
    inbox.splice(0).forEach(handle);
  });

  // ---- Messages from the workspace ------------------------------------------
  const inbox = [];
  const handle = (data) => {
    if (data.type === 'airflow-select' && byId[data.task]) { selection.task = data.task; setTab('grid'); }
    if (data.type === 'airflow-trigger') trigger();
  };
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.data?.source !== 'nexus-sql') return;
    if (dag) handle(event.data); else inbox.push(event.data);
  });

  document.querySelectorAll('.afu-tabs [data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('#afu-trigger').addEventListener('click', () => (active ? stop() : trigger()));

  function setTab(name) {
    tab = name;
    document.querySelectorAll('.afu-tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    render();
  }

  // ---- Data -----------------------------------------------------------------
  function topoOrder() {
    const depth = {};
    const visit = (id) => depth[id] ?? (depth[id] = Math.max(-1, ...byId[id].upstream.map(visit)) + 1);
    dag.tasks.forEach((t) => visit(t.task_id));
    return [...dag.tasks].sort((a, b) => depth[a.task_id] - depth[b.task_id] || a.task_id.localeCompare(b.task_id)).map((t) => t.task_id);
  }

  function recordedRun() {
    const rec = dag.recorded_run;
    const tasks = {};
    for (const t of rec.tasks) {
      tasks[t.task_id] = { state: t.state, tries: 1, start: t.offset_s, duration: t.duration_s, log: t.log.map((l) => `[recorded] ${l}`) };
    }
    const end = Math.max(...rec.tasks.map((t) => t.offset_s + t.duration_s));
    return { run_id: 'manual__2026-10-11T16:03:47', type: 'recorded', state: rec.state, duration: end, started: rec.recorded_at, tasks };
  }

  // ---- Header -----------------------------------------------------------------
  function renderHeader() {
    $('#afu-dag').textContent = dag.dag_id;
    $('#afu-dag-crumb').textContent = dag.dag_id;
    $('#afu-tags').replaceChildren(...dag.tags.map((t) => el('span', 'afu-tag', t)));
    const next = new Date();
    next.setUTCHours(6, 0, 0, 0);
    if (next <= new Date()) next.setUTCDate(next.getUTCDate() + 1);
    const facts = [
      ['Schedule', `${dag.schedule}  (daily 06:00 UTC)`],
      ['Next run', next.toISOString().slice(0, 16).replace('T', ' ')],
      ['Owner', dag.owner],
      ['Latest run', ''],
      ['Tasks', String(dag.tasks.length)],
    ];
    $('#afu-facts').replaceChildren(...facts.flatMap(([k, v]) => { const d = el('div'); d.append(el('dt', '', k), el('dd', '', v)); if (k === 'Latest run') d.querySelector('dd').id = 'afu-latest'; return [d]; }));
    updateLatest();
  }

  function updateLatest() {
    const run = runs.at(-1);
    const dd = $('#afu-latest');
    if (!dd || !run) return;
    dd.replaceChildren(stateDot(run.state), document.createTextNode(` ${run.run_id}`));
  }

  const stateDot = (s) => { const i = el('i', `afu-dot afu-s-${s}`); i.title = LABEL[s] ?? s; return i; };

  // ---- Panes ------------------------------------------------------------------
  function render() {
    const pane = $('#afu-pane');
    pane.className = `afu-pane afu-pane-${tab}`;
    if (tab === 'grid') pane.replaceChildren(gridPane());
    if (tab === 'graph') pane.replaceChildren(graphPane());
    if (tab === 'code') pane.replaceChildren(codePane(source, 'python', dag.source));
    if (tab === 'details') pane.replaceChildren(detailsPane());
    if (tab === 'overview') pane.replaceChildren(overviewPane());
    renderPanel();
  }

  function gridPane() {
    const wrap = el('div', 'afu-grid');
    const maxDur = Math.max(...runs.map((r) => r.duration || 1));
    // Header row: one duration bar per run.
    const head = el('div', 'afu-grid-row afu-grid-head');
    head.append(el('div', 'afu-grid-label', 'Run duration'));
    runs.forEach((run, i) => {
      const cell = el('button', `afu-bar-cell${selection.run === i ? ' is-selected' : ''}`);
      cell.type = 'button';
      cell.title = `${run.run_id} · ${LABEL[run.state]} · ${fmtDur(run.duration || 0)}`;
      const bar = el('span', `afu-bar afu-s-${run.state}`);
      bar.style.height = `${Math.max(6, (100 * (run.duration || 0)) / maxDur)}%`;
      cell.append(bar);
      cell.addEventListener('click', () => { selection = { run: i, task: null }; render(); });
      head.append(cell);
    });
    wrap.append(head);
    let group = null;
    for (const id of order) {
      const t = byId[id];
      if (t.group && t.group !== group) {
        group = t.group;
        const g = el('div', 'afu-grid-row afu-grid-group');
        g.append(el('div', 'afu-grid-label', `▾ ${group}`));
        runs.forEach(() => g.append(el('span')));
        wrap.append(g);
      } else if (!t.group) {
        group = null;
      }
      const row = el('div', `afu-grid-row${selection.task === id ? ' is-selected' : ''}`);
      const label = el('button', `afu-grid-label afu-task-label${t.group ? ' is-child' : ''}`, id.split('.').pop());
      label.type = 'button';
      label.title = id;
      label.addEventListener('click', () => { selection.task = id; render(); });
      row.append(label);
      runs.forEach((run, i) => {
        const ti = run.tasks[id];
        const s = ti?.state ?? 'none';
        const sq = el('button', `afu-sq afu-s-${s}${selection.run === i && selection.task === id ? ' is-selected' : ''}`);
        sq.type = 'button';
        sq.title = `${id} · ${run.run_id} · ${LABEL[s]}${ti?.tries > 1 ? ` · try ${ti.tries}` : ''}`;
        if (ti?.tries > 1) sq.append(el('b', '', String(ti.tries)));
        sq.addEventListener('click', () => { selection = { run: i, task: id }; panelTab = 'details'; render(); });
        row.append(sq);
      });
      wrap.append(row);
    }
    wrap.style.setProperty('--runs', runs.length);
    const legend = el('div', 'afu-legend');
    for (const s of ['success', 'running', 'queued', 'up_for_retry', 'failed', 'upstream_failed', 'none']) {
      const item = el('span'); item.append(stateDot(s), document.createTextNode(` ${LABEL[s]}`)); legend.append(item);
    }
    const box = el('div', 'afu-grid-box');
    box.append(wrap, legend);
    return box;
  }

  function graphPane() {
    const run = runs[selection.run] ?? runs.at(-1);
    const depth = {};
    const visit = (id) => depth[id] ?? (depth[id] = Math.max(-1, ...byId[id].upstream.map(visit)) + 1);
    dag.tasks.forEach((t) => visit(t.task_id));
    const rows = {};
    for (const id of order) (rows[depth[id]] ??= []).push(id);
    const W = 186, H = 44, GX = 20, GY = 30, PAD = 22;
    const maxCols = Math.max(...Object.values(rows).map((r) => r.length));
    const width = PAD * 2 + maxCols * W + (maxCols - 1) * GX;
    const pos = {};
    Object.entries(rows).forEach(([d, list]) => {
      const x0 = (width - (list.length * W + (list.length - 1) * GX)) / 2;
      list.forEach((id, i) => { pos[id] = { x: x0 + i * (W + GX), y: PAD + Number(d) * (H + GY) }; });
    });
    const height = PAD * 2 + Object.keys(rows).length * (H + GY) - GY;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', '100%');
    svg.style.maxWidth = `${width}px`;
    for (const t of dag.tasks) for (const up of t.upstream) {
      const a = pos[up], b = pos[t.task_id];
      const p = document.createElementNS(ns, 'path');
      const x1 = a.x + W / 2, y1 = a.y + H, x2 = b.x + W / 2, y2 = b.y, my = (y1 + y2) / 2;
      p.setAttribute('d', `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`);
      p.setAttribute('class', `afu-edge${run.tasks[up]?.state === 'success' ? ' is-done' : ''}`);
      svg.append(p);
    }
    for (const id of order) {
      const s = run.tasks[id]?.state ?? 'none';
      const g = document.createElementNS(ns, 'g');
      g.setAttribute('class', `afu-node afu-s-${s}${selection.task === id ? ' is-selected' : ''}`);
      g.setAttribute('transform', `translate(${pos[id].x},${pos[id].y})`);
      g.innerHTML = `<rect class="afu-node-box" width="${W}" height="${H}" rx="6"></rect><rect class="afu-node-bar" width="${W}" height="4" rx="2"></rect><text x="10" y="21" class="afu-node-name"></text><text x="10" y="35" class="afu-node-state"></text>`;
      g.querySelector('.afu-node-name').textContent = id.split('.').pop();
      g.querySelector('.afu-node-state').textContent = `${opLabel(byId[id].operator)} · ${LABEL[s]}`;
      g.addEventListener('click', () => { selection.task = id; render(); });
      svg.append(g);
    }
    const box = el('div', 'afu-graph');
    box.append(el('p', 'afu-pane-note', `Run ${run.run_id} · ${LABEL[run.state]}`), svg);
    return box;
  }

  function codePane(code, lang, path) {
    const box = el('div', 'afu-code');
    const head = el('div', 'afu-code-head');
    head.append(el('span', '', path));
    if (embedded) {
      const open = el('button', '', 'Open in the dbt view');
      open.type = 'button';
      open.addEventListener('click', () => toWorkspace({ type: 'open-view', view: 'dbt', file: dag.source }));
      head.append(open);
    }
    const pre = el('pre');
    const lines = window.NexusHighlight ? window.NexusHighlight.highlightLines(code.replace(/\n$/, ''), lang) : code.split('\n');
    pre.innerHTML = lines.map((l, i) => `<span class="code-line"><span class="code-ln">${i + 1}</span>${l}</span>`).join('');
    box.append(head, pre);
    return box;
  }

  function detailsPane() {
    const box = el('div', 'afu-details');
    const rows = [
      ['dag_id', dag.dag_id], ['description', dag.description], ['schedule', dag.schedule], ['owner', dag.owner],
      ['default retries', `${dag.retries} (exponential backoff ${dag.retry_delay_minutes} → ${dag.max_retry_delay_minutes} min)`],
      ['catchup', String(dag.catchup)], ['max_active_runs', String(dag.max_active_runs)], ['tags', dag.tags.join(', ')],
      ['file', dag.source], ['recorded on', `Airflow ${dag.recorded_run.airflow_version}: ${dag.recorded_run.command}`],
    ];
    const table = el('table', 'afu-table');
    rows.forEach(([k, v]) => { const tr = table.insertRow(); tr.append(el('th', '', k), el('td', '', v)); });
    box.append(table);
    return box;
  }

  function overviewPane() {
    const done = runs.filter((r) => ['success', 'failed'].includes(r.state));
    const ok = done.filter((r) => r.state === 'success').length;
    const mean = done.length ? done.reduce((s, r) => s + r.duration, 0) / done.length : 0;
    const box = el('div', 'afu-overview');
    const stats = el('div', 'afu-stats');
    for (const [k, v] of [['Runs', String(runs.length)], ['Succeeded', String(ok)], ['Failed', String(done.length - ok)], ['Mean duration', fmtDur(mean)]]) {
      const c = el('div'); c.append(el('span', '', k), el('strong', '', v)); stats.append(c);
    }
    box.append(stats, el('p', 'afu-pane-note', 'Each run builds and tests one dbt layer at a time, holds everything at the test gate, then regenerates the site data and checks warehouse budgets. Trigger a run to replay it, or tick "Fail the test gate" to watch the retries and the gate hold.'));
    return box;
  }

  // ---- Task instance panel ------------------------------------------------------
  function renderPanel() {
    const panel = $('#afu-panel');
    const run = runs[selection.run] ?? runs.at(-1);
    if (!selection.task) {
      const parts = [el('span', 'afu-eyebrow', 'DAG RUN'), el('h2', '', run.run_id)];
      const badge = el('p', 'afu-badge'); badge.append(stateDot(run.state), document.createTextNode(` ${LABEL[run.state]}`));
      parts.push(badge);
      const dl = el('dl', 'afu-kv');
      for (const [k, v] of [['Run type', run.type === 'recorded' ? 'manual (recorded with airflow dags test)' : 'manual (replay)'], ['Duration', fmtDur(run.duration || 0)], ['Tasks', `${Object.values(run.tasks).filter((t) => t.state === 'success').length} of ${dag.tasks.length} succeeded`]]) dl.append(el('dt', '', k), el('dd', '', v));
      parts.push(dl, el('p', 'afu-pane-note', 'Select a task square to see its details, logs and code.'));
      panel.replaceChildren(...parts);
      return;
    }
    const t = byId[selection.task];
    const ti = run.tasks[t.task_id] ?? { state: 'none', tries: 0, log: [] };
    const parts = [el('span', 'afu-eyebrow', t.group ? `TASK GROUP · ${t.group}` : 'TASK'), el('h2', '', t.task_id)];
    const badge = el('p', 'afu-badge'); badge.append(stateDot(ti.state), document.createTextNode(` ${LABEL[ti.state]}${ti.tries ? ` · try ${ti.tries} of ${t.retries + 1}` : ''}`));
    parts.push(badge, el('p', 'afu-run-id', `Run ${run.run_id}`));
    const tabs = el('div', 'afu-ptabs');
    for (const name of ['details', 'logs', 'code']) {
      const b = el('button', '', name[0].toUpperCase() + name.slice(1));
      b.type = 'button';
      b.setAttribute('aria-selected', String(panelTab === name));
      b.addEventListener('click', () => { panelTab = name; renderPanel(); });
      tabs.append(b);
    }
    parts.push(tabs);
    if (panelTab === 'details') {
      const dl = el('dl', 'afu-kv');
      const add = (k, v) => { if (v) dl.append(el('dt', '', k), el('dd', '', v)); };
      add('Operator', opLabel(t.operator) === '@task' ? '@task (Python)' : t.operator);
      add('Upstream', t.upstream.join(', ') || 'none (DAG root)');
      add('Retries', String(t.retries));
      add('Duration', ti.duration ? fmtDur(ti.duration) : null);
      add('Updates asset', t.outlets.join(', '));
      parts.push(dl);
      if (t.doc) parts.push(el('p', 'afu-pane-note', t.doc));
      const layer = t.task_id.match(/^transform\.build_(\w+)$/)?.[1];
      if (layer && embedded) {
        const q = el('button', 'afu-link', `Query the ${layer} models in SQL →`);
        q.type = 'button';
        q.addEventListener('click', () => toWorkspace({
          type: 'open-sql', title: `${layer} models`, kind: 'example',
          sql: `-- Models this Airflow task builds, from the dbt governance catalog\nselect model, materialized, owning_group, contract_enforced, data_tests\nfrom governance_models\nwhere layer = '${layer}'\norder by model;`,
        }));
        parts.push(q);
      }
    } else if (panelTab === 'logs') {
      const pre = el('pre', 'afu-log');
      pre.textContent = ti.log?.length ? ti.log.join('\n') : 'No log for this try yet.';
      parts.push(pre);
    } else {
      if (t.command) {
        parts.push(el('div', 'afu-mini', 'Rendered command (bash)'));
        parts.push(el('pre', 'afu-cmd', `$ ${t.command}`));
      }
      parts.push(el('div', 'afu-mini', `Defined in ${dag.source}`));
      const snippet = definitionSnippet(t.task_id);
      const pre = el('pre', 'afu-snippet');
      pre.innerHTML = window.NexusHighlight ? window.NexusHighlight.highlight(snippet, 'python') : snippet;
      parts.push(pre);
    }
    panel.replaceChildren(...parts);
  }

  // The lines of the DAG file that define a task.
  function definitionSnippet(taskId) {
    const lines = source.split('\n');
    const short = taskId.split('.').pop();
    let at = lines.findIndex((l) => l.includes(`"${short}"`) || l.includes(`'${short}'`) || l.includes(`def ${short}(`));
    if (at < 0 && short.startsWith('build_')) at = lines.findIndex((l) => l.includes('task_id=f"build_{layer}"'));
    if (at < 0) return source.slice(0, 600);
    // Widen to the surrounding block: back to the previous blank line, on to the next.
    let start = at;
    while (start > 0 && lines[start - 1].trim() && at - start < 6) start -= 1;
    let end = at;
    while (end < lines.length - 1 && lines[end + 1].trim() && end - at < 10) end += 1;
    return lines.slice(start, end + 1).join('\n');
  }

  function opLabel(op) {
    return op.includes('Decorated') ? '@task' : op.replace('Operator', '');
  }

  // ---- Replay -------------------------------------------------------------------
  const speed = () => Number($('#afu-speed').value);
  const later = (seconds, fn) => timers.push(setTimeout(fn, (seconds * 1000) / speed()));

  function trigger() {
    if (!dag || active) return;
    const failGate = $('#afu-fail').checked;
    const run = {
      run_id: `manual__replay_${runs.length}`, type: 'replay', state: 'running', duration: 0, failGate, tasks: {},
      t0: performance.now(),
    };
    for (const id of order) run.tasks[id] = { state: 'scheduled', tries: 0, log: [] };
    runs.push(run);
    if (runs.length > 8) runs.splice(1, 1); // keep the recorded run and the latest replays
    active = run;
    selection = { run: runs.length - 1, task: selection.task };
    $('#afu-trigger').innerHTML = '<span aria-hidden="true">■</span> Stop';
    $('#afu-trigger').classList.add('is-running');
    tick(run);
    render();
    updateLatest();
  }

  function stop() {
    timers.forEach(clearTimeout); timers = [];
    if (active) {
      for (const ti of Object.values(active.tasks)) if (!['success', 'failed', 'upstream_failed'].includes(ti.state)) ti.state = 'none';
      active.state = 'failed';
      finish(active, true);
    }
  }

  const elapsed = (run) => ((performance.now() - run.t0) / 1000) * speed();
  const logTo = (run, id, line) => run.tasks[id].log.push(`[T+${elapsed(run).toFixed(1)}s] ${line}`);

  function tick(run) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of order) {
        const ti = run.tasks[id];
        if (ti.state !== 'scheduled') continue;
        const ups = byId[id].upstream.map((u) => run.tasks[u].state);
        if (ups.some((s) => s === 'failed' || s === 'upstream_failed')) {
          ti.state = 'upstream_failed';
          logTo(run, id, 'Upstream task failed; this task will not run.');
          changed = true;
        } else if (ups.every((s) => s === 'success')) {
          start(run, id);
          changed = true;
        }
      }
    }
    const states = Object.values(run.tasks).map((t) => t.state);
    if (states.every((s) => ['success', 'failed', 'upstream_failed'].includes(s))) {
      run.state = states.includes('failed') ? 'failed' : 'success';
      finish(run);
    }
    if (run === active) { render(); updateLatest(); }
  }

  function start(run, id) {
    const t = byId[id];
    const ti = run.tasks[id];
    const rec = dag.recorded_run.tasks.find((r) => r.task_id === id);
    ti.tries += 1;
    ti.state = 'queued';
    logTo(run, id, `Queued (try ${ti.tries} of ${t.retries + 1}).`);
    later(0.6, () => {
      ti.state = 'running';
      ti.start = elapsed(run);
      logTo(run, id, t.command ? `Running command: ${t.command}` : 'Running @task callable check_budgets()');
      if (run === active) render();
      later(rec?.duration_s ?? 1, () => {
        ti.duration = rec?.duration_s ?? 1;
        if (run.failGate && id === 'test_gate') {
          logTo(run, id, 'Done. PASS=98 WARN=0 ERROR=1 SKIP=0 TOTAL=99');
          logTo(run, id, 'Failure in test assert_no_title_fanout [simulated]');
          if (ti.tries <= t.retries) {
            ti.state = 'up_for_retry';
            logTo(run, id, `Marking task as UP_FOR_RETRY; retry in ${dag.retry_delay_minutes * 2 ** (ti.tries - 1)} min (compressed here).`);
            if (run === active) render();
            later(3, () => { ti.state = 'scheduled'; tick(run); });
          } else {
            ti.state = 'failed';
            logTo(run, id, `Marking task as FAILED after ${ti.tries} tries.`);
            tick(run);
          }
          return;
        }
        (rec?.log ?? []).forEach((l) => logTo(run, id, l));
        ti.state = 'success';
        logTo(run, id, 'Marking task as SUCCESS.');
        tick(run);
      });
    });
  }

  function finish(run, stopped = false) {
    run.duration = elapsed(run);
    if (run === active) {
      active = null;
      timers.forEach(clearTimeout); timers = [];
      $('#afu-trigger').innerHTML = '<span aria-hidden="true">▶</span> Trigger';
      $('#afu-trigger').classList.remove('is-running');
      if (stopped) run.run_id += ' (stopped)';
    }
    render();
    updateLatest();
  }
})();
