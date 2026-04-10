import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import i18n from '../../i18n';

/**
 * Unauthorized Component
 * 
 * Displays when users try to access resources they don't have permission for.
 * Provides helpful information about their current role and available actions.
 */
const Unauthorized = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { user, signOut } = useAuth();
  const userRole = user ? user.role : 'customer';

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const getRoleInfo = () => {
    const roleInfo = {
      owner: {
        name: tr('Owner', 'Proprietaire'),
        color: 'purple',
        description: tr('Full system access', 'Acces complet au systeme'),
        capabilities: [tr('System management', 'Gestion du systeme'), tr('User management', 'Gestion des utilisateurs'), tr('All administrative functions', 'Toutes les fonctions administratives')]
      },
      admin: {
        name: tr('Administrator', 'Administrateur'),
        color: 'blue',
        description: tr('Administrative access', 'Acces administratif'),
        capabilities: [tr('Fleet management', 'Gestion de flotte'), tr('Rental operations', 'Operations de location'), tr('User management', 'Gestion des utilisateurs'), tr('Reports', 'Rapports')]
      },
      employee: {
        name: tr('Employee', 'Employe'),
        color: 'green',
        description: tr('Daily operations', 'Operations quotidiennes'),
        capabilities: [tr('Rental management', 'Gestion des locations'), tr('Vehicle updates', 'Mises a jour vehicules'), tr('Customer service', 'Service client')]
      },
      guide: {
        name: tr('Guide', 'Guide'),
        color: 'yellow',
        description: tr('Tour operations', 'Operations des tours'),
        capabilities: [tr('Tour management', 'Gestion des tours'), tr('Assigned vehicles', 'Vehicules assignes'), tr('Customer communication', 'Communication client')]
      },
      customer: {
        name: tr('Customer', 'Client'),
        color: 'gray',
        description: tr('Self-service access', 'Acces libre-service'),
        capabilities: [tr('Vehicle booking', 'Reservation vehicule'), tr('Rental history', 'Historique de location'), tr('Profile management', 'Gestion du profil')]
      }
    };

    return roleInfo[userRole] || roleInfo.customer;
  };

  const roleInfo = getRoleInfo();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="mx-auto h-12 w-12 bg-red-600 rounded-lg flex items-center justify-center">
          <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          {tr('Access Denied', 'Accès refusé')}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          {tr("You don't have permission to access this resource", "Vous n'avez pas l'autorisation d'accéder à cette ressource")}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {/* Current User Info */}
          {user && (
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">{tr('Current User', 'Utilisateur actuel')}</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-gray-700">
                      {user.email?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {user.email}
                    </p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-${roleInfo.color}-100 text-${roleInfo.color}-800`}>
                      {roleInfo.name}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-3">{roleInfo.description}</p>
                
                <div>
                  <h4 className="text-xs font-medium text-gray-700 mb-2">{tr('Your Capabilities:', 'Vos capacites :')}</h4>
                  <ul className="text-xs text-gray-600 space-y-1">
                    {roleInfo.capabilities.map((capability, index) => (
                      <li key={index} className="flex items-center">
                        <span className="w-1 h-1 bg-gray-400 rounded-full mr-2"></span>
                        {capability}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-4">
            <Link
              to="/dashboard"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {tr('Go to Dashboard', 'Aller au tableau de bord')}
            </Link>

            <Link
              to="/"
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {tr('Go to Home', "Aller a l'accueil")}
            </Link>

            <button
              onClick={handleSignOut}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {tr('Sign Out & Try Different Account', 'Se deconnecter et essayer un autre compte')}
            </button>
          </div>

          {/* Help Text */}
          <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
            <h4 className="text-sm font-medium text-yellow-800 mb-2">{tr('Need Different Access?', 'Besoin d un autre acces ?')}</h4>
            <p className="text-xs text-yellow-700 mb-3">
              {tr('If you need access to this feature, please contact your administrator or try logging in with a different account that has the required permissions.', "Si vous avez besoin d'acceder a cette fonctionnalite, contactez votre administrateur ou essayez un autre compte disposant des autorisations requises.")}
            </p>
            <div className="text-xs text-yellow-700">
              <strong>{tr('Demo Accounts Available:', 'Comptes demo disponibles :')}</strong>
              <ul className="mt-1 space-y-1">
                <li>• {tr('Owner', 'Proprietaire')}: owner_demo@saharax.com ({tr('Full access', 'Acces complet')})</li>
                <li>• {tr('Admin', 'Admin')}: admin@saharax.com ({tr('Administrative access', 'Acces administratif')})</li>
                <li>• {tr('Employee', 'Employe')}: employee_demo@saharax.com ({tr('Operations access', 'Acces operations')})</li>
                <li>• {tr('Guide', 'Guide')}: guide_demo@saharax.com ({tr('Tour access', 'Acces tours')})</li>
                <li>• {tr('Customer', 'Client')}: test@saharax.com ({tr('Limited access', 'Acces limite')})</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Unauthorized;
