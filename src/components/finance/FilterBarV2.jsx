import React, { useMemo, useState } from 'react';
import { Calendar, Car, Filter, RotateCcw, Search, User, X } from 'lucide-react';
import i18n from '../../i18n';

const DEFAULT_RANGE_DAYS = 30;

const tr = (en, fr) => (i18n.resolvedLanguage === 'fr' ? fr : en);

const cx = (...classes) => classes.filter(Boolean).join(' ');

const getDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDefaultFilters = () => {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - DEFAULT_RANGE_DAYS);

  return {
    startDate: getDateInputValue(start),
    endDate: getDateInputValue(today),
    vehicleIds: [],
    customerIds: [],
  };
};

const formatVehicleLabel = (vehicle) => {
  const name = String(vehicle?.name || vehicle?.vehicle_name || vehicle?.model || tr('Vehicle', 'Véhicule')).trim();
  const plate = String(vehicle?.plate_number || vehicle?.plate || vehicle?.vehicle_plate || '').trim();
  return plate ? `${name} · ${plate}` : name;
};

const formatCustomerLabel = (customer) => {
  const name = String(
    customer?.full_name ||
    customer?.name ||
    customer?.customer_name ||
    customer?.display_name ||
    ''
  ).trim();
  const contact = String(customer?.email || customer?.phone || customer?.whatsapp_number || '').trim();
  if (name && contact) return `${name} · ${contact}`;
  if (name) return name;
  if (contact) return contact;
  return tr('Unknown customer', 'Client inconnu');
};

const matchesSearch = (value, search) => {
  if (!search) return true;
  return String(value || '').toLowerCase().includes(search.toLowerCase());
};

