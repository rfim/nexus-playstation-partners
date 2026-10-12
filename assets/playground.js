// Live SQL over the exported dbt models, run by DuckDB-WASM in the visitor's browser.
const DUCKDB = "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm";
const MAX_ROWS = 200;
const MAX_TABS = 12;
const MAX_HISTORY = 40;
const STORAGE_KEY = "nexus-sql-workspace-v1";
// Views that open as tabs beside the queries. Each is a page of this site,
// embedded once and kept alive while its tab is open.
// Bumped whenever a view page changes, so an open workspace never shows a stale copy.
const VIEW_VERSION = "16";
const VIEWS = {
  lineage: { label: "Lineage", src: `platform.html?view=lineage&v=${VIEW_VERSION}`, hint: "dbt lineage graph · select a node, then query it in a new tab" },
  dbt: { label: "dbt", src: `code.html?v=${VIEW_VERSION}`, hint: "dbt project · every model, macro, test and script, with each model's build cost" },
  airflow: { label: "Airflow", src: `airflow.html?v=${VIEW_VERSION}`, hint: "Airflow DAG · trigger a replay of the recorded run, or inspect any task" },
  contracts: { label: "Contracts", src: `contracts.html?v=${VIEW_VERSION}`, hint: "Stakeholder contracts · each rule runs in dbt or Great Expectations, reconciled at the end of the day" },
};

const PRESETS = {
  scorecard: {
    label: "Partner scorecard",
    sql: `-- The published mart, exactly as dbt built it
select partner_name, region, titles_submitted,
       first_pass_approval_pct, avg_review_hours, avg_publication_lead_days
from mart_partner_publishing
order by first_pass_approval_pct desc;`,
  },
  rebuild: {
    label: "Rebuild from the fact",
    sql: `-- Recompute first-pass approval from attempt-grain rows.
-- It should match mart_partner_publishing.
with titles as (
  select partner_id, title_id,
         max(case when attempt_number = 1 and status = 'approved' then 1 else 0 end) as first_pass
  from fct_submission
  group by all
)
select p.partner_name,
       count(*) as titles_submitted,
       round(100.0 * sum(first_pass) / count(*), 1) as first_pass_approval_pct
from titles t join dim_partner p using (partner_id)
group by all
order by partner_name;`,
  },
  fanout: {
    label: "Fanout trap",
    sql: `-- Joining attempts to publications before aggregating repeats rows,
-- so a naive count overstates publications. int_title_outcomes
-- aggregates each stream to title grain first to avoid this.
select s.title_id,
       count(distinct s.submission_id) as attempts,
       count(p.publication_id) as naive_publications,
       count(distinct p.publication_id) as true_publications
from stg_submissions s
left join stg_publications p using (title_id)
group by all
order by naive_publications desc, title_id;`,
  },
  shelf: {
    label: "Time to shelf",
    sql: `select title_name, shelf_status, approved_at::date as approved,
       planned_release_at::date as planned_release, days_to_planned_release_as_of
from mart_title_time_to_shelf
order by shelf_status, days_to_planned_release_as_of;`,
  },
  health: {
    label: "Partner health",
    sql: `select partner_name, health_score,
       first_pass_wilson_lower, recency_component, shelf_conversion_component,
       is_low_sample
from mart_partner_health
order by health_score desc;`,
  },
  catalog: {
    label: "Governance catalog",
    sql: `-- The governance catalog, exported from the dbt manifest
select model, owning_group, access, contract_enforced,
       classification, data_tests, exposures
from governance_models
order by access, model;`,
  },
  governance: {
    label: "Public model audit",
    sql: `-- Ownership, access and contracts, exported from the dbt manifest.
-- For each public model: who owns it, is it contracted, and how many
-- partner-confidential columns and enforced constraints does it carry?
select g.model, g.owning_group, g.contract_enforced, g.exposures,
       count(*) filter (where c.classification = 'partner_confidential') as confidential_columns,
       sum(len(c.constraints)) as constraints
from governance_models g
join governance_columns c using (model)
where g.access = 'public'
group by all
order by g.contract_enforced desc, g.model;`,
  },
  cost: {
    label: "Cost by model",
    sql: `-- What each dbt model costs to build this month (synthetic credits).
select m.model_name, n.layer, n.owning_group, m.runs,
       m.avg_execution_seconds, m.cost_usd_mtd, m.pct_of_dbt_cost
from mart_cost_by_model m
left join lineage_nodes n on n.name = m.model_name
order by m.cost_usd_mtd desc;`,
  },
  contracts: {
    label: "Contract sign-off",
    sql: `-- End-of-day sign-off: each stakeholder contract's rules, by the engine
-- that ran them (dbt or Great Expectations), and its reconcile chains.
with rules as (
  select contract,
         count(*) as rules,
         count(*) filter (where engine = 'gx') as great_expectations,
         count(*) filter (where engine like 'dbt%') as dbt_tests,
         count(*) filter (where status = 'warn') as warnings,
         count(*) filter (where status = 'fail') as failures
  from contract_rules group by contract
), chains as (
  select contract, count(distinct reconcile_id) as chains,
         count(distinct reconcile_id) filter (where status = 'match') as chains_matched
  from contract_reconciliation group by contract
)
select r.*, c.chains, c.chains_matched,
       case when r.failures > 0 or c.chains_matched < c.chains then 'held'
            when r.warnings > 0 then 'signed off with warnings'
            else 'signed off' end as verdict
from rules r join chains c using (contract)
order by contract`,
  },
  impact: {
    label: "Impact analysis",
    sql: `-- Everything that breaks if raw_submissions changes:
-- a recursive walk down the dbt lineage graph.
with recursive downstream(node_id, hops) as (
  select node_id, 0 from lineage_nodes
  where name = 'partner_platform.raw_submissions'
  union
  select e.to_node, d.hops + 1
  from downstream d join lineage_edges e on e.from_node = d.node_id
)
select n.name, n.type, n.layer, n.owning_group, min(d.hops) as hops
from downstream d join lineage_nodes n using (node_id)
where d.hops > 0
group by all
order by hops, n.name;`,
  },
  tables: {
    label: "All tables",
    sql: `select table_name, count(*) as columns
from information_schema.columns
group by all
order by table_name;`,
  },
};

