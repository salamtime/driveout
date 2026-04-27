const DEFAULT_EMAIL_BRAND = {
  companyName: 'SaharaX',
  logoUrl: '',
  primaryColor: '#7c3aed',
};

export const EMAIL_SENDERS = {
  bookings: 'SaharaX Bookings <bookings@send.saharax.driveout.io>',
  support: 'SaharaX Support <support@send.saharax.driveout.io>',
  updates: 'SaharaX Updates <updates@send.saharax.driveout.io>',
};

const escapeHtml = (value = '') =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderShell = ({ preview, title, eyebrow, bodyHtml, footerNote, brand = {} }) => {
  const mergedBrand = { ...DEFAULT_EMAIL_BRAND, ...(brand || {}) };
  const safePreview = escapeHtml(preview || '');
  const safeTitle = escapeHtml(title || mergedBrand.companyName);
  const safeEyebrow = escapeHtml(eyebrow || mergedBrand.companyName);
  const safeFooter = escapeHtml(footerNote || `Sent by ${mergedBrand.companyName}`);

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${safeTitle}</title>
      </head>
      <body style="margin:0;padding:0;background:#f5f3ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safePreview}</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8f7ff;padding:32px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;">
                <tr>
                  <td style="padding:0 0 18px 0;">
                    <div style="border-radius:28px;background:linear-gradient(135deg,rgba(124,58,237,0.98) 0%,rgba(139,92,246,0.88) 52%,rgba(245,243,255,0.98) 100%);padding:28px 28px 24px 28px;box-shadow:0 24px 60px rgba(76,29,149,0.18);">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td style="vertical-align:top;">
                            <div style="display:inline-flex;align-items:center;gap:10px;border-radius:999px;padding:8px 14px;background:rgba(255,255,255,0.16);color:#ede9fe;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">
                              ${mergedBrand.logoUrl ? `<img src="${escapeHtml(mergedBrand.logoUrl)}" alt="${escapeHtml(mergedBrand.companyName)}" style="height:20px;width:20px;border-radius:999px;display:block;" />` : ''}
                              <span>${safeEyebrow}</span>
                            </div>
                            <h1 style="margin:18px 0 0 0;font-size:30px;line-height:1.1;font-weight:700;color:white;">${safeTitle}</h1>
                          </td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="background:#ffffff;border-radius:28px;padding:28px;box-shadow:0 18px 42px rgba(15,23,42,0.08);">
                    ${bodyHtml}
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 10px 0 10px;text-align:center;color:#6b7280;font-size:12px;line-height:18px;">
                    ${safeFooter}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
};

const renderPrimaryButton = (label, href) => `
  <a
    href="${escapeHtml(href)}"
    style="display:inline-block;border-radius:16px;padding:14px 22px;background:linear-gradient(135deg,#7c3aed 0%,#6366f1 100%);color:#ffffff;text-decoration:none;font-weight:700;box-shadow:0 16px 30px rgba(99,102,241,0.22);"
  >${escapeHtml(label)}</a>
`;

const renderSecondaryButton = (label, href) => `
  <a
    href="${escapeHtml(href)}"
    style="display:inline-block;border-radius:16px;padding:13px 20px;background:#ffffff;color:#475569;text-decoration:none;font-weight:700;border:1px solid #d8d4fe;"
  >${escapeHtml(label)}</a>
`;

const renderDetailRows = (rows = []) =>
  rows
    .filter((row) => row?.label && row?.value)
    .map(
      (row) => `
        <tr>
          <td style="padding:0 0 12px 0;font-size:13px;line-height:20px;color:#64748b;">${escapeHtml(row.label)}</td>
          <td style="padding:0 0 12px 18px;font-size:14px;line-height:20px;color:#0f172a;font-weight:700;text-align:right;">${escapeHtml(row.value)}</td>
        </tr>
      `
    )
    .join('');

