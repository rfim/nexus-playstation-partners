-- Descriptive diagnostics only. Wilson bounds illustrate sampling uncertainty under
-- independent Bernoulli trials; these deterministic synthetic titles are not such a sample.
with title_scope as (
    select partner_id, first_pass_approved, published_regions, publication_lead_days
    from {{ ref('int_title_outcomes') }} where submission_attempts > 0
    union all
    select 'ALL', first_pass_approved, published_regions, publication_lead_days
    from {{ ref('int_title_outcomes') }} where submission_attempts > 0
), title_counts as (
    select partner_id, count(*) as titles_submitted,
        sum(first_pass_approved) as first_pass_approved_titles,
        sum(case when published_regions > 0 then 1 else 0 end) as titles_published
    from title_scope group by partner_id
), review_scope as (
    select partner_id, review_hours from {{ ref('int_submission_lifecycle') }}
    where review_hours is not null
    union all
    select 'ALL', review_hours from {{ ref('int_submission_lifecycle') }}
    where review_hours is not null
), review_stats as (
    select partner_id, count(*) as reviewed_attempts,
        round(avg(review_hours), 1) as mean_review_hours,
        round(quantile_cont(review_hours, 0.25), 1) as q1_review_hours,
        round(quantile_cont(review_hours, 0.50), 1) as median_review_hours,
        round(quantile_cont(review_hours, 0.75), 1) as q3_review_hours,
        round(quantile_cont(review_hours, 0.90), 1) as p90_review_hours
    from review_scope group by partner_id
), lead_stats as (
    select partner_id, count(*) as observed_publication_leads,
        round(avg(publication_lead_days), 1) as mean_lead_days,
        round(quantile_cont(publication_lead_days, 0.50), 1) as median_lead_days
    from title_scope where publication_lead_days is not null
    group by partner_id
), tier_scope as (
    select partner_id, tier_history_available
    from {{ ref('int_partner_tier_asof_submission') }}
    union all
    select 'ALL', tier_history_available
    from {{ ref('int_partner_tier_asof_submission') }}
), tier_stats as (
    select partner_id, count(*) as submission_events,
        sum(tier_history_available) as tier_history_covered_events
    from tier_scope group by partner_id
), rates as (
    select *, {{ safe_ratio('first_pass_approved_titles', 'titles_submitted') }} as approval_fraction
    from title_counts
)
select
    r.partner_id, r.titles_submitted, r.first_pass_approved_titles,
    round(100.0 * r.approval_fraction, 1) as first_pass_approval_pct,
    round(100.0 * {{ wilson_score_bound('r.approval_fraction', 'r.titles_submitted', 'lower') }}, 1) as wilson_lower_pct,
    round(100.0 * {{ wilson_score_bound('r.approval_fraction', 'r.titles_submitted', 'upper') }}, 1) as wilson_upper_pct,
    r.titles_published, r.titles_submitted - r.titles_published as titles_without_publication,
    v.reviewed_attempts, v.mean_review_hours, v.q1_review_hours,
    v.median_review_hours, v.q3_review_hours, v.p90_review_hours,
    l.observed_publication_leads, l.mean_lead_days, l.median_lead_days,
    h.submission_events, h.tier_history_covered_events
from rates r
left join review_stats v on r.partner_id = v.partner_id
left join lead_stats l on r.partner_id = l.partner_id
left join tier_stats h on r.partner_id = h.partner_id
