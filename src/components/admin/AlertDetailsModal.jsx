import React, { useState } from 'react';
import toast from 'react-hot-toast';

const AlertDetailsModal = ({ isOpen, onClose, alerts = [] }) => {
  const [processingAlert, setProcessingAlert] = useState(null);

  if (!isOpen) return null;

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high':
        return 'text-red-800 bg-red-100';
      case 'critical':
        return 'text-red-900 bg-red-200';
      case 'medium':
        return 'text-yellow-800 bg-yellow-100';
      default:
        return 'text-gray-800 bg-gray-100';
    }
  };

  const handleAlertAction = async (alert, action) => {
    setProcessingAlert(alert.id);
    
    try {
      switch (action) {
        case 'schedule_service':
          toast.success(`Service scheduled for ${alert.vehicleName}`);
          break;
        case 'mark_complete':
          toast.success(`Oil change marked as complete for ${alert.vehicleName}`);
          break;
        case 'snooze':
          toast.success(`Reminder snoozed for ${alert.vehicleName}`);
          break;
        case 'mark_renewed':
          toast.success(`${alert.type === 'registration_expiry' ? 'Registration' : 'Insurance'} marked as renewed for ${alert.vehicleName}`);
          break;
        case 'extend_deadline':
          toast.success(`Deadline extended for ${alert.vehicleName}`);
          break;
        case 'update_info':
          toast.success(`Information updated for ${alert.vehicleName}`);
          break;
        case 'contact_insurer':
          toast.success(`Insurer contact reminder set for ${alert.vehicleName}`);
          break;
        default:
          toast.success('Action completed');
      }
      
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      toast.error('Failed to process alert action');
    } finally {
      setProcessingAlert(null);
    }
  };

  const getAlertIcon = (type) => {
    switch (type) {
      case 'registration_expiry':
        return (
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case 'insurance_expiry':
        return (
          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        );
      case 'maintenance_due':
        return (
          <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black bg-opacity-50 overflow-y-auto h-full w-full">
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 my-8 max-h-[80vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">System Alerts</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {alerts.length === 0 ? (
            <div className="text-center py-8">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="mt-2 text-gray-500">No alerts at this time</p>
              <p className="text-sm text-gray-400 mt-1">Your fleet is running smoothly!</p>
            </div>
          ) : (
            <div className="space-y-6">
              {alerts.map((alert) => (
                <div key={alert.id} className="border border-gray-200 rounded-lg p-6 bg-white shadow-sm">
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      {getAlertIcon(alert.type)}
                    </div>
                    <div className="flex-grow">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            {getAlertTitle(alert.type)}
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(alert.priority)}`}>
                              {alert.priority}
                            </span>
                          </h3>
                          <p className="text-sm text-gray-600 mt-1">Vehicle: {alert.vehicleName}</p>
                        </div>
                      </div>
                      
                      <div className="mt-4 bg-gray-50 rounded-md p-4">
                        {renderAlertDetails(alert)}
                      </div>
                      
                      <div className="mt-4 flex flex-wrap gap-2">
                        {renderAlertActions(alert)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  function getAlertTitle(type) {
    switch (type) {
      case 'maintenance_due':
        return '🔧 Oil Change Due';
      case 'registration_expiry':
        return '📋 Registration Expiring';
      case 'insurance_expiry':
        return '🛡️ Insurance Expiring';
      default:
        return '⚠️ Alert';
    }
  }

  function renderAlertDetails(alert) {
    switch (alert.type) {
      case 'maintenance_due':
        return (
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Current Odometer:</span>
              <span className="text-sm font-medium">{alert.currentOdometer || 'N/A'} km</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Due at:</span>
              <span className="text-sm font-medium">{alert.dueOdometer} km</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Remaining:</span>
              <span className="text-sm font-medium text-orange-600">
                {alert.dueOdometer - alert.currentOdometer} km
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Status:</span>
              <span className={`text-sm font-medium ${alert.priority === 'critical' ? 'text-red-600' : 'text-yellow-600'}`}>
                {alert.priority === 'critical' ? 'Overdue - Service Now' : 'Service Soon'}
              </span>
            </div>
          </div>
        );
      
      case 'registration_expiry':
        const regDaysRemaining = Math.ceil((new Date(alert.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
        return (
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Expiry Date:</span>
              <span className="text-sm font-medium">{new Date(alert.dueDate).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Days Remaining:</span>
              <span className={`text-sm font-medium ${regDaysRemaining <= 0 ? 'text-red-600' : regDaysRemaining <= 7 ? 'text-orange-600' : 'text-yellow-600'}`}>
                {regDaysRemaining <= 0 ? `Expired ${Math.abs(regDaysRemaining)} days ago` : `${regDaysRemaining} days`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Status:</span>
              <span className={`text-sm font-medium ${alert.priority === 'critical' ? 'text-red-600' : 'text-yellow-600'}`}>
                {alert.priority === 'critical' ? 'Critical - Action Required' : 'Renewal Needed'}
              </span>
            </div>
          </div>
        );
      
      case 'insurance_expiry':
        const insDaysRemaining = Math.ceil((new Date(alert.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
        return (
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Expiry Date:</span>
              <span className="text-sm font-medium">{new Date(alert.dueDate).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Days Remaining:</span>
              <span className={`text-sm font-medium ${insDaysRemaining <= 0 ? 'text-red-600' : insDaysRemaining <= 7 ? 'text-orange-600' : 'text-yellow-600'}`}>
                {insDaysRemaining <= 0 ? `Expired ${Math.abs(insDaysRemaining)} days ago` : `${insDaysRemaining} days`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Provider:</span>
              <span className="text-sm font-medium">ATV Insurance Co.</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Status:</span>
              <span className={`text-sm font-medium ${alert.priority === 'critical' ? 'text-red-600' : 'text-yellow-600'}`}>
                {alert.priority === 'critical' ? 'Critical - Action Required' : 'Renewal Needed'}
              </span>
            </div>
          </div>
        );
      
      default:
        return (
          <div className="text-sm text-gray-600">
            {alert.message}
          </div>
        );
    }
  }

  function renderAlertActions(alert) {
    const isProcessing = processingAlert === alert.id;
    
    switch (alert.type) {
      case 'maintenance_due':
        return (
          <>
            <button
              onClick={() => handleAlertAction(alert, 'schedule_service')}
              disabled={isProcessing}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
            >
              {isProcessing ? 'Processing...' : 'Schedule Service'}
            </button>
            <button
              onClick={() => handleAlertAction(alert, 'mark_complete')}
              disabled={isProcessing}
              className="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:bg-green-300 transition-colors"
            >
              Mark Complete
            </button>
            <button
              onClick={() => handleAlertAction(alert, 'snooze')}
              disabled={isProcessing}
              className="px-3 py-1 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700 disabled:bg-gray-300 transition-colors"
            >
              Snooze
            </button>
          </>
        );
      
      case 'registration_expiry':
        return (
          <>
            <button
              onClick={() => handleAlertAction(alert, 'mark_renewed')}
              disabled={isProcessing}
              className="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:bg-green-300 transition-colors"
            >
              Mark Renewed
            </button>
            <button
              onClick={() => handleAlertAction(alert, 'extend_deadline')}
              disabled={isProcessing}
              className="px-3 py-1 bg-yellow-600 text-white text-sm rounded-md hover:bg-yellow-700 disabled:bg-yellow-300 transition-colors"
            >
              Extend Deadline
            </button>
            <button
              onClick={() => handleAlertAction(alert, 'update_info')}
              disabled={isProcessing}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
            >
              Update Info
            </button>
          </>
        );
      
      case 'insurance_expiry':
        return (
          <>
            <button
              onClick={() => handleAlertAction(alert, 'contact_insurer')}
              disabled={isProcessing}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
            >
              Contact Insurer
            </button>
            <button
              onClick={() => handleAlertAction(alert, 'mark_renewed')}
              disabled={isProcessing}
              className="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:bg-green-300 transition-colors"
            >
              Mark Renewed
            </button>
            <button
              onClick={() => handleAlertAction(alert, 'update_info')}
              disabled={isProcessing}
              className="px-3 py-1 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700 disabled:bg-gray-300 transition-colors"
            >
              Update Policy
            </button>
          </>
        );
      
      default:
        return null;
    }
  }
};

export default AlertDetailsModal;