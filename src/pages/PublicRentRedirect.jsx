import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PublicCatalogService from '../services/PublicCatalogService';
import { buildInstantBookingHref } from '../utils/publicBookingFlow';

const PublicRentRedirect = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const redirectToDefaultVehicle = async () => {
      try {
        const city = searchParams.get('city') || 'Tangier';
        const catalog = await PublicCatalogService.getCatalog({
          flow: 'instant',
          source: 'certified_fleet',
          city,
        });

        if (!active) return;

        const listings = Array.isArray(catalog?.listings) ? catalog.listings : [];
        const at6Listing = listings.find((item) => String(item?.model || '').toUpperCase() === 'AT6');
        const targetListing = at6Listing || listings[0] || null;

        if (!targetListing) {
          setError('No rental vehicles are available right now.');
          return;
        }

        navigate(buildInstantBookingHref(targetListing, { city }), { replace: true });
      } catch (_error) {
        if (!active) return;
        setError('Unable to open rentals right now.');
      }
    };

    redirectToDefaultVehicle();

    return () => {
      active = false;
    };
  }, [navigate, searchParams]);

  if (!error) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f5f3ff_0%,#ece9ff_48%,#ffffff_100%)] px-6">
      <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white px-6 py-8 text-center shadow-sm">
        <p className="text-base font-semibold text-slate-900">{error}</p>
      </div>
    </div>
  );
};

export default PublicRentRedirect;
