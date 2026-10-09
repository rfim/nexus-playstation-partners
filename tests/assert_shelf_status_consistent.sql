-- A title waiting for the shelf must be approved, unpublished and waiting a non-negative number of days;
-- a published title must have been approved first.
select title_id, shelf_status, approved_at, first_published_at, days_waiting_as_of
from {{ ref('mart_title_time_to_shelf') }}
where (shelf_status = 'approved_waiting'
        and (approved_at is null or first_published_at is not null or days_waiting_as_of < 0))
   or (shelf_status = 'published'
        and (approved_at is null or first_published_at < approved_at))
