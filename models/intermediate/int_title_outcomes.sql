with submissions as (
    select
        title_id,
        count(*) as submission_attempts,
        sum(case when reviewed_at is not null then 1 else 0 end) as reviewed_attempts,
        sum(coalesce(review_hours, 0)) as review_hours_total,
        min(submitted_at) as first_submitted_at,
        max(case when attempt_number = 1 and status = 'approved' then 1 else 0 end)
            as first_pass_approved,
        max(case when status = 'approved' then 1 else 0 end) as ever_approved
    from {{ ref('int_submission_lifecycle') }}
    group by title_id
), publications as (
    select
        title_id,
        count(distinct storefront_region) as published_regions,
        min(published_at) as first_published_at
    from {{ ref('stg_publications') }}
    group by title_id
)
select
    t.title_id,
    t.partner_id,
    t.planned_release_at,
    coalesce(s.submission_attempts, 0) as submission_attempts,
    coalesce(s.reviewed_attempts, 0) as reviewed_attempts,
    coalesce(s.review_hours_total, 0) as review_hours_total,
    coalesce(s.first_pass_approved, 0) as first_pass_approved,
    coalesce(s.ever_approved, 0) as ever_approved,
    coalesce(p.published_regions, 0) as published_regions,
    s.first_submitted_at,
    p.first_published_at,
    case when p.first_published_at is not null and s.first_submitted_at is not null
        then date_diff('day', s.first_submitted_at, p.first_published_at)
    end as publication_lead_days
from {{ ref('stg_titles') }} t
left join submissions s on t.title_id = s.title_id
left join publications p on t.title_id = p.title_id
