alter table public.saharax_0u4w4d_settings
add column if not exists messaging_photo_sharing_enabled boolean default false,
add column if not exists messaging_max_photos_per_message numeric(10,2) default 3,
add column if not exists messaging_photo_retention_days numeric(10,2) default 7,
add column if not exists messaging_draft_retention_hours numeric(10,2) default 24,
add column if not exists messaging_allow_camera_capture boolean default true;

update public.saharax_0u4w4d_settings
set
  messaging_photo_sharing_enabled = coalesce(messaging_photo_sharing_enabled, false),
  messaging_max_photos_per_message = greatest(1, least(10, coalesce(messaging_max_photos_per_message, 3))),
  messaging_photo_retention_days = greatest(1, least(30, coalesce(messaging_photo_retention_days, 7))),
  messaging_draft_retention_hours = greatest(1, least(168, coalesce(messaging_draft_retention_hours, 24))),
  messaging_allow_camera_capture = coalesce(messaging_allow_camera_capture, true)
where id = 1;
