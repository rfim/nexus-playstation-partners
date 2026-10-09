select
    s.submission_id,
    s.title_id,
    t.partner_id,
    s.submitted_at,
    s.reviewed_at,
    s.status,
    s.build_version,
    s.return_reason,
    row_number() over (
        partition by s.title_id
        order by s.submitted_at, s.submission_id
    ) as attempt_number,
    {{ review_hours('s.submitted_at', 's.reviewed_at') }} as review_hours
from {{ ref('stg_submissions') }} s
join {{ ref('stg_titles') }} t on s.title_id = t.title_id
