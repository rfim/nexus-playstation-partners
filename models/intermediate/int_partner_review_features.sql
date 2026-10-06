-- Features available when a submission arrives: only earlier completed reviews count.
with prior_reviews as (
    select
        current_submission.submission_id,
        count(history.submission_id) as prior_partner_review_count,
        round(avg(history.review_hours), 1) as prior_partner_avg_review_hours
    from {{ ref('int_submission_lifecycle') }} current_submission
    left join {{ ref('int_submission_lifecycle') }} history
        on history.partner_id = current_submission.partner_id
       and history.reviewed_at < current_submission.submitted_at
    group by current_submission.submission_id
)

select
    current_submission.submission_id,
    current_submission.title_id,
    current_submission.partner_id,
    current_submission.submitted_at,
    current_submission.reviewed_at,
    current_submission.status,
    current_submission.attempt_number,
    current_submission.review_hours,
    prior_reviews.prior_partner_review_count,
    prior_reviews.prior_partner_avg_review_hours
from {{ ref('int_submission_lifecycle') }} current_submission
join prior_reviews
    on current_submission.submission_id = prior_reviews.submission_id