export const buildPasswordResetEmail = ({ resetUrl, email, brand = {} }) => ({
  subject: 'Reset your SaharaX password',
  preview: 'Use the secure link below to reset your password.',
  html: renderShell({
    preview: 'Use the secure link below to reset your password.',
    title: 'Reset your password',
    eyebrow: 'SaharaX Support',
    brand,
    footerNote: 'This secure reset link was requested for your SaharaX account.',
    bodyHtml: `
      <p style="margin:0 0 14px 0;font-size:15px;line-height:24px;color:#475569;">We received a request to reset the password for <strong>${escapeHtml(email)}</strong>.</p>
      <p style="margin:0 0 22px 0;font-size:15px;line-height:24px;color:#475569;">Use the secure link below to choose a new password.</p>
      <div style="margin:0 0 22px 0;">${renderPrimaryButton('Reset password', resetUrl)}</div>
      <p style="margin:0 0 8px 0;font-size:13px;line-height:22px;color:#64748b;">If the button does not open, copy this link into your browser:</p>
      <p style="margin:0;font-size:13px;line-height:22px;color:#7c3aed;word-break:break-all;">${escapeHtml(resetUrl)}</p>
    `,
  }),
});

export const buildRentalDocumentsEmail = ({
  customerName,
  rentalId,
  items = [],
  documentsHubUrl = '',
  brand = {},
}) => {
  const safeCustomerName = escapeHtml(customerName || 'Customer');
  const safeRentalId = escapeHtml(rentalId || '');
  const itemCards = items
    .map((item) => `
      <tr>
        <td style="padding:0 0 14px 0;">
          <div style="border:1px solid #e9d5ff;border-radius:20px;padding:18px;background:#ffffff;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#8b5cf6;">Document</div>
            <div style="margin-top:8px;font-size:18px;font-weight:700;color:#111827;">${escapeHtml(item.label || 'Document')}</div>
            <div style="margin-top:6px;font-size:14px;line-height:22px;color:#64748b;">${escapeHtml(item.description || 'Open the secure link below to view this rental item.')}</div>
            <div style="margin-top:16px;">${renderPrimaryButton(item.ctaLabel || 'Open document', item.url)}</div>
          </div>
        </td>
      </tr>
    `)
    .join('');

  const headerNote = documentsHubUrl
    ? `<div style="margin:0 0 18px 0;">${renderPrimaryButton('Open all rental items', documentsHubUrl)}</div>`
    : '';

  return {
    subject: `Your SaharaX rental documents${safeRentalId ? ` • ${safeRentalId}` : ''}`,
    preview: 'Open your contract, receipt, and shared rental items securely.',
    html: renderShell({
      preview: 'Open your contract, receipt, and shared rental items securely.',
      title: 'Rental documents',
      eyebrow: 'SaharaX Bookings',
      brand,
      footerNote: 'Shared securely for your rental access.',
      bodyHtml: `
        <p style="margin:0 0 8px 0;font-size:15px;line-height:24px;color:#475569;">Hello ${safeCustomerName},</p>
        <p style="margin:0 0 20px 0;font-size:15px;line-height:24px;color:#475569;">Your shared rental items are ready${safeRentalId ? ` for booking <strong>${safeRentalId}</strong>` : ''}.</p>
        ${headerNote}
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${itemCards}</table>
      `,
    }),
  };
};

export const buildAnnouncementEmail = ({
  subject,
  title,
  messageHtml,
  ctaLabel,
  ctaUrl,
  brand = {},
}) => ({
  subject,
  preview: title || subject,
  html: renderShell({
    preview: title || subject,
    title: title || subject,
    eyebrow: 'SaharaX Updates',
    brand,
    footerNote: 'You are receiving this update from SaharaX.',
    bodyHtml: `
      <div style="font-size:15px;line-height:24px;color:#475569;">${messageHtml}</div>
      ${ctaLabel && ctaUrl ? `<div style="margin-top:24px;">${renderPrimaryButton(ctaLabel, ctaUrl)}</div>` : ''}
    `,
  }),
});

