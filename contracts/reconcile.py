"""End-of-day reconciliation: one verdict per stakeholder contract.

    python contracts/reconcile.py          # write assets/contracts.json
    python contracts/reconcile.py --check  # fail if it is stale, or a contract is held

Joins the two engines' results rule by rule (dbt from target/run_results.json,
Great Expectations from target/gx_results/), then checks each reconcile
chain in the contracts: the same number, measured from the delivered file
through to the mart a stakeholder reads, must agree within tolerance.
"""

from __future__ import annotations

import argparse
import json
import sys

import duckdb

from contract_plan import ENGINES, REASONS, ROOT, dbt_test, dbt_vars, load, plain_sql, render_vars

DATABASE = ROOT / "target" / "nexus_partner_analytics.duckdb"
RUN_RESULTS = ROOT / "target" / "run_results.json"
GX_RESULTS = ROOT / "target" / "gx_results"
OUTPUT = ROOT / "assets" / "contracts.json"
SOURCES = [
    "contracts/README.md", "contracts/contract_plan.py", "contracts/compile.py",
    "contracts/validate.py", "contracts/reconcile.py",
]


def _dbt_results() -> dict:
    if not RUN_RESULTS.exists():
        sys.exit("target/run_results.json is missing; run `dbt build --profiles-dir .` first")
    return {r["unique_id"]: r for r in json.loads(RUN_RESULTS.read_text())["results"]}


def _gx_results() -> dict:
    files = sorted(GX_RESULTS.glob("*.json"))
    if not files:
        sys.exit("target/gx_results/ is empty; run contracts/validate.py first")
    return {r["rule"]: r for f in files for r in json.loads(f.read_text())["results"]}


