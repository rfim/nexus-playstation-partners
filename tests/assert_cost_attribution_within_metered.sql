-- Query attribution excludes idle time, so it can never exceed metered compute.
with attributed as (
    select warehouse_name, sum(credits_attributed) as credits
    from {{ ref('mart_cost_by_user') }}
    group by warehouse_name
),
metered as (
    select warehouse_name, sum(credits_used_compute) as credits
    from {{ ref('cost_warehouse_daily') }}
    where usage_date >= date_trunc('month', date '{{ var("cost_as_of_date") }}')
    group by warehouse_name
)
select a.warehouse_name, a.credits as attributed, m.credits as metered
from attributed a join metered m using (warehouse_name)
where a.credits > m.credits + 0.0001