export const buildBookingConfirmationEmail = ({
  bookingType = 'rental',
  customerName,
  bookingReference,
  summaryRows = [],
  openBookingUrl,
  signInUrl,
  signUpUrl,
  receiptUrl = '',
  contractUrl = '',
  hasAccount = false,
  brand = {},
}) => {
  const safeCustomerName = escapeHtml(customerName || 'Customer');
  const safeReference = escapeHtml(bookingReference || '');
  const normalizedType = String(bookingType || 'rental').toLowerCase();
  const isTour = normalizedType === 'tour';
  const title = isTour ? 'Tour confirmed' : 'Booking confirmed';
  const subtitle = isTour
    ? 'Your SaharaX tour request is confirmed and ready to follow.'
    : 'Your SaharaX rental booking is confirmed and ready to follow.';

  const secondaryActionHtml = hasAccount
    ? signInUrl
      ? `<div style="margin-top:12px;">${renderSecondaryButton(isTour ? 'Open my tour' : 'Open my booking', signInUrl)}</div>`
      : ''
    : signUpUrl
      ? `<div style="margin-top:12px;">${renderSecondaryButton('Create account to follow this booking', signUpUrl)}</div>`
      : '';

  const documentLinks = [
    contractUrl
      ? `
        <tr>
          <td style="padding:0 0 12px 0;">
            <div style="border:1px solid #e2e8f0;border-radius:18px;padding:16px;background:#fff;">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;">Document</div>
              <div style="margin-top:8px;font-size:16px;font-weight:700;color:#111827;">Contract</div>
              <div style="margin-top:6px;font-size:13px;line-height:21px;color:#64748b;">Open the latest contract copy for this booking.</div>
              <div style="margin-top:14px;">${renderSecondaryButton('Open contract', contractUrl)}</div>
            </div>
          </td>
        </tr>
      `
      : '',
    receiptUrl
      ? `
        <tr>
          <td style="padding:0 0 12px 0;">
            <div style="border:1px solid #ede9fe;border-radius:18px;padding:16px;background:#faf5ff;">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#8b5cf6;">Receipt</div>
              <div style="margin-top:8px;font-size:16px;font-weight:700;color:#111827;">Booking receipt</div>
              <div style="margin-top:6px;font-size:13px;line-height:21px;color:#64748b;">Open the latest receipt copy for this booking.</div>
              <div style="margin-top:14px;">${renderSecondaryButton('Open receipt', receiptUrl)}</div>
            </div>
          </td>
        </tr>
      `
      : '',
  ]
    .filter(Boolean)
    .join('');

  return {
    subject: `${title}${safeReference ? ` • ${safeReference}` : ''}`,
    preview: subtitle,
    html: renderShell({
      preview: subtitle,
      title,
      eyebrow: 'SaharaX Bookings',
      brand,
      footerNote: 'This confirmation was sent automatically by SaharaX Bookings.',
      bodyHtml: `
        <p style="margin:0 0 8px 0;font-size:15px;line-height:24px;color:#475569;">Hello ${safeCustomerName},</p>
        <p style="margin:0 0 20px 0;font-size:15px;line-height:24px;color:#475569;">${escapeHtml(subtitle)}</p>
        ${safeReference ? `<div style="margin:0 0 18px 0;display:inline-flex;align-items:center;border-radius:999px;background:#f5f3ff;padding:8px 14px;font-size:12px;font-weight:700;color:#7c3aed;">Reference: ${safeReference}</div>` : ''}
        <div style="margin:0 0 22px 0;border:1px solid #ede9fe;border-radius:22px;padding:18px;background:linear-gradient(180deg,#ffffff 0%,#faf5ff 100%);">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#8b5cf6;">Confirmation summary</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;">${renderDetailRows(summaryRows)}</table>
        </div>
        ${openBookingUrl ? `<div style="margin:0 0 12px 0;">${renderPrimaryButton(hasAccount ? (isTour ? 'Open my tour' : 'Open my booking') : 'Open confirmation', openBookingUrl)}</div>` : ''}
        ${secondaryActionHtml}
        ${
          !hasAccount && signInUrl
            ? `<p style="margin:16px 0 0 0;font-size:13px;line-height:21px;color:#64748b;">Already have a SaharaX account? <a href="${escapeHtml(signInUrl)}" style="color:#7c3aed;font-weight:700;text-decoration:none;">Sign in and open this booking</a>.</p>`
            : ''
        }
        ${documentLinks ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px;">${documentLinks}</table>` : ''}
      `,
    }),
  };
};

export const sendResendEmail = async ({
  from,
  to,
  subject,
  html,
  replyTo,
}) => {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  const payloadText = await response.text();
  let payload;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    payload = { raw: payloadText };
  }

  if (!response.ok) {
    throw new Error(payload?.message || `Resend request failed with status ${response.status}`);
  }

  return payload;
};