def _num(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return value
    value = round(float(value), 4)
    return int(value) if value.is_integer() else value


def _gx_outcome(rule: dict, gx: dict) -> dict:
    found = gx.get(rule["id"])
    if not found:
        sys.exit(f"{rule['id']}: no Great Expectations result; rerun contracts/validate.py")
    res = found["result"]
    status = "pass" if found["success"] else ("warn" if rule["severity"] == "warn" else "fail")
    if "unexpected_count" in res:
        n, bad = res["element_count"], res["unexpected_count"]
        observed = f"{bad} of {n} rows outside ({round(res['unexpected_percent'], 1)}%)"
        if rule.get("mostly") is not None:
            observed += f"; needs at least {int(rule['mostly'] * 100)}% inside"
    elif isinstance(res.get("observed_value"), list):
        observed = f"{len(res['observed_value'])} columns, in the agreed order" if found["success"] else "column layout differs"
    else:
        observed = f"observed {_num(res.get('observed_value'))}"
    return {"status": status, "observed": observed, "value": _num(res.get("observed_value")) if not isinstance(res.get("observed_value"), list) else None,
            "expectation": found["expectation"]}


def _dbt_outcome(rule: dict, dbt: dict) -> dict:
    unique_id = rule["reused"]["unique_id"] if rule["reused"] else f"test.nexus_partner_analytics.{rule['test_name']}"
    found = dbt.get(unique_id)
    if not found:
        sys.exit(f"{rule['id']}: {rule['test_name']} did not run; run `dbt build --profiles-dir .` first")
    status = {"pass": "pass", "warn": "warn", "fail": "fail"}.get(found["status"], "fail")
    failures = found.get("failures") or 0
    return {"status": status, "observed": f"{failures} failing row{'s' if failures != 1 else ''}", "value": failures}


def _artifact(contract: dict, rule: dict, suites: dict) -> dict:
    if rule["engine"] == "dbt":
        return {"path": f"tests/contracts/{rule['test_name']}.sql", "language": "sql", "code": dbt_test(contract, rule)}
    if rule["engine"] == "dbt_existing":
        reused = rule["reused"]
        return {"path": reused["path"], "language": "text",
                "code": f"# Already declared in {reused['path']}; dbt names it\n{reused['name']}\n"}
    suite = suites[rule["suite"]]
    exp = next(e for e in suite["expectations"] if e["meta"]["rule"] == rule["id"])
    return {"path": f"contracts/gx/expectations/{rule['suite']}.json", "language": "json",
            "code": json.dumps(exp, indent=2) + "\n"}


def _reconcile(spec: dict, rules: dict, con) -> dict:
    measures = []
    for m in spec["measures"]:
        if "rule" in m:
            value, source = rules[m["rule"]]["value"], f"Great Expectations observed value of {m['rule']}"
        else:
            sql = render_vars(m["sql"])
            value, source = _num(con.execute(sql).fetchone()[0]), sql
        measures.append({"label": m["label"], "value": value, "source": source, "engine": "gx" if "rule" in m else "sql"})
    values = [m["value"] for m in measures]
    spread = round(max(values) - min(values), 4) if all(v is not None for v in values) else None
    tolerance = spec.get("tolerance", 0)
    status = "match" if spread is not None and spread <= tolerance else "mismatch"
    return {"id": spec["id"], "title": spec["title"], "tolerance": tolerance, "spread": spread,
            "status": status, "measures": measures}


def render() -> tuple[str, list[str]]:
    dbt, gx = _dbt_results(), _gx_results()
    from contract_plan import gx_suites  # imports great_expectations only when needed

    con = duckdb.connect(str(DATABASE), read_only=True)
    contracts, held = [], []
    for contract in load():
        suites = gx_suites(contract)
        rules = []
        for rule in contract["rules"]:
            outcome = _gx_outcome(rule, gx) if rule["engine"] == "gx" else _dbt_outcome(rule, dbt)
            rules.append({
                "id": rule["id"], "description": rule["description"], "dataset": rule["dataset"],
                "dataset_kind": rule["dataset_kind"], "check": rule["check"],
                "column": rule.get("column") or ", ".join(rule.get("columns", [])) or None,
                "severity": rule["severity"], "engine": rule["engine"], "reason": rule["reason"],
                "artifact": _artifact(contract, rule, suites),
                "sql": plain_sql(rule) if rule["engine"] != "gx" else None,
                **outcome,
            })
        by_id = {r["id"]: r for r in rules}
        recs = [_reconcile(spec, by_id, con) for spec in contract.get("reconcile", [])]
        failed = [r["id"] for r in rules if r["status"] == "fail"] + [r["id"] for r in recs if r["status"] == "mismatch"]
        warned = [r["id"] for r in rules if r["status"] == "warn"]
        verdict = "held" if failed else "signed_off_with_warnings" if warned else "signed_off"
        if failed:
            held.append(f"{contract['contract']}: {', '.join(failed)}")
        contracts.append({
            "contract": contract["contract"], "title": contract["title"], "version": contract["version"],
            "stakeholder": contract["stakeholder"], "consumer": contract["consumer"],
            "owner_group": contract["owner_group"], "sla": contract["sla"], "path": contract["path"],
            "source": contract["source"], "verdict": verdict, "failed": failed, "warned": warned,
            "datasets": list(contract["datasets"].values()), "rules": rules, "reconcile": recs,
        })

    all_rules = [r for c in contracts for r in c["rules"]]
    all_recs = [r for c in contracts for r in c["reconcile"]]
    generated = sorted({r["artifact"]["path"] for r in all_rules if r["engine"] != "dbt_existing"})
    files = [{"path": p, "language": "markdown" if p.endswith(".md") else "python", "code": (ROOT / p).read_text()} for p in SOURCES]
    files += [{"path": p, "language": "sql" if p.endswith(".sql") else "json", "code": (ROOT / p).read_text()} for p in generated]
    data = {
        "business_date": dbt_vars()["cost_as_of_date"],
        "engines": ENGINES,
        "reasons": REASONS,
        "summary": {
            "contracts": len(contracts),
            "rules": len(all_rules),
            "engines": {e: sum(r["engine"] == e for r in all_rules) for e in ENGINES},
            "status": {s: sum(r["status"] == s for r in all_rules) for s in ("pass", "warn", "fail")},
            "reconciliations": len(all_recs),
            "reconciled": sum(r["status"] == "match" for r in all_recs),
        },
        "contracts": contracts,
        "files": files,
    }
    return json.dumps(data, indent=2) + "\n", held


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered, held = render()
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != rendered:
            sys.exit("assets/contracts.json is stale; run contracts/reconcile.py")
        print("Contract results match the build")
    else:
        OUTPUT.write_text(rendered)
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")
    if held:
        sys.exit("Contracts held at end of day: " + "; ".join(held))


if __name__ == "__main__":
    main()