// Table browser structure: the medallion path first, then the platform layers.
const startsWith = (...prefixes) => (t) => prefixes.some((p) => t.name.startsWith(p));
const isName = (...names) => (t) => names.includes(t.name);
const inLayer = (...layers) => (t) => layers.includes(t.layer);
const TIERS = [
  { key: "source", label: "Source", note: "raw inputs", match: inLayer("source"), subs: [
    ["Partner platform", startsWith("raw_")],
    ["Cost inputs", startsWith("platform_")],
    ["Teaching fixture", isName("hypothetical_workflow_weeks")],
  ] },
  { key: "bronze", label: "Bronze", note: "typed staging", match: inLayer("staging") },
  { key: "silver", label: "Silver", note: "logic + history", match: inLayer("intermediate", "snapshot"), subs: [
    ["Intermediate", inLayer("intermediate")],
    ["Snapshot", inLayer("snapshot")],
  ] },
  { key: "gold", label: "Gold", note: "star schema + marts", match: inLayer("marts"), subs: [
    ["Dimensions", startsWith("dim_")],
    ["Facts", startsWith("fct_")],
    ["Marts", startsWith("mart_")],
  ] },
  { key: "cost", label: "Platform cost", note: "credits + budget", match: inLayer("platform"), subs: [
    ["Daily burn", isName("cost_warehouse_daily", "mart_cost_daily")],
    ["Budget", isName("mart_cost_budget_vs_actual")],
    ["Attribution", isName("mart_cost_by_user", "mart_cost_by_model")],
  ] },
  { key: "governance", label: "Governance", note: "owners + contracts", match: inLayer("governance") },
  { key: "lineage", label: "Lineage", note: "dbt ref() graph", match: inLayer("lineage") },
  { key: "contracts", label: "Contracts", note: "dbt + GX results", match: inLayer("contracts") },
];
const OPEN_TIERS = new Set(["gold"]);

const root = document.querySelector("#playground");
if (root) setup(root);

