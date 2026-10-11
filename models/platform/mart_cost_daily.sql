-- One row per warehouse per day with a trailing seven-day baseline. A day is
-- flagged when it burns more than var('cost_anomaly_ratio') times that baseline.
with daily as (
    select
        warehouse_name,
        workload,
        usage_date,
        credits_used,
        cost_usd,
        avg(credits_used) over (
            partition by warehouse_name order by usage_date
            rows between 7 preceding and 1 preceding
        ) as trailing_7d_avg_credits,
        sum(credits_used) over (
            partition by warehouse_name, date_trunc('month', usage_date) order by usage_date
        ) as cumulative_credits_mtd
    from {{ ref('cost_warehouse_daily') }}
)

select
    warehouse_name,
    workload,
    usage_date,
    round(credits_used, 4) as credits_used,
    cost_usd,
    round(trailing_7d_avg_credits, 4) as trailing_7d_avg_credits,
    round(cumulative_credits_mtd, 4) as cumulative_credits_mtd,
    coalesce(credits_used > {{ var('cost_anomaly_ratio') }} * trailing_7d_avg_credits, false)
        as is_anomaly
from daily
