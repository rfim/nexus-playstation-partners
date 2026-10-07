select cohort, week_number
from {{ ref('hypothetical_workflow_weeks') }}
group by cohort, week_number
having count(*) <> 1
