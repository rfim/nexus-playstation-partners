select
    cast(title_id as varchar) as title_id,
    cast(partner_id as varchar) as partner_id,
    trim(title_name) as title_name,
    upper(trim(platform)) as platform,
    cast(planned_release_at as date) as planned_release_at
from {{ source('partner_platform', 'raw_titles') }}
