{#- One row per partner: an illustrative, transparent health score in [0, 1].
    Three equally weighted components, each bounded in [0, 1]:
      1. first-pass approval, taken at its Wilson lower bound so small samples earn little credit;
      2. recency of the last submission within var('health_recency_window_days');
      3. shelf conversion: published titles over approved titles.
    The weights are a starting point for discussion with partner managers, not a validated model.
    Partners below var('health_min_titles') are flagged and should be watched, not ranked. -#}
{%- set as_of = "cast('" ~ var('opportunity_as_of_date') ~ "' as date)" -%}

with titles as (
    select
        partner_id,
        sum(case when submission_attempts > 0 then 1 else 0 end) as titles_submitted,
        sum(first_pass_approved) as first_pass_approved_titles
    from {{ ref('int_title_outcomes') }}
    group by partner_id
), shelf as (
    select
        partner_id,
        sum(case when approved_at is not null then 1 else 0 end) as titles_approved,
        sum(case when shelf_status = 'published' then 1 else 0 end) as titles_published,
        sum(case when shelf_status = 'approved_waiting' then 1 else 0 end) as titles_awaiting_shelf,
        max(first_published_at) as last_published_at
    from {{ ref('mart_title_time_to_shelf') }}
    group by partner_id
), activity as (
    select partner_id, max(submitted_at) as last_submitted_at
    from {{ ref('int_submission_lifecycle') }}
    where cast(submitted_at as date) <= {{ as_of }}
    group by partner_id
), measured as (
    select
        p.partner_id,
        p.partner_name,
        t.titles_submitted,
        t.first_pass_approved_titles,
        {{ safe_ratio('t.first_pass_approved_titles', 't.titles_submitted') }} as first_pass_rate,
        s.titles_approved,
        s.titles_published,
        s.titles_awaiting_shelf,
        a.last_submitted_at,
        s.last_published_at,
        date_diff('day', cast(a.last_submitted_at as date), {{ as_of }}) as days_since_last_submission
    from {{ ref('dim_partner') }} p
    join titles t on p.partner_id = t.partner_id
    left join shelf s on p.partner_id = s.partner_id
    left join activity a on p.partner_id = a.partner_id
), components as (
    select
        *,
        greatest(0.0, {{ wilson_score_bound('first_pass_rate', 'titles_submitted', 'lower') }})
            as first_pass_wilson_lower,
        least(1.0, {{ wilson_score_bound('first_pass_rate', 'titles_submitted', 'upper') }})
            as first_pass_wilson_upper,
        greatest(0.0, 1.0 - days_since_last_submission * 1.0
            / {{ var('health_recency_window_days') }}) as recency_component,
        coalesce({{ safe_ratio('titles_published', 'titles_approved') }}, 0.0)
            as shelf_conversion_component
    from measured
)
select
    partner_id,
    partner_name,
    {{ as_of }} as as_of_date,
    titles_submitted,
    first_pass_approved_titles,
    round(first_pass_rate, 3) as first_pass_rate,
    round(first_pass_wilson_lower, 3) as first_pass_wilson_lower,
    round(first_pass_wilson_upper, 3) as first_pass_wilson_upper,
    titles_approved,
    titles_published,
    titles_awaiting_shelf,
    days_since_last_submission,
    round(recency_component, 3) as recency_component,
    round(shelf_conversion_component, 3) as shelf_conversion_component,
    round((first_pass_wilson_lower + recency_component + shelf_conversion_component) / 3.0, 3)
        as health_score,
    titles_submitted < {{ var('health_min_titles') }} as is_low_sample
from components
