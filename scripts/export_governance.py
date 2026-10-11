"""Export ownership, access, contracts and classification from the dbt manifest.

The site's governance section and the live SQL views read assets/governance.json.
The script also enforces the project's governance rules, so CI fails when a model
ships without an owner or classification, or a dashboard reads a non-public model.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "target" / "manifest.json"
DATABASE = ROOT / "target" / "nexus_partner_analytics.duckdb"
OUTPUT = ROOT / "assets" / "governance.json"
REPO = "https://github.com/rfim/nexus-playstation-partners/blob/main/"
CLASSIFICATIONS = ("public", "internal", "partner_confidential")


def _short(unique_id: str) -> str:
    return unique_id.split(".")[-1]


def _layer(path: str) -> str:
    return path.split("/")[0]


def _warehouse_columns() -> dict[str, list[tuple[str, str]]]:
    with duckdb.connect(str(DATABASE), read_only=True) as con:
        rows = con.execute(
            "select table_name, column_name, data_type from information_schema.columns "
            "where table_schema = 'main' order by table_name, ordinal_position"
        ).fetchall()
    columns: dict[str, list[tuple[str, str]]] = {}
    for table, column, data_type in rows:
        columns.setdefault(table, []).append((column, data_type))
    return columns


def build(manifest: dict, warehouse: dict[str, list[tuple[str, str]]]) -> dict:
    nodes = manifest["nodes"]
    groups = {g["name"]: g for g in manifest["groups"].values()}
    tests_by_model: dict[str, list[str]] = {}
    tests_by_column: dict[tuple[str, str], list[str]] = {}
    for node in nodes.values():
        if node["resource_type"] != "test":
            continue
        meta = node.get("test_metadata") or {}
        label = meta.get("name") or node["name"]
        for parent in node["depends_on"]["nodes"]:
            if parent.startswith("model."):
                tests_by_model.setdefault(_short(parent), []).append(label)
        column = node.get("column_name")
        attached = node.get("attached_node")
        if column and attached and attached.startswith("model."):
            tests_by_column.setdefault((_short(attached), column), []).append(label)

    exposures = sorted(
        (
            {
                "name": e["name"],
                "label": e.get("label") or e["name"],
                "type": e["type"],
                "maturity": e.get("maturity"),
                "owner": e["owner"].get("name"),
                "depends_on": sorted(_short(n) for n in e["depends_on"]["nodes"]),
            }
            for e in manifest["exposures"].values()
        ),
        key=lambda e: e["name"],
    )
    consumers: dict[str, list[str]] = {}
    for exposure in exposures:
        for model in exposure["depends_on"]:
            consumers.setdefault(model, []).append(exposure["name"])

    models = []
    for node in sorted(nodes.values(), key=lambda n: n["original_file_path"]):
        if node["resource_type"] != "model":
            continue
        name = node["name"]
        classification = node["config"]["meta"].get("classification")
        group = groups.get(node.get("group") or "")
        documented = node["columns"]
        columns = []
        # Every built column appears; documentation, constraints and overrides come from YAML.
        for column_name, warehouse_type in warehouse.get(name, []):
            column = documented.get(column_name, {})
            columns.append({
                "name": column_name,
                "data_type": (column.get("data_type") or warehouse_type).lower(),
                "description": column.get("description") or "",
                "classification": column.get("meta", {}).get("classification") or classification,
                "constraints": [c["type"] for c in column.get("constraints", [])],
                "tests": sorted(tests_by_column.get((name, column_name), [])),
            })
        models.append({
            "name": name,
            "layer": _layer(node["path"]),
            "description": node.get("description") or "",
            "materialized": node["config"]["materialized"],
            "group": node.get("group"),
            "owner": group["owner"].get("name") if group else None,
            "access": node.get("access"),
            "contract_enforced": bool(node["contract"]["enforced"]),
            "classification": classification,
            "tests": len(tests_by_model.get(name, [])),
            "upstream": sorted(_short(n) for n in node["depends_on"]["nodes"] if n.startswith("model.")),
            "sources": sorted(".".join(n.split(".")[-2:]) for n in node["depends_on"]["nodes"] if n.startswith("source.")),
            "exposures": sorted(consumers.get(name, [])),
            "columns": columns,
            "source_url": REPO + node["original_file_path"],
        })

    return {
        "summary": {
            "models": len(models),
            "public_models": sum(m["access"] == "public" for m in models),
            "contracts_enforced": sum(m["contract_enforced"] for m in models),
            "data_tests": sum(1 for n in nodes.values() if n["resource_type"] == "test"),
            "exposures": len(exposures),
            "groups": len(groups),
        },
        "groups": [
            {
                "name": g["name"],
                "owner": g["owner"].get("name"),
                "email": g["owner"].get("email"),
                "responsibility": g.get("config", {}).get("meta", {}).get("responsibility", ""),
                "models": sum(m["group"] == g["name"] for m in models),
            }
            for g in sorted(groups.values(), key=lambda g: g["name"])
        ],
        "models": models,
        "exposures": exposures,
    }


def violations(governance: dict) -> list[str]:
    problems = []
    by_name = {m["name"]: m for m in governance["models"]}
    for model in governance["models"]:
        if not model["group"] or not model["owner"]:
            problems.append(f"{model['name']} has no owning group")
        if model["classification"] not in CLASSIFICATIONS:
            problems.append(f"{model['name']} has classification {model['classification']!r}")
        for column in model["columns"]:
            if column["classification"] not in CLASSIFICATIONS:
                problems.append(f"{model['name']}.{column['name']} has classification {column['classification']!r}")
    for exposure in governance["exposures"]:
        for name in exposure["depends_on"]:
            model = by_name.get(name)
            if model and model["access"] != "public":
                problems.append(f"exposure {exposure['name']} reads non-public model {name}")
    return problems


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    governance = build(json.loads(MANIFEST.read_text()), _warehouse_columns())
    problems = violations(governance)
    if problems:
        sys.exit("Governance rules failed:\n- " + "\n- ".join(problems))
    rendered = json.dumps(governance, indent=2) + "\n"
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != rendered:
            sys.exit("assets/governance.json is stale; run scripts/export_governance.py")
        print("governance.json matches the dbt manifest")
        return
    OUTPUT.write_text(rendered)
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
