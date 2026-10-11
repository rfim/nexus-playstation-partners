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

# Raw seeds stay behind the staging layer, as they do in dbt.
LAYERS = (
    ("stg_", "staging"),
    ("int_", "intermediate"),
    ("dim_", "marts"),
    ("fct_", "marts"),
    ("mart_", "marts"),
    ("partner_tier_history", "snapshot"),
    ("hypothetical_workflow_weeks", "seed"),
)


def _layer(name: str) -> str | None:
    return next((layer for prefix, layer in LAYERS if name.startswith(prefix)), None)


def _tables(con) -> list[dict]:
    names = [row[0] for row in con.execute(
        "select table_name from information_schema.tables "
        "where table_schema = 'main' order by table_name"
    ).fetchall()]
    tables = []
    for name in names:
        layer = _layer(name)
        if layer is None:
            continue
        columns = con.execute(
            "select column_name, data_type from information_schema.columns "
            "where table_schema = 'main' and table_name = ? order by ordinal_position",
            [name],
        ).fetchall()
        rows = con.execute(f'select count(*) from main."{name}"').fetchone()[0]
        tables.append({
            "name": name,
            "layer": layer,
            "rows": rows,
            "columns": [{"name": c, "type": t} for c, t in columns],
        })
    return tables


def _manifest(tables: list[dict]) -> str:
    return json.dumps({"tables": tables}, indent=2) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with duckdb.connect(str(DATABASE), read_only=True) as con:
        tables = _tables(con)
        rendered = _manifest(tables)
        if args.check:
            stale = [] if MANIFEST.exists() and MANIFEST.read_text() == rendered else ["tables.json"]
            for table in tables:
                path = OUTPUT / f"{table['name']}.parquet"
                if not path.exists():
                    stale.append(path.name)
                    continue
                diff = con.execute(f"""
                    select count(*) from (
                        (select * from main."{table['name']}" except all
                         select * from read_parquet('{path.as_posix()}'))
                        union all
                        (select * from read_parquet('{path.as_posix()}') except all
                         select * from main."{table['name']}")
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
        for table in tables:
            path = OUTPUT / f"{table['name']}.parquet"
            con.execute(f"""copy (select * from main."{table['name']}") to '{path.as_posix()}' (format parquet)""")
        MANIFEST.write_text(rendered)
        print(f"Wrote {len(tables)} tables to {OUTPUT}")


if __name__ == "__main__":
    main()
