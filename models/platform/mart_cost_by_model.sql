-- Month-to-date dbt warehouse credits allocated to each model. Each day's
-- NEXUS_DBT_WH credits are split across that day's model runs in proportion
-- to execution time, the same signal a dbt on-run-end hook would log.
with runs as (
    select
        cast(run_date as date) as run_date,
        model_name,
        execution_seconds
    from {{ ref('platform_dbt_model_runs') }}
    where cast(run_date as date) between date_trunc('month', date '{{ var("cost_as_of_date") }}')
        and date '{{ var("cost_as_of_date") }}'
),

allocated as (
    select
        r.run_date,
        r.model_name,
        r.execution_seconds,
        d.credits_used * r.execution_seconds
            / sum(r.execution_seconds) over (partition by r.run_date) as credits_allocated
    from runs r
    join {{ ref('cost_warehouse_daily') }} d
        on d.usage_date = r.run_date and d.warehouse_name = 'NEXUS_DBT_WH'
)

select
    model_name,
    count(*)::bigint as runs,
    round(avg(execution_seconds), 2) as avg_execution_seconds,
    round(max(execution_seconds), 2) as max_execution_seconds,
    round(sum(credits_allocated), 4) as credits_allocated_mtd,
    round(sum(credits_allocated) * {{ var('credit_price_usd') }}, 2) as cost_usd_mtd,
    round(100 * sum(credits_allocated) / sum(sum(credits_allocated)) over (), 1) as pct_of_dbt_cost
from allocated
group by model_name