const FilterBarV2 = ({
  filters,
  vehicles = [],
  customers = [],
  onFiltersChange,
  loading = false,
  className = '',
}) => {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  const safeFilters = {
    ...getDefaultFilters(),
    ...(filters || {}),
    vehicleIds: Array.isArray(filters?.vehicleIds) ? filters.vehicleIds : [],
    customerIds: Array.isArray(filters?.customerIds) ? filters.customerIds : [],
  };

  const defaultFilters = useMemo(() => getDefaultFilters(), []);

  const activeFilterCount = useMemo(() => {
    let count = 0;

    if (safeFilters.vehicleIds.length > 0) count += 1;
    if (safeFilters.customerIds.length > 0) count += 1;
    if (
      safeFilters.startDate !== defaultFilters.startDate ||
      safeFilters.endDate !== defaultFilters.endDate
    ) {
      count += 1;
    }

    return count;
  }, [defaultFilters.endDate, defaultFilters.startDate, safeFilters.customerIds.length, safeFilters.endDate, safeFilters.startDate, safeFilters.vehicleIds.length]);

  const filteredVehicles = useMemo(
    () =>
      (vehicles || []).filter((vehicle) =>
        matchesSearch(
          [
            vehicle?.name,
            vehicle?.vehicle_name,
            vehicle?.plate_number,
            vehicle?.plate,
            vehicle?.model,
          ]
            .filter(Boolean)
            .join(' '),
          vehicleSearch
        )
      ),
    [vehicleSearch, vehicles]
  );

  const filteredCustomers = useMemo(
    () =>
      (customers || []).filter((customer) =>
        matchesSearch(
          [
            customer?.full_name,
            customer?.name,
            customer?.customer_name,
            customer?.email,
            customer?.phone,
            customer?.whatsapp_number,
          ]
            .filter(Boolean)
            .join(' '),
          customerSearch
        )
      ),
    [customerSearch, customers]
  );

  const selectedVehicleNames = useMemo(() => {
    const selectedIds = new Set(safeFilters.vehicleIds.map(String));
    return (vehicles || [])
      .filter((vehicle) => selectedIds.has(String(vehicle?.id)))
      .map((vehicle) => formatVehicleLabel(vehicle));
  }, [safeFilters.vehicleIds, vehicles]);

  const selectedCustomerNames = useMemo(() => {
    const selectedIds = new Set(safeFilters.customerIds.map(String));
    return (customers || [])
      .filter((customer) => selectedIds.has(String(customer?.id)))
      .map((customer) => formatCustomerLabel(customer));
  }, [customers, safeFilters.customerIds]);

  const emitFilters = (nextFilters) => {
    onFiltersChange?.({
      ...safeFilters,
      ...nextFilters,
      vehicleIds: Array.isArray(nextFilters.vehicleIds) ? nextFilters.vehicleIds : safeFilters.vehicleIds,
      customerIds: Array.isArray(nextFilters.customerIds) ? nextFilters.customerIds : safeFilters.customerIds,
    });
  };

  const toggleSelection = (key, value) => {
    const currentValues = safeFilters[key] || [];
    const normalizedValue = String(value);
    const nextValues = currentValues.some((item) => String(item) === normalizedValue)
      ? currentValues.filter((item) => String(item) !== normalizedValue)
      : [...currentValues, value];

    emitFilters({ [key]: nextValues });
  };

  const resetFilters = () => {
    emitFilters(defaultFilters);
  };

  const showVehiclePanel = showAdvancedFilters || safeFilters.vehicleIds.length > 0;
  const showCustomerPanel = showAdvancedFilters || safeFilters.customerIds.length > 0;

  return (
    <div className={cx('rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)] sm:p-5', className)}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
              {tr('Filters', 'Filtres')}
            </p>
            <h3 className="text-lg font-semibold text-slate-950">
              {tr('Scope the finance view', 'Définir la portée de la vue finance')}
            </h3>
            <p className="text-sm text-slate-500">
              {tr(
                'Adjust the date range, vehicles, and customers without leaving the admin workspace rhythm.',
                "Ajustez la période, les véhicules et les clients sans quitter le rythme visuel de l'admin."
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowAdvancedFilters((current) => !current)}
              className={cx(
                'inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold shadow-sm transition-all',
                showAdvancedFilters || activeFilterCount > 0
                  ? 'border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-300 hover:bg-violet-100'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:text-violet-700'
              )}
            >
              <Filter className="h-4 w-4" />
              {tr('Advanced filters', 'Filtres avancés')}
              {activeFilterCount > 0 ? (
                <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-violet-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-all hover:border-slate-300 hover:bg-white"
            >
              <RotateCcw className="h-4 w-4" />
              {tr('Reset filters', 'Réinitialiser les filtres')}
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-[24px] border border-slate-200 bg-slate-50/85 p-4">
            <label className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
              {tr('Date range', 'Période')}
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {tr('Start date', 'Date de début')}
                </p>
                <div className="flex items-center gap-3 rounded-[20px] border border-white bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <Calendar className="h-4 w-4 text-violet-500" />
                  <input
                    type="date"
                    value={safeFilters.startDate}
                    onChange={(event) => emitFilters({ startDate: event.target.value })}
                    className="w-full border-0 bg-transparent p-0 text-sm font-medium text-slate-700 outline-none"
                  />
                </div>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {tr('End date', 'Date de fin')}
                </p>
                <div className="flex items-center gap-3 rounded-[20px] border border-white bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <Calendar className="h-4 w-4 text-violet-500" />
                  <input
                    type="date"
                    value={safeFilters.endDate}
                    min={safeFilters.startDate}
                    onChange={(event) => emitFilters({ endDate: event.target.value })}
                    className="w-full border-0 bg-transparent p-0 text-sm font-medium text-slate-700 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
              {tr('Active scope', 'Portée active')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700">
                <Calendar className="h-4 w-4" />
                {safeFilters.startDate} → {safeFilters.endDate}
              </span>

              {safeFilters.vehicleIds.length > 0 ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                  <Car className="h-4 w-4" />
                  {safeFilters.vehicleIds.length} {safeFilters.vehicleIds.length === 1 ? tr('vehicle', 'véhicule') : tr('vehicles', 'véhicules')}
                </span>
              ) : null}

              {safeFilters.customerIds.length > 0 ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700">
                  <User className="h-4 w-4" />
                  {safeFilters.customerIds.length} {safeFilters.customerIds.length === 1 ? tr('customer', 'client') : tr('customers', 'clients')}
                </span>
              ) : null}

              {activeFilterCount === 0 ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
                  {tr('Default finance range', 'Période finance par défaut')}
                </span>
              ) : null}
            </div>

            {(selectedVehicleNames.length > 0 || selectedCustomerNames.length > 0) ? (
              <div className="mt-4 space-y-3">
                {selectedVehicleNames.length > 0 ? (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {tr('Selected vehicles', 'Véhicules sélectionnés')}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedVehicleNames.map((name) => (
                        <span key={name} className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {selectedCustomerNames.length > 0 ? (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {tr('Selected customers', 'Clients sélectionnés')}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedCustomerNames.map((name) => (
                        <span key={name} className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {(showVehiclePanel || showCustomerPanel) ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
                    {tr('Vehicles', 'Véhicules')}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {tr('Limit KPIs and reports to specific vehicles.', 'Limitez les KPI et rapports à des véhicules précis.')}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {vehicles.length}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-3 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={vehicleSearch}
                  onChange={(event) => setVehicleSearch(event.target.value)}
                  placeholder={tr('Search vehicles or plates', 'Rechercher des véhicules ou plaques')}
                  className="w-full border-0 bg-transparent p-0 text-sm text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>

              <div className="mt-4 max-h-60 overflow-y-auto">
                {loading ? (
                  <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    {tr('Loading finance filters...', 'Chargement des filtres finance...')}
                  </div>
                ) : filteredVehicles.length === 0 ? (
                  <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    {tr('No vehicles match this search.', 'Aucun véhicule ne correspond à cette recherche.')}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {filteredVehicles.map((vehicle) => {
                      const vehicleId = vehicle?.id;
                      const selected = safeFilters.vehicleIds.some((id) => String(id) === String(vehicleId));

                      return (
                        <button
                          key={vehicleId}
                          type="button"
                          onClick={() => toggleSelection('vehicleIds', vehicleId)}
                          className={cx(
                            'rounded-full border px-3 py-2 text-sm font-semibold transition',
                            selected
                              ? 'border-violet-300 bg-violet-50 text-violet-700'
                              : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-violet-200 hover:bg-white'
                          )}
                        >
                          {formatVehicleLabel(vehicle)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
                    {tr('Customers', 'Clients')}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {tr('Focus the finance analysis on selected customers.', 'Concentrez l’analyse finance sur des clients sélectionnés.')}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {customers.length}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-3 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder={tr('Search customers, email, or phone', 'Rechercher des clients, email ou téléphone')}
                  className="w-full border-0 bg-transparent p-0 text-sm text-slate-700 outline-none placeholder:text-slate-400"
                />
              </div>

              <div className="mt-4 max-h-60 overflow-y-auto">
                {loading ? (
                  <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    {tr('Loading customer filters...', 'Chargement des filtres clients...')}
                  </div>
                ) : filteredCustomers.length === 0 ? (
                  <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    {customers.length === 0
                      ? tr('No customers available for this workspace yet.', "Aucun client disponible pour cet espace pour l'instant.")
                      : tr('No customers match this search.', 'Aucun client ne correspond à cette recherche.')}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {filteredCustomers.map((customer) => {
                      const customerId = customer?.id;
                      const selected = safeFilters.customerIds.some((id) => String(id) === String(customerId));

                      return (
                        <button
                          key={customerId}
                          type="button"
                          onClick={() => toggleSelection('customerIds', customerId)}
                          className={cx(
                            'rounded-full border px-3 py-2 text-sm font-semibold transition',
                            selected
                              ? 'border-violet-300 bg-violet-50 text-violet-700'
                              : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-violet-200 hover:bg-white'
                          )}
                        >
                          {formatCustomerLabel(customer)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {(safeFilters.vehicleIds.length > 0 || safeFilters.customerIds.length > 0) ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {tr('Quick clear', 'Suppression rapide')}
            </p>

            {safeFilters.vehicleIds.length > 0 ? (
              <button
                type="button"
                onClick={() => emitFilters({ vehicleIds: [] })}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-violet-200 hover:text-violet-700"
              >
                <X className="h-3 w-3" />
                {tr('Clear vehicles', 'Retirer les véhicules')}
              </button>
            ) : null}

            {safeFilters.customerIds.length > 0 ? (
              <button
                type="button"
                onClick={() => emitFilters({ customerIds: [] })}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-violet-200 hover:text-violet-700"
              >
                <X className="h-3 w-3" />
                {tr('Clear customers', 'Retirer les clients')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default FilterBarV2;
