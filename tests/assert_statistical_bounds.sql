-- A generic proportion bound must enclose the descriptive rate and stay in [0, 100].
select partner_id
from {{ ref('mart_partner_statistical_diagnostics') }}
where wilson_lower_pct < 0 or wilson_upper_pct > 100
   or wilson_lower_pct > first_pass_approval_pct
   or first_pass_approval_pct > wilson_upper_pct
   or first_pass_approved_titles > titles_submitted
   or titles_published > titles_submitted
   or observed_publication_leads > titles_published
