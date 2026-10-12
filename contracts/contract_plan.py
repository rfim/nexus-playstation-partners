"""Read the stakeholder contracts and decide where each rule runs.

Shared by compile.py (writes the dbt tests and GX suites), validate.py (runs the
GX suites) and reconcile.py (joins both engines' results at the end of the day).

Routing, cheapest place first:
  1. A rule on a file that is not loaded yet goes to Great Expectations: dbt can
     only test what is already in the warehouse.
  2. A rule with a tolerance or a distribution (mostly, mean, sum, row count)
     goes to Great Expectations, which has these built in and reports the
     observed value. In dbt each would be a hand-written macro.
  3. Any other rule on a model is set-based SQL, so it becomes a dbt test that
     runs in the warehouse inside `dbt build`. If the project already has the
     same generic test, the contract reuses it instead of running it twice.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "contracts"
DBT_TESTS = ROOT / "tests" / "contracts"
GX_SUITES = CONTRACTS / "gx" / "expectations"
MANIFEST = ROOT / "target" / "manifest.json"
PROJECT = "nexus_partner_analytics"

DBT_CHECKS = {"unique", "not_null", "accepted_values", "between", "regex", "expression", "reconciles"}
GX_CHECKS = {
    "columns_match", "regex", "accepted_values", "row_count", "between",
    "unique_combination", "sum", "mean", "unique", "not_null",
}
TOLERANCE_CHECKS = {"row_count", "sum", "mean"}
REUSABLE = {"unique", "not_null", "accepted_values"}

ENGINES = {
    "gx": "Great Expectations",
    "dbt": "dbt test (generated)",
    "dbt_existing": "dbt test (already in the project)",
}
REASONS = {
    "boundary": "The file is not in the warehouse yet, so dbt cannot see it. GX checks the file as delivered and stops a bad drop before it loads.",
    "tolerance": "A tolerance or distribution check. GX has it built in and reports the observed value; in dbt it would be a custom macro.",
    "gx_only": "No set-based SQL form of this check, so it runs in GX.",
    "set_based": "Set-based SQL on a model. It runs in the warehouse inside dbt build, moves no rows, and a failure stops downstream models.",
    "reuse": "The project already runs this exact dbt test, so the contract links to it rather than testing twice.",
}


def contract_files() -> list[Path]:
    return sorted(CONTRACTS.glob("*.yml"))


def dbt_vars() -> dict:
    return yaml.safe_load((ROOT / "dbt_project.yml").read_text()).get("vars", {})


def render_vars(text: str) -> str:
    """Replace {{ var('x') }} with its dbt_project.yml value, for SQL run outside dbt."""
    values = dbt_vars()
    return re.sub(r"\{\{\s*var\(['\"](\w+)['\"]\)\s*\}\}", lambda m: str(values[m.group(1)]), text)


def existing_tests() -> dict[tuple, dict]:
    """Generic tests already in the project, keyed by (check, model, column, values)."""
    if not MANIFEST.exists():
        raise SystemExit("target/manifest.json is missing; run `dbt parse --profiles-dir .` first")
    found = {}
    for node in json.loads(MANIFEST.read_text())["nodes"].values():
        meta = node.get("test_metadata")
        if node["resource_type"] != "test" or not meta or not node.get("attached_node"):
            continue
        if node["original_file_path"].startswith("tests/contracts/"):
            continue
        values = meta.get("kwargs", {}).get("values")
        key = (meta["name"], node["attached_node"].split(".")[-1], node.get("column_name"),
               tuple(map(str, values)) if values else None)
        found[key] = {"name": node["name"], "unique_id": node["unique_id"], "path": node["original_file_path"]}
    return found


def route(rule: dict, dataset: dict, existing: dict) -> tuple[str, str, dict | None]:
    check = rule["check"]
    if dataset["kind"] == "file":
        engine, reason = "gx", "boundary"
    elif rule.get("mostly") is not None or check in TOLERANCE_CHECKS:
        engine, reason = "gx", "tolerance"
    elif check not in DBT_CHECKS:
        engine, reason = "gx", "gx_only"
    else:
        engine, reason = "dbt", "set_based"
    if engine == "gx" and check not in GX_CHECKS:
        raise SystemExit(f"{rule['id']}: Great Expectations has no mapping for check '{check}'")
    reused = None
    if engine == "dbt" and check in REUSABLE and rule.get("severity", "error") == "error":
        values = tuple(map(str, rule["values"])) if rule.get("values") else None
        reused = existing.get((check, rule["dataset"], rule.get("column"), values))
        if reused:
            engine, reason = "dbt_existing", "reuse"
    return engine, reason, reused


def load() -> list[dict]:
    """Every contract, with each rule's engine, reason and artifact name."""
    existing = existing_tests()
    contracts = []
    for path in contract_files():
        spec = yaml.safe_load(path.read_text())
        datasets = {d["name"]: d for d in spec["datasets"]}
        rules = []
        for rule in spec["rules"]:
            dataset = datasets[rule["dataset"]]
            engine, reason, reused = route(rule, dataset, existing)
            slug = rule["id"].lower().replace("-", "")
            rules.append({
                **rule,
                "severity": rule.get("severity", "error"),
                "dataset_kind": dataset["kind"],
                "engine": engine,
                "reason": reason,
                "test_name": reused["name"] if reused else f"contract_{spec['contract']}_{slug}" if engine == "dbt" else None,
                "reused": reused,
                "suite": f"{spec['contract']}__{rule['dataset']}" if engine == "gx" else None,
            })
        contracts.append({**spec, "path": path.relative_to(ROOT).as_posix(), "source": path.read_text(),
                          "datasets": datasets, "rules": rules})
    return contracts


