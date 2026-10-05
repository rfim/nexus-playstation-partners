select submission_id
from {{ ref('fct_submission') }}
where reviewed_at < submitted_at
