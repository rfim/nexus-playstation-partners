"""Export the DAG's structure to assets/airflow.json for the workspace's Airflow tab.

Run with Airflow installed (see airflow/README.md); CI runs it with --check so the
site's graph cannot drift from the DAG. Commands are written relative to the
repository root, and the recorded run in airflow/recorded_run.json rides along.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "airflow.json"
RECORDED = ROOT / "airflow" / "recorded_run.json"

# Write portable commands regardless of local binary overrides.
for name in ("NEXUS_DBT_BIN", "NEXUS_PYTHON_BIN", "NEXUS_PROJECT_DIR"):
    os.environ.pop(name, None)

from airflow.models import DagBag  # noqa: E402


def build() -> dict:
    bag = DagBag(dag_folder=str(ROOT / "airflow" / "dags"), include_examples=False)
    if bag.import_errors:
        sys.exit(f"DAG import errors: {bag.import_errors}")
    dag = bag.dags["nexus_partner_analytics"]
    tasks = []
    for task in sorted(dag.tasks, key=lambda t: t.task_id):
        command = getattr(task, "bash_command", None)
        tasks.append({
            "task_id": task.task_id,
            "group": task.task_id.split(".")[0] if "." in task.task_id else None,
            "operator": type(task).__name__,
            "upstream": sorted(task.upstream_task_ids),
            "command": command.replace(f"cd {ROOT} && ", "") if command else None,
            "retries": task.retries,
            "doc": (task.doc_md or "").strip() or None,
            "outlets": [getattr(o, "uri", str(o)).replace(str(ROOT) + "/", "") for o in task.outlets],
        })
    default = dag.default_args
    return {
        "dag_id": dag.dag_id,
        "description": dag.description,
        "schedule": "0 6 * * *",
        "owner": default["owner"],
        "retries": default["retries"],
        "retry_delay_minutes": int(default["retry_delay"].total_seconds() // 60),
        "max_retry_delay_minutes": int(default["max_retry_delay"].total_seconds() // 60),
        "catchup": dag.catchup,
        "max_active_runs": dag.max_active_runs,
        "tags": sorted(dag.tags),
        "source": "airflow/dags/nexus_partner_analytics.py",
        "tasks": tasks,
        "recorded_run": json.loads(RECORDED.read_text()),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = json.dumps(build(), indent=2) + "\n"
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != rendered:
            sys.exit("assets/airflow.json is stale; run airflow/export_dag.py")
        print("airflow.json matches the DAG")
        return
    OUTPUT.write_text(rendered)
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
