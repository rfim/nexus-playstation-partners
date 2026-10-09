select
    submission_id,
    title_id,
    partner_id,
    submitted_at,
    reviewed_at,
    status,
    build_version,
    return_reason,
    attempt_number,
    review_hours
from {{ ref('int_submission_lifecycle') }}
