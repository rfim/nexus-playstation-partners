-- Month-to-date credits attributed to each user and role, shaped like
-- ACCOUNT_USAGE.QUERY_ATTRIBUTION_HISTORY. Idle warehouse time is never
-- attributed to a query, so attributed credits stay below metered compute.
with attributed as (
    select
        warehouse_name,
        user_name,
        role_name,
        sum(query_count) as query_count,
        sum(credits_attributed) as credits_attributed
    from {{ ref('platform_query_attribution') }}
    where cast(usage_date as date) between date_trunc('month', date '{{ var("cost_as_of_date") }}')
        and date '{{ var("cost_as_of_date") }}'
    group by all
)

select
    a.warehouse_name,
    a.user_name,
    a.role_name,
    a.query_count::bigint as query_count,
    round(a.credits_attributed, 4) as credits_attributed,
    round(a.credits_attributed * {{ var('credit_price_usd') }}, 2) as cost_usd,
    round(100 * a.credits_attributed
        / sum(a.credits_attributed) over (partition by a.warehouse_name), 1) as pct_of_warehouse_attributed,
    round(1000 * a.credits_attributed / nullif(a.query_count, 0), 4) as credits_per_1k_queries
from attributed a
