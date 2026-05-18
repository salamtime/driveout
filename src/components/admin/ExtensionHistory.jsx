/**
 * Extension History Component
 * Displays all extensions for a rental with approval status
 */

import React from 'react';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Clock, CheckCircle, XCircle, AlertCircle, AlertTriangle, Pencil } from 'lucide-react';
import i18n from '../../i18n';

const ExtensionHistory = ({ 
  extensions, 
  onApprove, 
  onReject, 
  isAdmin,
  onEdit,
  canEdit,
  highlightedExtensionId = '',
  actionLoading = {},
}) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);

  if (!extensions || extensions.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-500">
          <Clock className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>{tr('No extension history available', "Aucun historique de prolongation disponible")}</p>
        </CardContent>
      </Card>
    );
  }

  const formatPrice = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'MAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return tr('N/A', 'N/D');
    return new Date(dateString).toLocaleString();
  };

  const getRequesterDisplay = (extension) => {
    return (
      extension?.requester?.full_name ||
      extension?.requester?.email ||
      extension?.requested_by_name ||
      extension?.created_by_name ||
      (typeof extension?.requested_by === 'string' && !/^[0-9a-f-]{32,}$/i.test(extension.requested_by) ? extension.requested_by : null) ||
      tr('Not recorded', 'Non renseigné')
    );
  };

  const getApproverDisplay = (extension) => {
    return (
      extension?.approver?.full_name ||
      extension?.approver?.email ||
      extension?.rejecter?.full_name ||
      extension?.rejecter?.email ||
      extension?.approved_by_name ||
      extension?.rejected_by_name ||
      (typeof extension?.approved_by === 'string' && !/^[0-9a-f-]{32,}$/i.test(extension.approved_by) ? extension.approved_by : null) ||
      (typeof extension?.rejected_by === 'string' && !/^[0-9a-f-]{32,}$/i.test(extension.rejected_by) ? extension.rejected_by : null) ||
      ''
    );
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: AlertCircle, label: tr('Pending', 'En attente') },
      approved: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: tr('Approved', 'Approuvée') },
      rejected: { color: 'bg-red-100 text-red-800', icon: XCircle, label: tr('Rejected', 'Refusée') },
      active: { color: 'bg-blue-100 text-blue-800', icon: Clock, label: tr('Active', 'Active') },
      completed: { color: 'bg-gray-100 text-gray-800', icon: CheckCircle, label: tr('Completed', 'Terminée') }
    };

    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-600" />
          {tr('Extension History', 'Historique des prolongations')} ({extensions.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {extensions.map((extension, index) => {
            const isManualExtension = extension.is_custom_price || extension.price_source === 'manual';
            const isHighlighted = String(highlightedExtensionId || '') === String(extension.id || '');
            const approverName = getApproverDisplay(extension);
            const isActionLoading = Boolean(actionLoading?.[extension.id]);
            
            return (
              <div
                key={extension.id}
                data-extension-id={extension.id}
                className={`p-4 border rounded-lg transition-all duration-300 ${
                  isHighlighted ? 'ring-4 ring-amber-300 shadow-[0_0_0_8px_rgba(251,191,36,0.18)] ' : ''
                }${
                  extension.status === 'pending' ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white'
                }`}
              >
                {/* Header */}
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {tr('Extension', 'Prolongation')} #{index + 1}
                    </p>
                    <p className="text-xs text-gray-500">
                      {tr('Requested:', 'Demandée :')} {formatDate(extension.requested_at)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {tr('Staff:', 'Personnel :')} {getRequesterDisplay(extension)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canEdit && onEdit && extension.status !== 'rejected' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit(extension)}
                        className="h-8 rounded-lg border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        {tr('Edit', 'Modifier')}
                      </Button>
                    )}
                    {getStatusBadge(extension.status)}
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  <div>
                    <p className="text-xs text-gray-600">{tr('Duration', 'Durée')}</p>
                    <p className="text-sm font-medium text-gray-900">
                      {extension.extension_type === 'days'
                        ? `${extension.extension_value || Math.round(extension.extension_hours/24)} ${tr('day(s)', 'jour(s)')}`
                        : `${extension.extension_hours} ${tr('hour(s)', 'heure(s)')}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">{tr('Price', 'Prix')}</p>
                    <p className="text-sm font-medium text-blue-600">
                      {formatPrice(extension.extension_price)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">{tr('Type', 'Type')}</p>
                    <div className="flex items-center gap-1 flex-wrap">
                      {extension.use_package_pricing || extension.package_id ? (
                        <Badge className="bg-purple-100 text-purple-800 text-xs">📦 {tr('Package', 'Forfait')}</Badge>
                      ) : extension.tier_applied ? (
                        <Badge className="bg-blue-100 text-blue-800 text-xs">⚡ Tier</Badge>
                      ) : isManualExtension ? (
                        <Badge className="bg-yellow-100 text-yellow-800 text-xs">✏️ {tr('Manual', 'Manuel')}</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-800 text-xs">📊 {tr('Base Rate', 'Tarif de base')}</Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">{tr('Breakdown', 'Détail')}</p>
                    <p className="text-xs font-medium text-gray-700">
                      {extension.use_package_pricing || extension.package_id ? (
                        <>
                          {extension.package_name && <span className="block text-purple-700">{extension.package_name}</span>}
                          {extension.package_rate_per_unit > 0 && (
                            <span>{extension.package_rate_per_unit} MAD × {extension.extension_value || extension.extension_hours} {extension.extension_type === 'days' ? tr('days', 'jours') : tr('hours', 'heures')}</span>
                          )}
                        </>
                      ) : (
                        <>
                          {extension.package_rate_per_unit > 0
                            ? `${extension.package_rate_per_unit} MAD × ${extension.extension_hours}h`
                            : extension.extension_hours > 0
                              ? `${(extension.extension_price / extension.extension_hours).toFixed(0)} MAD/h × ${extension.extension_hours}h`
                              : `${extension.extension_price} MAD`
                          }
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* WhatsApp Notification Button - FOR MANUAL EXTENSIONS ONLY (NON-ADMIN) */}
                {extension.status === 'pending' && !isAdmin && isManualExtension && (
                  <div className="mt-3 pt-3 border-t border-yellow-200">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <h4 className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                        <AlertTriangle className="h-4 w-4" />
                        {tr('Request sent', 'Demande envoyée')}
                      </h4>
                      <p className="mt-1 text-xs font-medium text-amber-800">
                        {tr('Admins were notified on Telegram. Waiting for approval.', 'Les admins ont été notifiés sur Telegram. En attente d’approbation.')}
                      </p>
                    </div>
                  </div>
                )}

                {/* Admin Actions for Pending Extensions - ONLY FOR ADMINS */}
                {extension.status === 'pending' && isAdmin && onApprove && onReject && (
                  <div className="mt-3 border-t border-yellow-200 pt-3">
                    <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
                      <h4 className="text-sm font-semibold text-blue-950">
                        {tr('Review extension request', 'Examiner la demande de prolongation')}
                      </h4>
                      <p className="mt-1 text-xs text-blue-800">
                        {tr('Requested by', 'Demandée par')} <strong>{getRequesterDisplay(extension)}</strong>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => onApprove(extension.id)}
                        disabled={isActionLoading}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded transition-colors flex items-center justify-center gap-1"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {isActionLoading ? tr('Approving...', 'Approbation...') : tr('Approve', 'Approuver')}
                      </Button>
                      <Button
                        onClick={() => onReject(extension.id)}
                        disabled={isActionLoading}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-colors flex items-center justify-center gap-1"
                      >
                        <XCircle className="w-4 h-4" />
                        {tr('Reject', 'Refuser')}
                      </Button>
                    </div>
                  </div>
                )}

                {extension.status !== 'pending' && approverName && (
                  <div className="mt-3 border-t border-gray-100 pt-3 text-xs font-medium text-gray-500">
                    {extension.status === 'approved'
                      ? tr('Approved by', 'Approuvée par')
                      : tr('Reviewed by', 'Examinée par')}{' '}
                    <strong className="text-gray-700">{approverName}</strong>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default ExtensionHistory;
