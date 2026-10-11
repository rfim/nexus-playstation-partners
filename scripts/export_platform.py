"""Export platform cost and dbt lineage for platform.html.

Cost comes from the built mart_cost_* models. Lineage comes from dbt's own
manifest: every source, seed, snapshot, model and exposure, and every ref()
between them. The script fails when the graph breaks the project's rules.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import duckdb
import yaml

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "target" / "manifest.json"
DATABASE = ROOT / "target" / "nexus_partner_analytics.duckdb"
OUTPUT = ROOT / "assets" / "platform.json"
REPO = "https://github.com/rfim/nexus-playstation-partners/blob/main/"


def _rows(con, sql: str) -> list[dict]:
    query = con.execute(sql)
    columns = [c[0] for c in query.description]
    return [dict(zip(columns, (v.isoformat() if hasattr(v, "isoformat") else v for v in row)))
            for row in query.fetchall()]


def _layer(node: dict) -> str:
    kind = node["resource_type"]
    if kind in ("source", "seed", "snapshot", "exposure"):
        return kind
    return node["path"].split("/")[0]


def lineage(manifest: dict, model_cost: dict[str, float]) -> dict:
    groups = {g["name"]: g["owner"].get("name") for g in manifest["groups"].values()}
    candidates = {**manifest["nodes"], **manifest["sources"], **manifest["exposures"]}
    edges = set()
    for uid, node in candidates.items():
        for parent in node.get("depends_on", {}).get("nodes", []):
            if parent in candidates:
                edges.add((parent, uid))
    # Keep the data path: drop tests, and seeds that only sit behind a source.
    used = {a for a, _ in edges} | {b for _, b in edges}
    keep = {
        uid for uid, node in candidates.items()
        if node["resource_type"] in ("source", "model", "snapshot", "exposure")
        or (node["resource_type"] == "seed" and uid in used)
    }
    edges = sorted((a, b) for a, b in edges if a in keep and b in keep)

    parents: dict[str, list[str]] = {uid: [] for uid in keep}
    for a, b in edges:
        parents[b].append(a)
    depth: dict[str, int] = {}

    def depth_of(uid: str) -> int:
        if uid not in depth:
            depth[uid] = 1 + max((depth_of(p) for p in parents[uid]), default=-1)
        return depth[uid]

    nodes = []
    for uid in sorted(keep, key=lambda u: (depth_of(u), u)):
        node = candidates[uid]
        kind = node["resource_type"]
        name = f"{node['source_name']}.{node['name']}" if kind == "source" else node["name"]
        config = node.get("config", {})
        nodes.append({
            "id": uid,
            "name": name,
            "type": kind,
            "layer": _layer(node),
            "depth": depth_of(uid),
            "description": (node.get("description") or "").strip(),
            "group": node.get("group"),
            "owner": groups.get(node.get("group") or "") or (node.get("owner") or {}).get("name"),
            "access": node.get("access"),
            "materialized": config.get("materialized"),
            "classification": (config.get("meta") or {}).get("classification"),
            "contract_enforced": bool((node.get("contract") or {}).get("enforced")),
            "cost_usd_mtd": model_cost.get(node["name"]) if kind in ("model", "snapshot") else None,
            "url": REPO + node["original_file_path"],
        })
    return {"nodes": nodes, "edges": [{"from": a, "to": b} for a, b in edges]}


def cost(con, as_of: str, price: float) -> dict:
    budget = _rows(con, "select * from main.mart_cost_budget_vs_actual order by warehouse_name")
    daily = _rows(con, """
        select usage_date, warehouse_name, credits_used, cost_usd,
               trailing_7d_avg_credits, cumulative_credits_mtd, is_anomaly
        from main.mart_cost_daily order by usage_date, warehouse_name""")
    users = _rows(con, "select * from main.mart_cost_by_user order by cost_usd desc, user_name")
    models = _rows(con, "select * from main.mart_cost_by_model order by cost_usd_mtd desc, model_name")
    settings = _rows(con, f"""
        select date '{as_of}' as as_of_date,
               extract(day from date '{as_of}')::int as days_elapsed,
               extract(day from last_day(date '{as_of}'))::int as days_in_month""")[0]
    credits_mtd = sum(r["credits_used_mtd"] for r in budget)
    forecast = sum(r["forecast_credits_month_end"] for r in budget)
    quota = sum(r["credit_quota"] for r in budget)
    return {
        **settings,
        "credit_price_usd": price,
        "summary": {
            "credits_mtd": round(credits_mtd, 3),
            "cost_usd_mtd": round(credits_mtd * price, 2),
            "forecast_credits": round(forecast, 3),
            "forecast_usd": round(forecast * price, 2),
            "budget_credits": quota,
            "budget_usd": round(quota * price, 2),
            "anomalies": sum(1 for r in daily if r["is_anomaly"]),
            "dbt_cost_usd_mtd": round(sum(r["cost_usd_mtd"] for r in models), 2),
        },
        "budget": budget,
        "daily": daily,
        "by_user": users,
        "by_model": models,
    }


def violations(graph: dict) -> list[str]:
    problems = []
    upstream = {e["to"] for e in graph["edges"]}
    downstream = {e["from"] for e in graph["edges"]}
    for node in graph["nodes"]:
        if node["type"] in ("model", "snapshot", "exposure") and node["id"] not in upstream:
            problems.append(f"{node['name']} has no upstream: it reads nothing dbt can trace")
        if node["type"] in ("source", "seed") and node["id"] not in downstream:
            problems.append(f"{node['name']} is declared but nothing reads it")
        if node["type"] == "model" and not node["owner"]:
            problems.append(f"{node['name']} has no owner")
    return problems


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    variables = yaml.safe_load((ROOT / "dbt_project.yml").read_text())["vars"]
    with duckdb.connect(str(DATABASE), read_only=True) as con:
        cost_data = cost(con, variables["cost_as_of_date"], float(variables["credit_price_usd"]))
    model_cost = {r["model_name"]: r["cost_usd_mtd"] for r in cost_data["by_model"]}
    graph = lineage(manifest, model_cost)
    problems = violations(graph)
    if problems:
        sys.exit("Lineage rules failed:\n- " + "\n- ".join(problems))
    rendered = json.dumps({"cost": cost_data, "lineage": graph}, indent=2) + "\n"
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != rendered:
            sys.exit("assets/platform.json is stale; run scripts/export_platform.py")
        print("platform.json matches the dbt build")
        return
    OUTPUT.write_text(rendered)
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
