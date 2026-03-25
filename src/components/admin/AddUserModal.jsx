import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { Copy, Eye, EyeOff, RefreshCw, UserPlus, CheckCircle, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { createUser } from '../../store/slices/usersSlice';

const ROLES = ['customer', 'guide', 'employee', 'admin', 'owner'];

const generateSecurePassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

const getPasswordStrength = (password) => {
  if (!password) return { strength: 'none', score: 0 };
  
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  
  if (score <= 2) return { strength: 'weak', score };
  if (score <= 4) return { strength: 'medium', score };
  return { strength: 'strong', score };
};

const AddUserModal = ({ isOpen, onClose, onUserCreated }) => {
  const dispatch = useDispatch();
  const { user: currentUser } = useSelector(state => state.auth);
  const { isCreating } = useSelector(state => state.users);
  
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    role: 'customer',
    password: '',
    confirmPassword: '',
    phone: ''
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdUser, setCreatedUser] = useState(null);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const generatePassword = () => {
    const newPassword = generateSecurePassword();
    setFormData(prev => ({
      ...prev,
      password: newPassword,
      confirmPassword: newPassword
    }));
    toast.success('Secure password generated');
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const copyAllCredentials = () => {
    if (!createdUser) return;
    
    const credentials = `
Account Created Successfully!

Email: ${createdUser.email}
Password: ${formData.password}
Full Name: ${createdUser.full_name}
Role: ${createdUser.role}
Created: ${new Date().toLocaleDateString()}

Please save these credentials securely.
    `.trim();
    
    copyToClipboard(credentials, 'All credentials');
  };

  const canAssignRole = (role) => {
    if (currentUser?.role === 'owner') return true;
    if (currentUser?.role === 'admin' && role !== 'owner') return true;
    return false;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.email || !formData.full_name || !formData.password) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    const strength = getPasswordStrength(formData.password);
    if (strength.strength === 'weak') {
      toast.error('Password is too weak. Please use a stronger password.');
      return;
    }
    
    if (!canAssignRole(formData.role)) {
      toast.error('You cannot assign this role');
      return;
    }

    try {
      const result = await dispatch(createUser(formData)).unwrap();
      setCreatedUser(result);
      setShowSuccess(true);
      toast.success('User created successfully!');
      
      // Notify parent component
      if (onUserCreated) {
        onUserCreated(result, formData.password);
      }
    } catch (error) {
      console.error('User creation failed:', error);
      toast.error(`User creation failed: ${error}`);
    }
  };

  const handleClose = () => {
    setFormData({
      email: '',
      full_name: '',
      role: 'customer',
      password: '',
      confirmPassword: '',
      phone: ''
    });
    setShowSuccess(false);
    setCreatedUser(null);
    onClose();
  };

  const passwordStrength = getPasswordStrength(formData.password);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {showSuccess ? 'User Created Successfully!' : 'Add New User'}
          </DialogTitle>
        </DialogHeader>

        {showSuccess && createdUser ? (
          // Success Screen
          <div className="space-y-6">
            <div className="text-center p-6 bg-green-50 rounded-lg">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-green-800 mb-2">
                Account Created Successfully!
              </h3>
              <p className="text-green-600">
                The user account has been created and can now access the system.
              </p>
            </div>

            <div className="space-y-4">
              <h4 className="font-medium">Account Details:</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <div className="flex items-center gap-2">
                    <Input value={createdUser.email} disabled />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => copyToClipboard(createdUser.email, 'Email')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Password</Label>
                  <div className="flex items-center gap-2">
                    <Input 
                      type={showPassword ? "text" : "password"}
                      value={formData.password} 
                      disabled 
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => copyToClipboard(formData.password, 'Password')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input value={createdUser.full_name} disabled />
                </div>
                
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Input value={createdUser.role.charAt(0).toUpperCase() + createdUser.role.slice(1)} disabled />
                </div>
              </div>

              <div className="p-4 bg-yellow-50 rounded-lg border-l-4 border-yellow-400">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-yellow-800">Important:</h4>
                    <p className="text-sm text-yellow-700 mt-1">
                      Please save these credentials securely and share them with the user. 
                      The password cannot be recovered later.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={copyAllCredentials}>
                <Copy className="h-4 w-4 mr-2" />
                Copy All Details
              </Button>
              <Button onClick={handleClose}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Done
              </Button>
            </div>
          </div>
        ) : (
          // Create User Form
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="user@example.com"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => handleInputChange('full_name', e.target.value)}
                  placeholder="John Doe"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="role">Role *</Label>
                <Select 
                  value={formData.role} 
                  onValueChange={(value) => handleInputChange('role', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map(role => (
                      <SelectItem 
                        key={role} 
                        value={role}
                        disabled={!canAssignRole(role)}
                      >
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                        {!canAssignRole(role) && ' (Restricted)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            </div>

            {/* Password Section */}
            <div className="space-y-4">
              <Label className="text-base font-medium">Password *</Label>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      placeholder="Enter password"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  
                  {formData.password && (
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-full rounded-full ${
                        passwordStrength.strength === 'weak' ? 'bg-red-200' :
                        passwordStrength.strength === 'medium' ? 'bg-yellow-200' : 'bg-green-200'
                      }`}>
                        <div className={`h-full rounded-full transition-all ${
                          passwordStrength.strength === 'weak' ? 'bg-red-500 w-1/3' :
                          passwordStrength.strength === 'medium' ? 'bg-yellow-500 w-2/3' : 'bg-green-500 w-full'
                        }`} />
                      </div>
                      <Badge variant={
                        passwordStrength.strength === 'weak' ? 'destructive' :
                        passwordStrength.strength === 'medium' ? 'secondary' : 'default'
                      }>
                        {passwordStrength.strength}
                      </Badge>
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    placeholder="Confirm password"
                    required
                  />
                  {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                    <p className="text-xs text-red-500">Passwords do not match</p>
                  )}
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={generatePassword}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Generate Secure Password
                </Button>
                
                {formData.password && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => copyToClipboard(formData.password, 'Password')}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Password
                  </Button>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Creating User...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Create User
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddUserModal;