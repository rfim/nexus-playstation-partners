-- The return-reason mart must account for every rejected attempt in the submission fact, once.
with by_reason as (
    select sum(rejected_attempts) as rejected_attempts from {{ ref('mart_resubmission_cost') }}
), by_fact as (
    select count(*) as rejected_attempts from {{ ref('fct_submission') }} where status = 'rejected'
)
select r.rejected_attempts as mart_total, f.rejected_attempts as fact_total
from by_reason r cross join by_fact f
where coalesce(r.rejected_attempts, 0) <> f.rejected_attempts
