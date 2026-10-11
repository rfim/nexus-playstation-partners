-- Allocated model credits must add back up to the metered dbt warehouse total.
with allocated as (
    select sum(credits_allocated_mtd) as credits from {{ ref('mart_cost_by_model') }}
),
metered as (
    select sum(credits_used) as credits
    from {{ ref('cost_warehouse_daily') }}
    where warehouse_name = 'NEXUS_DBT_WH'
        and usage_date >= date_trunc('month', date '{{ var("cost_as_of_date") }}')
)
select a.credits as allocated, m.credits as metered
from allocated a cross join metered m
where abs(a.credits - m.credits) > 0.01
