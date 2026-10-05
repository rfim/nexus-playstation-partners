select
    (select count(*) from {{ ref('stg_titles') }}) as source_titles,
    (select count(*) from {{ ref('int_title_outcomes') }}) as outcome_titles
where source_titles <> outcome_titles
