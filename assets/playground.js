// Live SQL over the exported dbt models, run by DuckDB-WASM in the visitor's browser.
const DUCKDB = "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm";
const MAX_ROWS = 200;

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
];
const OPEN_TIERS = new Set(["gold"]);

const root = document.querySelector("#playground");
if (root) setup(root);

function setup(root) {
  const editor = root.querySelector("#sql-editor");
  const runButton = root.querySelector("#sql-run");
  const status = root.querySelector("#sql-status");
  const output = root.querySelector("#sql-output");
  const tabs = root.querySelector("#sql-presets");
  const tableList = root.querySelector("#sql-tables");
  let connection = null;
  let starting = null;
  let lastResult = null;

  for (const [key, preset] of Object.entries(PRESETS)) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.preset = key;
    button.textContent = preset.label;
    button.setAttribute("aria-pressed", "false");
    tabs.append(button);
  }

  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-preset]");
    if (!button) return;
    editor.value = PRESETS[button.dataset.preset].sql;
    markPreset(button.dataset.preset);
    run();
  });
  runButton.addEventListener("click", run);
  editor.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      run();
    }
  });
  editor.addEventListener("input", () => markPreset(null));
  // Other pages can link straight to a preset with ?preset=<key>.
  const requested = new URLSearchParams(location.search).get("preset");
  const initial = PRESETS[requested] ? requested : "scorecard";
  editor.value = PRESETS[initial].sql;
  markPreset(initial);

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

  const download = root.querySelector("#sql-download");
  download?.addEventListener("click", () => {
    if (!lastResult) return;
    const csv = [lastResult.columns, ...lastResult.rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "nexus-query.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  });

  // This page exists to run SQL: start DuckDB straight away, and run a linked preset.
  if (requested && PRESETS[requested]) run();
  else start().catch(() => {});

  function markPreset(key) {
    for (const button of tabs.querySelectorAll("button")) {
      const active = button.dataset.preset === key;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
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
      const pre = document.createElement("pre");
      pre.className = "sql-macro";
      pre.textContent = macro.sql;
      const head = document.createElement("p");
      head.className = "sql-macro-head";
      head.textContent = `${macro.path} · ${macro.description || "dbt macro"}`;
      output.replaceChildren(head, pre);
      status.textContent = `Macro ${macro.name}: dbt compiles it into model SQL, so it is shown here rather than run.`;
      if (download) download.disabled = true;
      lastResult = null;
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
      editor.value = `select *\nfrom ${table.name}\nlimit 50;`;
      markPreset(null);
      run();
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
    const { selectionStart: from, selectionEnd: to, value } = editor;
    editor.value = value.slice(0, from) + text + value.slice(to);
    editor.focus();
    editor.selectionStart = editor.selectionEnd = from + text.length;
    markPreset(null);
  }

  function start() {
    starting ??= (async () => {
      status.textContent = "Starting DuckDB in your browser…";
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
      status.textContent = `DuckDB ${version} ready · ${tables.length} dbt tables loaded`;
      connection = conn;
      return conn;
    })();
    starting.catch((error) => {
      starting = null;
      status.textContent = "DuckDB could not start in this browser.";
      showError(error);
    });
    return starting;
  }

  async function run() {
    const sql = editor.value.trim();
    if (!sql) return;
    runButton.disabled = true;
    try {
      const conn = connection ?? await start();
      status.textContent = "Running…";
      const began = performance.now();
      const result = await conn.query(sql);
      const elapsed = Math.round(performance.now() - began);
      renderResult(result);
      const shown = Math.min(result.numRows, MAX_ROWS);
      status.textContent = `${result.numRows} row${result.numRows === 1 ? "" : "s"} in ${elapsed} ms`
        + (shown < result.numRows ? ` · showing first ${shown}` : "");
    } catch (error) {
      status.textContent = "Query failed";
      showError(error);
    } finally {
      runButton.disabled = false;
    }
  }

  function renderResult(result) {
    const fields = result.schema.fields;
    const columns = fields.map((field) => field.name);
    const kinds = fields.map((field) => String(field.type).split("<")[0]);
    const table = document.createElement("table");
    const head = table.createTHead().insertRow();
    for (const name of columns) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = name;
      head.append(th);
    }
    const body = table.createTBody();
    const allRows = result.toArray();
    lastResult = {
      columns,
      rows: allRows.map((row) => columns.map((name, index) => format(row[name], kinds[index]))),
    };
    if (download) download.disabled = false;
    const rows = allRows.slice(0, MAX_ROWS);
    for (const row of rows) {
      const tr = body.insertRow();
      columns.forEach((name, index) => {
        const value = row[name];
        const td = tr.insertCell();
        td.textContent = format(value, kinds[index]);
        if (typeof value === "number" || typeof value === "bigint") td.className = "num";
        if (value === null || value === undefined) td.className = "null";
      });
    }
    output.replaceChildren(table);
  }

  function showError(error) {
    lastResult = null;
    if (download) download.disabled = true;
    const pre = document.createElement("pre");
    pre.className = "sql-error";
    pre.textContent = String(error?.message ?? error);
    output.replaceChildren(pre);
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
