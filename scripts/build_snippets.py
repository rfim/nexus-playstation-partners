"""Keep the site's code inspector tied to the actual repository files."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "snippets.json"
BASE = "https://github.com/rfim/nexus-playstation-partners/blob/main/"

ITEMS = {
    "source": ("Source contract", "models/staging/sources.yml", "yaml", "Synthetic partner, title, review and publication sources with key and relationship tests."),
    "stage": ("Typed staging model", "models/staging/stg_submissions.sql", "sql", "One named place to cast times and standardise review status."),
    "snapshot": ("Partner tier snapshot", "snapshots/partner_tier_history.sql", "sql", "Timestamp strategy preserves partner-tier changes as history."),
    "lifecycle": ("Submission lifecycle", "models/intermediate/int_submission_lifecycle.sql", "sql", "Window ordering identifies each title's first attempt; the macro calculates review hours."),
    "title": ("One row per title", "models/intermediate/int_title_outcomes.sql", "sql", "Submission and publication streams aggregate separately before joining, preventing fanout."),
    "fact": ("Submission fact", "models/marts/fct_submission.sql", "sql", "A review-attempt grain for flexible downstream analysis."),
    "dimension": ("Partner dimension", "models/marts/dim_partner.sql", "sql", "A partner key with business-friendly attributes."),
    "mart": ("Partner publishing mart", "models/marts/mart_partner_publishing.sql", "sql", "Curated partner-level measures, with explicit denominators."),
    "semantic": ("Metric contract", "semantic/partner_metrics.yml", "yaml", "Versioned definitions and evidence requirements; a portfolio contract, not a deployed service."),
    "tests": ("Fanout assertion", "tests/assert_no_title_fanout.sql", "sql", "A singular dbt test fails if the one-row-per-title model changes its grain."),
    "exposure": ("Dashboard exposure", "models/marts/properties.yml", "yaml", "The dbt exposure links a proposed partner dashboard to its upstream mart."),
    "ci": ("Build on every change", ".github/workflows/ci.yml", "yaml", "GitHub Actions runs dbt build and checks generated site evidence."),
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = json.dumps(build(), indent=2, ensure_ascii=False) + "\n"
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != rendered:
            raise SystemExit("assets/snippets.json is stale; run scripts/build_snippets.py")
        print("snippets.json matches repository source")
    else:
        OUTPUT.write_text(rendered)
        print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
