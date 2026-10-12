"""Compile the stakeholder contracts into dbt tests and Great Expectations suites.

    python contracts/compile.py          # write tests/contracts/*.sql and contracts/gx/expectations/*.json
    python contracts/compile.py --check  # fail if the committed files differ from the contracts

Needs target/manifest.json (from `dbt parse`) to find dbt tests the project already has.
"""

from __future__ import annotations

import argparse
import json
import sys

from contract_plan import DBT_TESTS, GX_SUITES, ROOT, dbt_test, gx_suites, load


def render() -> dict:
    files = {}
    for contract in load():
        for rule in contract["rules"]:
            if rule["engine"] == "dbt":
                files[DBT_TESTS / f"{rule['test_name']}.sql"] = dbt_test(contract, rule)
        for name, suite in gx_suites(contract).items():
            files[GX_SUITES / f"{name}.json"] = json.dumps(suite, indent=2) + "\n"
    return files


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    files = render()
    current = set(DBT_TESTS.glob("*.sql")) | set(GX_SUITES.glob("*.json"))
    stale = sorted(
        [p for p, text in files.items() if not p.exists() or p.read_text() != text] + list(current - set(files))
    )
    if args.check:
        if stale:
            sys.exit("Contract tests are stale; run contracts/compile.py: "
                     + ", ".join(p.relative_to(ROOT).as_posix() for p in stale))
        print(f"{len(files)} generated contract files match the contracts")
        return
    for path in current - set(files):
        path.unlink()
    for path, text in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    dbt = sum(p.suffix == ".sql" for p in files)
    print(f"Wrote {dbt} dbt tests and {len(files) - dbt} GX suites")


if __name__ == "__main__":
    main()
