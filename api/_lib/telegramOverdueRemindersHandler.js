import { createSupabaseClients, APP_USERS_TABLE } from './supabase.js';
import { processTelegramRentalAlert } from './telegramAlertsHandler.js';

const RENTALS_TABLE = 'app_4c3a7a6153_rentals';

const json = (res, status, body) => res.status(status).json(body);

const isCronRequest = (req) => Boolean(req.headers['x-vercel-cron']);

export async function handleTelegramOverdueRemindersRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(204).end();
  }

  if (!['GET', 'POST'].includes(req.method)) {
    return json(res, 405, { error: 'Method not allowed' });
  }

  if (!isCronRequest(req) && process.env.NODE_ENV === 'production') {
    return json(res, 401, { error: 'Unauthorized' });
  }

  try {
    const { adminClient } = createSupabaseClients();
    const nowIso = new Date().toISOString();
    const baseUrl = String(process.env.APP_BASE_URL || 'https://saharax.driveout.io').trim();
    const hostname = (() => {
      try {
        return new URL(baseUrl).hostname.toLowerCase();
      } catch {
        return 'saharax.driveout.io';
      }
    })();

    const { data: actorUser } = await adminClient
      .from(APP_USERS_TABLE)
      .select('id, email, role, primary_organization_id')
      .eq('access_enabled', true)
      .in('role', ['owner', 'admin'])
      .order('role', { ascending: true })
      .limit(1)
      .maybeSingle();

    const { data: overdueRentals, error: rentalsError } = await adminClient
      .from(RENTALS_TABLE)
      .select('id, rental_id, customer_name, rental_start_date, rental_end_date, total_amount, deposit_amount, remaining_amount, rental_status, status, vehicle_name')
      .eq('rental_status', 'active')
      .lt('rental_end_date', nowIso)
      .order('rental_end_date', { ascending: true })
      .limit(50);

    if (rentalsError) throw rentalsError;

    const results = [];
    for (const rental of overdueRentals || []) {
      const result = await processTelegramRentalAlert({
        adminClient,
        actorUser: actorUser || null,
        actorWorkspaceContext: actorUser?.primary_organization_id
          ? { primary_organization_id: actorUser.primary_organization_id }
          : null,
        hostname,
        payload: {
          id: rental.id,
          eventType: 'rental_overdue',
          reference: rental.rental_id || '',
          vehicle: String(rental.vehicle_name || 'Vehicle').trim(),
          customer: rental.customer_name,
          start: rental.rental_start_date,
          end: rental.rental_end_date,
          total: rental.total_amount || 0,
          amountPaid: rental.deposit_amount || 0,
          remaining: rental.remaining_amount || 0,
          overdueReason: 'Scheduled overdue reminder',
        },
      });

      results.push({
        rental_id: rental.rental_id || rental.id,
        status: result.status,
        success: result.body?.success === true,
        skipped: result.body?.skipped === true,
        reason: result.body?.reason || null,
      });
    }

    const summary = results.reduce((acc, item) => {
      if (item.success && !item.skipped) acc.sent += 1;
      else if (item.skipped) acc.skipped += 1;
      else acc.failed += 1;
      return acc;
    }, { sent: 0, skipped: 0, failed: 0 });

    return json(res, 200, {
      ok: true,
      scanned: Array.isArray(overdueRentals) ? overdueRentals.length : 0,
      ...summary,
      items: results,
    });
  } catch (error) {
    console.error('❌ Overdue reminder cron failed:', error);
    return json(res, 500, {
      error: error?.message || 'Failed to process overdue reminders',
    });
  }
}
