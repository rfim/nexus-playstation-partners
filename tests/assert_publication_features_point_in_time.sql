with first_published as (
    select title_id, min(published_at) as first_published_at
    from {{ ref('stg_publications') }}
    group by title_id
), expected as (
    select
        current_title.title_id,
        sum(case when prior.first_published_at < current_title.first_submitted_at
            then 1 else 0 end) as expected_at_submission,
        sum(case when prior.first_published_at < current_title.approved_at
            then 1 else 0 end) as expected_at_approval
    from {{ ref('int_title_publication_features') }} current_title
    left join {{ ref('stg_titles') }} other_title
        on other_title.partner_id = current_title.partner_id
        and other_title.title_id <> current_title.title_id
    left join first_published prior on prior.title_id = other_title.title_id
    group by current_title.title_id
)
select f.title_id
from {{ ref('int_title_publication_features') }} f
join expected e on f.title_id = e.title_id
where f.prior_partner_published_at_submission <> e.expected_at_submission
   or f.prior_partner_published_titles <> e.expected_at_approval
