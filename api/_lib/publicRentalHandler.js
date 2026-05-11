import { createSupabaseClients } from './supabase.js';

const json = (res, status, body) => res.status(status).json(body);

export default async function publicRentalHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const rentalId = String(req.query?.id || '').trim();
  if (!rentalId) {
    return json(res, 400, { error: 'Missing rental id' });
  }

  try {
    const { adminClient } = createSupabaseClients();

    const rentalSelect = `
      *,
      quantity_hours,
      quantity_days,
      vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
        *,
        vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)
      ),
      extensions:rental_extensions!rental_extensions_rental_id_fkey(*),
      package:app_4c3a7a6153_rental_km_packages!package_id(*)
    `;

    let rental = null;
    let rentalError = null;

    const byInternalId = await adminClient
      .from('app_4c3a7a6153_rentals')
      .select(rentalSelect)
      .eq('id', rentalId)
      .maybeSingle();

    rental = byInternalId.data;
    rentalError = byInternalId.error;

    if (!rental) {
      const byContractId = await adminClient
        .from('app_4c3a7a6153_rentals')
        .select(rentalSelect)
        .ilike('rental_id', rentalId)
        .maybeSingle();

      rental = byContractId.data;
      rentalError = byContractId.error;
    }

    if (rentalError || !rental) {
      return json(res, 404, { error: 'Rental not found' });
    }

    const { data: settings } = await adminClient
      .from('app_settings')
      .select('logo_url, stamp_url')
      .eq('id', 1)
      .maybeSingle()
      .then((result) => result)
      .catch(() => ({ data: null }));

    const { data: mediaRows, error: mediaError } = await adminClient
      .from('app_2f7bf469b0_rental_media')
      .select('*')
      .eq('rental_id', rental.id)
      .order('created_at', { ascending: false });

    if (mediaError) {
      return json(res, 500, { error: mediaError.message || 'Failed to load media' });
    }

    const { data: reportRows } = await adminClient
      .from('app_4c3a7a6153_vehicle_reports')
      .select('*')
      .eq('rental_id', rental.id)
      .order('created_at', { ascending: false })
      .limit(1);

    const latestVehicleReport = reportRows?.[0] || null;
    let linkedMaintenance = null;

    if (latestVehicleReport?.maintenance_id) {
      const { data: maintenanceRow } = await adminClient
        .from('app_687f658e98_maintenance')
        .select('*')
        .eq('id', latestVehicleReport.maintenance_id)
        .maybeSingle();

      if (maintenanceRow) {
        const { data: maintenancePartsRows } = await adminClient
          .from('app_687f658e98_maintenance_parts')
          .select(`
            *,
            inventory_item:saharax_0u4w4d_inventory_items(id, name, sku, unit)
          `)
          .eq('maintenance_id', latestVehicleReport.maintenance_id);

        linkedMaintenance = {
          ...maintenanceRow,
          parts: maintenancePartsRows || [],
          parts_used: maintenancePartsRows || [],
        };
      } else {
        linkedMaintenance = null;
      }
    }

    const hydratedRental = {
      ...rental,
      vehicle_report: latestVehicleReport
        ? {
            ...latestVehicleReport,
            maintenance: linkedMaintenance,
          }
        : null,
      vehicleReport: latestVehicleReport
        ? {
            ...latestVehicleReport,
            maintenance: linkedMaintenance,
          }
        : null,
    };

    return json(res, 200, {
      rental: hydratedRental,
      settings: settings || null,
      media: mediaRows || [],
    });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Failed to load public rental document' });
  }
}
