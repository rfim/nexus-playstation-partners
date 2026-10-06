with approvals as (
    select
        title_id,
        partner_id,
        min(reviewed_at) as approved_at,
        min(attempt_number) as approval_attempt_number
    from {{ ref('int_submission_lifecycle') }}
    where status = 'approved' and reviewed_at is not null
    group by title_id, partner_id
), handoffs as (
    select
        a.title_id,
        a.partner_id,
        a.approved_at,
        a.approval_attempt_number,
        o.first_submitted_at,
        o.planned_release_at,
        o.publication_lead_days,
        o.first_published_at,
        o.published_regions,
        case when o.first_published_at is not null
            then date_diff('hour', a.approved_at, o.first_published_at)
        end as observed_handoff_hours
    from approvals a
    join {{ ref('int_title_outcomes') }} o on a.title_id = o.title_id
), prior_approval_history as (
    select
        current_title.title_id,
        count(prior_title.title_id) as prior_partner_published_titles,
        round(avg(prior_title.observed_handoff_hours), 1) as prior_partner_avg_handoff_hours
    from handoffs current_title
    left join handoffs prior_title
        on current_title.partner_id = prior_title.partner_id
        and prior_title.first_published_at < current_title.approved_at
    group by current_title.title_id
), prior_submission_history as (
    select
        current_title.title_id,
        count(prior_title.title_id) as prior_partner_published_at_submission,
        round(avg(prior_title.publication_lead_days), 1) as prior_partner_avg_lead_days_at_submission
    from handoffs current_title
    left join handoffs prior_title
        on current_title.partner_id = prior_title.partner_id
        and prior_title.first_published_at < current_title.first_submitted_at
    group by current_title.title_id
)
select
    h.title_id,
    h.partner_id,
    h.first_submitted_at,
    h.planned_release_at,
    h.approved_at,
    h.approval_attempt_number,
    p.prior_partner_published_titles,
    p.prior_partner_avg_handoff_hours,
    s.prior_partner_published_at_submission,
    s.prior_partner_avg_lead_days_at_submission,
    h.first_published_at,
    h.published_regions,
    h.observed_handoff_hours,
    h.publication_lead_days
from handoffs h
join prior_approval_history p on h.title_id = p.title_id
join prior_submission_history s on h.title_id = s.title_id
