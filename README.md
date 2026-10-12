# NEXUS for PlayStation Partners

An independent Senior Analytics Engineer portfolio by Firman Insan Muhammad (VIM). The page leads with the NEXUS data path and its inspectable dbt source, then uses PlayStation game worlds as editorial examples of partner publishing questions. It demonstrates how the production NEXUS patterns I built at Lifepal can support clear, tested measures.

The hero labels this independent application **“Presented to PlayStation”** and shows the Sony Computer Entertainment heritage image supplied by VIM. Its full-page moving backdrop uses original broken circles, graphic cuts and green light inspired by Persona 6's visual mood. Blue flowing light and vector controller symbols in the architecture preview and accordion are original CSS/SVG animation inspired by the PS5 visual mood. These are not official console footage or UI.

**Live site:** https://rfim.github.io/nexus-playstation-partners/ · **dbt workspace:** https://rfim.github.io/nexus-playstation-partners/sql.html

## What's on the site

| Where | What it shows |
|---|---|
| **Main page** (`index.html`) | The NEXUS architecture, game-world examples, the Lifepal production story, role-fit walkthroughs, the maths, synthetic results, business potential, working code (08) and dbt governance (09). The nav is Architecture · Built at Lifepal · Results · **dbt workspace**. |
| **dbt workspace** (`sql.html`) | Live SQL over the whole dbt build, run by DuckDB-WASM in the browser, plus four view tabs: **dbt** (the project's code, governance and build cost), **Lineage** (the dbt graph), **Airflow** (the hypothetical DAG in an Airflow-style UI) and **Contracts → GX + dbt tests** (stakeholder YAML contracts compiled into Great Expectations and dbt tests, with the end-of-day sign-off). |

`platform.html`, `code.html`, `airflow.html` and `contracts.html` are the pages the workspace embeds as tabs; opening `platform.html` on its own forwards to the workspace.

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

## Repository layout

```
models/            dbt models: staging (bronze), intermediate (silver), marts (gold), platform (cost)
seeds/             synthetic partner data and invented platform-cost inputs
snapshots/         partner tier history
macros/            reusable SQL, documented in macros/properties.yml
tests/             singular dbt tests; tests/contracts/ is generated from the contracts
contracts/         stakeholder data contracts (YAML), their compiler, GX runner, reconciler and GX suites
semantic/          metric definitions for discussion (not a deployed semantic layer)
scripts/           exports that turn the dbt build into the site's data, each with --check
airflow/           hypothetical Airflow 3 DAG, its tests, export script and recorded run
assets/            site CSS/JS and generated data (assets/data/*.parquet, *.json)
docs/              normalisation notes and the illustrative Snowflake cost SQL
.github/workflows/ CI: dbt-reference and airflow-dag jobs
```

## Run it locally

Use Python 3.12:

```bash
python -m pip install -r requirements.txt
dbt build --profiles-dir .
python -m http.server 8767        # then open http://localhost:8767/
```

The DuckDB file is created in `target/`. No cloud account is needed. `dbt build` runs 9 seeds, a timestamp snapshot, 23 models across staging, intermediate, marts and platform cost, 106 data tests (generic, singular and 7 generated from the stakeholder contracts) and 3 exposures. `requirements.txt` also installs Great Expectations for the contract checks.

### After changing the dbt project

The site reads files generated from the build. Regenerate them in this order and commit the results:

```bash
python contracts/compile.py           # tests/contracts/*.sql, contracts/gx/expectations/*.json  (after a contract changes)
python contracts/validate.py --scope files
dbt build --profiles-dir .
python contracts/validate.py --scope models
python contracts/reconcile.py         # assets/contracts.json       end-of-day contract sign-off
python scripts/export_governance.py   # assets/governance.json      ownership, access, contracts, classification
python scripts/export_platform.py     # assets/platform.json        cost marts and the lineage graph
python scripts/export_metrics.py      # assets/metrics.json         the main page's charts
python scripts/export_parquet.py      # assets/data/*.parquet       every table for the SQL workspace
python scripts/build_snippets.py      # snippets, code.json, airflow_code.json   source shown on the site
```

`compile.py`, `reconcile.py` and each export script also take `--check`, which fails if the committed file no longer matches the build. After changing the DAG, also run `airflow/export_dag.py` (see [airflow/README.md](airflow/README.md)).

## The dbt project

**Layers.** Raw seeds sit behind `source()` definitions; staging (bronze) types and standardises them, intermediate (silver) holds title-grain logic, review and publication features and the as-of tier join, and marts (gold) hold dimensions, the submission fact and partner marts. `models/platform/` holds the platform-cost models.

**Governance** (shown in section 09 of the main page and in the dbt tab):

- **Ownership:** three dbt groups in `models/groups.yml`: `data_platform` (staging and intermediate), `partner_analytics` (facts, dimensions and marts) and `platform_ops` (cost models). Owners are portfolio placeholders.
- **Access:** marts are `public`, the consumer interface. Staging, intermediate, the teaching DiD mart and the internal cost view are `protected`.
- **Contracts:** `dim_partner`, `fct_submission`, `mart_partner_publishing` and `mart_cost_budget_vs_actual` declare every column's name and type plus `not_null`, `primary_key` and `check` constraints. dbt refuses to build a model that drifts from its contract.
- **Classification:** `public`, `internal` or `partner_confidential`, set per layer in `dbt_project.yml` and overridden per model or column in YAML.
- **Rules in CI:** `scripts/export_governance.py` fails if a model has no owning group, a model or column has an unknown classification, or an exposure reads a model that is not public.

**Platform cost and lineage** follow the cost-governance pattern of a Snowflake platform: one warehouse per workload, each behind a resource monitor.

- **Cost tracking:** four invented seeds stand in for Snowflake usage data: `platform_warehouse_budget` (monitor quotas), `platform_warehouse_metering` (daily credits, like `ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY`), `platform_query_attribution` (per-user credits, like `QUERY_ATTRIBUTION_HISTORY`) and `platform_dbt_model_runs` (what a dbt on-run-end hook would log). The models produce budget against actual with a run-rate forecast (`mart_cost_budget_vs_actual`), daily burn with anomaly flags (`mart_cost_daily`), attribution by user (`mart_cost_by_user`) and the build cost of every dbt model (`mart_cost_by_model`). Singular tests check that the model allocation reconciles to metered dbt credits and that attribution never exceeds metered compute. The clock (`cost_as_of_date`) and the illustrative credit price (`credit_price_usd`) are dbt vars.
- **Lineage:** `scripts/export_platform.py` reads every `ref()` and `source()` from `target/manifest.json`. It fails if a model reads nothing traceable or a declared input is unused.
- **Production translation:** `docs/snowflake_cost_governance.sql` shows the warehouses, monitors and `ACCOUNT_USAGE` views the seeds stand in for. It is illustrative and is not run.

## Stakeholder data contracts (dbt + Great Expectations)

Each stakeholder owns a YAML contract stating what they rely on: `contracts/partners.yml` covers the partner scorecard and `contracts/finance.yml` the warehouse chargeback. Nobody writes the tests by hand. `contracts/compile.py` routes each rule to the cheaper engine:

- **Great Expectations** for rules on a delivered file (the partner submission feed, the billing export), checked before the file loads, and for tolerance or distribution rules (`mostly`, mean, sum, row count).
- **dbt** for set-based SQL on a model (unique, accepted values, ranges, expressions, cross-model totals). It writes a singular test into `tests/contracts/`, which runs inside `dbt build`. A rule that matches a test the project already has links to that test rather than running it twice.

Of the 24 rules, 13 run in Great Expectations, 7 as generated dbt tests and 4 reuse existing dbt tests. `contracts/validate.py` runs the GX suites. At the end of the day, `contracts/reconcile.py` joins both engines' results and checks each contract's reconcile chains: the same number measured from the delivered file through the loaded table to the mart must agree. Each contract is then signed off, signed off with warnings, or held. A held contract fails CI and the DAG, so nothing publishes. On the current data Partners is signed off, and Finance is signed off with one warning: `NEXUS_BI_WH` is forecast at 122.8% of its budget. See [contracts/README.md](contracts/README.md).

**Metrics.** `semantic/partner_metrics.yml` is a versioned metric definition for discussion, not a deployed semantic layer.

## Orchestration (hypothetical Airflow)

`airflow/dags/nexus_partner_analytics.py` runs the same build on an Airflow 3 daily schedule: parse, Great Expectations on the delivered files, ingest, snapshot, a dbt build per layer with its own tests, a full test gate, the contract sign-off, then the site exports and a budget check that warns `platform_ops` when a warehouse is forecast over budget. Failures retry with exponential backoff, and nothing publishes unless every test passes and the contracts are signed off.

It is not deployed. A full `airflow dags test` run on Airflow 3.2.2 rebuilt the project from scratch, and `airflow/recorded_run.json` keeps its task timings and logs. CI checks that the DAG imports, matches the run design, and agrees with the graph the site shows. See [airflow/README.md](airflow/README.md) to run it.

## The dbt workspace

[`sql.html`](https://rfim.github.io/nexus-playstation-partners/sql.html) runs [DuckDB-WASM](https://duckdb.org/docs/api/wasm/overview) in the visitor's browser, so the live site needs no server or database account. Nothing a visitor types is sent anywhere.

- **Data:** `scripts/export_parquet.py` writes the raw sources and every staging, intermediate, snapshot, seed, mart and cost table, plus the governance and lineage catalogs and the contract results (`contract_rules`, `contract_reconciliation`), to `assets/data/*.parquet`. The page registers each file as a read-only view.
- **Tables sidebar:** grouped as Source, Bronze, Silver, Gold, Platform cost, Governance, Lineage, Contracts and Macros. Filter by table or column name, preview a table, or insert a column into the query. Examples and History panels sit beside it, and the whole sidebar folds into a slim rail (Ctrl+B).
- **Query tabs:** each query, example, table preview or macro opens in its own closable tab with its own results. The SQL editor is syntax-highlighted as you type, results download as CSV, and open tabs and history stay in the visitor's browser only.
- **dbt tab:** every dbt model, macro, test, script and CI file, highlighted (SQL with dbt Jinja, YAML, Python). Each model shows its description, governance, the models it reads and is used by, and its build cost; a pinned **Build cost** entry summarises warehouse budgets and cost by model.
- **Lineage tab:** the dbt graph from the manifest. Select a node to see what it reads, what would break if it changed and what it costs, then open its preview or impact query in a SQL tab.
- **Airflow tab:** laid out like the Airflow UI, with Overview, Grid, Graph, Code and Details, and Details, Logs and Code for each task instance. **Trigger** replays the recorded run; **Fail the test gate** shows the retries and the gate holding. Its left nav also opens every file in `airflow/`, the DAG's assets and its README. Nothing executes in the browser.
- **Contracts → GX + dbt tests tab:** an animated walk-through of one contract from YAML to sign-off, told three ways: an insurance loss ratio (as at Lifepal), a bakery analogy and this build's live PlayStation numbers. Each has a "bad day" switch showing a bad file stopped at the door and the contract held. Below it are the end-of-day sign-off for each stakeholder, then each contract's rules with the engine that ran them, why it was chosen, the generated dbt test or GX expectation, and the result. A dbt rule's test query runs in a new SQL tab, and each reconcile chain can be recomputed there. Its Code section holds the YAML, the compiler and every generated file.
- **Links:** `sql.html?view=<dbt|lineage|airflow|contracts>` opens a view and `sql.html?preset=<key>` opens a ready-made example, such as `impact`, `catalog` or `contracts`.

## CI

GitHub Actions runs two jobs on every push and pull request:

- **dbt-reference** checks the delivered files with Great Expectations, builds and tests the dbt project, signs off the stakeholder contracts (failing if a contract is held or its generated tests drift), then runs every export with `--check` so the site's data, code and catalogs can never drift from the build.
- **airflow-dag** installs Airflow 3.2.2 with its constraints, runs the DAG integrity tests and checks `assets/airflow.json` against the DAG.

GitHub Pages publishes `main`.

## Typography

Text uses PlayStation's brand face, SST, when the visitor has it installed. SST is licensed by Sony from Monotype and cannot be redistributed, so everyone else gets Source Sans 3, a free humanist sans close to it, from Google Fonts (`assets/fonts.css`). Code stays monospace.

## Core metric contract

First-pass approval is `approved titles on attempt one / submitted titles`. Review time uses only attempts with a completed review. Review features include only reviews completed before each submission timestamp. Publication features include only storefront events before the selected title was approved. The selected title's later review duration or publication is an outcome, not a feature. Submission and publication streams aggregate separately at title grain before joining, and a singular test rejects title fanout. These definitions are deliberately small enough to inspect in the code.

`mart_partner_statistical_diagnostics.sql` adds means, quartiles, a 90th percentile, observed-publication counts, snapshot coverage, and a Wilson-score calculation. Its interval algebra is intentionally labeled as a teaching example. `int_partner_tier_asof_submission.sql` only uses snapshot versions valid at submission time; all nine synthetic submissions predate the first captured tier version, so the tier remains unknown. `mart_workflow_did_demo.sql` uses only `hypothetical_workflow_weeks.csv`, never the six operational titles. The +12 percentage-point contrast would require a real rollout design, plausible parallel trends, no material spillovers, unit-level denominators, and cluster-aware inference before being interpreted causally. See the [dbt macro guidance](https://docs.getdbt.com/docs/build/jinja-macros), [dbt tests](https://docs.getdbt.com/docs/build/data-tests), and [difference-in-differences review](https://doi.org/10.1016/j.jeconom.2023.03.008).
