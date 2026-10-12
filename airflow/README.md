# Airflow orchestration (hypothetical)

The public demo builds in GitHub Actions. `dags/nexus_partner_analytics.py` shows how the
same project would run on a schedule in Airflow 3. It follows the run graph on the site:

```
dbt_parse → validate_contract_files (Great Expectations on the delivered files)
  → ingest_sources → snapshot_partner_tiers
  → transform: build_staging → build_intermediate → build_marts
               build_platform (parallel; reads only its own seeds)
  → test_gate (every dbt test, including cross-layer ones and generated contract tests)
  → contracts: validate_contract_models → reconcile_contracts (the daily sign-off)
  → publish: export_governance, export_platform → export_parquet; export_metrics; build_snippets
  → check_budgets (warns platform_ops when a warehouse is forecast over budget)
```

- **Retries:** two, with exponential backoff up to 30 minutes, and a 30-minute timeout per task.
- **Layer gates:** each layer builds its models and runs the tests that belong wholly to it
  (`--indirect-selection cautious`); tests that span layers wait for `test_gate`. Nothing
  publishes unless every test passes.
- **Contracts:** stakeholder contracts in `contracts/*.yml` compile to dbt tests and Great
  Expectations suites (see `contracts/README.md`). GX checks each delivered file before it
  loads; after the test gate, `reconcile_contracts` joins both engines' results and the
  file-to-mart reconcile chains into one verdict per stakeholder. A held contract fails the
  run, so nothing publishes.
- **Assets:** `export_parquet`, `export_platform` and `reconcile_contracts` update Airflow assets for the site's data,
  so a downstream DAG could schedule on them.
- **Backfills:** `catchup=False` and one active run; reprocessing an interval is an explicit
  `airflow dags backfill`, not an accident.

In production, `ingest_sources` would be a sensor on the partner file drop rather than
`dbt seed`, and `check_budgets` would page the owning team instead of logging.

## Run it locally

Airflow and dbt pin different dependency versions, so give Airflow its own environment and
point the DAG at the project's dbt. With Python 3.12, from the repository root:

```bash
# The project environment (dbt and DuckDB), as in the main README
python -m venv .venv && .venv/bin/pip install -r requirements.txt

# A separate Airflow environment
python -m venv .venv-airflow
.venv-airflow/bin/pip install -r airflow/requirements.txt \
  --constraint https://raw.githubusercontent.com/apache/airflow/constraints-3.2.2/constraints-3.12.txt

export AIRFLOW_HOME="$PWD/.airflow" AIRFLOW__CORE__DAGS_FOLDER="$PWD/airflow/dags" AIRFLOW__CORE__LOAD_EXAMPLES=False
export NEXUS_DBT_BIN="$PWD/.venv/bin/dbt" NEXUS_PYTHON_BIN="$PWD/.venv/bin/python"
.venv-airflow/bin/airflow db migrate
.venv-airflow/bin/airflow dags test nexus_partner_analytics   # runs every task once, in process
.venv-airflow/bin/python -m pytest airflow/tests             # DAG integrity checks
```

A full `dags test` run rebuilds the project from scratch (parse, 9 seeds, snapshot, four
layer builds, 106 tests at the gate, both contract checks), regenerates the site exports and logs the budget
warning for `NEXUS_BI_WH`. `airflow standalone` starts the UI on http://localhost:8080 if
you want to see the graph. CI runs the integrity checks on every push.

## On the site

The dbt workspace has an **Airflow** tab, laid out like the Airflow UI: a Grid of runs × tasks, the Graph, the highlighted DAG Code and Details, with Details, Logs and Code for every task instance. Its left nav also opens **Code** (a browser over every file in `airflow/`, from `assets/airflow_code.json`), **Assets** (what the DAG's outlets update) and **Docs** (this README). The graph comes
from `assets/airflow.json`, which `airflow/export_dag.py` writes from the DAG itself (CI
checks it with `--check`). **Trigger DAG run** replays `airflow/recorded_run.json`, the task
durations and dbt results captured from a real `airflow dags test` run, along the DAG's
dependencies; **Fail the test gate** shows the retries and that nothing publishes when tests
fail. Nothing executes in the browser.

After changing the DAG, refresh the export with Airflow installed:

```bash
.venv-airflow/bin/python airflow/export_dag.py
```

