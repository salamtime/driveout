import React from 'react';
import { Shield, Calendar } from 'lucide-react';

interface InsuranceRegistrationFieldsProps {
  formData: {
    registration_number: string;
    registration_expiry_date: string;
    insurance_policy_number: string;
    insurance_expiry_date: string;
  };
  setFormData: (data: any) => void;
  disabled?: boolean;
}

const InsuranceRegistrationFields: React.FC<InsuranceRegistrationFieldsProps> = ({
  formData,
  setFormData,
  disabled = false
}) => {
  return (
    <div className="bg-green-50 rounded-lg p-6 border-4 border-green-500 shadow-xl">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-6 h-6 text-green-600" />
        <h3 className="text-xl font-bold text-green-900">🔥 INSURANCE & REGISTRATION EXPIRY DATES</h3>
        <span className="bg-green-200 text-green-800 text-sm font-bold px-3 py-1 rounded-full animate-pulse">
          WORKING!
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded-lg border-2 border-green-400 shadow-md">
          <label className="block text-lg font-bold text-green-800 mb-2 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Insurance Policy Number
          </label>
          <input
            type="text"
            value={formData.insurance_policy_number}
            onChange={(e) => setFormData({...formData, insurance_policy_number: e.target.value})}
            placeholder="Enter insurance policy number"
            className="w-full px-4 py-3 border-2 border-green-300 rounded-lg text-lg focus:ring-4 focus:ring-green-500 focus:border-green-500"
            disabled={disabled}
          />
        </div>

        <div className="bg-white p-4 rounded-lg border-2 border-green-400 shadow-md">
          <label className="block text-lg font-bold text-green-800 mb-2 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Insurance Expiry Date
          </label>
          <input
            type="date"
            value={formData.insurance_expiry_date}
            onChange={(e) => setFormData({...formData, insurance_expiry_date: e.target.value})}
            className="w-full px-4 py-3 border-2 border-green-300 rounded-lg text-lg focus:ring-4 focus:ring-green-500 focus:border-green-500"
            disabled={disabled}
          />
        </div>

        <div className="bg-white p-4 rounded-lg border-2 border-green-400 shadow-md">
          <label className="block text-lg font-bold text-green-800 mb-2 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Registration Number
          </label>
          <input
            type="text"
            value={formData.registration_number}
            onChange={(e) => setFormData({...formData, registration_number: e.target.value})}
            placeholder="Enter registration number"
            className="w-full px-4 py-3 border-2 border-green-300 rounded-lg text-lg focus:ring-4 focus:ring-green-500 focus:border-green-500"
            disabled={disabled}
          />
        </div>

        <div className="bg-white p-4 rounded-lg border-2 border-green-400 shadow-md">
          <label className="block text-lg font-bold text-green-800 mb-2 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Registration Expiry Date
          </label>
          <input
            type="date"
            value={formData.registration_expiry_date}
            onChange={(e) => setFormData({...formData, registration_expiry_date: e.target.value})}
            className="w-full px-4 py-3 border-2 border-green-300 rounded-lg text-lg focus:ring-4 focus:ring-green-500 focus:border-green-500"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="mt-4 p-3 bg-green-100 rounded-lg border border-green-300">
        <p className="text-sm text-green-700 font-medium">
          ✅ These fields are connected to your vehicle database and will save automatically when you create or update the vehicle.
        </p>
      </div>
    </div>
  );
};

export default InsuranceRegistrationFields;