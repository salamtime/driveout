const toBase64UrlFromBytes = (bytes) => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const fromBase64UrlToBytes = (value) => {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + padding);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const encodeLegacy = (value) =>
  btoa(unescape(encodeURIComponent(value)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const decodeLegacy = (value) => {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return decodeURIComponent(escape(atob(normalized + padding)));
};

const gzipSupported =
  typeof CompressionStream !== 'undefined' &&
  typeof DecompressionStream !== 'undefined' &&
  typeof Response !== 'undefined';

const gzipString = async (value) => {
  const stream = new Blob([value]).stream().pipeThrough(new CompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
};

const gunzipBytes = async (bytes) => {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
};

export const encodePublicSharePayload = async (payload) => {
  try {
    const json = JSON.stringify(payload || {});

    if (!gzipSupported) {
      return encodeLegacy(json);
    }

    const compressed = await gzipString(json);
    return `gz.${toBase64UrlFromBytes(compressed)}`;
  } catch {
    return null;
  }
};

export const decodePublicSharePayload = async (encoded) => {
  try {
    if (String(encoded || '').startsWith('gz.')) {
      const compressed = fromBase64UrlToBytes(String(encoded).slice(3));
      const json = await gunzipBytes(compressed);
      return JSON.parse(json);
    }

    return JSON.parse(decodeLegacy(encoded));
  } catch {
    return null;
  }
};
