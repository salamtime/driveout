alter table public.saharax_0u4w4d_inventory_items
  add column if not exists labels text[] not null default '{}'::text[];

create index if not exists idx_inventory_items_labels_gin
  on public.saharax_0u4w4d_inventory_items
  using gin (labels);

update public.saharax_0u4w4d_inventory_items
set labels = array_remove(array[
  case
    when lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%10w%'
      or lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%oil%'
      then 'oil'
  end,
  case
    when lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%engine oil%'
      or lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%10w%'
      then 'engine_oil'
  end,
  case
    when lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%gear oil%'
      then 'gear_oil'
  end,
  case
    when lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%brake fluid%'
      then 'brake_fluid'
  end,
  case
    when lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%coolant%'
      then 'coolant'
  end,
  case
    when lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%grease%'
      then 'grease'
  end,
  case
    when lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%oil filter%'
      then 'oil_filter'
  end,
  case
    when lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%air filter%'
      then 'air_filter'
  end,
  case
    when lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%fuel filter%'
      then 'fuel_filter'
  end,
  case
    when lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%spark plug%'
      then 'spark_plug'
  end,
  case
    when lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%belt%'
      then 'belt'
  end,
  case
    when lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%cvt%'
      or lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%clutch%'
      then 'cvt'
  end,
  case
    when lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%clutch%'
      then 'clutch'
  end,
  case
    when lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%brake%'
      then 'brake'
  end,
  case
    when lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%tire%'
      or lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%tyre%'
      then 'tire'
  end,
  case
    when lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%wheel%'
      then 'wheel'
  end,
  case
    when lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%light%'
      then 'light'
  end,
  case
    when lower(coalesce(name, '') || ' ' || coalesce(sku, '') || ' ' || coalesce(description, '')) like '%mirror%'
      then 'mirror'
  end
], null)
where labels = '{}'::text[];
