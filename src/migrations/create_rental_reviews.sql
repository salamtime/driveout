begin;

create extension if not exists pgcrypto;

create or replace function public.app_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.app_can_submit_rental_review(
  v_organization_id uuid,
  v_rental_id uuid,
  v_marketplace_request_id uuid,
  v_reviewer_user_id uuid,
  v_reviewee_user_id uuid,
  v_reviewer_role text,
  v_reviewee_role text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with review_context as (
    select
      records.organization_id,
      coalesce(requests.owner_id, records.owner_user_id) as owner_user_id,
      coalesce(requests.customer_id, records.customer_user_id) as customer_user_id,
      coalesce(records.marketplace_request_id, requests.id) as marketplace_request_id,
      coalesce(records.completed_at, rentals.completed_at, rentals.rental_completed_at) as completed_at,
      lower(coalesce(rentals.rental_status, rentals.status, '')) as rental_status
    from public.app_4c3a7a6153_rental_execution_records records
    join public.app_4c3a7a6153_rentals rentals
      on rentals.id = records.rental_id
    left join public.app_booking_requests requests
      on requests.id = coalesce(v_marketplace_request_id, records.marketplace_request_id)
    where records.rental_id = v_rental_id
      and (
        v_marketplace_request_id is null
        or records.marketplace_request_id = v_marketplace_request_id
      )
    limit 1
  )
  select exists (
    select 1
    from review_context ctx
    where auth.uid() = v_reviewer_user_id
      and ctx.organization_id = v_organization_id
      and (ctx.completed_at is not null or ctx.rental_status = 'completed')
      and v_reviewer_user_id <> v_reviewee_user_id
      and v_reviewer_role in ('customer', 'owner')
      and v_reviewee_role in ('customer', 'owner')
      and v_reviewer_role <> v_reviewee_role
      and (
        (
          v_reviewer_role = 'owner'
          and v_reviewee_role = 'customer'
          and v_reviewer_user_id = ctx.owner_user_id
          and v_reviewee_user_id = ctx.customer_user_id
        )
        or (
          v_reviewer_role = 'customer'
          and v_reviewee_role = 'owner'
          and v_reviewer_user_id = ctx.customer_user_id
          and v_reviewee_user_id = ctx.owner_user_id
        )
      )
      and not exists (
        select 1
        from public.app_rental_reviews existing
        where existing.rental_id = v_rental_id
          and existing.reviewer_user_id = v_reviewer_user_id
          and existing.reviewee_user_id = v_reviewee_user_id
      )
  );
$$;

create table if not exists public.app_rental_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.app_organizations(id) on delete cascade,
  rental_id uuid not null references public.app_4c3a7a6153_rentals(id) on delete cascade,
  marketplace_request_id uuid references public.app_booking_requests(id) on delete set null,
  listing_id uuid references public.app_marketplace_listings(id) on delete set null,
  vehicle_public_profile_id uuid references public.app_vehicle_public_profiles(id) on delete set null,
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  reviewee_user_id uuid not null references auth.users(id) on delete cascade,
  reviewer_role text not null,
  reviewee_role text not null,
  rating integer not null,
  category_ratings jsonb not null default '{}'::jsonb,
  comment text,
  private_notes text,
  review_status text not null default 'published',
  visibility text not null default 'public',
  submitted_at timestamptz not null default now(),
  published_at timestamptz,
  moderated_at timestamptz,
  moderated_by uuid references auth.users(id) on delete set null,
  moderation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_rental_reviews_unique_author_target_per_rental
    unique (rental_id, reviewer_user_id, reviewee_user_id),
  constraint app_rental_reviews_role_check
    check (reviewer_role in ('customer', 'owner') and reviewee_role in ('customer', 'owner')),
  constraint app_rental_reviews_opposite_roles_check
    check (reviewer_role <> reviewee_role),
  constraint app_rental_reviews_distinct_users_check
    check (reviewer_user_id <> reviewee_user_id),
  constraint app_rental_reviews_rating_check
    check (rating between 1 and 5),
  constraint app_rental_reviews_status_check
    check (review_status in ('draft', 'published', 'hidden', 'flagged', 'removed')),
  constraint app_rental_reviews_visibility_check
    check (visibility in ('public', 'private_internal')),
  constraint app_rental_reviews_category_ratings_object_check
    check (jsonb_typeof(category_ratings) = 'object')
);

create index if not exists app_rental_reviews_org_idx
  on public.app_rental_reviews (organization_id, created_at desc);

create index if not exists app_rental_reviews_rental_idx
  on public.app_rental_reviews (rental_id, created_at desc);

create index if not exists app_rental_reviews_reviewee_idx
  on public.app_rental_reviews (reviewee_user_id, reviewee_role, created_at desc);

create index if not exists app_rental_reviews_reviewer_idx
  on public.app_rental_reviews (reviewer_user_id, reviewer_role, created_at desc);

create index if not exists app_rental_reviews_marketplace_idx
  on public.app_rental_reviews (marketplace_request_id, listing_id, vehicle_public_profile_id);

create index if not exists app_rental_reviews_public_idx
  on public.app_rental_reviews (reviewee_user_id, review_status, visibility, created_at desc);

drop trigger if exists trg_app_rental_reviews_updated_at on public.app_rental_reviews;
create trigger trg_app_rental_reviews_updated_at
before update on public.app_rental_reviews
for each row execute function public.app_touch_updated_at();

alter table public.app_rental_reviews enable row level security;

grant execute on function public.app_can_submit_rental_review(uuid, uuid, uuid, uuid, uuid, text, text)
  to authenticated, service_role;

grant select on public.app_rental_reviews to anon, authenticated, service_role;
grant insert, update on public.app_rental_reviews to authenticated, service_role;
grant delete on public.app_rental_reviews to service_role;

drop policy if exists "Public read published rental reviews" on public.app_rental_reviews;
create policy "Public read published rental reviews"
on public.app_rental_reviews
for select
using (
  review_status = 'published'
  and visibility = 'public'
);

drop policy if exists "Authenticated read own or org rental reviews" on public.app_rental_reviews;
create policy "Authenticated read own or org rental reviews"
on public.app_rental_reviews
for select
to authenticated
using (
  auth.uid() = reviewer_user_id
  or auth.uid() = reviewee_user_id
  or public.app_is_platform_admin()
  or public.app_has_current_organization_access(organization_id)
);

drop policy if exists "Managed insert rental reviews" on public.app_rental_reviews;
create policy "Managed insert rental reviews"
on public.app_rental_reviews
for insert
to authenticated
with check (
  public.app_is_platform_admin()
  or public.app_can_manage_current_organization(organization_id)
  or public.app_can_submit_rental_review(
    organization_id,
    rental_id,
    marketplace_request_id,
    reviewer_user_id,
    reviewee_user_id,
    reviewer_role,
    reviewee_role
  )
);

drop policy if exists "Managed update rental reviews" on public.app_rental_reviews;
create policy "Managed update rental reviews"
on public.app_rental_reviews
for update
to authenticated
using (
  public.app_is_platform_admin()
  or public.app_can_manage_current_organization(organization_id)
)
with check (
  public.app_is_platform_admin()
  or public.app_can_manage_current_organization(organization_id)
);

commit;
