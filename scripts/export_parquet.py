"""Export the built dbt models as Parquet for the in-browser DuckDB playground."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
DATABASE = ROOT / "target" / "nexus_partner_analytics.duckdb"
OUTPUT = ROOT / "assets" / "data"
MANIFEST = OUTPUT / "tables.json"
DBT_MANIFEST = ROOT / "target" / "manifest.json"
GOVERNANCE = (ROOT / "assets" / "governance.json").as_posix()
PLATFORM = (ROOT / "assets" / "platform.json").as_posix()
CONTRACTS = (ROOT / "assets" / "contracts.json").as_posix()

# Layer of each exported table; the SQL page groups these into source,
# bronze, silver and gold.
LAYERS = (
    ("raw_", "source"),
    ("platform_", "source"),
    ("stg_", "staging"),
    ("cost_", "platform"),
    ("mart_cost_", "platform"),
    ("int_", "intermediate"),
    ("dim_", "marts"),
    ("fct_", "marts"),
    ("mart_", "marts"),
    ("partner_tier_history", "snapshot"),
    ("hypothetical_workflow_weeks", "source"),
)


# The governance catalog exported from the dbt manifest, flattened for SQL.
_MODELS = f"(select unnest(models) as m from read_json('{GOVERNANCE}'))"
GOVERNANCE_TABLES = {
    "governance_models": f"""
        select m.name as model, m.layer, m."group" as owning_group, m.owner, m.access,
               m.contract_enforced, m.classification, m.tests as data_tests,
               m.materialized, m.upstream, m.exposures
        from {_MODELS} order by m.layer, m.name""",
    "governance_columns": f"""
        select model, c.name as column_name, c.data_type, c.classification,
               c.constraints, c.tests
        from (select m.name as model, unnest(m.columns) as c from {_MODELS})""",
}

# dbt lineage from the manifest: one row per node and one per ref() edge.
_LINEAGE = f"(select lineage from read_json('{PLATFORM}'))"
LINEAGE_TABLES = {
    "lineage_nodes": f"""
        select n.id as node_id, n.name, n.type, n.layer, n.depth, n."group" as owning_group,
               n.access, n.materialized, n.cost_usd_mtd
        from (select unnest(lineage.nodes) as n from {_LINEAGE}) order by n.depth, n.name""",
    "lineage_edges": f"""
        select e."from" as from_node, e."to" as to_node
        from (select unnest(lineage.edges) as e from {_LINEAGE})""",
}


# Stakeholder contract results from contracts/reconcile.py: one row per rule, and
# one per measure in each end-of-day reconcile chain.
_CONTRACTS = f"(select unnest(contracts) as c from read_json('{CONTRACTS}', maximum_object_size=67108864))"
CONTRACT_TABLES = {
    "contract_rules": f"""
        select c.contract, r.id as rule_id, r.description, r.dataset, r.dataset_kind, r."check",
               r."column", r.severity, r.engine, r.reason, r.status, r.observed
        from (select c, unnest(c.rules) as r from {_CONTRACTS}) order by c.contract, r.id""",
    "contract_reconciliation": f"""
        select c.contract, x.id as reconcile_id, x.title, x.tolerance, x.spread, x.status,
               m.label as measure, m.engine as measured_by, m.value
        from (select c, x, unnest(x.measures) as m
              from (select c, unnest(c.reconcile) as x from {_CONTRACTS}))
        order by c.contract, x.id""",
}


def _layer(name: str) -> str | None:
    return next((layer for prefix, layer in LAYERS if name.startswith(prefix)), None)


def _relations(con) -> list[tuple[str, str, str]]:
    """(name, layer, select) for every table the playground exposes."""
    names = [row[0] for row in con.execute(
        "select table_name from information_schema.tables "
        "where table_schema = 'main' order by table_name"
    ).fetchall()]
    relations = [(n, _layer(n), f'select * from main."{n}"') for n in names if _layer(n)]
    relations += [(n, "governance", sql) for n, sql in GOVERNANCE_TABLES.items()]
    relations += [(n, "lineage", sql) for n, sql in LINEAGE_TABLES.items()]
    relations += [(n, "contracts", sql) for n, sql in CONTRACT_TABLES.items()]
    return relations


def _tables(con, relations) -> list[dict]:
    tables = []
    for name, layer, sql in relations:
        columns = con.execute(f"describe ({sql})").fetchall()
        rows = con.execute(f"select count(*) from ({sql})").fetchone()[0]
        tables.append({
            "name": name,
            "layer": layer,
            "rows": rows,
            "columns": [{"name": c[0], "type": c[1]} for c in columns],
        })
    return tables


def _macros() -> list[dict]:
    """The project's own dbt macros, for the SQL page's reference list."""
    macros = json.loads(DBT_MANIFEST.read_text())["macros"].values()
    return sorted(
        (
            {
                "name": m["name"],
                "path": m["original_file_path"],
                "description": m.get("description") or "",
                "arguments": [a["name"] for a in m.get("arguments", [])],
                "sql": m["macro_sql"].strip(),
            }
            for m in macros if m["package_name"] == "nexus_partner_analytics"
        ),
        key=lambda m: m["name"],
    )


def _manifest(tables: list[dict]) -> str:
    return json.dumps({"tables": tables, "macros": _macros()}, indent=2) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with duckdb.connect(str(DATABASE), read_only=True) as con:
        relations = _relations(con)
        tables = _tables(con, relations)
        rendered = _manifest(tables)
        if args.check:
            stale = [] if MANIFEST.exists() and MANIFEST.read_text() == rendered else ["tables.json"]
            for name, _, sql in relations:
                path = OUTPUT / f"{name}.parquet"
                if not path.exists():
                    stale.append(path.name)
                    continue
                diff = con.execute(f"""
                    select count(*) from (
                        (select * from ({sql}) except all
                         select * from read_parquet('{path.as_posix()}'))
                        union all
                        (select * from read_parquet('{path.as_posix()}') except all
                         select * from ({sql}))
                    )
                """).fetchone()[0]
                if diff:
                    stale.append(path.name)
            if stale:
                sys.exit("Playground data is stale; run scripts/export_parquet.py: " + ", ".join(stale))
            print(f"{len(tables)} playground tables match the dbt build")
            return
        OUTPUT.mkdir(parents=True, exist_ok=True)
        for old in OUTPUT.glob("*.parquet"):
            old.unlink()
        for name, _, sql in relations:
            path = OUTPUT / f"{name}.parquet"
            con.execute(f"copy ({sql}) to '{path.as_posix()}' (format parquet)")
        MANIFEST.write_text(rendered)
        print(f"Wrote {len(tables)} tables to {OUTPUT}")


if __name__ == "__main__":
    main()
