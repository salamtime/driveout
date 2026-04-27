import { supabase } from '../lib/supabase';

const parseResponse = async (response) => {
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Request failed with status ${response.status}`);
  }

  return payload;
};

const getAuthHeaders = async () => {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
};

export const requestPasswordResetEmail = async ({ email, redirectTo }) => {
  const response = await fetch('/api/system-settings?action=send-password-reset-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      redirectTo,
    }),
  });

  return parseResponse(response);
};

export const sendRentalDocumentsEmail = async ({
  toEmail,
  customerName,
  rentalId,
  items,
  documentsHubUrl,
}) => {
  const authHeaders = await getAuthHeaders();
  const response = await fetch('/api/system-settings?action=send-rental-documents-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({
      toEmail,
      customerName,
      rentalId,
      items,
      documentsHubUrl,
    }),
  });

  return parseResponse(response);
};

export const sendAnnouncementEmail = async ({
  to,
  subject,
  title,
  messageHtml,
  ctaLabel,
  ctaUrl,
}) => {
  const authHeaders = await getAuthHeaders();
  const response = await fetch('/api/system-settings?action=send-announcement-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({
      to,
      subject,
      title,
      messageHtml,
      ctaLabel,
      ctaUrl,
    }),
  });

  return parseResponse(response);
};
