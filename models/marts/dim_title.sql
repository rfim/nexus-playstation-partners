select title_id, partner_id, title_name, platform, planned_release_at
from {{ ref('stg_titles') }}
