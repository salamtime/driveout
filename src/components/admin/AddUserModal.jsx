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
import i18n from '../../i18n';

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
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
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
    toast.success(tr('Secure password generated', 'Mot de passe sécurisé généré'));
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(tr(`${label} copied to clipboard`, `${label} copié dans le presse-papiers`));
  };

  const copyAllCredentials = () => {
    if (!createdUser) return;
    
    const credentials = `
${tr('Account Created Successfully!', 'Compte créé avec succès !')}

Email: ${createdUser.email}
Password: ${formData.password}
${tr('Full Name', 'Nom complet')}: ${createdUser.full_name}
${tr('Role', 'Rôle')}: ${tr(
  createdUser.role,
  ({
    customer: 'Client',
    guide: 'Guide',
    employee: 'Employé',
    admin: 'Admin',
    owner: 'Propriétaire',
  }[createdUser.role] || createdUser.role)
)}
${tr('Created', 'Créé')}: ${new Date().toLocaleDateString()}

${tr('Please save these credentials securely.', 'Veuillez enregistrer ces identifiants en lieu sûr.')}
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
      toast.error(tr('Please fill in all required fields', 'Veuillez remplir tous les champs obligatoires'));
      return;
    }
    
    if (formData.password !== formData.confirmPassword) {
      toast.error(tr('Passwords do not match', 'Les mots de passe ne correspondent pas'));
      return;
    }
    
    const strength = getPasswordStrength(formData.password);
    if (strength.strength === 'weak') {
      toast.error(tr('Password is too weak. Please use a stronger password.', 'Le mot de passe est trop faible. Veuillez utiliser un mot de passe plus fort.'));
      return;
    }
    
    if (!canAssignRole(formData.role)) {
      toast.error(tr('You cannot assign this role', "Vous ne pouvez pas attribuer ce rôle"));
      return;
    }

    try {
      const result = await dispatch(createUser(formData)).unwrap();
      setCreatedUser(result);
      setShowSuccess(true);
      toast.success(tr('User created successfully!', 'Utilisateur créé avec succès !'));
      
      // Notify parent component
      if (onUserCreated) {
        onUserCreated(result, formData.password);
      }
    } catch (error) {
      console.error('User creation failed:', error);
      toast.error(tr(`User creation failed: ${error}`, `La création de l'utilisateur a échoué : ${error}`));
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
            {showSuccess ? tr('User Created Successfully!', 'Utilisateur créé avec succès !') : tr('Add New User', 'Ajouter un nouvel utilisateur')}
          </DialogTitle>
        </DialogHeader>

        {showSuccess && createdUser ? (
          // Success Screen
          <div className="space-y-6">
            <div className="text-center p-6 bg-green-50 rounded-lg">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-green-800 mb-2">
                {tr('Account Created Successfully!', 'Compte créé avec succès !')}
              </h3>
              <p className="text-green-600">
                {tr("The user account has been created and can now access the system.", "Le compte utilisateur a été créé et peut maintenant accéder au système.")}
              </p>
            </div>

            <div className="space-y-4">
              <h4 className="font-medium">{tr('Account Details:', 'Détails du compte :')}</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{tr('Email', 'E-mail')}</Label>
                  <div className="flex items-center gap-2">
                    <Input value={createdUser.email} disabled />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => copyToClipboard(createdUser.email, tr('Email', 'E-mail'))}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>{tr('Password', 'Mot de passe')}</Label>
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
                      onClick={() => copyToClipboard(formData.password, tr('Password', 'Mot de passe'))}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>{tr('Full Name', 'Nom complet')}</Label>
                  <Input value={createdUser.full_name} disabled />
                </div>
                
                <div className="space-y-2">
                  <Label>{tr('Role', 'Rôle')}</Label>
                  <Input value={createdUser.role.charAt(0).toUpperCase() + createdUser.role.slice(1)} disabled />
                </div>
              </div>

              <div className="p-4 bg-yellow-50 rounded-lg border-l-4 border-yellow-400">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-yellow-800">{tr('Important:', 'Important :')}</h4>
                    <p className="text-sm text-yellow-700 mt-1">
                      {tr('Please save these credentials securely and share them with the user. The password cannot be recovered later.', "Veuillez enregistrer ces identifiants en lieu sûr et les partager avec l'utilisateur. Le mot de passe ne pourra pas être récupéré plus tard.")}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={copyAllCredentials}>
                <Copy className="h-4 w-4 mr-2" />
                {tr('Copy All Details', 'Copier tous les détails')}
              </Button>
              <Button onClick={handleClose}>
                <CheckCircle className="h-4 w-4 mr-2" />
                {tr('Done', 'Terminé')}
              </Button>
            </div>
          </div>
        ) : (
          // Create User Form
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">{tr('Email', 'E-mail')} *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder={tr('user@example.com', 'utilisateur@exemple.com')}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="full_name">{tr('Full Name', 'Nom complet')} *</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => handleInputChange('full_name', e.target.value)}
                  placeholder={tr('John Doe', 'Jean Dupont')}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="role">{tr('Role', 'Rôle')} *</Label>
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
                        {!canAssignRole(role) && tr(' (Restricted)', ' (Restreint)')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="phone">{tr('Phone', 'Téléphone')}</Label>
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
              <Label className="text-base font-medium">{tr('Password', 'Mot de passe')} *</Label>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password">{tr('Password', 'Mot de passe')}</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      placeholder={tr('Enter password', 'Saisir le mot de passe')}
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
                  <Label htmlFor="confirmPassword">{tr('Confirm Password', 'Confirmer le mot de passe')}</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    placeholder={tr('Confirm password', 'Confirmer le mot de passe')}
                    required
                  />
                  {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                    <p className="text-xs text-red-500">{tr('Passwords do not match', 'Les mots de passe ne correspondent pas')}</p>
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
                  {tr('Generate Secure Password', 'Générer un mot de passe sécurisé')}
                </Button>
                
                {formData.password && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => copyToClipboard(formData.password, 'Password')}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {tr('Copy Password', 'Copier le mot de passe')}
                  </Button>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={handleClose}>
                {tr('Cancel', 'Annuler')}
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    {tr('Creating User...', "Création de l'utilisateur...")}
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    {tr('Create User', "Créer l'utilisateur")}
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
