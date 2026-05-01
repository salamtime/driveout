alter table public.saharax_0u4w4d_settings
add column if not exists auto_send_contract_email_after_creation boolean default false,
add column if not exists rental_details_default_view text default 'standard';

update public.saharax_0u4w4d_settings
set
  auto_send_contract_email_after_creation = coalesce(auto_send_contract_email_after_creation, false),
  rental_details_default_view = case
    when lower(coalesce(rental_details_default_view, 'standard')) = 'light' then 'light'
    else 'standard'
  end
where id = 1;
