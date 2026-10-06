"""Export deterministic synthetic dbt results to the static website."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
DATABASE = ROOT / "target" / "nexus_partner_analytics.duckdb"
OUTPUT = ROOT / "assets" / "metrics.json"


def build() -> dict:
    with duckdb.connect(str(DATABASE), read_only=True) as con:
        rows = con.execute("""
            select partner_id, partner_name, region, titles_submitted,
                   first_pass_approved_titles, titles_published,
                   submission_attempts, first_pass_approval_pct,
                   avg_review_hours, avg_publication_lead_days
            from main.mart_partner_publishing order by partner_id
        """).fetchall()
        review_rows = con.execute("""
            select submission_id, title_id, partner_id,
                   strftime(submitted_at, '%Y-%m-%dT%H:%M:%S') as submitted_at,
                   status, attempt_number, review_hours,
                   prior_partner_review_count, prior_partner_avg_review_hours
            from main.int_partner_review_features
            where review_hours is not null
            order by submitted_at, submission_id
        """).fetchall()
        publication_rows = con.execute("""
            select title_id, partner_id,
                   strftime(approved_at, '%Y-%m-%dT%H:%M:%S') as approved_at,
                   approval_attempt_number, prior_partner_published_titles,
                   prior_partner_avg_handoff_hours,
                   strftime(first_published_at, '%Y-%m-%dT%H:%M:%S') as first_published_at,
                   published_regions, observed_handoff_hours
            from main.int_title_publication_features
            order by approved_at, title_id
        """).fetchall()
    partners = [
        dict(zip(("partner_id", "partner_name", "region", "titles_submitted",
                  "first_pass_approved_titles", "titles_published", "submission_attempts",
                  "first_pass_approval_pct", "avg_review_hours",
                  "avg_publication_lead_days"), row))
        for row in rows
    ]
    submitted = sum(row["titles_submitted"] for row in partners)
    first_pass = sum(row["first_pass_approved_titles"] for row in partners)
    review_events = [
        dict(zip(("submission_id", "title_id", "partner_id", "submitted_at",
                  "status", "attempt_number", "review_hours",
                  "prior_partner_review_count", "prior_partner_avg_review_hours"), row))
        for row in review_rows
    ]
    publication_events = [
        dict(zip(("title_id", "partner_id", "approved_at", "approval_attempt_number",
                  "prior_partner_published_titles", "prior_partner_avg_handoff_hours",
                  "first_published_at", "published_regions", "observed_handoff_hours"), row))
        for row in publication_rows
    ]
    return {
        "scope": "Synthetic portfolio data; no PlayStation or Lifepal records",
        "metric_version": 3,
        "totals": {
            "titles_submitted": submitted,
            "first_pass_approved_titles": first_pass,
            "titles_published": sum(row["titles_published"] for row in partners),
            "submission_attempts": sum(row["submission_attempts"] for row in partners),
            "first_pass_approval_pct": round(100 * first_pass / submitted, 1),
        },
        "partners": partners,
        "review_events": review_events,
        "publication_events": publication_events,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = json.dumps(build(), indent=2, ensure_ascii=False) + "\n"
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != rendered:
            raise SystemExit("assets/metrics.json is stale; run scripts/export_metrics.py")
        print("metrics.json matches the dbt output")
    else:
        OUTPUT.write_text(rendered)
        print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
