select
    cast(partner_id as varchar) as partner_id,
    trim(partner_name) as partner_name,
    upper(trim(region)) as region,
    trim(partner_tier) as partner_tier,
    cast(updated_at as timestamp) as updated_at
from {{ source('partner_platform', 'raw_partners') }}
