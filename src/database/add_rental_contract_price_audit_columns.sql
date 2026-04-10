-- Optional audit normalization for rental contract price edits.
-- The app already stores override metadata in price_override_reason JSON and now
-- records user_activity_log entries. This migration adds explicit rental columns
-- for cleaner querying/reporting and safely backfills them from existing JSON.

alter table public.app_4c3a7a6153_rentals
  add column if not exists contract_price_edited_by uuid null references auth.users(id),
  add column if not exists contract_price_edited_by_name text null,
  add column if not exists contract_price_previous_amount numeric(12,2) null,
  add column if not exists contract_price_edited_at timestamptz null;

with parsed_override_meta as (
  select
    id,
    case
      when nullif(price_override_reason, '') is not null
       and left(trim(price_override_reason), 1) = '{'
      then price_override_reason::jsonb
      else null
    end as meta
  from public.app_4c3a7a6153_rentals
)
update public.app_4c3a7a6153_rentals r
set
  contract_price_edited_by = coalesce(
    r.contract_price_edited_by,
    nullif(parsed.meta ->> 'editedById', '')::uuid
  ),
  contract_price_edited_by_name = coalesce(
    r.contract_price_edited_by_name,
    nullif(parsed.meta ->> 'editedByName', '')
  ),
  contract_price_previous_amount = coalesce(
    r.contract_price_previous_amount,
    nullif(parsed.meta ->> 'previousPrice', '')::numeric
  ),
  contract_price_edited_at = coalesce(
    r.contract_price_edited_at,
    nullif(parsed.meta ->> 'editedAt', '')::timestamptz
  )
from parsed_override_meta parsed
where parsed.id = r.id
  and parsed.meta is not null;

comment on column public.app_4c3a7a6153_rentals.contract_price_edited_by is
  'User id of the staff member who last edited the rental contract price manually.';
comment on column public.app_4c3a7a6153_rentals.contract_price_edited_by_name is
  'Display name of the staff member who last edited the rental contract price manually.';
comment on column public.app_4c3a7a6153_rentals.contract_price_previous_amount is
  'Previous contract price before the latest manual override.';
comment on column public.app_4c3a7a6153_rentals.contract_price_edited_at is
  'Timestamp of the latest manual rental contract price edit.';
