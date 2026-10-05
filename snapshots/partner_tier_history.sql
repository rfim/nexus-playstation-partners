{% snapshot partner_tier_history %}
{{ config(target_schema='main', unique_key='partner_id', strategy='timestamp', updated_at='updated_at') }}
select partner_id, partner_tier, updated_at
from {{ source('partner_platform', 'raw_partners') }}
{% endsnapshot %}
