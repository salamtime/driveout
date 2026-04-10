alter table public.app_687f658e98_tour_packages
  add column if not exists public_title text,
  add column if not exists public_summary text,
  add column if not exists route_label text,
  add column if not exists route_stops_json jsonb not null default '[]'::jsonb,
  add column if not exists media_gallery_json jsonb not null default '[]'::jsonb,
  add column if not exists public_highlights_json jsonb not null default '[]'::jsonb,
  add column if not exists display_order integer not null default 0,
  add column if not exists cover_image_url text,
  add column if not exists duration_display text,
  add column if not exists stop_count integer,
  add column if not exists difficulty_label text;

update public.app_687f658e98_tour_packages
set public_title = nullif(trim(name), '')
where coalesce(public_title, '') = ''
  and coalesce(name, '') <> '';

update public.app_687f658e98_tour_packages
set stop_count = jsonb_array_length(route_stops_json)
where stop_count is null
  and jsonb_typeof(route_stops_json) = 'array';

create index if not exists idx_tour_packages_public_listing
  on public.app_687f658e98_tour_packages (website_visible, is_active, display_order, name);
