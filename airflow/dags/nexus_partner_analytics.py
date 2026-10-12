"""Hypothetical Airflow orchestration for the NEXUS partner analytics project.

The public demo builds in GitHub Actions; this DAG shows how the same commands
would run on a schedule. It follows the run graph on the site: ingest,
snapshot, stage, test, publish. Each dbt layer builds and tests before the next
opens, failures retry with backoff, and the run publishes only after the
stakeholder contracts (contracts/*.yml) are signed off and the exports match
the build.

Run it locally with `airflow dags test nexus_partner_analytics` (see
airflow/README.md). All data is synthetic.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from pathlib import Path

from airflow.providers.standard.operators.bash import BashOperator
from airflow.sdk import DAG, Asset, TaskGroup, task

PROJECT_DIR = Path(os.environ.get("NEXUS_PROJECT_DIR", Path(__file__).resolve().parents[2]))
DBT = os.environ.get("NEXUS_DBT_BIN", "dbt")
PYTHON = os.environ.get("NEXUS_PYTHON_BIN", "python")
DBT_ARGS = "--profiles-dir . --target dev"

# What downstream consumers wait on: the site's data, refreshed by this run.
SITE_DATA = Asset(f"file://{PROJECT_DIR}/assets/data/tables.json")
CONTRACT_RESULTS = Asset(f"file://{PROJECT_DIR}/assets/contracts.json")
PLATFORM_DATA = Asset(f"file://{PROJECT_DIR}/assets/platform.json")

# Model layers. Each builds its models and runs the tests that belong wholly to
# it (cautious indirect selection); tests that span layers wait for the gate.
LAYERS = {
    "staging": "path:models/staging",
    "intermediate": "path:models/intermediate",
    "marts": "path:models/marts",
    "platform": "path:models/platform",
}

default_args = {
    "owner": "partner_analytics",
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
    "retry_exponential_backoff": True,
    "max_retry_delay": timedelta(minutes=30),
    "execution_timeout": timedelta(minutes=30),
}


def dbt(command: str) -> str:
    return f"cd {PROJECT_DIR} && {DBT} {command} {DBT_ARGS}"


def script(name: str) -> str:
    return f"cd {PROJECT_DIR} && {PYTHON} scripts/{name}"


def contracts(command: str) -> str:
    return f"cd {PROJECT_DIR} && {PYTHON} contracts/{command}"


with DAG(
    dag_id="nexus_partner_analytics",
    description="Ingest, snapshot, stage, test and publish the NEXUS partner analytics build.",
    schedule="0 6 * * *",
    start_date=datetime(2026, 9, 1),
    catchup=False,
    max_active_runs=1,
    default_args=default_args,
    tags=["nexus", "dbt", "duckdb", "synthetic"],
    doc_md=__doc__,
) as dag:

    # 01 / Ingest: validate the project, then land the synthetic source extracts.
    # In production the seed step would be a sensor on the partner file drop.
    validate = BashOperator(task_id="dbt_parse", bash_command=dbt("parse"))
    # Great Expectations checks the delivered files (partner feed, billing export)
    # against their contracts before they load: dbt cannot test what is not loaded.
    check_files = BashOperator(
        task_id="validate_contract_files",
        bash_command=contracts("validate.py --scope files"),
        doc_md="Run the GX suites for delivered files. A failed error rule stops the load.",
    )
    ingest = BashOperator(task_id="ingest_sources", bash_command=dbt("seed"))

    # 02 / Snapshot: keep partner tier history before anything reads it as-of.
    snapshot = BashOperator(task_id="snapshot_partner_tiers", bash_command=dbt("snapshot"))

    # 03-04 / Stage and test: one dbt build per layer, models and their tests together.
    with TaskGroup(group_id="transform") as transform:
        build = {
            layer: BashOperator(
                task_id=f"build_{layer}",
                bash_command=dbt(f"build --select {selector} --indirect-selection cautious"),
                doc_md=f"Build and test the {layer} layer ({selector}).",
            )
            for layer, selector in LAYERS.items()
        }
        # Partner models run in layer order; platform cost reads only its own seeds.
        build["staging"] >> build["intermediate"] >> build["marts"]

    # The test gate: every test, including those spanning layers (fanout,
    # reconciliation, point-in-time). Nothing publishes unless this passes.
    test_gate = BashOperator(task_id="test_gate", bash_command=dbt("test"))

    # Daily sign-off: GX tolerance checks on the built models, then one verdict per
    # stakeholder from both engines plus the file-to-mart reconcile chains.
    with TaskGroup(group_id="contracts") as signoff:
        check_models = BashOperator(
            task_id="validate_contract_models",
            bash_command=contracts("validate.py --scope models"),
            doc_md="Run the GX suites for built models (mostly, mean and sum checks).",
        )
        reconcile = BashOperator(
            task_id="reconcile_contracts",
            bash_command=contracts("reconcile.py"),
            outlets=[CONTRACT_RESULTS],
            doc_md="Join dbt and GX results per contract and check every reconcile chain. A held contract fails the run.",
        )
        check_models >> reconcile

    # 05 / Publish: regenerate the site's evidence from the build, then verify it.
    with TaskGroup(group_id="publish") as publish:
        governance = BashOperator(task_id="export_governance", bash_command=script("export_governance.py"))
        platform = BashOperator(
            task_id="export_platform", bash_command=script("export_platform.py"), outlets=[PLATFORM_DATA]
        )
        metrics = BashOperator(task_id="export_metrics", bash_command=script("export_metrics.py"))
        parquet = BashOperator(task_id="export_parquet", bash_command=script("export_parquet.py"), outlets=[SITE_DATA])
        snippets = BashOperator(task_id="build_snippets", bash_command=script("build_snippets.py"))
        [governance, platform] >> parquet

    @task(retries=0)
    def check_budgets() -> list[str]:
        """Flag warehouses over budget or forecast to exceed it; the run still succeeds."""
        cost = json.loads((PROJECT_DIR / "assets" / "platform.json").read_text())["cost"]
        flagged = [
            f"{w['warehouse_name']}: {w['pct_of_budget_used']}% used, forecast {w['forecast_pct_of_budget']}%"
            for w in cost["budget"]
            if w["budget_status"] != "ok"
        ]
        for line in flagged:
            print(f"Budget warning for platform_ops: {line}")
        return flagged

    validate >> check_files >> ingest >> snapshot >> transform >> test_gate >> signoff >> publish >> check_budgets()
