begin;

alter table public.app_4c3a7a6153_rental_km_packages
  drop constraint if exists package_pricing_consistency;

alter table public.app_4c3a7a6153_rental_km_packages
  add constraint package_pricing_consistency
  check (
    fixed_amount is not null
    and fixed_amount > 0
    and (
      (
        included_kilometers is not null
        and included_kilometers > 0
        and extra_km_rate is not null
        and extra_km_rate > 0
      )
      or (
        included_kilometers is null
        and coalesce(extra_km_rate, 0) = 0
      )
    )
  );

commit;