# ---- dbt: one singular test per rule ------------------------------------------

def _literal(value) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def dbt_body(rule: dict, ref) -> str:
    """The failing-rows query for a dbt-routed rule. `ref` renders a model reference."""
    check, model, col = rule["check"], ref(rule["dataset"]), rule.get("column")
    if check == "unique":
        return f"select {col}, count(*) as occurrences\nfrom {model}\ngroup by {col}\nhaving count(*) > 1"
    if check == "not_null":
        return f"select *\nfrom {model}\nwhere {col} is null"
    if check == "accepted_values":
        values = ", ".join(_literal(v) for v in rule["values"])
        return f"select *\nfrom {model}\nwhere {col} not in ({values})"
    if check == "between":
        bounds = [f"{col} < {rule['min']}" if "min" in rule else None, f"{col} > {rule['max']}" if "max" in rule else None]
        return f"select *\nfrom {model}\nwhere " + " or ".join(b for b in bounds if b)
    if check == "regex":
        return f"select *\nfrom {model}\nwhere not regexp_matches({col}, {_literal(rule['pattern'])})"
    if check == "expression":
        return f"select *\nfrom {model}\nwhere not ({rule['expression']})"
    if check == "reconciles":
        right = rule["right"]
        reference = (f"select {right['value']} as value" if "value" in right
                     else f"select {right['expression']} as value from {ref(right['model'])}")
        tolerance = rule.get("tolerance", 0)
        return (
            f"with contract_side as (\n    select {rule['left']} as value from {model}\n),\n"
            f"reference_side as (\n    {reference}\n)\n"
            "select c.value as contract_value, r.value as reference_value\n"
            "from contract_side c cross join reference_side r\n"
            f"where c.value is null or r.value is null or abs(c.value - r.value) > {tolerance}"
        )
    raise SystemExit(f"{rule['id']}: no dbt template for check '{check}'")


def dbt_test(contract: dict, rule: dict) -> str:
    """The generated dbt singular test file for a rule."""
    config = (
        f"{{{{ config(tags=['contract', 'contract_{contract['contract']}'], severity='{rule['severity']}',\n"
        f"          meta={{'contract': '{contract['contract']}', 'rule': '{rule['id']}'}}) }}}}"
    )
    header = (
        f"-- Generated by contracts/compile.py from {contract['path']} (rule {rule['id']}). Do not edit.\n"
        f"-- {rule['description']}\n"
    )
    return header + config + "\n\n" + dbt_body(rule, lambda m: f"{{{{ ref('{m}') }}}}") + "\n"


def plain_sql(rule: dict) -> str:
    """The same failing-rows query with plain table names, to run in the browser."""
    return render_vars(dbt_body(rule, lambda m: m))


# ---- Great Expectations: one suite per contract and dataset --------------------

def expectation(rule: dict):
    import great_expectations.expectations as gxe

    check, col = rule["check"], rule.get("column")
    extra = {"meta": {"rule": rule["id"]}, "severity": "warning" if rule["severity"] == "warn" else "critical"}
    if rule.get("mostly") is not None:
        extra["mostly"] = rule["mostly"]
    bounds = {"min_value": rule.get("min"), "max_value": rule.get("max")}
    if check == "columns_match":
        return gxe.ExpectTableColumnsToMatchOrderedList(column_list=rule["columns"], **extra)
    if check == "regex":
        return gxe.ExpectColumnValuesToMatchRegex(column=col, regex=rule["pattern"], **extra)
    if check == "accepted_values":
        return gxe.ExpectColumnValuesToBeInSet(column=col, value_set=rule["values"], **extra)
    if check == "row_count":
        return gxe.ExpectTableRowCountToBeBetween(**bounds, **extra)
    if check == "between":
        return gxe.ExpectColumnValuesToBeBetween(column=col, **bounds, **extra)
    if check == "unique_combination":
        return gxe.ExpectCompoundColumnsToBeUnique(column_list=rule["columns"], **extra)
    if check == "sum":
        return gxe.ExpectColumnSumToBeBetween(column=col, **bounds, **extra)
    if check == "mean":
        return gxe.ExpectColumnMeanToBeBetween(column=col, **bounds, **extra)
    if check == "unique":
        return gxe.ExpectColumnValuesToBeUnique(column=col, **extra)
    if check == "not_null":
        return gxe.ExpectColumnValuesToNotBeNull(column=col, **extra)
    raise SystemExit(f"{rule['id']}: no Great Expectations mapping for check '{check}'")


def gx_suites(contract: dict) -> dict[str, dict]:
    """Suite name -> serialised GX expectation suite, for this contract's GX rules."""
    import great_expectations as gx

    suites = {}
    for dataset in contract["datasets"].values():
        rules = [r for r in contract["rules"] if r["engine"] == "gx" and r["dataset"] == dataset["name"]]
        if not rules:
            continue
        name = f"{contract['contract']}__{dataset['name']}"
        suite = gx.ExpectationSuite(
            name=name,
            expectations=[expectation(r) for r in rules],
            meta={"contract": contract["contract"], "contract_version": contract["version"],
                  "dataset": dataset["name"], "dataset_kind": dataset["kind"],
                  **({"path": dataset["path"]} if dataset["kind"] == "file" else {}),
                  "generated_from": contract["path"]},
        )
        suites[name] = suite.to_json_dict()
    return suites
