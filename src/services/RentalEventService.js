import { supabase } from '../lib/supabase';

export const RENTAL_EVENTS_TABLE = 'rental_events';
let rentalEventsTableUnavailable = false;
let rentalEventsDispatchKeyUnavailable = false;

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
const normalizeDispatchKey = (value) => String(value || '').trim();

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
    dispatchKey: normalizeDispatchKey(row?.dispatch_key || row?.metadata?.dispatchKey),
    createdAt: row?.created_at || null,
  };
};

const isMissingTableError = (error) => {
  const errorCode = String(error?.code || '').trim();
  const errorStatus = Number(error?.status || 0);
  const errorMessage = String(error?.message || '').trim().toLowerCase();
  return (
    errorCode === '42P01' ||
    errorStatus === 404 ||
    (errorMessage.includes('relation') && errorMessage.includes('does not exist')) ||
    errorMessage.includes('not found')
  );
};

const isMissingColumnError = (error, columnName) => {
  const errorCode = String(error?.code || '').trim().toUpperCase();
  const errorMessage = String(error?.message || error?.details || '').trim().toLowerCase();
  const normalizedColumn = String(columnName || '').trim().toLowerCase();
  return errorCode === '42703' || (normalizedColumn && errorMessage.includes(normalizedColumn));
};

class RentalEventService {
  static async findByDispatchKey({ rentalId, eventType, dispatchKey }) {
    if (rentalEventsTableUnavailable) return null;

    const normalizedRentalId = String(rentalId || '').trim();
    const normalizedEventType = normalizeEventType(eventType);
    const normalizedDispatchKey = normalizeDispatchKey(dispatchKey);
    if (!normalizedRentalId || !normalizedEventType || !normalizedDispatchKey) return null;

    if (!rentalEventsDispatchKeyUnavailable) {
      const { data, error } = await supabase
        .from(RENTAL_EVENTS_TABLE)
        .select('*')
        .eq('rental_id', normalizedRentalId)
        .eq('event_type', normalizedEventType)
        .eq('dispatch_key', normalizedDispatchKey)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return normalizeEventRow(data);
      }

      if (error) {
        if (isMissingTableError(error)) {
          rentalEventsTableUnavailable = true;
          return null;
        }
        if (isMissingColumnError(error, 'dispatch_key')) {
          rentalEventsDispatchKeyUnavailable = true;
        } else {
          console.warn('Failed to look up rental event by dispatch key:', error);
        }
      }
    }

    const { data, error } = await supabase
      .from(RENTAL_EVENTS_TABLE)
      .select('*')
      .eq('rental_id', normalizedRentalId)
      .eq('event_type', normalizedEventType)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      if (isMissingTableError(error)) {
        rentalEventsTableUnavailable = true;
        return null;
      }
      console.warn('Failed to look up rental event dispatch fallback:', error);
      return null;
    }

    const matched = (Array.isArray(data) ? data : []).find(
      (row) => normalizeDispatchKey(row?.metadata?.dispatchKey) === normalizedDispatchKey
    );

    return matched ? normalizeEventRow(matched) : null;
  }

  static async recordEvent({ rentalId, eventType, actor = 'system', metadata = {}, createdAt = null, dispatchKey = '' }) {
    if (rentalEventsTableUnavailable) return null;
    const normalizedRentalId = String(rentalId || '').trim();
    const normalizedEventType = normalizeEventType(eventType);
    const normalizedDispatchKey = normalizeDispatchKey(dispatchKey);
    if (!normalizedRentalId || !normalizedEventType) return null;

    if (normalizedDispatchKey) {
      const existing = await this.findByDispatchKey({
        rentalId: normalizedRentalId,
        eventType: normalizedEventType,
        dispatchKey: normalizedDispatchKey,
      });
      if (existing) {
        return {
          ...existing,
          duplicate: true,
        };
      }
    }

    const payload = {
      rental_id: normalizedRentalId,
      event_type: normalizedEventType,
      actor: normalizeActor(actor),
      metadata: {
        ...normalizeMetadata(metadata),
        ...(normalizedDispatchKey ? { dispatchKey: normalizedDispatchKey } : {}),
      },
      ...(createdAt ? { created_at: createdAt } : {}),
    };
    if (normalizedDispatchKey && !rentalEventsDispatchKeyUnavailable) {
      payload.dispatch_key = normalizedDispatchKey;
    }

    const { data, error } = await supabase
      .from(RENTAL_EVENTS_TABLE)
      .insert([payload])
      .select('*')
      .maybeSingle();

    if (error) {
      const errorCode = String(error?.code || '').trim().toUpperCase();
      if (isMissingTableError(error)) {
        rentalEventsTableUnavailable = true;
        return null;
      }
      if (isMissingColumnError(error, 'dispatch_key')) {
        rentalEventsDispatchKeyUnavailable = true;
        return this.recordEvent({
          rentalId: normalizedRentalId,
          eventType: normalizedEventType,
          actor,
          metadata,
          createdAt,
          dispatchKey: normalizedDispatchKey,
        });
      }
      if (errorCode === '23505' && normalizedDispatchKey) {
        const existing = await this.findByDispatchKey({
          rentalId: normalizedRentalId,
          eventType: normalizedEventType,
          dispatchKey: normalizedDispatchKey,
        });
        if (existing) {
          return {
            ...existing,
            duplicate: true,
          };
        }
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
