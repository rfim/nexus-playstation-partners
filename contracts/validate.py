"""Run the generated Great Expectations suites and record the results.

    python contracts/validate.py                 # every suite
    python contracts/validate.py --scope files   # delivered files only, before they load
    python contracts/validate.py --scope models  # models only, after the dbt build

File datasets are read as delivered (the CSV a partner or the billing system
sends). Model datasets are read from the dbt build, selecting only the columns
the suite needs. Results go to target/gx_results/<scope>.json for reconcile.py. Exits
non-zero if an error-severity expectation fails, so a bad file never loads.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys

import duckdb
import great_expectations as gx

from contract_plan import GX_SUITES, ROOT

DATABASE = ROOT / "target" / "nexus_partner_analytics.duckdb"
RESULTS = ROOT / "target" / "gx_results"
SCOPES = {"files": ("file",), "models": ("model",), "all": ("file", "model")}


def columns(suite: dict) -> list[str]:
    needed = []
    for exp in suite["expectations"]:
        kwargs = exp["kwargs"]
        for col in [kwargs.get("column"), *kwargs.get("column_list", [])]:
            if col and col not in needed:
                needed.append(col)
    return needed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scope", choices=SCOPES, default="all")
    kinds = SCOPES[parser.parse_args().scope]
    logging.getLogger("great_expectations").setLevel(logging.ERROR)
    context = gx.get_context(mode="ephemeral")
    context.variables.progress_bars = {"globally": False}
    files = context.data_sources.add_pandas("delivered_files")
    warehouse = context.data_sources.add_pandas("dbt_build")
    con = duckdb.connect(str(DATABASE), read_only=True) if "model" in kinds else None

    results, blocking = {kind: [] for kind in kinds}, []
    for path in sorted(GX_SUITES.glob("*.json")):
        spec = json.loads(path.read_text())
        meta = spec["meta"]
        if meta["dataset_kind"] not in kinds:
            continue
        if meta["dataset_kind"] == "file":
            asset = files.add_csv_asset(spec["name"], filepath_or_buffer=str(ROOT / meta["path"]))
            batch = asset.add_batch_definition_whole_dataframe("delivered").get_batch()
        else:
            frame = con.execute(f"select {', '.join(columns(spec))} from {meta['dataset']}").df()
            asset = warehouse.add_dataframe_asset(spec["name"])
            batch = asset.add_batch_definition_whole_dataframe("built").get_batch(batch_parameters={"dataframe": frame})
        suite = context.suites.add(gx.ExpectationSuite(**{k: v for k, v in spec.items() if k != "id"}))
        validation = batch.validate(suite)
        for item in validation.results:
            config = item.expectation_config
            result = {k: v for k, v in item.result.items() if k in (
                "observed_value", "element_count", "unexpected_count", "unexpected_percent", "partial_unexpected_list")}
            results[meta["dataset_kind"]].append({
                "rule": config.meta["rule"],
                "suite": spec["name"],
                "expectation": config.type,
                "success": bool(item.success),
                "severity": config.severity.value if hasattr(config.severity, "value") else str(config.severity),
                "result": json.loads(json.dumps(result, default=str)),
            })
            if not item.success and results[meta["dataset_kind"]][-1]["severity"] == "critical":
                blocking.append(config.meta["rule"])

    RESULTS.mkdir(parents=True, exist_ok=True)
    for kind, found in results.items():
        payload = {"great_expectations_version": gx.__version__, "scope": f"{kind}s", "results": found}
        (RESULTS / f"{kind}s.json").write_text(json.dumps(payload, indent=2) + "\n")
    flat = [r for found in results.values() for r in found]
    print(f"Great Expectations: {sum(r['success'] for r in flat)} of {len(flat)} expectations met")
    if blocking:
        sys.exit("Blocking expectations failed: " + ", ".join(blocking))


if __name__ == "__main__":
    main()
