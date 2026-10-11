# NEXUS for PlayStation Partners

An independent Senior Analytics Engineer portfolio by Firman Insan Muhammad (VIM). The page leads with the NEXUS data path and its inspectable dbt source, then uses PlayStation game worlds as editorial examples of partner publishing questions. It demonstrates how the production NEXUS patterns I built at Lifepal can support clear, tested measures.

The hero labels this independent application **“Presented to PlayStation”** and shows the Sony Computer Entertainment heritage image supplied by VIM. Its full-page moving backdrop uses original broken circles, graphic cuts and green light inspired by Persona 6's visual mood. Blue flowing light and vector controller symbols in the architecture preview and accordion are original CSS/SVG animation inspired by the PS5 visual mood. These are not official console footage or UI.

**Live site:** https://rfim.github.io/nexus-playstation-partners/

## What is real, and what is an example

- **Production experience:** The dbt-first NEXUS architecture and outcomes described in the Lifepal section come from my Sony CV and prior work. My Deloitte experience includes Snowflake and dbt warehouses on AWS; AWS S3, Lambda and ECS are listed separately in my CV. The site keeps those contexts separate. This repository does not contain Lifepal or Deloitte data or production code.
- **Runnable portfolio reference:** The dbt project here uses six fictional titles, three fictional partners and synthetic submission/publication events. It does not use PlayStation or Capcom data. The dashboard values are exported from the built `mart_partner_publishing` model.
- **Interactive architecture and math:** The architecture signal picker reads the exported mart and replays the path through five source-linked stages. The Lifepal production evidence appears inside the architecture accordion. A [3NF-to-analytics bridge](docs/normalization.md) follows the map: Partner, Title, Submission and Publication retain separate keys and dependencies at the source, then dbt reshapes them into title-grain and dimensional models for analysis. The math covers a title-grain proportion, Wilson score calculation, quantile review diagnostics, join weighting, a snapshot as-of condition, and a separate difference-in-differences teaching example. A displayed score interval is only formula arithmetic: the six fixed fictional titles are not an independent random sample.
- **Role-fit walkthrough:** Six accessible tabs cover data quality and observability, orchestration, semantic metrics, governance, mentoring, and business outcomes. Each tab separates runnable dbt evidence or CV outcomes from an illustrative production workflow. The first-pass figures are read from the exported synthetic metric file. Design screenshots remain local under `previews/` and are not part of the published site.
- **Game art and charts:** Game examples sit directly after the architecture. The full architecture section rotates editorial art from [Final Fantasy VII Revelation](https://www.playstation.com/en-us/games/final-fantasy-vii-revelation/), [Monster Hunter Wilds: Ascendance](https://blog.playstation.com/2026/09/03/monster-hunter-wilds-ascendance-reveals-new-monsters-story-details-and-gameplay), [Resident Evil Veronica](https://www.playstation.com/en-us/games/resident-evil-veronica/) and an official [Grand Theft Auto VI screenshot](https://www.rockstargames.com/VI/media/screenshots). The accordion header has a separate original PlayStation-style animation. The architecture icons are original artwork inspired by Persona 6's circular visual language. The Sony Computer Entertainment heritage image was supplied by VIM as a visual reference. All marks and media belong to their respective owners. This is not affiliated with or endorsed by Sony Interactive Entertainment, PlayStation, Capcom, Square Enix, ATLUS, SEGA or Rockstar Games.
- **Story to measure:** Selecting a game changes its editorial question and places the matching synthetic dashboard beside the example on wide screens and below it on smaller screens. Four supporting slides appear one at a time with direct chart selection and previous/next controls. The story follows a question → measure → possible decision narrative. These are prompts for partner conversations, never claims about the named games or PlayStation's systems. The four operational charts read `assets/metrics.json`, including descriptive statistics from `mart_partner_statistical_diagnostics`. Chart 02 uses a separate 16-row invented weekly seed, `mart_workflow_did_demo`, and a D3 plot to explain a conditional counterfactual, pre-period placebo, pretrend slope, and a 1 pp/week drift sensitivity scenario. The fixture has no cohort sizes or unit-level outcomes, so it supports no standard error, interval or measured causal effect.
- **Point-in-time features:** The review-time D3 curve exposes prior completed review count, prior mean review time and current attempt number from `int_partner_review_features.sql`; current review duration is a later observed label. The publication D3 timeline follows each approved title to its first observed storefront event. The lead-time D3 plot shows title outcomes behind each partner mean from first submission to publication. The `int_title_publication_features.sql` model exposes only earlier partner history at each clock: before the selected title’s first submission or approval. Current publication and elapsed time are later outcomes. An unobserved publication is shown as unknown, not zero. These are candidate feature views; no predictive model was trained. D3 7.9.0 is vendored locally with its license in `assets/vendor/D3-LICENSE.txt`.
- **Business potential (section 07):** Three synthetic opportunity marts read the same six titles at a fixed clock, `var('opportunity_as_of_date')` (30 Sep 2026). `mart_title_time_to_shelf` shows approved titles not yet on a storefront and their slack before planned release. `mart_resubmission_cost` groups rejected attempts by an invented `return_reason`, with reviewer hours and the days each rejection added. `mart_partner_health` combines a Wilson lower bound on first-pass approval, recency and shelf conversion into an illustrative score in [0, 1]; its equal weights are a discussion starting point, not a validated model, and every partner here is flagged low-sample. The calculator's reviewer-hours and days-added defaults come from these marts; titles per year and uplift are the visitor's assumptions. Singular tests reconcile rejected attempts with the submission fact, keep shelf states consistent and bound every health component.
- **Stack logos:** AWS architecture icons come from the [official AWS architecture icon package](https://aws.amazon.com/architecture/icons/). The Snowflake logo comes from [Snowflake press resources](https://www.snowflake.com/en/news/). They indicate experience from the CV, not the runtime of this local dbt reference.

## Run the analytics reference

Use Python 3.12:

```bash
python -m pip install -r requirements.txt
dbt build --profiles-dir .
python scripts/export_metrics.py --check
python scripts/build_snippets.py --check
python scripts/export_governance.py --check
python scripts/export_platform.py --check
python scripts/export_parquet.py --check
```

The DuckDB file is created in `target/`. No cloud account is needed. The build runs seeds, staging models, intermediate logic, a timestamp snapshot, a guarded as-of join, dimensions, a submission fact, a partner publishing mart, descriptive diagnostics, a separate causal arithmetic model, generic and singular tests, and an exposure. `semantic/partner_metrics.yml` is a versioned metric definition for discussion, not a deployed semantic layer.

To view the site locally:

```bash
python -m http.server 8767
```

Open http://localhost:8767/. Every architecture block opens source from this repository.

## Governance

dbt enforces the governance shown in section 09:

- **Ownership:** two dbt groups in `models/groups.yml`, `data_platform` for staging and intermediate logic and `partner_analytics` for facts, dimensions and marts. Owners are portfolio placeholders.
- **Access:** marts are `public`, the consumer interface. Staging, intermediate and the teaching DiD mart are `protected`.
- **Contracts:** `dim_partner`, `fct_submission` and `mart_partner_publishing` declare every column's name and type plus `not_null`, `primary_key` and `check` constraints. dbt refuses to build a model that drifts from its contract.
- **Classification:** `public`, `internal` or `partner_confidential`, set per layer in `dbt_project.yml` and overridden per model or column in YAML.

`scripts/export_governance.py` reads `target/manifest.json` and writes `assets/governance.json`. It fails if a model has no owning group, a model or column has an unknown classification, or an exposure reads a model that is not public. The live SQL panel also exposes the catalog as `governance_models` and `governance_columns`.

## Platform cost and lineage

A separate page, [`platform.html`](https://rfim.github.io/nexus-playstation-partners/platform.html), follows the cost-governance pattern of a Snowflake platform: one warehouse per workload, each behind a resource monitor.

- **Cost tracking:** four invented seeds stand in for Snowflake usage data: `platform_warehouse_budget` (monitor quotas), `platform_warehouse_metering` (daily credits, like `ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY`), `platform_query_attribution` (per-user credits, like `QUERY_ATTRIBUTION_HISTORY`) and `platform_dbt_model_runs` (what a dbt on-run-end hook would log). Models in `models/platform/`, owned by the `platform_ops` group, produce budget against actual with a run-rate forecast (`mart_cost_budget_vs_actual`, contract enforced), daily burn with anomaly flags (`mart_cost_daily`), attribution by user (`mart_cost_by_user`) and the build cost of every dbt model (`mart_cost_by_model`). Singular tests check that model allocation reconciles to metered dbt credits and that attribution never exceeds metered compute. The clock (`cost_as_of_date`) and the illustrative credit price (`credit_price_usd`) are dbt vars.
- **Lineage:** `scripts/export_platform.py` reads every `ref()` and `source()` from `target/manifest.json` and writes the graph to `assets/platform.json`. It fails if a model reads nothing traceable or a declared input is unused. The page lets you select any node to see what it reads, what would break if it changed, and what it costs to build.
- **Production translation:** `docs/snowflake_cost_governance.sql` shows the warehouses, monitors and `ACCOUNT_USAGE` views the seeds stand in for. It is illustrative and is not run.

The live SQL panel exposes `lineage_nodes` and `lineage_edges`, with presets for cost by model and a recursive impact query.

## Live SQL workspace

The [**Live SQL workspace**](https://rfim.github.io/nexus-playstation-partners/sql.html) (`sql.html`) runs [DuckDB-WASM](https://duckdb.org/docs/api/wasm/overview) in the visitor's browser, so the live site needs no server or database account. `scripts/export_parquet.py` writes the raw sources and every staging, intermediate, snapshot, seed and mart table from the local DuckDB build, plus the governance and lineage catalogs, to `assets/data/*.parquet` with a `tables.json` manifest. The page registers each file as a read-only view; the table browser groups them as Source (raw seeds), Bronze (staging), Silver (intermediate and snapshot), Gold (dimensions, facts and marts), Platform cost, Governance and Lineage, and lists the project's documented macros (`macros/properties.yml`). Visitors can filter by table or column name, insert a column into the query, run any SQL and download results as CSV. Each query, example, table preview or macro opens in its own closable tab with its own results, and a History panel lists recent runs; open tabs and history are kept in the visitor's browser only. Two **views** open as tabs beside the queries: **Lineage** (the platform page's dbt graph) and **dbt** (`code.html`, a browser over every model, macro, test, script and CI file, exported to `assets/code.json` by `scripts/build_snippets.py`). View tabs take the full workspace width, a **Focus** button fills the window, and first-time visitors land on the dbt tab. Each model file shows its description, governance (layer, materialization, owner, access, contract, classification, tests), the models it reads and is used by, and its build cost this month, and a pinned **Build cost** entry summarises warehouse budgets and cost by model. Selecting a lineage node or model file offers to preview it or run its impact query in a new SQL tab. `sql.html?view=<lineage|dbt>` opens a view directly. `sql.html?preset=<key>` opens a ready-made example, such as `impact` or `catalog`.

After changing a model, refresh the files and commit them:

```bash
dbt build --profiles-dir .
python scripts/export_governance.py
python scripts/export_platform.py
python scripts/export_parquet.py
```

CI runs `export_parquet.py --check` to confirm the committed Parquet rows match a fresh build. GitHub Actions runs the dbt build and checks that the exported site data and snippets match the working files.

## Core metric contract

First-pass approval is `approved titles on attempt one / submitted titles`. Review time uses only attempts with a completed review. Review features include only reviews completed before each submission timestamp. Publication features include only storefront events before the selected title was approved. The selected title's later review duration or publication is an outcome, not a feature. Submission and publication streams aggregate separately at title grain before joining, and a singular test rejects title fanout. These definitions are deliberately small enough to inspect in the code.

`mart_partner_statistical_diagnostics.sql` adds means, quartiles, a 90th percentile, observed-publication counts, snapshot coverage, and a Wilson-score calculation. Its interval algebra is intentionally labeled as a teaching example. `int_partner_tier_asof_submission.sql` only uses snapshot versions valid at submission time; all nine synthetic submissions predate the first captured tier version, so the tier remains unknown. `mart_workflow_did_demo.sql` uses only `hypothetical_workflow_weeks.csv`, never the six operational titles. The +12 percentage-point contrast would require a real rollout design, plausible parallel trends, no material spillovers, unit-level denominators, and cluster-aware inference before being interpreted causally. See the [dbt macro guidance](https://docs.getdbt.com/docs/build/jinja-macros), [dbt tests](https://docs.getdbt.com/docs/build/data-tests), and [difference-in-differences review](https://doi.org/10.1016/j.jeconom.2023.03.008).
