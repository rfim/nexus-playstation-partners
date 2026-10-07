-- The demo is stable arithmetic, not evidence of an identified treatment effect.
select did_pp, pre_period_placebo_pp
from {{ ref('mart_workflow_did_demo') }}
where did_pp <> 12 or pre_period_placebo_pp <> 0
   or pretrend_slope_gap_pp_per_week <> 0 or effect_if_1pp_week_drift <> 8
union all
select null, null
where (select count(*) from {{ ref('mart_workflow_did_demo') }}) <> 1
