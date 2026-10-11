-- Daily credit burn per warehouse, shaped like Snowflake's
-- ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY rolled up to a day.
select
    m.warehouse_name,
    b.workload,
    cast(m.usage_date as date) as usage_date,
    m.credits_used_compute,
    m.credits_used_cloud_services,
    m.credits_used_compute + m.credits_used_cloud_services as credits_used,
    round((m.credits_used_compute + m.credits_used_cloud_services)
        * {{ var('credit_price_usd') }}, 2) as cost_usd
from {{ ref('platform_warehouse_metering') }} m
join {{ ref('platform_warehouse_budget') }} b on m.warehouse_name = b.warehouse_name
where cast(m.usage_date as date) <= date '{{ var("cost_as_of_date") }}'
