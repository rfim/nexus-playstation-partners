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
            select f.title_id, f.partner_id, t.title_name,
                   strftime(f.first_submitted_at, '%Y-%m-%dT%H:%M:%S') as first_submitted_at,
                   strftime(f.planned_release_at, '%Y-%m-%d') as planned_release_at,
                   strftime(approved_at, '%Y-%m-%dT%H:%M:%S') as approved_at,
                   approval_attempt_number, prior_partner_published_titles,
                   prior_partner_avg_handoff_hours,
                   prior_partner_published_at_submission,
                   prior_partner_avg_lead_days_at_submission,
                   strftime(first_published_at, '%Y-%m-%dT%H:%M:%S') as first_published_at,
                   published_regions, observed_handoff_hours, publication_lead_days
            from main.int_title_publication_features f
            join main.stg_titles t on f.title_id = t.title_id
            order by approved_at, f.title_id
        """).fetchall()
        diagnostics_query = con.execute("""
            select * from main.mart_partner_statistical_diagnostics order by partner_id
        """)
        diagnostic_columns = [column[0] for column in diagnostics_query.description]
        diagnostic_rows = [dict(zip(diagnostic_columns, row)) for row in diagnostics_query.fetchall()]
        did_query = con.execute("select * from main.mart_workflow_did_demo")
        did_columns = [column[0] for column in did_query.description]
        did_demo = dict(zip(did_columns, did_query.fetchone()))
        cohort_query = con.execute("""
            select week_number,
                max(case when cohort = 'treated' then first_pass_rate_pct end) as treated_rate_pct,
                max(case when cohort = 'comparison' then first_pass_rate_pct end) as comparison_rate_pct
            from main.hypothetical_workflow_weeks
            group by week_number order by week_number
        """)
        cohort_columns = [column[0] for column in cohort_query.description]
        did_demo["weeks"] = [dict(zip(cohort_columns, row)) for row in cohort_query.fetchall()]
        business_potential = export_business_potential(con)
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
        dict(zip(("title_id", "partner_id", "title_name", "first_submitted_at",
                  "planned_release_at", "approved_at", "approval_attempt_number",
                  "prior_partner_published_titles", "prior_partner_avg_handoff_hours",
                  "prior_partner_published_at_submission", "prior_partner_avg_lead_days_at_submission",
                  "first_published_at", "published_regions", "observed_handoff_hours",
                  "publication_lead_days"), row))
        for row in publication_rows
    ]
    return {
        "scope": "Synthetic portfolio data; no PlayStation or Lifepal records",
        "metric_version": 6,
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
        "statistics": {
            "overall": next(row for row in diagnostic_rows if row["partner_id"] == "ALL"),
            "partners": [row for row in diagnostic_rows if row["partner_id"] != "ALL"],
        },
        "causal_demo": did_demo,
        "business_potential": business_potential,
    }


def _rows(con, sql: str) -> list[dict]:
    query = con.execute(sql)
    columns = [column[0] for column in query.description]
    return [dict(zip(columns, row)) for row in query.fetchall()]


def export_business_potential(con) -> dict:
    """Opportunity marts for section 07. Calculator defaults come from the marts where they have a value."""
    shelf = _rows(con, """
        select title_id, partner_id, title_name,
               strftime(as_of_date, '%Y-%m-%d') as as_of_date,
               strftime(planned_release_at, '%Y-%m-%d') as planned_release_at,
               strftime(approved_at, '%Y-%m-%dT%H:%M:%S') as approved_at,
               strftime(first_published_at, '%Y-%m-%dT%H:%M:%S') as first_published_at,
               shelf_status, approval_buffer_days, days_waiting_as_of,
               days_to_planned_release_as_of
        from main.mart_title_time_to_shelf order by title_id
    """)
    resubmission = _rows(con, """
        select return_reason, rejected_attempts, titles_affected, partners_affected,
               cast(reviewer_hours as integer) as reviewer_hours, avg_days_added,
               cast(rejections_without_resubmission as integer) as rejections_without_resubmission,
               share_of_rejected_attempts
        from main.mart_resubmission_cost
        order by rejected_attempts desc, return_reason
    """)
    health = _rows(con, """
        select partner_id, partner_name, titles_submitted, first_pass_approved_titles,
               first_pass_rate, first_pass_wilson_lower, first_pass_wilson_upper,
               titles_approved, titles_published, titles_awaiting_shelf,
               days_since_last_submission, recency_component,
               shelf_conversion_component, health_score, is_low_sample
        from main.mart_partner_health order by health_score, partner_id
    """)
    for row in health:
        for key in ("titles_submitted", "first_pass_approved_titles", "titles_approved",
                    "titles_published", "titles_awaiting_shelf"):
            row[key] = int(row[key])
    rejected = sum(row["rejected_attempts"] for row in resubmission)
    hours = sum(row["reviewer_hours"] for row in resubmission)
    days_added = sum(row["avg_days_added"] * row["rejected_attempts"] for row in resubmission)
    return {
        "as_of_date": shelf[0]["as_of_date"] if shelf else None,
        "summary": {
            "titles": len(shelf),
            "titles_awaiting_shelf": sum(row["shelf_status"] == "approved_waiting" for row in shelf),
            "rejected_attempts": rejected,
            "rejected_reviewer_hours": hours,
            "top_return_reason": resubmission[0]["return_reason"] if resubmission else None,
            "lowest_health_partner": health[0]["partner_id"] if health else None,
        },
        "calculator_defaults": {
            "titles_per_year": 400,
            "first_pass_uplift_points": 10,
            "reviewer_hours_per_attempt": round(hours / rejected) if rejected else None,
            "days_added_per_resubmission": round(days_added / rejected) if rejected else None,
            "derived_from_mart": ["reviewer_hours_per_attempt", "days_added_per_resubmission"],
        },
        "shelf": shelf,
        "resubmission": resubmission,
        "health": health,
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
