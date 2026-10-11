-- One row per warehouse: month-to-date credits against its resource-monitor
-- quota, and a straight-line run-rate forecast for the month end. Status uses
-- the monitor's own triggers: notify at 75%, suspend at 100%.
with month as (
    select
        date_trunc('month', date '{{ var("cost_as_of_date") }}') as month_start,
        extract(day from date '{{ var("cost_as_of_date") }}') as days_elapsed,
        extract(day from last_day(date '{{ var("cost_as_of_date") }}')) as days_in_month
),

usage as (
    select d.warehouse_name, sum(d.credits_used) as credits_used_mtd
    from {{ ref('cost_warehouse_daily') }} d
    cross join month
    where d.usage_date >= month.month_start
    group by d.warehouse_name
)

select
    b.warehouse_name,
    b.workload,
    b.resource_monitor,
    b.credit_quota,
    round(coalesce(u.credits_used_mtd, 0), 3) as credits_used_mtd,
    round(coalesce(u.credits_used_mtd, 0) * {{ var('credit_price_usd') }}, 2) as cost_usd_mtd,
    round(100 * coalesce(u.credits_used_mtd, 0) / b.credit_quota, 1) as pct_of_budget_used,
    round(coalesce(u.credits_used_mtd, 0) / month.days_elapsed * month.days_in_month, 3)
        as forecast_credits_month_end,
    round(100 * coalesce(u.credits_used_mtd, 0) / month.days_elapsed * month.days_in_month
        / b.credit_quota, 1) as forecast_pct_of_budget,
    case
        when coalesce(u.credits_used_mtd, 0) >= b.credit_quota then 'suspended'
        when coalesce(u.credits_used_mtd, 0) / month.days_elapsed * month.days_in_month
            >= b.credit_quota then 'forecast_over'
        when coalesce(u.credits_used_mtd, 0) >= 0.75 * b.credit_quota then 'notify'
        else 'ok'
    end as budget_status
from {{ ref('platform_warehouse_budget') }} b
cross join month
left join usage u on b.warehouse_name = u.warehouse_name
