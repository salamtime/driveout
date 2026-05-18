import React, { useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const AccountRewards = () => {
  const location = useLocation();

  const target = useMemo(() => {
    const params = new URLSearchParams(location.search);
    params.set('panel', 'credits');

    return {
      pathname: '/account/revenue',
      search: `?${params.toString()}`,
    };
  }, [location.search]);

  return <Navigate to={target} replace state={location.state} />;
};

export default AccountRewards;