function setup(root) {
  const editor = root.querySelector("#sql-editor");
  const highlightEl = root.querySelector("#sql-highlight");
  // The textarea's text is transparent; a highlighted copy sits behind it.
  const paintEditor = () => {
    if (!highlightEl || !window.NexusHighlight) return;
    highlightEl.innerHTML = `${window.NexusHighlight.highlight(editor.value, "sql")}\n`;
    highlightEl.parentElement.scrollTop = editor.scrollTop;
    highlightEl.parentElement.scrollLeft = editor.scrollLeft;
  };
  editor.addEventListener("scroll", () => {
    if (!highlightEl) return;
    highlightEl.parentElement.scrollTop = editor.scrollTop;
    highlightEl.parentElement.scrollLeft = editor.scrollLeft;
  });
  const runButton = root.querySelector("#sql-run");
  const status = root.querySelector("#sql-status");
  const output = root.querySelector("#sql-output");
  const tabStrip = root.querySelector("#sql-tabs");
  const tableList = root.querySelector("#sql-tables");
  const exampleList = root.querySelector("#sql-examples");
  const historyList = root.querySelector("#sql-history");
  const download = root.querySelector("#sql-download");
  const windowEl = root.querySelector(".playground-window");
  const viewHost = root.querySelector("#sql-views");
  const layoutEl = root.querySelector(".sql-layout");
  const focusButton = root.querySelector("#sql-focus");
  const frames = {};
  let connection = null;
  let starting = null;
  let engineStatus = "Starting DuckDB…";

  // Open query tabs and run history. Only SQL and titles are remembered
  // between visits (in this browser); results are recomputed on demand.
  const saved = load();
  let tabs = saved.tabs;
  let activeId = saved.activeId;
  let history = saved.history;
  let nextId = Math.max(0, ...tabs.map((t) => t.id)) + 1;

  // Focus mode: the workspace fills the window; Esc or the button leaves it.
  const setFocus = (on) => {
    document.body.classList.toggle("sql-focus", on);
    focusButton?.setAttribute("aria-pressed", String(on));
    if (focusButton) focusButton.textContent = on ? "Exit focus" : "Focus";
  };
  focusButton?.addEventListener("click", () => setFocus(!document.body.classList.contains("sql-focus")));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("sql-focus")) setFocus(false);
  });

  root.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => openView(button.dataset.view));
  });

  // Embedded views hand back queries and cross-links as messages.
  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.data?.source !== "nexus-platform") return;
    const { type, title, kind, sql, view, id } = event.data;
    if (type === "open-sql" && typeof sql === "string") openTab({ title, kind: kind ?? "query", sql, run: true });
    if (type === "open-view" && VIEWS[view]) {
      const { file, task } = event.data;
      openView(view, id ? { type: "lineage-select", id } : file ? { type: "code-open", path: file } : task ? { type: "airflow-select", task } : null);
    }
  });

  // The sidebar can be tucked into a slim rail; Ctrl/Cmd+B toggles it. View tabs
  // (dbt, Lineage, Airflow) always show the rail, so the view keeps the width.
  const rail = root.querySelector(".side-rail");
  let sidebarShown = true;
  const applySidebar = () => {
    const inView = activeTab().kind === "view";
    const open = sidebarShown && !inView;
    layoutEl.classList.toggle("is-side-hidden", !open);
    if (rail) rail.hidden = open;
  };
  const setSidebar = (visible, panel) => {
    sidebarShown = visible;
    if (visible && activeTab().kind === "view") {
      // Tables, examples and history work on queries: return to the latest query tab.
      const query = [...tabs].reverse().find((t) => t.kind !== "view");
      if (query) selectTab(query.id); else newTab();
    }
    if (panel) showPanel(panel);
    applySidebar();
    try { localStorage.setItem(`${STORAGE_KEY}-sidebar`, visible ? "shown" : "hidden"); } catch { /* per-visit only */ }
  };
  root.querySelector("#sql-side-hide")?.addEventListener("click", () => setSidebar(false));
  root.querySelectorAll("[data-rail-panel]").forEach((button) => {
    button.addEventListener("click", () => setSidebar(true, button.dataset.railPanel || null));
  });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
      event.preventDefault();
      setSidebar(layoutEl.classList.contains("is-side-hidden"));
    }
  });
  try {
    sidebarShown = localStorage.getItem(`${STORAGE_KEY}-sidebar`) !== "hidden";
  } catch { /* storage unavailable */ }

  // Sidebar panels: tables, examples, history.
  root.querySelectorAll("[data-panel]").forEach((button) => {
    button.addEventListener("click", () => showPanel(button.dataset.panel));
  });

  for (const [key, preset] of Object.entries(PRESETS)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ex-item";
    const summary = preset.sql.split("\n").find((line) => line.startsWith("--"))?.replace(/^--\s*/, "") ?? "";
    button.innerHTML = "<strong></strong><small></small>";
    button.querySelector("strong").textContent = preset.label;
    button.querySelector("small").textContent = summary;
    button.addEventListener("click", () => openTab({ title: preset.label, kind: "example", sql: preset.sql, run: true }));
    button.dataset.preset = key;
    exampleList.append(button);
  }

  root.querySelector("#sql-history-clear").addEventListener("click", () => {
    history = [];
    save();
    renderHistory();
  });

  runButton.addEventListener("click", run);
  editor.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      run();
    }
  });
  editor.addEventListener("input", () => {
    paintEditor();
    activeTab().sql = editor.value;
    save();
  });

  download?.addEventListener("click", () => {
    const result = activeTab().result;
    if (!result) return;
    const csv = [result.columns, ...result.rows.map((row) => row.map((cell) => cell.text))]
      .map((row) => row.map(csvCell).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `${activeTab().title.replace(/[^\w.-]+/g, "_")}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  });

  fetch("assets/data/tables.json")
    .then((response) => response.json())
    .then(({ tables, macros }) => renderTables(tables, macros ?? []))
    .catch(() => { tableList.textContent = "Table list unavailable."; });

  const filterBox = root.querySelector("#sql-table-filter");
  filterBox?.addEventListener("input", () => {
    const needle = filterBox.value.trim().toLowerCase();
    for (const section of tableList.querySelectorAll(".tbl-group")) {
      let matches = 0;
      for (const item of section.querySelectorAll(".tbl-item")) {
        const hit = needle === "" || item.dataset.search.includes(needle);
        item.hidden = !hit;
        matches += hit ? 1 : 0;
      }
      for (const sub of section.querySelectorAll(".tbl-sub")) {
        sub.hidden = ![...sub.querySelectorAll(".tbl-item")].some((item) => !item.hidden);
      }
      section.hidden = matches === 0;
      section.open = needle ? true : OPEN_TIERS.has(section.dataset.layer);
    }
  });

  // Other pages can link straight to an example with ?preset=<key>.
  const requested = new URLSearchParams(location.search).get("preset");
  const requestedView = new URLSearchParams(location.search).get("view");
  if (VIEWS[requestedView]) {
    openView(requestedView);
    start().catch(() => {});
  } else if (PRESETS[requested]) {
    openTab({ title: PRESETS[requested].label, kind: "example", sql: PRESETS[requested].sql, run: true });
  } else {
    renderTabs();
    renderActive();
    start().catch(() => {});
  }
  renderHistory();

  function load() {
    const fresh = {
      // First visit lands on the dbt project, with a ready query beside it.
      tabs: [
        { id: 1, title: VIEWS.dbt.label, kind: "view", view: "dbt", sql: "" },
        { id: 2, title: PRESETS.scorecard.label, kind: "example", sql: PRESETS.scorecard.sql },
      ],
      activeId: 1,
      history: [],
    };
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!stored?.tabs?.length) return fresh;
      const tabsBack = stored.tabs
        .filter((t) => typeof t.sql === "string" && (t.kind !== "view" || VIEWS[t.view]))
        .slice(0, MAX_TABS);
      if (!tabsBack.length) return fresh;
      return {
        tabs: tabsBack,
        activeId: tabsBack.some((t) => t.id === stored.activeId) ? stored.activeId : tabsBack[0].id,
        history: Array.isArray(stored.history) ? stored.history.slice(0, MAX_HISTORY) : [],
      };
    } catch {
      return fresh;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        tabs: tabs.map(({ id, title, kind, sql, view }) => ({ id, title, kind, sql, view })),
        activeId,
        history,
      }));
    } catch {
      // Storage can be unavailable (private mode); tabs still work for this visit.
    }
  }

  function activeTab() {
    return tabs.find((t) => t.id === activeId) ?? tabs[0];
  }

  function openTab({ title, kind = "query", sql, run: runNow = false }) {
    let tab = tabs.find((t) => t.title === title && t.sql === sql);
    if (!tab) {
      if (tabs.length >= MAX_TABS) {
        // Drop the oldest tab that is not active to make room.
        const victim = tabs.find((t) => t.id !== activeId);
        tabs = tabs.filter((t) => t !== victim);
      }
      tab = { id: nextId++, title, kind, sql };
      tabs.push(tab);
    }
    activeId = tab.id;
    save();
    renderTabs();
    renderActive();
    if (runNow && kind !== "macro") run();
    else start().catch(() => {});
    return tab;
  }

  function newTab() {
    const used = new Set(tabs.map((t) => t.title));
    let n = 1;
    while (used.has(`Query ${n}`)) n += 1;
    openTab({ title: `Query ${n}`, sql: "-- Write SQL against any table in the sidebar\nselect *\nfrom mart_partner_publishing;\n" });
    editor.focus();
  }

  function openView(view, message = null) {
    let tab = tabs.find((t) => t.kind === "view" && t.view === view);
    if (!tab) {
      if (tabs.length >= MAX_TABS) {
        const victim = tabs.find((t) => t.id !== activeId);
        tabs = tabs.filter((t) => t !== victim);
      }
      tab = { id: nextId++, title: VIEWS[view].label, kind: "view", view, sql: "" };
      tabs.push(tab);
    }
    activeId = tab.id;
    save();
    renderTabs();
    renderActive();
    if (message) sendToView(view, message);
    return tab;
  }

  function frameFor(view) {
    if (!frames[view]) {
      const frame = document.createElement("iframe");
      frame.className = "sql-view-frame";
      frame.title = VIEWS[view].label;
      frame.src = VIEWS[view].src;
      frame.dataset.view = view;
      frame.loaded = false;
      frame.pending = [];
      frame.addEventListener("load", () => {
        frame.loaded = true;
        // Give the view a moment to render its data before handing it messages.
        setTimeout(() => frame.pending.splice(0).forEach((m) => frame.contentWindow.postMessage(m, location.origin)), 400);
      });
      viewHost.append(frame);
      frames[view] = frame;
    }
    return frames[view];
  }

  function sendToView(view, message) {
    const frame = frameFor(view);
    const payload = { source: "nexus-sql", ...message };
    if (frame.loaded) frame.contentWindow.postMessage(payload, location.origin);
    else frame.pending.push(payload);
  }

  function closeTab(id) {
    const index = tabs.findIndex((t) => t.id === id);
    if (index < 0) return;
    const [closed] = tabs.splice(index, 1);
    if (closed.kind === "view" && frames[closed.view]) {
      frames[closed.view].remove();
      delete frames[closed.view];
    }
    if (!tabs.length) {
      tabs.push({ id: nextId++, title: "Query 1", kind: "query", sql: "" });
    }
    if (activeId === id) activeId = tabs[Math.min(index, tabs.length - 1)].id;
    save();
    renderTabs();
    renderActive();
  }

  function selectTab(id) {
    activeId = id;
    save();
    renderTabs();
    renderActive();
  }

  function renderTabs() {
    root.querySelectorAll("[data-view]").forEach((b) => {
      b.classList.toggle("is-open", tabs.some((t) => t.kind === "view" && t.view === b.dataset.view));
    });
    tabStrip.replaceChildren();
    for (const tab of tabs) {
      const wrap = document.createElement("div");
      wrap.className = `qtab qtab-${tab.kind}${tab.view ? ` qtab-view-${tab.view}` : ""}`;
      wrap.classList.toggle("is-active", tab.id === activeId);
      const select = document.createElement("button");
      select.type = "button";
      select.className = "qtab-title";
      select.setAttribute("role", "tab");
      select.setAttribute("aria-selected", String(tab.id === activeId));
      select.textContent = tab.title;
      select.title = tab.title;
      select.addEventListener("click", () => selectTab(tab.id));
      select.addEventListener("auxclick", (event) => { if (event.button === 1) closeTab(tab.id); });
      const close = document.createElement("button");
      close.type = "button";
      close.className = "qtab-close";
      close.setAttribute("aria-label", `Close ${tab.title}`);
      close.textContent = "×";
      close.addEventListener("click", () => closeTab(tab.id));
      wrap.append(select, close);
      tabStrip.append(wrap);
    }
    const add = document.createElement("button");
    add.type = "button";
    add.className = "qtab-new";
    add.setAttribute("aria-label", "New query tab");
    add.title = "New query tab";
    add.textContent = "+";
    add.addEventListener("click", newTab);
    tabStrip.append(add);
    tabStrip.querySelector(".is-active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function renderActive() {
    const tab = activeTab();
    const isView = tab.kind === "view";
    windowEl.classList.toggle("is-view", isView);
    // Views bring their own navigation; the sidebar folds into its rail beside them.
    applySidebar();
    viewHost.hidden = !isView;
    for (const frame of Object.values(frames)) frame.hidden = !isView || frame.dataset.view !== tab.view;
    if (isView) {
      frameFor(tab.view).hidden = false;
      status.textContent = VIEWS[tab.view].hint;
      if (download) download.disabled = true;
      return;
    }
    editor.value = tab.sql;
    paintEditor();
    editor.readOnly = tab.kind === "macro";
    runButton.disabled = tab.kind === "macro";
    if (tab.error) {
      const pre = document.createElement("pre");
      pre.className = "sql-error";
      pre.textContent = tab.error;
      output.replaceChildren(pre);
    } else if (tab.result) {
      output.replaceChildren(resultTable(tab.result));
    } else {
      const empty = document.createElement("p");
      empty.className = "sql-empty";
      empty.textContent = tab.kind === "macro"
        ? "dbt macros compile into model SQL; read the source above."
        : "Run this tab to see results. Ctrl+Enter runs it from the editor.";
      output.replaceChildren(empty);
    }
    if (download) download.disabled = !tab.result;
    showStatus();
  }

  function showStatus() {
    const tab = activeTab();
    status.textContent = tab.kind === "view" ? VIEWS[tab.view].hint : tab.status ?? engineStatus;
  }

  function showPanel(name) {
    root.querySelectorAll("[data-panel]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.panel === name)));
    root.querySelectorAll("[data-panel-body]").forEach((p) => { p.hidden = p.dataset.panelBody !== name; });
  }

  function renderHistory() {
    historyList.replaceChildren();
    if (!history.length) {
      const empty = document.createElement("p");
      empty.className = "sql-hint";
      empty.textContent = "Queries you run appear here, newest first. They stay in this browser only.";
      historyList.append(empty);
      return;
    }
    for (const entry of history) {
      const item = document.createElement("div");
      item.className = `hist-item${entry.ok ? "" : " is-failed"}`;
      const open = document.createElement("button");
      open.type = "button";
      open.className = "hist-open";
      open.title = entry.sql;
      open.innerHTML = "<strong></strong><code></code><small></small>";
      open.querySelector("strong").textContent = entry.title;
      open.querySelector("code").textContent = entry.sql.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--")).join(" ").slice(0, 90);
      const when = new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      open.querySelector("small").textContent = entry.ok ? `${when} · ${entry.rows} row${entry.rows === 1 ? "" : "s"} · ${entry.ms} ms` : `${when} · failed`;
      open.addEventListener("click", () => openTab({ title: entry.title, sql: entry.sql, kind: entry.kind ?? "query" }));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "hist-remove";
      remove.setAttribute("aria-label", "Remove from history");
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        history = history.filter((h) => h !== entry);
        save();
        renderHistory();
      });
      item.append(open, remove);
      historyList.append(item);
    }
  }

  function remember(tab, entry) {
    const sql = tab.sql.trim();
    history = history.filter((h) => h.sql.trim() !== sql);
    history.unshift({ title: tab.title, kind: tab.kind, sql: tab.sql, at: Date.now(), ...entry });
    history = history.slice(0, MAX_HISTORY);
    save();
    renderHistory();
  }

  function renderTables(tables, macros) {
    tableList.replaceChildren();
    const placed = new Set();
    for (const tier of TIERS) {
      const members = tables.filter((t) => !placed.has(t) && tier.match(t));
      if (!members.length) continue;
      members.forEach((t) => placed.add(t));
      const section = tierSection(tier.key, tier.label, tier.note, members.length);
      const subs = tier.subs ?? [[null, () => true]];
      const used = new Set();
      for (const [label, match] of subs) {
        const group = members.filter((t) => !used.has(t) && match(t));
        if (!group.length) continue;
        group.forEach((t) => used.add(t));
        section.append(subGroup(label, group.map(tableItem)));
      }
      const rest = members.filter((t) => !used.has(t));
      if (rest.length) section.append(subGroup("Other", rest.map(tableItem)));
      tableList.append(section);
    }
    if (macros.length) {
      const section = tierSection("macros", "Macros", "reusable SQL", macros.length);
      section.append(subGroup(null, macros.map(macroItem)));
      tableList.append(section);
    }
    return tables;
  }

  function tierSection(key, label, note, count) {
    const section = document.createElement("details");
    section.className = `tbl-group tbl-tier-${key}`;
    section.dataset.layer = key;
    section.open = OPEN_TIERS.has(key);
    section.innerHTML = "<summary><i></i><span></span><em></em><small></small></summary>";
    section.querySelector("summary span").textContent = label;
    section.querySelector("summary em").textContent = note;
    section.querySelector("summary small").textContent = count;
    return section;
  }

  function subGroup(label, items) {
    const group = document.createElement("div");
    group.className = "tbl-sub";
    if (label) {
      const heading = document.createElement("p");
      heading.className = "tbl-sub-label";
      heading.textContent = label;
      group.append(heading);
    }
    group.append(...items);
    return group;
  }

  function macroItem(macro) {
    const item = document.createElement("div");
    item.className = "tbl-item tbl-macro";
    item.dataset.search = [macro.name, macro.description, ...macro.arguments].join(" ").toLowerCase();
    const row = document.createElement("div");
    row.className = "tbl-row";
    const show = document.createElement("button");
    show.type = "button";
    show.className = "tbl-name";
    show.title = `Show the source of ${macro.name}`;
    show.innerHTML = `${macro.name.replace(/_/g, "_<wbr>")}<span class="tbl-args"></span>`;
    show.querySelector(".tbl-args").textContent = `(${macro.arguments.join(", ")})`;
    show.addEventListener("click", () => {
      openTab({
        title: macro.name,
        kind: "macro",
        sql: `-- dbt macro ${macro.name}(${macro.arguments.join(", ")}) · ${macro.path}\n-- ${macro.description}\n-- dbt compiles macros into model SQL, so this tab is for reading, not running.\n\n${macro.sql}\n`,
      });
    });
    const note = document.createElement("span");
    note.className = "tbl-note";
    note.textContent = macro.description;
    row.append(show, note);
    item.append(row);
    return item;
  }

  function tableItem(table) {
    const item = document.createElement("div");
    item.className = "tbl-item";
    item.dataset.search = [table.name, ...table.columns.map((c) => c.name)].join(" ").toLowerCase();
    const row = document.createElement("div");
    row.className = "tbl-row";
    const preview = document.createElement("button");
    preview.type = "button";
    preview.className = "tbl-name";
    preview.title = `Preview ${table.name}`;
    // Identifiers wrap at underscores rather than mid-word.
    preview.innerHTML = table.name.replace(/_/g, "_<wbr>");
    preview.addEventListener("click", () => {
      openTab({ title: table.name, kind: "table", sql: `select *\nfrom ${table.name}\nlimit 50;`, run: true });
    });
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "tbl-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", `Show columns of ${table.name}`);
    toggle.textContent = `${table.rows} rows · ${table.columns.length} cols`;
    row.append(preview, toggle);
    const columns = document.createElement("ul");
    columns.className = "tbl-columns";
    columns.hidden = true;
    for (const column of table.columns) {
      const li = document.createElement("li");
      const insert = document.createElement("button");
      insert.type = "button";
      insert.title = `Insert ${column.name} into the query`;
      insert.innerHTML = "<span></span><small></small>";
      insert.querySelector("span").textContent = column.name;
      insert.querySelector("small").textContent = column.type.toLowerCase();
      insert.addEventListener("click", () => insertText(column.name));
      li.append(insert);
      columns.append(li);
    }
    toggle.addEventListener("click", () => {
      const open = columns.hidden;
      columns.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
    });
    item.append(row, columns);
    return item;
  }

  function insertText(text) {
    const tab = activeTab();
    if (tab.kind === "macro" || tab.kind === "view") return;
    const { selectionStart: from, selectionEnd: to, value } = editor;
    editor.value = value.slice(0, from) + text + value.slice(to);
    paintEditor();
    editor.focus();
    editor.selectionStart = editor.selectionEnd = from + text.length;
    tab.sql = editor.value;
    save();
  }

  function start() {
    starting ??= (async () => {
      engineStatus = "Starting DuckDB in your browser…";
      showStatus();
      const duckdb = await import(DUCKDB);
      const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
      const workerUrl = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" }),
      );
      const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), new Worker(workerUrl));
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      await db.open({ query: { castBigIntToDouble: true, castDecimalToDouble: true } });
      URL.revokeObjectURL(workerUrl);
      const conn = await db.connect();
      const { tables } = await (await fetch("assets/data/tables.json")).json();
      for (const table of tables) {
        const file = `${table.name}.parquet`;
        const url = new URL(`assets/data/${file}`, document.baseURI).href;
        await db.registerFileURL(file, url, duckdb.DuckDBDataProtocol.HTTP, false);
        await conn.query(`create view "${table.name}" as select * from read_parquet('${file}')`);
      }
      const version = (await conn.query("select version() as v")).toArray()[0].v;
      engineStatus = `DuckDB ${version} ready · ${tables.length} dbt tables loaded`;
      showStatus();
      connection = conn;
      return conn;
    })();
    starting.catch((error) => {
      starting = null;
      engineStatus = "DuckDB could not start in this browser.";
      const tab = activeTab();
      tab.result = null;
      tab.error = String(error?.message ?? error);
      tab.status = engineStatus;
      renderActive();
    });
    return starting;
  }

  async function run() {
    const tab = activeTab();
    const sql = tab.sql.trim();
    if (!sql || tab.kind === "macro" || tab.kind === "view") return;
    runButton.disabled = true;
    try {
      const conn = connection ?? await start();
      tab.status = "Running…";
      if (tab === activeTab()) showStatus();
      const began = performance.now();
      const result = await conn.query(sql);
      const elapsed = Math.round(performance.now() - began);
      tab.result = collect(result);
      tab.error = null;
      const shown = Math.min(result.numRows, MAX_ROWS);
      tab.status = `${result.numRows} row${result.numRows === 1 ? "" : "s"} in ${elapsed} ms`
        + (shown < result.numRows ? ` · showing first ${shown}` : "");
      remember(tab, { ok: true, rows: result.numRows, ms: elapsed });
    } catch (error) {
      tab.result = null;
      tab.error = String(error?.message ?? error);
      tab.status = "Query failed";
      remember(tab, { ok: false });
    } finally {
      runButton.disabled = activeTab().kind === "macro";
      if (tab === activeTab()) renderActive();
    }
  }

  function collect(result) {
    const fields = result.schema.fields;
    const columns = fields.map((field) => field.name);
    const kinds = fields.map((field) => String(field.type).split("<")[0]);
    const rows = result.toArray().map((row) => columns.map((name, index) => {
      const value = row[name];
      return {
        text: format(value, kinds[index]),
        num: typeof value === "number" || typeof value === "bigint",
        nul: value === null || value === undefined,
      };
    }));
    return { columns, rows };
  }

  function resultTable(result) {
    const table = document.createElement("table");
    const head = table.createTHead().insertRow();
    for (const name of result.columns) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = name;
      head.append(th);
    }
    const body = table.createTBody();
    for (const row of result.rows.slice(0, MAX_ROWS)) {
      const tr = body.insertRow();
      for (const cell of row) {
        const td = tr.insertCell();
        td.textContent = cell.text;
        if (cell.nul) td.className = "null";
        else if (cell.num) td.className = "num";
      }
    }
    return table;
  }
}

function csvCell(value) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function format(value, kind) {
  if (value === null || value === undefined) return "null";
  if (kind.startsWith("Date") && typeof value === "number") return new Date(value).toISOString().slice(0, 10);
  if (kind.startsWith("Timestamp") && typeof value === "number") return new Date(value).toISOString().slice(0, 19).replace("T", " ");
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Math.round(value * 1e4) / 1e4);
  if (value instanceof Date) return value.toISOString().replace(".000Z", "Z");
  if (typeof value === "object") return JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  return String(value);
}
