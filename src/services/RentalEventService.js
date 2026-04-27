import { supabase } from '../lib/supabase';

export const RENTAL_EVENTS_TABLE = 'rental_events';
let rentalEventsTableUnavailable = false;

const EVENT_LABELS = {
  request_sent: 'Request sent',
  approved: 'Approved by owner',
  declined: 'Declined by owner',
  confirmed: 'Booking confirmed',
  started: 'Rental started',
  ended: 'Rental ended',
  issue_reported: 'Issue reported',
  deposit_external: 'Deposit handled externally',
};

const ACTOR_LABELS = {
  renter: 'Renter',
  owner: 'Owner',
  system: 'System',
  admin: 'Admin',
};

const normalizeEventType = (value) => String(value || '').trim().toLowerCase();
const normalizeActor = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['renter', 'owner', 'system', 'admin'].includes(normalized)) return normalized;
  return 'system';
};

const normalizeMetadata = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

const normalizeEventRow = (row = {}) => {
  const eventType = normalizeEventType(row?.event_type);
  const actor = normalizeActor(row?.actor);
  return {
    id: String(row?.id || '').trim(),
    rentalId: String(row?.rental_id || '').trim(),
    eventType,
    actor,
    actorLabel: ACTOR_LABELS[actor] || 'System',
    label: EVENT_LABELS[eventType] || eventType || 'Rental event',
    metadata: normalizeMetadata(row?.metadata),
    createdAt: row?.created_at || null,
  };
};

class RentalEventService {
  static async recordEvent({ rentalId, eventType, actor = 'system', metadata = {}, createdAt = null }) {
    if (rentalEventsTableUnavailable) return null;
    const normalizedRentalId = String(rentalId || '').trim();
    const normalizedEventType = normalizeEventType(eventType);
    if (!normalizedRentalId || !normalizedEventType) return null;

    const payload = {
      rental_id: normalizedRentalId,
      event_type: normalizedEventType,
      actor: normalizeActor(actor),
      metadata: normalizeMetadata(metadata),
      ...(createdAt ? { created_at: createdAt } : {}),
    };

    const { data, error } = await supabase
      .from(RENTAL_EVENTS_TABLE)
      .insert([payload])
      .select('*')
      .maybeSingle();

    if (error) {
      const errorCode = String(error?.code || '').trim();
      const errorStatus = Number(error?.status || 0);
      const errorMessage = String(error?.message || '').trim().toLowerCase();
      if (
        errorCode === '42P01' ||
        errorStatus === 404 ||
        errorMessage.includes('relation') && errorMessage.includes('does not exist') ||
        errorMessage.includes('not found')
      ) {
        rentalEventsTableUnavailable = true;
        return null;
      }
      console.warn('Failed to record rental event:', error);
      return null;
    }

    return normalizeEventRow(data || payload);
  }

  static async listEvents(rentalIds = []) {
    if (rentalEventsTableUnavailable) return new Map();
    const ids = [...new Set((Array.isArray(rentalIds) ? rentalIds : [rentalIds]).map((id) => String(id || '').trim()).filter(Boolean))];
    if (!ids.length) return new Map();

    const { data, error } = await supabase
      .from(RENTAL_EVENTS_TABLE)
      .select('*')
      .in('rental_id', ids)
      .order('created_at', { ascending: false });

    if (error) {
      const errorCode = String(error?.code || '').trim();
      const errorStatus = Number(error?.status || 0);
      const errorMessage = String(error?.message || '').trim().toLowerCase();
      if (
        errorCode === '42P01' ||
        errorStatus === 404 ||
        errorMessage.includes('relation') && errorMessage.includes('does not exist') ||
        errorMessage.includes('not found')
      ) {
        rentalEventsTableUnavailable = true;
        return new Map();
      }
      console.warn('Failed to load rental events:', error);
      return new Map();
    }

    const events = (Array.isArray(data) ? data : []).map(normalizeEventRow);
    return ids.reduce((map, rentalId) => {
      map.set(rentalId, events.filter((event) => event.rentalId === rentalId));
      return map;
    }, new Map());
  }
}

export default RentalEventService;
