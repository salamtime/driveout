import React, { useState, useEffect } from 'react';
import { X, Mail, Phone, Calendar, Shield, MessageCircle } from 'lucide-react';
import OptimizedAvatar from '../common/OptimizedAvatar';
import { supabase } from '../../services/supabaseClient';

const UserDetailsModal = ({ user, isOpen, onClose }) => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user?.id) return;
      
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('app_b30c02e74da644baad4668e3587d86b1_users')
          .select('phone_number, whatsapp_notifications')
          .eq('id', user.id)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          console.error('Error fetching user data:', error);
        }

        setUserData(data);
      } catch (err) {
        console.error('Error loading user data:', err);
      } finally {
        setLoading(false);
      }
    };

    if (isOpen && user) {
      fetchUserData();
    }
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const phoneNumber = userData?.phone_number || user.phone;
  const whatsappEnabled = userData?.whatsapp_notifications || false;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">User Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Avatar and Basic Info */}
          <div className="flex items-center mb-6">
            <OptimizedAvatar 
              src={user.avatarUrl}
              name={`${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || user.email}
              size={80}
              className="mr-4"
            />
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                {user.firstName} {user.lastName}
              </h3>
              <p className="text-gray-600">{user.email}</p>
              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full mt-1 ${
                user.role === 'admin' ? 'bg-red-100 text-red-800' :
                user.role === 'guide' ? 'bg-green-100 text-green-800' :
                user.role === 'employee' ? 'bg-yellow-100 text-yellow-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {user.role || 'User'}
              </span>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-4">
            <div className="flex items-center">
              <Mail className="h-4 w-4 text-gray-400 mr-3" />
              <span className="text-sm text-gray-900">{user.email}</span>
            </div>
            
            {phoneNumber && (
              <div className="flex items-center">
                <Phone className="h-4 w-4 text-gray-400 mr-3" />
                <span className="text-sm text-gray-900">{phoneNumber}</span>
                {whatsappEnabled && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    <MessageCircle className="h-3 w-3 mr-1" />
                    WhatsApp
                  </span>
                )}
              </div>
            )}
            
            <div className="flex items-center">
              <Calendar className="h-4 w-4 text-gray-400 mr-3" />
              <span className="text-sm text-gray-900">
                Joined {user.dateJoined ? new Date(user.dateJoined).toLocaleDateString() : 'Unknown'}
              </span>
            </div>
            
            <div className="flex items-center">
              <Shield className="h-4 w-4 text-gray-400 mr-3" />
              <span className="text-sm text-gray-900">
                Status: {user.status === 'active' ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>

          {/* Additional Info */}
          {user.position && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Position</h4>
              <p className="text-sm text-gray-600">{user.position}</p>
            </div>
          )}

          {/* WhatsApp Notifications Status */}
          {phoneNumber && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Notifications</h4>
              <div className="flex items-center">
                <MessageCircle className={`h-4 w-4 mr-2 ${whatsappEnabled ? 'text-green-600' : 'text-gray-400'}`} />
                <span className="text-sm text-gray-600">
                  WhatsApp Alerts: {whatsappEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserDetailsModal;