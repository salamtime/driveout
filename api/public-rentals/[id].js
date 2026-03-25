import { createSupabaseClients } from '../_lib/supabase.js';

const json = (res, status, body) => res.status(status).json(body);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const rentalId = String(req.query?.id || '').trim();
  if (!rentalId) {
    return json(res, 400, { error: 'Missing rental id' });
  }

  try {
    const { anonClient } = createSupabaseClients();

    // Only join tables accessible to the anon role
    const rentalSelect = `
      *,
      quantity_hours,
      quantity_days,
      vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
        *,
        vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)
      )
    `;

    let rental = null;
    let rentalError = null;

    const byInternalId = await anonClient
      .from('app_4c3a7a6153_rentals')
      .select(rentalSelect)
      .eq('id', rentalId)
      .maybeSingle();

    rental = byInternalId.data;
    rentalError = byInternalId.error;

    if (!rental) {
      const byContractId = await anonClient
        .from('app_4c3a7a6153_rentals')
        .select(rentalSelect)
        .eq('rental_id', rentalId)
        .maybeSingle();

      rental = byContractId.data;
      rentalError = byContractId.error;
    }

    if (rentalError || !rental) {
      return json(res, 404, { error: 'Rental not found' });
    }

    // app_settings is restricted — return null gracefully
    const { data: settings } = await anonClient
      .from('app_settings')
      .select('logo_url, stamp_url')
      .eq('id', 1)
      .maybeSingle()
      .then(r => r)
      .catch(() => ({ data: null }));

    const { data: mediaRows, error: mediaError } = await anonClient
      .from('app_2f7bf469b0_rental_media')
      .select('*')
      .eq('rental_id', rental.id)
      .order('created_at', { ascending: false });

    if (mediaError) {
      return json(res, 500, { error: mediaError.message || 'Failed to load media' });
    }

    return json(res, 200, {
      rental,
      settings: settings || null,
      media: mediaRows || [],
    });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Failed to load public rental document' });
  }
}
