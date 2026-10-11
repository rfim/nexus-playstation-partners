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
    .then(({ tables }) => renderTables(tables))
    .catch(() => { tableList.textContent = "Table list unavailable."; });

  const filterBox = root.querySelector("#sql-table-filter");
  filterBox?.addEventListener("input", () => {
    const needle = filterBox.value.trim().toLowerCase();
    for (const button of tableList.querySelectorAll("button")) {
      button.hidden = needle !== "" && !button.textContent.toLowerCase().includes(needle);
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

  function renderTables(tables) {
    tableList.replaceChildren();
    for (const table of tables) {
      const button = document.createElement("button");
      button.type = "button";
      button.title = table.columns.map((c) => `${c.name} ${c.type}`).join("\n");
      button.innerHTML = `<span></span><small></small>`;
      button.querySelector("span").textContent = table.name;
      button.querySelector("small").textContent = `${table.layer} · ${table.rows} rows`;
      button.addEventListener("click", () => {
        editor.value = `select *\nfrom ${table.name}\nlimit 50;`;
        markPreset(null);
        run();
      });
      tableList.append(button);
    }
    return tables;
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
