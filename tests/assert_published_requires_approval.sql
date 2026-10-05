select title_id
from {{ ref('int_title_outcomes') }}
where published_regions > 0 and ever_approved = 0
