"""DAG integrity checks: the DAG imports, its graph matches the run design, and
every dbt model directory is built by exactly one layer task."""

from pathlib import Path

import pytest

pytest.importorskip("airflow")

from airflow.models import DagBag  # noqa: E402

DAGS = Path(__file__).resolve().parents[1] / "dags"
PROJECT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def dag():
    bag = DagBag(dag_folder=str(DAGS), include_examples=False)
    assert bag.import_errors == {}
    # Read the parsed DAG straight from the bag: no metadata database needed.
    return bag.dags["nexus_partner_analytics"]


def test_schedule_and_defaults(dag):
    assert dag is not None
    assert dag.catchup is False
    assert dag.max_active_runs == 1
    assert dag.default_args["retries"] == 2


def test_run_order(dag):
    def downstream(task_id):
        return {t.task_id for t in dag.get_task(task_id).get_flat_relatives(upstream=False)}

    assert "ingest_sources" in downstream("dbt_parse")
    assert "snapshot_partner_tiers" in downstream("ingest_sources")
    assert "transform.build_intermediate" in downstream("transform.build_staging")
    assert "transform.build_marts" in downstream("transform.build_intermediate")
    assert "test_gate" in downstream("transform.build_marts")
    assert "test_gate" in downstream("transform.build_platform")
    # Nothing publishes before every test has passed.
    for task_id in dag.task_ids:
        if task_id.startswith("publish."):
            assert task_id in downstream("test_gate")


def test_every_model_directory_has_a_layer_task(dag):
    layer_dirs = {p.name for p in (PROJECT / "models").iterdir() if p.is_dir()}
    built = {t.task_id.split(".build_")[1] for t in dag.tasks if t.task_id.startswith("transform.build_")}
    assert built == layer_dirs
