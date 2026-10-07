-- A separate invented two-cohort teaching fixture, never an estimate from operational titles.
with period_means as (
    select cohort,
        case when week_number <= 4 then 'pre' else 'post' end as period,
        avg(first_pass_rate_pct) as mean_rate_pct
    from {{ ref('hypothetical_workflow_weeks') }}
    group by cohort, period
), means as (
    select
        max(case when cohort = 'treated' and period = 'pre' then mean_rate_pct end) as treated_pre_pct,
        max(case when cohort = 'treated' and period = 'post' then mean_rate_pct end) as treated_post_pct,
        max(case when cohort = 'comparison' and period = 'pre' then mean_rate_pct end) as comparison_pre_pct,
        max(case when cohort = 'comparison' and period = 'post' then mean_rate_pct end) as comparison_post_pct
    from period_means
), placebo_halves as (
    select cohort,
        case when week_number <= 2 then 'early' else 'late' end as half,
        avg(first_pass_rate_pct) as mean_rate_pct
    from {{ ref('hypothetical_workflow_weeks') }}
    where week_number <= 4
    group by cohort, half
), placebo as (
    select
        max(case when cohort = 'treated' and half = 'early' then mean_rate_pct end) as treated_early_pct,
        max(case when cohort = 'treated' and half = 'late' then mean_rate_pct end) as treated_late_pct,
        max(case when cohort = 'comparison' and half = 'early' then mean_rate_pct end) as comparison_early_pct,
        max(case when cohort = 'comparison' and half = 'late' then mean_rate_pct end) as comparison_late_pct
    from placebo_halves
), pretrend_slopes as (
    select cohort, regr_slope(first_pass_rate_pct, week_number) as slope_pp_per_week
    from {{ ref('hypothetical_workflow_weeks') }}
    where week_number <= 4
    group by cohort
), pretrend as (
    select
        max(case when cohort = 'treated' then slope_pp_per_week end) as treated_pre_slope,
        max(case when cohort = 'comparison' then slope_pp_per_week end) as comparison_pre_slope
    from pretrend_slopes
), time_gap as (
    select avg(case when week_number > 4 then week_number end)
         - avg(case when week_number <= 4 then week_number end) as pre_post_mean_week_gap
    from {{ ref('hypothetical_workflow_weeks') }}
    where cohort = 'treated'
), result as (
    select
        m.*,
        round({{ difference_in_differences('m.treated_pre_pct', 'm.treated_post_pct', 'm.comparison_pre_pct', 'm.comparison_post_pct') }}, 1) as did_pp,
        round({{ difference_in_differences('p.treated_early_pct', 'p.treated_late_pct', 'p.comparison_early_pct', 'p.comparison_late_pct') }}, 1) as pre_period_placebo_pp,
        round(t.treated_pre_slope - t.comparison_pre_slope, 1) as pretrend_slope_gap_pp_per_week,
        g.pre_post_mean_week_gap,
        round({{ difference_in_differences('m.treated_pre_pct', 'm.treated_post_pct', 'm.comparison_pre_pct', 'm.comparison_post_pct') }} - g.pre_post_mean_week_gap, 1) as effect_if_1pp_week_drift
    from means m cross join placebo p cross join pretrend t cross join time_gap g
)
select * from result
