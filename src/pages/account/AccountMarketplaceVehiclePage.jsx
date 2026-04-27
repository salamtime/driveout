import React, { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getCurrentLocationPath, resolveReturnPath } from '../../utils/navigationReturn';

const AccountMarketplaceVehiclePage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { vehicleId } = useParams();

  useEffect(() => {
    const target = vehicleId
      ? `/account/vehicles/${vehicleId}/profile?tab=overview`
      : '/account/vehicles';
    navigate(target, {
      replace: true,
      state: {
        ...(location.state && typeof location.state === 'object' ? location.state : {}),
        from: resolveReturnPath(location, getCurrentLocationPath(location)),
      },
    });
  }, [location.hash, location.pathname, location.search, location.state, navigate, vehicleId]);

  return null;
};

export default AccountMarketplaceVehiclePage;
