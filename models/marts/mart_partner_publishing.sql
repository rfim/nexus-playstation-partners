select
    p.partner_id,
    p.partner_name,
    p.region,
    sum(case when o.submission_attempts > 0 then 1 else 0 end) as titles_submitted,
    sum(o.first_pass_approved) as first_pass_approved_titles,
    sum(case when o.published_regions > 0 then 1 else 0 end) as titles_published,
    sum(o.published_regions) as published_storefront_regions,
    sum(o.submission_attempts) as submission_attempts,
    sum(o.reviewed_attempts) as reviewed_attempts,
    sum(o.review_hours_total) as review_hours_total,
    round(100.0 * sum(o.first_pass_approved)
        / nullif(sum(case when o.submission_attempts > 0 then 1 else 0 end), 0), 1)
        as first_pass_approval_pct,
    round(sum(o.review_hours_total) / nullif(sum(o.reviewed_attempts), 0), 1)
        as avg_review_hours,
    round(avg(o.publication_lead_days), 1) as avg_publication_lead_days
from {{ ref('dim_partner') }} p
join {{ ref('int_title_outcomes') }} o on p.partner_id = o.partner_id
group by p.partner_id, p.partner_name, p.region
