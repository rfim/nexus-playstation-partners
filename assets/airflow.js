// Airflow tab: the DAG's real structure (assets/airflow.json, exported from the DAG)
// and a replay of a recorded `airflow dags test` run. Nothing executes in the browser.
(() => {
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const embedded = window.parent !== window;
  const toWorkspace = (m) => window.parent.postMessage({ source: 'nexus-platform', ...m }, location.origin);
  const STATES = {
    none: 'no status', queued: 'queued', running: 'running', success: 'success',
    up_for_retry: 'up for retry', failed: 'failed', upstream_failed: 'upstream failed',
  };
  let dag = null;
  let byId = {};
  let recorded = {};
  let state = {};
  let tries = {};
  let selected = null;
  let timers = [];
  let running = false;
  let clock0 = 0;

  fetch('assets/airflow.json').then((r) => r.json()).then((data) => {
    dag = data;
    byId = Object.fromEntries(dag.tasks.map((t) => [t.task_id, t]));
    recorded = Object.fromEntries(dag.recorded_run.tasks.map((t) => [t.task_id, t]));
    renderMeta();
    reset();
    renderGraph();
    select(new URLSearchParams(location.search).get('task') || 'test_gate');
    inbox.splice(0).forEach(handle);
  });

  $('#af-trigger').addEventListener('click', () => (running ? reset() : trigger()));
  $('#af-source').addEventListener('click', () => openSource());
  // Messages from the workspace can arrive before the DAG has loaded; hold them until it has.
  const inbox = [];
  const handle = (data) => {
    if (data.type === 'airflow-select' && byId[data.task]) select(data.task);
    if (data.type === 'airflow-trigger' && !running) trigger();
  };
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.data?.source !== 'nexus-sql') return;
    if (dag) handle(event.data); else inbox.push(event.data);
  });

  function openSource() {
    if (embedded) toWorkspace({ type: 'open-view', view: 'dbt', file: dag.source });
    else window.open(`https://github.com/rfim/nexus-playstation-partners/blob/main/${dag.source}`, '_blank', 'noopener');
  }

  function renderMeta() {
    const meta = $('#af-meta');
    const chip = (k, v) => { const c = el('span', 'af-chip'); c.append(el('small', '', k), el('b', '', v)); return c; };
    meta.replaceChildren(
      chip('schedule', `${dag.schedule} (daily 06:00)`), chip('owner', dag.owner),
      chip('retries', `${dag.retries} · backoff ${dag.retry_delay_minutes}→${dag.max_retry_delay_minutes} min`),
      chip('catchup', String(dag.catchup)), chip('max active runs', String(dag.max_active_runs)),
      chip('tasks', String(dag.tasks.length)), chip('tags', dag.tags.join(', ')),
    );
  }

  // Layout: top to bottom like Airflow's graph view. Row = longest path from a root.
  function layout() {
    const depth = {};
    const visit = (id) => depth[id] ?? (depth[id] = Math.max(-1, ...byId[id].upstream.map(visit)) + 1);
    dag.tasks.forEach((t) => visit(t.task_id));
    const rows = {};
    for (const t of dag.tasks) (rows[depth[t.task_id]] ??= []).push(t);
    const W = 190, H = 46, GX = 22, GY = 34, PAD = 26;
    const maxCols = Math.max(...Object.values(rows).map((r) => r.length));
    const width = PAD * 2 + maxCols * W + (maxCols - 1) * GX;
    const pos = {};
    Object.entries(rows).forEach(([d, list]) => {
      list.sort((a, b) => a.task_id.localeCompare(b.task_id));
      const rowWidth = list.length * W + (list.length - 1) * GX;
      const x0 = (width - rowWidth) / 2;
      list.forEach((t, i) => { pos[t.task_id] = { x: x0 + i * (W + GX), y: PAD + 18 + Number(d) * (H + GY) }; });
    });
    const nrows = Object.keys(rows).length;
    return { pos, W, H, width, height: PAD * 2 + 18 + nrows * H + (nrows - 1) * GY };
  }

  function renderGraph() {
    const { pos, W, H, width, height } = layout();
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', '100%');
    svg.style.maxWidth = `${width}px`;
    // Task groups.
    for (const group of ['transform', 'publish']) {
      const members = dag.tasks.filter((t) => t.group === group).map((t) => pos[t.task_id]);
      const x = Math.min(...members.map((p) => p.x)) - 10, y = Math.min(...members.map((p) => p.y)) - 24;
      const x2 = Math.max(...members.map((p) => p.x)) + W + 10, y2 = Math.max(...members.map((p) => p.y)) + H + 10;
      const box = document.createElementNS(ns, 'rect');
      Object.entries({ x, y, width: x2 - x, height: y2 - y, rx: 10, class: 'af-group' }).forEach(([k, v]) => box.setAttribute(k, v));
      const label = document.createElementNS(ns, 'text');
      Object.entries({ x: x + 10, y: y + 15, class: 'af-group-label' }).forEach(([k, v]) => label.setAttribute(k, v));
      label.textContent = `TaskGroup · ${group}`;
      svg.append(box, label);
    }
    for (const t of dag.tasks) {
      for (const up of t.upstream) {
        const a = pos[up], b = pos[t.task_id];
        const path = document.createElementNS(ns, 'path');
        const x1 = a.x + W / 2, y1 = a.y + H, x2 = b.x + W / 2, y2 = b.y, my = (y1 + y2) / 2;
        path.setAttribute('d', `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`);
        path.setAttribute('class', 'af-edge');
        path.dataset.from = up; path.dataset.to = t.task_id;
        svg.append(path);
      }
    }
    for (const t of dag.tasks) {
      const g = document.createElementNS(ns, 'g');
      g.setAttribute('class', 'af-node');
      g.setAttribute('transform', `translate(${pos[t.task_id].x},${pos[t.task_id].y})`);
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.dataset.task = t.task_id;
      g.innerHTML = `<rect class="af-box" width="${W}" height="${H}" rx="7"></rect><rect class="af-stripe" width="5" height="${H}" rx="2"></rect>
        <text class="af-name" x="14" y="19"></text><text class="af-state" x="14" y="35"></text><title></title>`;
      g.querySelector('.af-name').textContent = t.task_id.split('.').pop();
      g.querySelector('title').textContent = t.task_id;
      g.addEventListener('click', () => select(t.task_id));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(t.task_id); } });
      svg.append(g);
    }
    $('#af-graph').replaceChildren(svg);
    $('#af-legend').replaceChildren(...Object.entries(STATES).map(([k, v]) => { const s = el('span', `af-leg af-s-${k}`); s.append(el('i'), document.createTextNode(v)); return s; }));
    paint();
  }

  function paint() {
    document.querySelectorAll('.af-node').forEach((g) => {
      const id = g.dataset.task;
      const s = state[id] ?? 'none';
      g.setAttribute('class', `af-node af-s-${s}${id === selected ? ' is-selected' : ''}`);
      const tryLabel = tries[id] > 1 ? ` · try ${tries[id]}` : '';
      g.querySelector('.af-state').textContent = `${opLabel(byId[id].operator)} · ${STATES[s]}${tryLabel}`;
    });
    document.querySelectorAll('.af-edge').forEach((p) => {
      p.classList.toggle('is-done', state[p.dataset.from] === 'success');
    });
    if (selected) renderTask(selected);
  }

  function opLabel(op) {
    return op.includes('Decorated') ? '@task' : op.replace('Operator', '');
  }

  function select(id) {
    selected = id;
    paint();
  }

  function renderTask(id) {
    const t = byId[id];
    const rec = recorded[id];
    const panel = $('#af-task');
    const s = state[id] ?? 'none';
    const parts = [el('span', 'af-eyebrow', t.group ? `TASKGROUP · ${t.group.toUpperCase()}` : 'TASK'), el('h2', '', t.task_id)];
    const status = el('p', `af-badge af-s-${s}`); status.append(el('i'), document.createTextNode(STATES[s] + (tries[id] > 1 ? ` · try ${tries[id]} of ${t.retries + 1}` : '')));
    parts.push(status);
    const dl = el('dl', 'af-facts');
    const add = (k, v) => { if (v) dl.append(el('dt', '', k), el('dd', '', v)); };
    add('Operator', opLabel(t.operator) === '@task' ? '@task (Python)' : t.operator);
    add('Upstream', t.upstream.join(', ') || 'none (DAG root)');
    add('Retries', String(t.retries));
    add('Updates asset', t.outlets.join(', '));
    add('Recorded run', rec ? `${rec.duration_s}s · ${rec.state}` : null);
    parts.push(dl);
    if (t.command) { const pre = el('pre', 'af-cmd', `$ ${t.command}`); parts.push(pre); }
    if (t.doc) parts.push(el('p', 'af-doc', t.doc));
    if (rec?.log?.length) { parts.push(el('div', 'af-mini', 'Recorded log')); parts.push(el('pre', 'af-tail', rec.log.join('\n'))); }
    const actions = el('div', 'af-actions');
    const src = el('button', '', 'Open in DAG source'); src.type = 'button'; src.addEventListener('click', openSource);
    actions.append(src);
    const layer = t.task_id.match(/^transform\.build_(\w+)$/)?.[1];
    if (layer && embedded) {
      const q = el('button', '', `Query the ${layer} layer`); q.type = 'button';
      q.addEventListener('click', () => toWorkspace({
        type: 'open-sql', title: `${layer} models`, kind: 'example',
        sql: `-- Models this Airflow task builds, from the dbt governance catalog\nselect model, materialized, owning_group, contract_enforced, data_tests\nfrom governance_models\nwhere layer = '${layer}'\norder by model;`,
      }));
      actions.append(q);
    }
    parts.push(actions);
    panel.replaceChildren(...parts);
  }

  // ---- Replay --------------------------------------------------------------
  function reset() {
    timers.forEach(clearTimeout); timers = [];
    running = false;
    state = {}; tries = {};
    $('#af-trigger').textContent = '▶ Trigger DAG run';
    $('#af-trigger').classList.remove('is-running');
    $('#af-run-state').textContent = 'No run yet';
    $('#af-run-state').className = 'af-run-state';
    $('#af-log').textContent = `# Click "Trigger DAG run" to replay the recorded run of ${dag?.dag_id ?? 'the DAG'}.\n`;
    if (dag) paint();
  }

  function log(line) {
    const t = ((performance.now() - clock0) / 1000 * speed()).toFixed(1).padStart(6);
    const pre = $('#af-log');
    pre.textContent += `[T+${t}s] ${line}\n`;
    pre.scrollTop = pre.scrollHeight;
  }

  const speed = () => Number($('#af-speed').value);
  const later = (seconds, fn) => timers.push(setTimeout(fn, (seconds * 1000) / speed()));

  function trigger() {
    reset();
    running = true;
    clock0 = performance.now();
    $('#af-trigger').textContent = '■ Stop';
    $('#af-trigger').classList.add('is-running');
    setRun('running', 'DagRun running');
    log(`DagRun manual__replay started for ${dag.dag_id} (${$('#af-fail').checked ? 'test gate set to fail' : 'recorded run'})`);
    tick();
  }

  function setRun(cls, text) { const s = $('#af-run-state'); s.textContent = text; s.className = `af-run-state af-s-${cls}`; }

  function tick() {
    const failGate = $('#af-fail').checked;
    // Repeat until nothing changes, so a failure propagates through every descendant.
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of dag.tasks) {
        if (state[t.task_id]) continue;
        const ups = t.upstream.map((u) => state[u]);
        if (ups.some((u) => u === 'failed' || u === 'upstream_failed')) {
          state[t.task_id] = 'upstream_failed';
          log(`${t.task_id} → upstream_failed (not run)`);
          changed = true;
        } else if (ups.every((u) => u === 'success')) {
          start(t, failGate && t.task_id === 'test_gate');
          changed = true;
        }
      }
    }
    paint();
    const all = dag.tasks.map((t) => state[t.task_id]);
    if (all.every((s) => ['success', 'failed', 'upstream_failed'].includes(s))) finish();
  }

  function start(t, fail) {
    const id = t.task_id;
    tries[id] = (tries[id] ?? 0) + 1;
    state[id] = 'queued';
    log(`${id} → queued${tries[id] > 1 ? ` (try ${tries[id]})` : ''}`);
    later(0.6, () => {
      state[id] = 'running';
      log(`${id} → running: ${t.command ?? '@task python callable'}`);
      paint();
      const rec = recorded[id];
      later(rec?.duration_s ?? 1, () => {
        if (fail) {
          log(`${id}: Done. PASS=98 WARN=0 ERROR=1 SKIP=0 TOTAL=99 [simulated: assert_no_title_fanout failed]`);
          if (tries[id] <= t.retries) {
            state[id] = 'up_for_retry';
            log(`${id} → up_for_retry (retry ${tries[id]} of ${t.retries}, backoff ${dag.retry_delay_minutes * 2 ** (tries[id] - 1)} min, compressed here)`);
            paint();
            later(3, () => { delete state[id]; start(t, true); paint(); });
          } else {
            state[id] = 'failed';
            log(`${id} → failed after ${tries[id]} tries; downstream tasks will not run`);
            tick();
          }
          return;
        }
        (rec?.log ?? []).slice(-2).forEach((l) => log(`${id}: ${l}`));
        state[id] = 'success';
        log(`${id} → success`);
        tick();
      });
    });
  }

  function finish() {
    running = false;
    $('#af-trigger').textContent = '↻ Run again';
    $('#af-trigger').classList.remove('is-running');
    const failed = Object.values(state).includes('failed');
    const secs = ((performance.now() - clock0) / 1000 * speed()).toFixed(0);
    if (failed) {
      setRun('failed', `DagRun failed · nothing published`);
      log(`DagRun failed after ${secs}s simulated: the test gate held, publish and check_budgets never ran.`);
    } else {
      setRun('success', `DagRun success · ${secs}s`);
      log(`DagRun success in ${secs}s simulated (recorded serially in ${Math.round(dag.recorded_run.tasks.at(-1).offset_s)}s; parallel branches overlap here).`);
    }
  }
})();
