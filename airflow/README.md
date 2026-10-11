# Airflow orchestration (hypothetical)

The public demo builds in GitHub Actions. `dags/nexus_partner_analytics.py` shows how the
same project would run on a schedule in Airflow 3. It follows the run graph on the site:

```
dbt_parse → ingest_sources → snapshot_partner_tiers
  → transform: build_staging → build_intermediate → build_marts
               build_platform (parallel; reads only its own seeds)
  → test_gate (every dbt test, including cross-layer ones)
  → publish: export_governance, export_platform → export_parquet; export_metrics; build_snippets
  → check_budgets (warns platform_ops when a warehouse is forecast over budget)
```

- **Retries:** two, with exponential backoff up to 30 minutes, and a 30-minute timeout per task.
- **Layer gates:** each layer builds its models and runs the tests that belong wholly to it
  (`--indirect-selection cautious`); tests that span layers wait for `test_gate`. Nothing
  publishes unless every test passes.
- **Assets:** `export_parquet` and `export_platform` update Airflow assets for the site's data,
  so a downstream DAG could schedule on them.
- **Backfills:** `catchup=False` and one active run; reprocessing an interval is an explicit
  `airflow dags backfill`, not an accident.

In production, `ingest_sources` would be a sensor on the partner file drop rather than
`dbt seed`, and `check_budgets` would page the owning team instead of logging.

## Run it locally

Use Python 3.12, from the repository root:

```bash
python -m venv .venv-airflow && . .venv-airflow/bin/activate
pip install -r requirements.txt
pip install -r airflow/requirements.txt \
  --constraint https://raw.githubusercontent.com/apache/airflow/constraints-3.2.2/constraints-3.12.txt
export AIRFLOW_HOME="$PWD/.airflow" AIRFLOW__CORE__DAGS_FOLDER="$PWD/airflow/dags" AIRFLOW__CORE__LOAD_EXAMPLES=False
airflow db migrate
airflow dags test nexus_partner_analytics   # runs every task once, in process
pytest airflow/tests                        # DAG integrity checks
```

`airflow standalone` starts the UI on http://localhost:8080 if you want to see the graph.
