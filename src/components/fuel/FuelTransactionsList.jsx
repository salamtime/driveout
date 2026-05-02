import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Minus, 
  Car, 
  Fuel, 
  Calendar, 
  MapPin, 
  User, 
  Eye, 
  Edit, 
  Trash2,
  Download,
  RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import FuelTransactionService from '../../services/FuelTransactionService';
import { useAuth } from '../../contexts/AuthContext';
import { roundFuelLitersForDisplay } from '../../utils/formatters';
import { formatVehicleNameWithModel } from '../../utils/vehicleLabels';
import { getFuelTransactionVisual } from '../../utils/fuelVisuals';
import i18n from '../../i18n';

const FuelTransactionsList = ({ 
  filters, 
  vehicles, 
  onAddTransaction, 
  onViewDetails,
  onTransactionsMutated,
  initialPageData,
}) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    limit: 20
  });
  const { user } = useAuth();

  useEffect(() => {
    if (!initialPageData?.success || !Array.isArray(initialPageData.transactions) || initialPageData.transactions.length === 0) {
      return;
    }

    setTransactions((current) => (current.length > 0 ? current : initialPageData.transactions));
    setPagination((prev) => ({
      ...prev,
      totalCount: Number(initialPageData.totalCount || initialPageData.transactions.length || 0),
      totalPages: Math.max(1, Math.ceil(Number(initialPageData.totalCount || initialPageData.transactions.length || 0) / prev.limit)),
    }));
    setHasLoadedOnce(true);
    setLoading(false);
  }, [initialPageData]);

  useEffect(() => {
    setPagination((prev) => ({
      ...prev,
      currentPage: 1,
    }));
  }, [
    filters.search,
    filters.vehicleId,
    filters.transactionType,
    filters.fuelType,
    filters.startDate,
    filters.endDate,
    filters.fuelStation,
    filters.location,
  ]);

  useEffect(() => {
    loadTransactions();
  }, [
    pagination.currentPage,
    filters.search,
    filters.vehicleId,
    filters.transactionType,
    filters.fuelType,
    filters.startDate,
    filters.endDate,
    filters.fuelStation,
    filters.location,
  ]);

  const loadTransactions = async () => {
    if (!hasLoadedOnce) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const offset = (pagination.currentPage - 1) * pagination.limit;
      
      const result = await FuelTransactionService.getAllTransactions({
        ...filters,
        limit: pagination.limit,
        offset
      });

      if (result.success) {
        setTransactions(result.transactions || []);
        setPagination(prev => ({
          ...prev,
          totalCount: result.totalCount,
          totalPages: Math.max(1, Math.ceil(result.totalCount / prev.limit))
        }));
        setHasLoadedOnce(true);
      } else {
        console.error('Error loading transactions:', result.error);
        setTransactions([]);
      }
    } catch (error) {
      console.error('Unexpected error loading transactions:', error);
      setTransactions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const performDelete = async (transaction) => {
    const previousTransactions = transactions;
    const nextTransactions = transactions.filter((item) => item.id !== transaction.id);

    try {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.add(transaction.id);
        return next;
      });
      setTransactions(nextTransactions);
      setPagination((prev) => ({
        ...prev,
        totalCount: Math.max(0, prev.totalCount - 1),
      }));

      const result = await FuelTransactionService.deleteTransaction(
        transaction.id,
        transaction.transaction_type,
        user?.id
      );

      if (result.success) {
        toast.success(isFrench ? 'Transaction supprimée avec succès' : 'Transaction deleted successfully');
        if (typeof onTransactionsMutated === 'function') {
          onTransactionsMutated();
        }
        loadTransactions();
      } else {
        console.error('Error deleting transaction:', result.error);
        setTransactions(previousTransactions);
        setPagination((prev) => ({
          ...prev,
          totalCount: prev.totalCount + 1,
        }));
        toast.error(isFrench ? `Échec de la suppression de la transaction : ${result.error}` : `Failed to delete transaction: ${result.error}`);
      }
    } catch (error) {
      console.error('Unexpected error deleting transaction:', error);
      setTransactions(previousTransactions);
      setPagination((prev) => ({
        ...prev,
        totalCount: prev.totalCount + 1,
      }));
      toast.error(isFrench ? 'Une erreur inattendue est survenue lors de la suppression de la transaction' : 'An unexpected error occurred while deleting the transaction');
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(transaction.id);
        return next;
      });
    }
  };

  const handleDelete = (transaction) => {
    if (confirmingDeleteId) {
      toast.dismiss(confirmingDeleteId);
    }

    const toastId = toast((t) => (
      <div className="flex min-w-[320px] items-start gap-3 rounded-xl bg-slate-900 px-4 py-3 text-white shadow-xl">
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">
            {isFrench ? 'Supprimer cette transaction ?' : 'Delete this transaction?'}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-200">
            {isFrench
              ? 'Cette action est irreversible.'
              : 'This action cannot be undone.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              toast.dismiss(t.id);
              setConfirmingDeleteId((current) => (current === t.id ? null : current));
            }}
            className="rounded-md border border-slate-400/70 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
          >
            {isFrench ? 'Annuler' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => {
              toast.dismiss(t.id);
              setConfirmingDeleteId((current) => (current === t.id ? null : current));
              performDelete(transaction);
            }}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
          >
            {isFrench ? 'Supprimer' : 'Delete'}
          </button>
        </div>
      </div>
    ), {
      duration: 6000,
    });

    setConfirmingDeleteId(toastId);
    return toastId;
  };

  useEffect(() => {
    if (confirmingDeleteId && deletingIds.size > 0) {
      toast.dismiss(confirmingDeleteId);
      setConfirmingDeleteId(null);
    }
  }, [confirmingDeleteId, deletingIds]);

  const handleExportCSV = async () => {
    try {
      const result = await FuelTransactionService.exportToCSV(filters);
      
      if (result.success) {
        // Create and download CSV file
        const blob = new Blob([result.csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        console.error('Error exporting CSV:', result.error);
      }
    } catch (error) {
      console.error('Unexpected error exporting CSV:', error);
    }
  };

  const formatCurrency = (amount) => {
    if (!amount || isNaN(amount)) return '0.00 MAD';
    return `${parseFloat(amount).toFixed(2)} MAD`;
  };

  const isRentalFuelSnapshot = (transaction) =>
    transaction?.transaction_type === 'rental_opening_level' ||
    transaction?.transaction_type === 'rental_closing_level';

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', {
      timeZone: 'Africa/Casablanca',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const formatTime = (dateString) => {
    return new Date(dateString).toLocaleTimeString(isFrench ? 'fr-FR' : 'en-US', {
      timeZone: 'Africa/Casablanca',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTransactionTypeIcon = (type) => {
    const visual = getFuelTransactionVisual(type);
    switch (type) {
      case 'tank_refill':
        return <span className="mr-1">{visual.emoji}</span>;
      case 'vehicle_refill':
        return <span className="mr-1">{visual.emoji}</span>;
      case 'withdrawal':
        return <span className="mr-1">{visual.emoji}</span>;
      default:
        return <span className="mr-1">{visual.emoji}</span>;
    }
  };

  const getTransactionTypeLabel = (type) => {
    return FuelTransactionService.getTransactionTypeLabel(type);
  };

  const getTransactionTypeColor = (type) => {
    return getFuelTransactionVisual(type).badgeClass;
  };

  const getVehicleName = (transaction) => {
    if (transaction.saharax_0u4w4d_vehicles) {
      return formatVehicleNameWithModel(transaction.saharax_0u4w4d_vehicles);
    }
    const matchedVehicle = vehicles?.find((vehicle) => String(vehicle.id) === String(transaction.vehicle_id));
    if (matchedVehicle) {
      return formatVehicleNameWithModel(matchedVehicle);
    }
    return '—';
  };

  const getVehiclePlate = (transaction) => {
    if (transaction.saharax_0u4w4d_vehicles) {
      return transaction.saharax_0u4w4d_vehicles.plate_number;
    }
    const matchedVehicle = vehicles?.find((vehicle) => String(vehicle.id) === String(transaction.vehicle_id));
    if (matchedVehicle) {
      return matchedVehicle.plate_number || '';
    }
    return '';
  };

  const getRentalReference = (transaction) => {
    return transaction?.rental_reference || transaction?.linked_report?.rental_id || '';
  };

  const formatAmount = (transaction) => {
    const numericAmount = roundFuelLitersForDisplay(transaction.amount || 0) || 0;
    const showSignedAmount =
      transaction.transaction_type === 'rental_closing_level' ||
      transaction.transaction_type === 'manual_adjustment' ||
      transaction.transaction_type === 'staff_fuel_use';

    if (showSignedAmount && Number.isFinite(numericAmount)) {
      if (transaction.transaction_type === 'staff_fuel_use') {
        if (numericAmount > 0) return `-${numericAmount.toFixed(1)}L`;
        return '0.0L';
      }
      if (numericAmount < 0) return `${numericAmount.toFixed(1)}L`;
      if (numericAmount > 0) return `+${numericAmount.toFixed(1)}L`;
      return '0.0L';
    }

    return `${numericAmount.toFixed(1)}L`;
  };

  const getAmountClassName = (transaction) => {
    if (transaction.transaction_type === 'staff_fuel_use') {
      return 'text-rose-600';
    }

    if (!['rental_closing_level', 'manual_adjustment'].includes(transaction.transaction_type)) {
      return 'text-gray-900';
    }

    const numericAmount = roundFuelLitersForDisplay(transaction.amount || 0) || 0;
    if (numericAmount > 0) return 'text-green-700';
    if (numericAmount < 0) return 'text-red-600';
    return 'text-gray-900';
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, currentPage: newPage }));
  };

  const canEditTransaction = (transaction) => (
    ['tank_refill', 'tank_out', 'vehicle_refill', 'withdrawal'].includes(String(transaction?.transaction_type || '').toLowerCase())
  );

  const handleLoadMore = () => {
    if (pagination.currentPage < pagination.totalPages && !refreshing) {
      handlePageChange(pagination.currentPage + 1);
    }
  };

  const pageStart = pagination.totalCount > 0
    ? ((pagination.currentPage - 1) * pagination.limit) + 1
    : 0;
  const pageEnd = Math.min(pagination.currentPage * pagination.limit, pagination.totalCount);

  // Check if current user can delete a transaction - ONLY OWNER role
  const canDeleteTransaction = (transaction) => {
    if (!user?.id) return false;
    
    // CRITICAL: Only allow 'owner' role to delete transactions
    
    return user.role === 'owner';
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="h-4 w-48 rounded bg-gray-100 animate-pulse" />
          <div className="flex gap-2">
            <div className="h-10 w-24 rounded-lg bg-gray-100 animate-pulse" />
            <div className="h-10 w-28 rounded-lg bg-gray-100 animate-pulse" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={`fuel-transaction-skeleton-${index}`} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex justify-between items-center">
      <div className="flex items-center gap-4">
        <p className="text-sm text-gray-600">
          {isFrench
            ? `Affichage de ${pageStart} à ${pageEnd} sur ${pagination.totalCount} transactions`
            : `Showing ${pageStart} to ${pageEnd} of ${pagination.totalCount} transactions`}
        </p>
        {refreshing ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            {isFrench ? 'Actualisation' : 'Refreshing'}
          </span>
        ) : null}
      </div>
        
        <div className="flex gap-2">
          <button
            onClick={loadTransactions}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {isFrench ? 'Actualiser' : 'Refresh'}
          </button>
          
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3 py-2 text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            {isFrench ? 'Exporter CSV' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {isFrench ? 'Date et heure' : 'Date & Time'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {isFrench ? 'Véhicule' : 'Vehicle'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {isFrench ? 'Quantité' : 'Amount'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {isFrench ? 'Coût' : 'Cost'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {isFrench ? 'Station / Zone' : 'Station / Area'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {isFrench ? 'Détails' : 'Details'}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <Fuel className="w-12 h-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">{isFrench ? 'Aucune transaction trouvée' : 'No transactions found'}</h3>
                      <p className="text-gray-500 mb-4">
                        {Object.values(filters).some(v => v) 
                          ? (isFrench ? 'Essayez d’ajuster vos filtres pour voir plus de résultats.' : 'Try adjusting your filters to see more results.')
                          : (isFrench ? 'Commencez par ajouter votre première transaction carburant.' : 'Start by adding your first fuel transaction.')
                        }
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => onAddTransaction('tank_refill')}
                          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
                        >
                          <Plus className="w-4 h-4" />
                          {isFrench ? 'Ajouter au réservoir' : 'Add to Tank'}
                        </button>
                        <button
                          onClick={() => onAddTransaction('withdrawal')}
                          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
                        >
                          <Minus className="w-4 h-4" />
                          {isFrench ? 'Transfert réservoir' : 'Tank Transfer'}
                        </button>
                        <button
                          onClick={() => onAddTransaction('vehicle_refill')}
                          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white transition-colors hover:bg-indigo-700"
                        >
                          <Fuel className="w-4 h-4" />
                          {isFrench ? 'Remplissage direct' : 'Direct Fill'}
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                transactions.map((transaction) => (
                  <tr
                    key={transaction.id}
                    className={`cursor-pointer hover:bg-gray-50 ${deletingIds.has(transaction.id) ? 'opacity-50' : ''}`}
                    onClick={() => onViewDetails(transaction)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {formatDate(transaction.transaction_date)}
                          </div>
                          <div className="text-sm text-gray-500">
                            {formatTime(transaction.transaction_date)}
                          </div>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getTransactionTypeColor(transaction.transaction_type)}`}>
                        {getTransactionTypeIcon(transaction.transaction_type)}
                        {getTransactionTypeLabel(transaction.transaction_type)}
                      </span>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Car className="w-4 h-4 text-gray-400 mr-2" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {getVehicleName(transaction)}
                          </div>
                          {getVehiclePlate(transaction) && (
                            <div className="text-sm text-gray-500">
                              {getVehiclePlate(transaction)}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Fuel className="w-4 h-4 text-blue-500 mr-2" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            <span className={getAmountClassName(transaction)}>
                              {formatAmount(transaction)}
                            </span>
                          </div>
                          <div className="text-sm text-gray-500">
                            {transaction.fuel_type}
                          </div>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      {isRentalFuelSnapshot(transaction) ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <>
                          <div className="text-sm font-medium text-gray-900">
                            {formatCurrency(transaction.cost)}
                          </div>
                          {transaction.amount > 0 && transaction.cost > 0 && (
                            <div className="text-sm text-gray-500">
                              {formatCurrency(transaction.cost / transaction.amount)}/L
                            </div>
                          )}
                          {transaction.is_financial_expense === false && (
                            <div className="text-xs text-gray-500">{isFrench ? 'Mouvement interne' : 'Internal movement'}</div>
                          )}
                        </>
                      )}
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        {transaction.fuel_station && (
                          <div className="text-sm font-medium text-gray-900">
                            {transaction.fuel_station}
                          </div>
                        )}
                        {transaction.location && (
                          <div className="flex items-center text-sm text-gray-500">
                            <MapPin className="w-3 h-3 mr-1" />
                            {transaction.location}
                          </div>
                        )}
                        {transaction.receipt_media && (
                          <div className="text-xs text-blue-600">
                            {transaction.transaction_type === 'staff_fuel_use'
                              ? (isFrench ? 'Pièce jointe' : 'Attachment added')
                              : (isFrench ? 'Reçu joint' : 'Receipt attached')}
                          </div>
                        )}
                        {!transaction.fuel_station && !transaction.location && (
                          <span className="text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {transaction.odometer_reading && (
                          <div className="flex items-center">
                            <Car className="w-3 h-3 text-gray-400 mr-1" />
                            {transaction.odometer_reading}km
                          </div>
                        )}
                        {(transaction.performed_by_name || transaction.filled_by) && (
                          <div className="flex items-center">
                            <User className="w-3 h-3 text-gray-400 mr-1" />
                            {transaction.performed_by_name || transaction.filled_by}
                          </div>
                        )}
                        {getRentalReference(transaction) && (
                          <div className="text-xs font-mono text-violet-600">
                            {isFrench ? 'Contrat' : 'Contract'}: {getRentalReference(transaction)}
                          </div>
                        )}
                        {!transaction.odometer_reading && !(transaction.performed_by_name || transaction.filled_by) && !getRentalReference(transaction) && (
                          <span className="text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            onViewDetails(transaction);
                          }}
                          className="text-blue-600 hover:text-blue-900 p-1 rounded"
                          title={isFrench ? 'Voir les détails' : 'View Details'}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {canEditTransaction(transaction) && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              onAddTransaction(transaction.transaction_type, transaction);
                            }}
                            className="text-gray-600 hover:text-gray-900 p-1 rounded"
                            title={isFrench ? 'Modifier la transaction' : 'Edit Transaction'}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        {canDeleteTransaction(transaction) && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDelete(transaction);
                            }}
                            disabled={deletingIds.has(transaction.id)}
                            className="text-red-500 hover:text-red-700 p-1 rounded"
                            title={isFrench ? 'Supprimer la transaction (propriétaire uniquement)' : 'Delete Transaction (Owner Only)'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {transactions.length > 0 && (
          <div className="border-t border-gray-200 bg-white px-4 py-4 sm:px-6">
            <div className="flex flex-col items-center justify-center gap-3">
              <p className="text-sm text-gray-600">
                {isFrench ? 'Affichage de ' : 'Showing '}
                <span className="font-medium">{pageStart}</span>
                {isFrench ? ' à ' : ' to '}
                <span className="font-medium">{pageEnd}</span>
                {isFrench ? ' sur ' : ' of '}
                <span className="font-medium">{pagination.totalCount}</span> {isFrench ? 'transactions' : 'transactions'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(Math.max(1, pagination.currentPage - 1))}
                  disabled={pagination.currentPage <= 1 || refreshing}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isFrench ? 'Précédent' : 'Previous'}
                </button>
                <span className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
                  {pagination.currentPage} / {pagination.totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(Math.min(pagination.totalPages, pagination.currentPage + 1))}
                  disabled={pagination.currentPage >= pagination.totalPages || refreshing}
                  className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {refreshing ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                  {isFrench ? 'Suivant' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FuelTransactionsList;
