select
    cast(submission_id as varchar) as submission_id,
    cast(title_id as varchar) as title_id,
    cast(submitted_at as timestamp) as submitted_at,
    cast(reviewed_at as timestamp) as reviewed_at,
    lower(trim(status)) as status,
    cast(build_version as integer) as build_version,
    nullif(lower(trim(cast(return_reason as varchar))), '') as return_reason
from {{ source('partner_platform', 'raw_submissions') }}
