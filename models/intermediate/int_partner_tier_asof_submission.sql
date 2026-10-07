-- A snapshot begins at its first captured version. Do not fill earlier events with today's tier.
select
    s.submission_id,
    s.partner_id,
    s.submitted_at,
    h.partner_tier as tier_at_submission,
    h.dbt_valid_from as tier_valid_from,
    h.dbt_valid_to as tier_valid_to,
    case when h.partner_id is null then 0 else 1 end as tier_history_available
from {{ ref('int_submission_lifecycle') }} s
left join {{ ref('partner_tier_history') }} h
    on s.partner_id = h.partner_id
   and s.submitted_at >= h.dbt_valid_from
   and (h.dbt_valid_to is null or s.submitted_at < h.dbt_valid_to)
