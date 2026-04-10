-- Safe backfill for rentals missing created_by / created_by_name.
-- Strategy:
-- 1. If contract_signed_by and started_by match, use that staff member.
-- 2. Else if only one of contract_signed_by or started_by exists, use that one.
-- 3. Else if completed_by exists, use that one.
-- 4. Leave anything ambiguous untouched.
--
-- This intentionally avoids guessing when there is no clear staff actor.

begin;

with inferred_staff as (
  select
    r.id,
    case
      when r.created_by is not null or r.created_by_name is not null then null
      when r.contract_signed_by is not null
           and r.started_by is not null
           and r.contract_signed_by = r.started_by
        then r.contract_signed_by
      when r.contract_signed_by is not null and r.started_by is null
        then r.contract_signed_by
      when r.started_by is not null and r.contract_signed_by is null
        then r.started_by
      when r.completed_by is not null
        then r.completed_by
      else null
    end as inferred_user_id,
    case
      when r.created_by is not null or r.created_by_name is not null then null
      when r.contract_signed_by_name is not null
           and r.started_by_name is not null
           and r.contract_signed_by = r.started_by
        then r.contract_signed_by_name
      when r.contract_signed_by_name is not null and r.started_by_name is null
        then r.contract_signed_by_name
      when r.started_by_name is not null and r.contract_signed_by_name is null
        then r.started_by_name
      when r.completed_by_name is not null
        then r.completed_by_name
      else null
    end as inferred_user_name
  from app_4c3a7a6153_rentals r
),
resolved_staff as (
  select
    i.id,
    i.inferred_user_id,
    coalesce(i.inferred_user_name, u.full_name, u.email) as inferred_user_name
  from inferred_staff i
  left join app_b30c02e74da644baad4668e3587d86b1_users u
    on u.id = i.inferred_user_id
  where i.inferred_user_id is not null
)
update app_4c3a7a6153_rentals r
set
  created_by = rs.inferred_user_id,
  created_by_name = rs.inferred_user_name
from resolved_staff rs
where r.id = rs.id
  and r.created_by is null
  and r.created_by_name is null;

commit;
