{#- One row per title: where it stands between approval and a storefront at a fixed clock.
    Events after var('opportunity_as_of_date') are treated as not yet observed. -#}
{%- set as_of = "cast('" ~ var('opportunity_as_of_date') ~ "' as date)" -%}

with approvals as (
    select
        title_id,
        min(case when status = 'approved' then reviewed_at end) as approved_at
    from {{ ref('int_submission_lifecycle') }}
    where cast(reviewed_at as date) <= {{ as_of }}
    group by title_id
), observed as (
    select
        o.title_id,
        o.partner_id,
        t.title_name,
        o.planned_release_at,
        o.submission_attempts,
        a.approved_at,
        case when cast(o.first_published_at as date) <= {{ as_of }}
            then o.first_published_at end as first_published_at
    from {{ ref('int_title_outcomes') }} o
    join {{ ref('stg_titles') }} t on o.title_id = t.title_id
    left join approvals a on o.title_id = a.title_id
)
select
    title_id,
    partner_id,
    title_name,
    {{ as_of }} as as_of_date,
    planned_release_at,
    approved_at,
    first_published_at,
    case
        when first_published_at is not null then 'published'
        when approved_at is not null then 'approved_waiting'
        when submission_attempts > 0 then 'in_review'
        else 'not_submitted'
    end as shelf_status,
    -- Days of slack between approval and the planned release date.
    case when approved_at is not null
        then date_diff('day', cast(approved_at as date), planned_release_at)
    end as approval_buffer_days,
    -- Approved but not yet on any storefront: days spent waiting so far.
    case when approved_at is not null and first_published_at is null
        then date_diff('day', cast(approved_at as date), {{ as_of }})
    end as days_waiting_as_of,
    case when first_published_at is null
        then date_diff('day', {{ as_of }}, planned_release_at)
    end as days_to_planned_release_as_of
from observed
