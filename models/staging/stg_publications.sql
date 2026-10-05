select
    cast(publication_id as varchar) as publication_id,
    cast(title_id as varchar) as title_id,
    cast(published_at as timestamp) as published_at,
    upper(trim(storefront_region)) as storefront_region
from {{ source('partner_platform', 'raw_publications') }}
