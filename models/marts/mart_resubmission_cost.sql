{#- One row per return reason: what rejected attempts cost reviewers and partners.
    Days added runs from the rejected submission to the partner's next submission of the same title. -#}

with attempts as (
    select
        *,
        lead(submitted_at) over (
            partition by title_id
            order by attempt_number
        ) as next_submitted_at
    from {{ ref('int_submission_lifecycle') }}
), rejected as (
    select * from attempts where status = 'rejected'
)
select
    return_reason,
    count(*) as rejected_attempts,
    count(distinct title_id) as titles_affected,
    count(distinct partner_id) as partners_affected,
    sum(review_hours) as reviewer_hours,
    round(avg(date_diff('hour', submitted_at, next_submitted_at)) / 24.0, 1)
        as avg_days_added,
    sum(case when next_submitted_at is null then 1 else 0 end)
        as rejections_without_resubmission,
    round({{ safe_ratio('count(*)', 'sum(count(*)) over ()') }}, 3)
        as share_of_rejected_attempts
from rejected
group by return_reason
