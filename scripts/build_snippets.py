"""Keep the site's code inspector tied to the actual repository files."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "snippets.json"
CODE_OUTPUT = ROOT / "assets" / "code.json"

# The SQL workspace's code browser: every dbt and pipeline file, by folder.
CODE_FOLDERS = (
    ("dbt project", ["dbt_project.yml", "profiles.yml", "requirements.txt"]),
    ("models/staging", ["models/staging/*"]),
    ("models/intermediate", ["models/intermediate/*"]),
    ("models/marts", ["models/marts/*"]),
    ("models/platform", ["models/platform/*"]),
    ("models", ["models/*.yml"]),
    ("snapshots", ["snapshots/*"]),
    ("macros", ["macros/*"]),
    ("tests", ["tests/*"]),
    ("seeds", ["seeds/*.yml"]),
    ("semantic", ["semantic/*"]),
    ("scripts", ["scripts/*.py"]),
    ("airflow", ["airflow/dags/*.py", "airflow/*.py", "airflow/tests/*.py", "airflow/README.md"]),
    ("ci", [".github/workflows/*"]),
    ("docs", ["docs/*"]),
)
LANGUAGES = {".sql": "sql", ".yml": "yaml", ".yaml": "yaml", ".py": "python", ".md": "md", ".txt": "text"}
BASE = "https://github.com/rfim/nexus-playstation-partners/blob/main/"

ITEMS = {
    "source": ("Source definitions and tests", "models/staging/sources.yml", "yaml", "Synthetic partner, title, review and publication sources with key and relationship tests."),
    "normalization": ("3NF to dimensional handoff", "docs/normalization.md", "md", "Functional dependencies, source keys, foreign keys and the move to title-grain and dimensional analytics."),
    "stage": ("Typed staging model", "models/staging/stg_submissions.sql", "sql", "One named place to cast times and standardise review status."),
    "snapshot": ("Partner tier snapshot", "snapshots/partner_tier_history.sql", "sql", "Timestamp strategy preserves partner-tier changes as history."),
    "asof": ("Tier at submission", "models/intermediate/int_partner_tier_asof_submission.sql", "sql", "An as-of join leaves pre-capture history unknown rather than using a future tier."),
    "wilson": ("Wilson score macro", "macros/wilson_score_bound.sql", "sql", "Reusable score-bound algebra for a binomial proportion, with an explicit sampling-design caveat."),
    "didMacro": ("Difference-in-differences macro", "macros/difference_in_differences.sql", "sql", "Reusable two-period contrast; identification requires separate design checks."),
    "diagnostics": ("Statistical diagnostics mart", "models/marts/mart_partner_statistical_diagnostics.sql", "sql", "Descriptive title, attempt, publication and snapshot-coverage diagnostics."),
    "didMart": ("Causal teaching model", "models/marts/mart_workflow_did_demo.sql", "sql", "A separate invented weekly cohort fixture calculates a DiD and pre-period placebo."),
    "lifecycle": ("Submission lifecycle", "models/intermediate/int_submission_lifecycle.sql", "sql", "Window ordering identifies each title's first attempt; the macro calculates review hours."),
    "title": ("One row per title", "models/intermediate/int_title_outcomes.sql", "sql", "Submission and publication streams aggregate separately before joining, preventing fanout."),
    "fact": ("Submission fact", "models/marts/fct_submission.sql", "sql", "A review-attempt grain for flexible downstream analysis."),
    "dimension": ("Partner dimension", "models/marts/dim_partner.sql", "sql", "A partner key with business-friendly attributes."),
    "mart": ("Partner publishing mart", "models/marts/mart_partner_publishing.sql", "sql", "Curated partner-level measures, with explicit denominators."),
    "shelf": ("Time to shelf", "models/marts/mart_title_time_to_shelf.sql", "sql", "One row per title at a fixed clock: approved but not yet on a storefront, days waiting and slack before planned release."),
    "resubmission": ("Resubmission cost", "models/marts/mart_resubmission_cost.sql", "sql", "One row per return reason: rejected attempts, reviewer hours and the days each rejection added."),
    "health": ("Partner health", "models/marts/mart_partner_health.sql", "sql", "An illustrative, bounded score from three transparent components; low-sample partners are flagged, not ranked."),
    "healthTest": ("Health bounds test", "tests/assert_partner_health_bounds.sql", "sql", "A singular test keeps every component and the score inside [0, 1] and the Wilson bounds ordered."),
    "semantic": ("Metric contract", "semantic/partner_metrics.yml", "yaml", "Versioned definitions and evidence requirements; a portfolio contract, not a deployed service."),
    "tests": ("Fanout assertion", "tests/assert_no_title_fanout.sql", "sql", "A singular dbt test fails if the one-row-per-title model changes its grain."),
    "exposure": ("Dashboard exposure", "models/marts/properties.yml", "yaml", "The dbt exposure links a proposed partner dashboard to its upstream mart."),
    "ci": ("Build on every change", ".github/workflows/ci.yml", "yaml", "GitHub Actions runs dbt build and checks generated site evidence."),
    "airflowDag": ("Airflow DAG (hypothetical)", "airflow/dags/nexus_partner_analytics.py", "python", "The same build on an Airflow 3 schedule: ingest, snapshot, layer-by-layer build and test, a test gate, then publish."),
    "groups": ("Ownership groups", "models/groups.yml", "yaml", "Two dbt groups own every model; dbt_project.yml assigns each layer a group, an access level and a default classification."),
    "contract": ("Enforced contracts", "models/marts/properties.yml", "yaml", "dim_partner, fct_submission and mart_partner_publishing declare column names, types and constraints; dbt refuses to build a model that drifts from its contract."),
    "costBudget": ("Budget against actual", "models/platform/mart_cost_budget_vs_actual.sql", "sql", "Month-to-date credits against each resource-monitor quota, a run-rate forecast and a status that follows the monitor's triggers."),
    "costByModel": ("Cost by dbt model", "models/platform/mart_cost_by_model.sql", "sql", "Each day's dbt warehouse credits split across that day's model runs by execution time; a singular test reconciles the total."),
    "costReconcile": ("Allocation reconciles", "tests/assert_cost_model_allocation_reconciles.sql", "sql", "Fails the build if allocated model credits drift from the metered dbt warehouse total."),
    "snowflakeCost": ("Snowflake translation", "docs/snowflake_cost_governance.sql", "sql", "Illustrative production SQL: warehouses, resource monitors and the ACCOUNT_USAGE views the seeds stand in for."),
    "platformExport": ("Lineage export and rules", "scripts/export_platform.py", "python", "Reads every ref() and source() from the dbt manifest and fails CI if a model reads nothing traceable or a declared input is unused."),
    "governanceExport": ("Governance export and rules", "scripts/export_governance.py", "python", "Reads the dbt manifest, writes assets/governance.json and fails CI when a model lacks an owner or classification, or a dashboard reads a non-public model."),
}


def build() -> dict:
    result = {}
    for key, (title, filename, language, description) in ITEMS.items():
        path = ROOT / filename
        result[key] = {
            "title": title,
            "filename": filename,
            "language": language,
            "description": description,
            "code": path.read_text(),
            "link": BASE + filename,
        }
    return result


def build_code() -> dict:
    folders = []
    for label, patterns in CODE_FOLDERS:
        paths = sorted({p for pattern in patterns for p in ROOT.glob(pattern) if p.is_file()})
        files = [
            {
                "path": path.relative_to(ROOT).as_posix(),
                "language": LANGUAGES.get(path.suffix, "text"),
                "code": path.read_text(),
            }
            for path in paths
        ]
        if files:
            folders.append({"folder": label, "files": files})
    return {"base": BASE, "folders": folders}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    outputs = {
        OUTPUT: json.dumps(build(), indent=2, ensure_ascii=False) + "\n",
        CODE_OUTPUT: json.dumps(build_code(), indent=1, ensure_ascii=False) + "\n",
    }
    if args.check:
        for path, rendered in outputs.items():
            if not path.exists() or path.read_text() != rendered:
                raise SystemExit(f"assets/{path.name} is stale; run scripts/build_snippets.py")
        print("snippets.json and code.json match repository source")
    else:
        for path, rendered in outputs.items():
            path.write_text(rendered)
            print(f"Wrote {path}")


if __name__ == "__main__":
    main()
