import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Trash2, Truck, AlertTriangle, CheckCircle, Loader2, Save, RefreshCw } from "lucide-react";
import OptimizedTransportFeeService from "../../services/OptimizedTransportFeeService";
import { useAuth } from "../../contexts/AuthContext";
import i18n from "../../i18n";

const TransportFeeManager = ({ onUpdate }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { user } = useAuth();
  const [transportFees, setTransportFees] = useState({
    pickup_fee: 0,
    dropoff_fee: 0,
    currency: 'MAD'
  });
  const [editForm, setEditForm] = useState({
    pickup_fee: '',
    dropoff_fee: '',
    currency: 'MAD'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadTransportFees();
  }, []);

  const loadTransportFees = async () => {
    try {
      setLoading(true);
      setError("");
      
      console.log('🔄 TransportFeeManager: Loading transport fees from database...');
      
      // Load transport fees using OptimizedTransportFeeService
      const fees = await OptimizedTransportFeeService.getTransportFees();
      console.log('✅ Transport fees loaded:', fees);
      
      setTransportFees(fees);
      setEditForm({
        pickup_fee: fees.pickup_fee?.toString() || '0',
        dropoff_fee: fees.dropoff_fee?.toString() || '0',
        currency: fees.currency || 'MAD'
      });
      
      // Clear any previous success messages
      setSuccess("");
    } catch (error) {
      console.error("❌ Error loading transport fees:", error);
      setError(`${tr('Failed to load transport fees', 'Echec du chargement des frais de transport')} : ${error.message}`);
      
      // Set fallback data
      const fallbackFees = OptimizedTransportFeeService.getDefaultTransportFees();
      setTransportFees(fallbackFees);
      setEditForm({
        pickup_fee: '0',
        dropoff_fee: '0',
        currency: 'MAD'
      });
    } finally {
      setLoading(false);
    }
  };

  const saveTransportFees = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      
      // Validate input
      const pickupFee = parseFloat(editForm.pickup_fee) || 0;
      const dropoffFee = parseFloat(editForm.dropoff_fee) || 0;
      
      if (pickupFee < 0 || dropoffFee < 0) {
        setError(tr('Fees must be 0 or greater', 'Les frais doivent etre egaux ou superieurs a 0'));
        return;
      }

      console.log('🔄 Saving transport fees:', { pickupFee, dropoffFee, currency: editForm.currency });

      // Use OptimizedTransportFeeService.upsertTransportFees (mirrors base price pattern)
      const savedFees = await OptimizedTransportFeeService.upsertTransportFees({
        id: transportFees.id, // Include ID if updating existing
        pickup_fee: pickupFee,
        dropoff_fee: dropoffFee,
        currency: editForm.currency,
        created_at: transportFees.created_at // Preserve original created_at
      });

      // Update state with saved data
      setTransportFees(savedFees);
      setEditForm({
        pickup_fee: savedFees.pickup_fee?.toString() || '0',
        dropoff_fee: savedFees.dropoff_fee?.toString() || '0',
        currency: savedFees.currency || 'MAD'
      });
      
      setSuccess(tr('Transport fees saved successfully!', 'Frais de transport enregistres avec succes !'));
      onUpdate?.();
      
      console.log('✅ Transport fees saved successfully:', savedFees);
    } catch (error) {
      console.error("❌ Error saving transport fees:", error);
      setError(`${tr('Error saving transport fees', "Erreur lors de l'enregistrement des frais de transport")} : ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteTransportFees = async () => {
    if (!transportFees.id) {
      setError(tr('No transport fees to delete', 'Aucun frais de transport a supprimer'));
      return;
    }

    if (confirm(tr('Are you sure you want to delete the current transport fees?', 'Voulez-vous vraiment supprimer les frais de transport actuels ?'))) {
      try {
        setError("");
        setSaving(true);
        
        await OptimizedTransportFeeService.deleteTransportFees(transportFees.id);
        
        // Reload data after deletion
        await loadTransportFees();
        
        setSuccess(tr('Transport fees deleted successfully!', 'Frais de transport supprimes avec succes !'));
        onUpdate?.();
      } catch (error) {
        console.error("❌ Error deleting transport fees:", error);
        setError(`${tr('Error deleting transport fees', 'Erreur lors de la suppression des frais de transport')} : ${error.message}`);
      } finally {
        setSaving(false);
      }
    }
  };

  const formatFeeDisplay = (fee, currency = 'MAD') => {
    return OptimizedTransportFeeService.formatFeeForDisplay(fee, currency);
  };

  const handleInputChange = (field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
    setError(""); // Clear errors on input change
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>{tr('Loading transport fees...', 'Chargement des frais de transport...')}</span>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600" />
            {tr('Transport Fee Management', 'Gestion des frais de transport')}
          </CardTitle>
          <Button 
            onClick={loadTransportFees} 
            disabled={loading}
            variant="outline"
            size="sm"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {tr('Refresh', 'Actualiser')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center">
            <AlertTriangle className="w-4 h-4 text-red-500 mr-2" />
            <span className="text-sm text-red-600">{error}</span>
          </div>
        )}
        
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center">
            <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
            <span className="text-sm text-green-600">{success}</span>
          </div>
        )}

        {/* Current Transport Fees Display */}
        <Card className="mb-6 bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-4">{tr('Current Transport Fees', 'Frais de transport actuels')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-lg border">
                <div className="text-sm text-gray-600 font-medium">{tr('Pickup Fee', 'Frais de prise en charge')}</div>
                <div className="text-2xl font-bold text-green-600">
                  {formatFeeDisplay(transportFees.pickup_fee, transportFees.currency)}
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border">
                <div className="text-sm text-gray-600 font-medium">{tr('Dropoff Fee', 'Frais de depot')}</div>
                <div className="text-2xl font-bold text-blue-600">
                  {formatFeeDisplay(transportFees.dropoff_fee, transportFees.currency)}
                </div>
              </div>
            </div>
            {transportFees.updated_at && (
              <div className="mt-3 text-xs text-gray-500">
                {tr('Last updated', 'Derniere mise a jour')} : {new Date(transportFees.updated_at).toLocaleString()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Transport Fees Form */}
        <Card className="border-dashed border-2 border-green-300 bg-green-50">
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold text-green-900 mb-4">{tr('Update Transport Fees', 'Mettre a jour les frais de transport')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="pickup-fee">{tr('Pickup Fee *', 'Frais de prise en charge *')}</Label>
                <Input
                  id="pickup-fee"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.pickup_fee}
                  onChange={(e) => handleInputChange('pickup_fee', e.target.value)}
                  placeholder="0.00"
                />
              </div>
              
              <div>
                <Label htmlFor="dropoff-fee">{tr('Dropoff Fee *', 'Frais de depot *')}</Label>
                <Input
                  id="dropoff-fee"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.dropoff_fee}
                  onChange={(e) => handleInputChange('dropoff_fee', e.target.value)}
                  placeholder="0.00"
                />
              </div>
              
              <div>
                <Label htmlFor="currency">{tr('Currency', 'Devise')}</Label>
                <Input
                  id="currency"
                  type="text"
                  value={editForm.currency}
                  onChange={(e) => handleInputChange('currency', e.target.value.toUpperCase())}
                  placeholder="MAD"
                  maxLength="3"
                />
              </div>
            </div>
            
            <div className="flex gap-2 mt-6">
              <Button 
                onClick={saveTransportFees} 
                disabled={saving}
                className="bg-green-600 hover:bg-green-700"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {tr('Save Transport Fees', 'Enregistrer les frais de transport')}
              </Button>
              
              {transportFees.id && (
                <Button 
                  variant="outline" 
                  onClick={deleteTransportFees}
                  disabled={saving}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {tr('Delete', 'Supprimer')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Help Information */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <Truck className="h-5 w-5 text-blue-400 mt-0.5" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                {tr('Transport Fee Information', 'Informations sur les frais de transport')}
              </h3>
              <div className="mt-1 text-sm text-blue-700">
                <ul className="list-disc list-inside space-y-1">
                  <li>{tr('Transport fees are organization-wide and stored in the database', "Les frais de transport sont definis pour toute l'organisation et stockes en base de donnees")}</li>
                  <li>{tr('Pickup fee: Applied when vehicles are picked up from customer location', "Frais de prise en charge : appliques lorsque les vehicules sont recuperes chez le client")}</li>
                  <li>{tr('Dropoff fee: Applied when vehicles are delivered to customer location', "Frais de depot : appliques lorsque les vehicules sont livres chez le client")}</li>
                  <li>{tr('Fees must be 0 or greater, formatted to 2 decimal places', 'Les frais doivent etre egaux ou superieurs a 0, avec 2 decimales')}</li>
                  <li>{tr('Only one active fee configuration per organization', "Une seule configuration active par organisation")}</li>
                  <li>{tr('Changes are immediately applied to new rentals', 'Les modifications sont appliquees immediatement aux nouvelles locations')}</li>
                  <li>{tr('Data is cached for 30 seconds to improve performance', 'Les donnees sont mises en cache pendant 30 secondes pour ameliorer les performances')}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TransportFeeManager;
