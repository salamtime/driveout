import React from 'react';
import { useSelector } from 'react-redux';
import { useAuth } from '../../contexts/AuthContext';
import i18n from '../../i18n';

const ProtectedRoute = ({ children, requiredRole, fallback = null }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { user, isAuthenticated } = useSelector(state => state.auth);
  const auth = useAuth();

  // Clean role extraction from metadata only
  const userRole = auth.user?.role;

  console.log('🔒 ProtectedRoute - Clean auth check:', {
    isAuthenticated,
    userRole,
    requiredRole,
    email: auth.user?.email
  });

  // Check authentication
  if (!isAuthenticated || !auth.user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-lg font-semibold">{tr('Authentication Required', 'Authentification requise')}</h2>
          <p className="text-gray-600">{tr('Please log in to continue.', 'Veuillez vous connecter pour continuer.')}</p>
          <button 
            onClick={() => window.location.href = '/auth/login'}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {tr('Go to Login', 'Aller à la connexion')}
          </button>
        </div>
      </div>
    );
  }

  // Check role access if required
  if (requiredRole) {
    const rolesArray = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    
    if (!userRole || !rolesArray.includes(userRole)) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-lg font-semibold">{tr('Access Denied', 'Accès refusé')}</h2>
            <p className="text-gray-600">
              {tr("You don't have the required permissions to access this page.", "Vous n'avez pas les autorisations requises pour accéder à cette page.")}
            </p>
            <p className="text-sm text-gray-500 mt-2">
              {tr('Required:', 'Requis :')} {rolesArray.join(', ')} | {tr('Your role:', 'Votre rôle :')} {userRole || tr('none', 'aucun')}
            </p>
            <button 
              onClick={() => window.history.back()}
              className="mt-4 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              {tr('Go Back', 'Retour')}
            </button>
          </div>
        </div>
      );
    }
  }

  console.log('✅ ProtectedRoute - Access granted');
  return children;
};

export default ProtectedRoute;
