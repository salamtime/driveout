alter table public.app_4c3a7a6153_receive_funds_entries
  add column if not exists received_by_admin_user_id uuid,
  add column if not exists received_by_admin_display_name text,
  add column if not exists receipt_image_url text,
  add column if not exists receipt_image_path text;
