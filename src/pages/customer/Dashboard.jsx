import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { isBusinessAccountType, isBusinessOwnerAccountType, isPlatformOwnerEmail } from '../../utils/accountType';

/**
 * CustomerDashboard - Redirects customer users into the profile workspace.
 */
const CustomerDashboard = () => {
  const { user, getBusinessOwnerHomePath } = useAuth();
  const accountType = user?.user_metadata?.account_type || '';
  const platformOwnerOverride = isPlatformOwnerEmail(user?.email);
  const businessOwnerFreezeRedirect = !platformOwnerOverride && isBusinessOwnerAccountType(accountType)
    ? getBusinessOwnerHomePath({
        account_type: accountType,
        verification_status: user?.user_metadata?.verification_status || user?.app_metadata?.verification_status,
        subscription_status: user?.user_metadata?.subscription_status || user?.app_metadata?.subscription_status,
      })
    : null;

  if (platformOwnerOverride) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  if (businessOwnerFreezeRedirect) {
    return <Navigate to={businessOwnerFreezeRedirect} replace />;
  }

  if (isBusinessAccountType(accountType)) {
    return <Navigate to="/account/overview" replace />;
  }

  return <Navigate to="/account/overview" replace />;
};

export default CustomerDashboard;
