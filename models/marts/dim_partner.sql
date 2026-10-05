select partner_id, partner_name, region, partner_tier
from {{ ref('stg_partners') }}
