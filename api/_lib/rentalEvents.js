export const RENTAL_EVENTS_TABLE = 'rental_events';

const normalizeActor = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['renter', 'owner', 'system', 'admin'].includes(normalized)) return normalized;
  return 'system';
};

const normalizeEventType = (value) => String(value || '').trim().toLowerCase();
const normalizeMetadata = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

export const insertRentalEvent = async (adminClient, {
  rentalId,
  eventType,
  actor = 'system',
  metadata = {},
  createdAt = null,
}) => {
  const normalizedRentalId = String(rentalId || '').trim();
  const normalizedEventType = normalizeEventType(eventType);
  if (!adminClient || !normalizedRentalId || !normalizedEventType) return null;

  const payload = {
    rental_id: normalizedRentalId,
    event_type: normalizedEventType,
    actor: normalizeActor(actor),
    metadata: normalizeMetadata(metadata),
    ...(createdAt ? { created_at: createdAt } : {}),
  };

  const { data, error } = await adminClient
    .from(RENTAL_EVENTS_TABLE)
    .insert([payload])
    .select('*')
    .maybeSingle();

  if (error) {
    const errorCode = String(error?.code || '').trim().toUpperCase();
    const errorStatus = Number(error?.status || 0);
    const errorMessage = String(error?.message || error?.details || '').trim().toLowerCase();
    if (
      errorCode === '42P01' ||
      errorStatus === 404 ||
      errorMessage.includes('relation') && errorMessage.includes('does not exist') ||
      errorMessage.includes('not found')
    ) {
      return null;
    }
    console.warn('Failed to insert rental event:', error);
    return null;
  }

  return data || payload;
};
