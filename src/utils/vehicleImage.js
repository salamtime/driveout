export const normalizeVehicleImageUrl = (url) => {
  if (!url || typeof url !== 'string') {
    return '';
  }

  try {
    const parsed = new URL(url);
    const signMarker = '/storage/v1/object/sign/vehicle-images/';
    const publicMarker = '/storage/v1/object/public/vehicle-images/';

    if (parsed.pathname.includes(publicMarker)) {
      return url;
    }

    if (parsed.pathname.includes(signMarker)) {
      const encodedPath = parsed.pathname.split(signMarker)[1] || '';
      const decodedPath = decodeURIComponent(encodedPath);
      return `${parsed.origin}${publicMarker}${decodedPath}`;
    }

    return url;
  } catch (_error) {
    return url;
  }
};
