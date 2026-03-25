import React, { useState } from 'react';
import { X, Copy, Check, Eye, EyeOff, Mail, Key, User, Shield } from 'lucide-react';
import toast from 'react-hot-toast';

const CredentialsDisplayModal = ({ isOpen, onClose, user, password }) => {
  const [copiedField, setCopiedField] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const copyToClipboard = async (text, field) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success(`${field} copied to clipboard!`);
      setTimeout(() => setCopiedField(''), 2000);
    } catch (err) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const copyAllCredentials = async () => {
    const credentialsText = `
User Account Created Successfully
================================
Full Name: ${user?.full_name || 'Not provided'}
Email: ${user?.email}
Password: ${password}
Role: ${user?.role?.charAt(0)?.toUpperCase() + user?.role?.slice(1)}

Login Instructions:
1. Go to the application login page
2. Enter the email and password above
3. Change your password after first login (recommended)

Account created on: ${new Date().toLocaleDateString()}
    `.trim();

    try {
      await navigator.clipboard.writeText(credentialsText);
      toast.success('All credentials copied to clipboard!');
      setCopiedField('all');
      setTimeout(() => setCopiedField(''), 3000);
    } catch (err) {
      toast.error('Failed to copy credentials');
    }
  };

  if (!isOpen || !user || !password) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="h-5 w-5 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">User Created Successfully</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* User Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <span className="text-white font-semibold text-lg">
                  {user.full_name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || '?'}
                </span>
              </div>
              <div>
                <p className="font-medium text-gray-900">{user.full_name || 'No Name Set'}</p>
                <p className="text-sm text-gray-600">Account created successfully</p>
              </div>
            </div>
          </div>

          {/* Credentials */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <Key className="h-5 w-5 mr-2 text-blue-600" />
              Login Credentials
            </h3>

            {/* Email */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 flex items-center">
                <Mail className="h-4 w-4 mr-1" />
                Email
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={user.email}
                  readOnly
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-900"
                />
                <button
                  onClick={() => copyToClipboard(user.email, 'Email')}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Copy email"
                >
                  {copiedField === 'Email' ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 flex items-center">
                <Key className="h-4 w-4 mr-1" />
                Password
              </label>
              <div className="flex items-center space-x-2">
                <div className="flex-1 relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    readOnly
                    className="w-full px-3 py-2 pr-10 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 font-mono"
                  />
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  onClick={() => copyToClipboard(password, 'Password')}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Copy password"
                >
                  {copiedField === 'Password' ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Role */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 flex items-center">
                <Shield className="h-4 w-4 mr-1" />
                Role
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={user.role?.charAt(0)?.toUpperCase() + user.role?.slice(1)}
                  readOnly
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-900"
                />
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-blue-900 mb-2">Next Steps:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>1. Copy the credentials using the buttons above</li>
              <li>2. Share them securely with the user (email, in person, etc.)</li>
              <li>3. User can log in with these credentials</li>
              <li>4. Recommend changing password after first login</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <button
              onClick={copyAllCredentials}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
            >
              {copiedField === 'all' ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied All!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy All Credentials
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Done
            </button>
          </div>

          {/* Security Notice */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-xs text-yellow-800">
              <strong>Security Notice:</strong> These credentials will only be shown once. 
              Make sure to copy and share them securely before closing this dialog.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CredentialsDisplayModal;