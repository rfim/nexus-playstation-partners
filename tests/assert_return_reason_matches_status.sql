-- Every rejected attempt records why it was returned; no approved attempt carries a return reason.
select submission_id, status, return_reason
from {{ ref('stg_submissions') }}
where (status = 'rejected' and return_reason is null)
   or (status = 'approved' and return_reason is not null)
