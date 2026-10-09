-- Every health component and the score itself stay within [0, 1], and Wilson bounds stay ordered.
select partner_id, health_score
from {{ ref('mart_partner_health') }}
where health_score not between 0 and 1
   or first_pass_wilson_lower not between 0 and 1
   or first_pass_wilson_upper not between 0 and 1
   or first_pass_wilson_lower > first_pass_wilson_upper
   or recency_component not between 0 and 1
   or shelf_conversion_component not between 0 and 1
