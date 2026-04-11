import fs from 'fs';
import pg from 'pg';

const env = fs.readFileSync('.env.local', 'utf8');
const get = (key) => {
  const line = env.split(/\n/).find((entry) => entry.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).replace(/^"|"$/g, '') : '';
};

const client = new pg.Client({
  connectionString: get('SUPABASE_DB_URL'),
  ssl: { rejectUnauthorized: false },
});

const rentalId = 'RNT-2026-c77';

await client.connect();

const rentalResult = await client.query(
  `select
      id,
      rental_id,
      rental_status,
      customer_name,
      vehicle_id,
      quantity_days,
      unit_price,
      total_amount,
      deposit_amount,
      remaining_amount,
      payment_status,
      package_id,
      package_name,
      package_rate_per_unit,
      package_included_km_per_unit,
      package_total_included_km,
      package_extra_rate,
      use_package_pricing,
      fuel_charge,
      transport_fee,
      damage_deposit,
      approval_status,
      pending_total_request,
      created_at,
      updated_at
    from public.app_4c3a7a6153_rentals
    where rental_id = $1`,
  [rentalId]
);

const rentalRow = rentalResult.rows[0];

let vehicleResult = { rows: [] };
let pricingResult = { rows: [] };

if (rentalRow?.vehicle_id) {
  vehicleResult = await client.query(
    `select id, plate_number, name, model, vehicle_model_id
     from public.saharax_0u4w4d_vehicles
     where id = $1`,
    [rentalRow.vehicle_id]
  );

  pricingResult = await client.query(
    `select
        id,
        vehicle_id,
        vehicle_model_id,
        amount_per_day,
        amount_per_hour,
        min_hours,
        max_hours,
        rental_type,
        is_active,
        created_at
      from public.pricing_tiers
      where vehicle_id = $1
         or vehicle_model_id = (
           select vehicle_model_id
           from public.saharax_0u4w4d_vehicles
           where id = $1
         )
      order by created_at desc nulls last
      limit 20`,
    [rentalRow.vehicle_id]
  );
}

console.log(JSON.stringify({
  rental: rentalResult.rows,
  vehicle: vehicleResult.rows,
  pricing: pricingResult.rows,
}, null, 2));

await client.end();
