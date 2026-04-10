alter table public.app_4c3a7a6153_rentals
add column if not exists damage_deposit_document_url text,
add column if not exists damage_deposit_document_name text;
