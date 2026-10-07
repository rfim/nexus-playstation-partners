-- A version captured after a submission cannot become a historical feature.
select submission_id
from {{ ref('int_partner_tier_asof_submission') }}
where (tier_history_available = 1 and (tier_valid_from > submitted_at or (tier_valid_to is not null and tier_valid_to <= submitted_at)))
   or (tier_history_available = 0 and tier_at_submission is not null)
