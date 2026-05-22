import { adminApiRequest } from './adminApi';
import { supabase } from '../lib/supabase';
import { shouldScopeSharedTenantData } from './OrganizationService';
import { getTenantSession } from './TenantRegistryService';
import { getHostContext, isSaharaXBrandingHost } from '../utils/hostContext';

const SETTINGS_TABLE = 'app_settings';
const DEFAULT_SETTINGS_ID = 1;
const SAHARAX_LEGACY_DEPOSIT_PRESETS = Object.freeze({
  '9f6cca16-9269-4a0e-9d99-d775d4c67b5b': [
    { label: 'Preset 1', amount: 2000, enabled: true, isDefault: true },
    { label: 'Preset 2', amount: 2500, enabled: true, isDefault: false },
    { label: 'Preset 3', amount: 2953, enabled: true, isDefault: false },
  ],
  'cec1ed26-b093-4482-9f0d-70eab752ee56': [
    { label: 'Preset 1', amount: 3000, enabled: true, isDefault: false },
    { label: 'Preset 2', amount: 4000, enabled: true, isDefault: true },
    { label: 'Preset 3', amount: 5000, enabled: true, isDefault: false },
  ],
  'dc2fcf54-1135-4149-a876-43d73e7fd87e': [
    { label: 'Preset 1', amount: 3000, enabled: true, isDefault: false },
    { label: 'Preset 2', amount: 4000, enabled: true, isDefault: false },
    { label: 'Preset 3', amount: 5000, enabled: true, isDefault: false },
  ],
});

const getSaharaXLegacyDepositPresetSettings = () =>
  normalizeDepositPresetSettings(SAHARAX_LEGACY_DEPOSIT_PRESETS, true);

const shouldUseSaharaXLocalDepositFallback = (hostContext = getHostContext()) =>
  Boolean(hostContext?.isLocal) && isSaharaXBrandingHost(hostContext);

export const normalizeDepositPresetSettings = (presets, allowCustomDeposit = true) => {
  if (!presets || typeof presets !== 'object' || Array.isArray(presets)) {
    return {
      vehicleModelPresets: {},
      allowCustomDeposit: allowCustomDeposit !== false,
    };
  }

  const vehicleModelPresets = Object.fromEntries(
    Object.entries(presets).map(([vehicleModelId, rawPresets]) => {
      const normalizedPresets = Array.isArray(rawPresets)
        ? rawPresets
            .map((preset) => {
              if (!preset || typeof preset !== 'object') return null;
              return {
                label: String(preset.label || '').trim(),
                amount: Number(preset.amount || 0),
                enabled: Boolean(preset.enabled),
                isDefault: Boolean(preset.isDefault ?? preset.is_default),
              };
            })
            .filter((preset) => Boolean(preset?.label))
        : [];

      return [String(vehicleModelId), normalizedPresets];
    })
  );

  return {
    vehicleModelPresets,
    allowCustomDeposit: allowCustomDeposit !== false,
  };
};

const readGlobalDepositPresetSettings = async () => {
  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select('damage_deposit_presets, allow_custom_deposit')
    .eq('id', DEFAULT_SETTINGS_ID)
    .limit(1);

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : null;
  return normalizeDepositPresetSettings(
    row?.damage_deposit_presets,
    row?.allow_custom_deposit ?? true
  );
};

const readSharedTenantDepositPresetSettings = async () => {
  const tenantSession = await getTenantSession();
  const tenantSettings =
    tenantSession?.tenantSettings && typeof tenantSession.tenantSettings === 'object'
      ? tenantSession.tenantSettings
      : {};

  return normalizeDepositPresetSettings(
    tenantSettings.damage_deposit_presets,
    tenantSettings.allow_custom_deposit ?? true
  );
};

export const getDepositPresetSettings = async () => {
  const hostContext = getHostContext();
  if (shouldScopeSharedTenantData(hostContext) && !isSaharaXBrandingHost(hostContext)) {
    return readSharedTenantDepositPresetSettings();
  }

  try {
    const globalSettings = await readGlobalDepositPresetSettings();
    if (
      shouldUseSaharaXLocalDepositFallback(hostContext) &&
      Object.keys(globalSettings.vehicleModelPresets || {}).length === 0
    ) {
      return getSaharaXLegacyDepositPresetSettings();
    }
    return globalSettings;
  } catch (error) {
    if (shouldUseSaharaXLocalDepositFallback(hostContext)) {
      console.warn('Using local SaharaX deposit preset fallback:', error?.message || error);
      return getSaharaXLegacyDepositPresetSettings();
    }
    throw error;
  }
};

export const saveDepositPresetSettings = async (settings) => {
  const normalized = normalizeDepositPresetSettings(
    settings?.vehicleModelPresets,
    settings?.allowCustomDeposit ?? true
  );

  const hostContext = getHostContext();
  if (shouldScopeSharedTenantData(hostContext) && !isSaharaXBrandingHost(hostContext)) {
    const response = await adminApiRequest('/api/tenants?resource=workspace-config&action=deposit-presets', {
      method: 'PATCH',
      body: JSON.stringify({
        settings: {
          damage_deposit_presets: normalized.vehicleModelPresets,
          allow_custom_deposit: normalized.allowCustomDeposit,
        },
      }),
    });

    return normalizeDepositPresetSettings(
      response?.settings?.damage_deposit_presets,
      response?.settings?.allow_custom_deposit ?? normalized.allowCustomDeposit
    );
  }

  const { error } = await supabase
    .from(SETTINGS_TABLE)
    .upsert(
      {
        id: DEFAULT_SETTINGS_ID,
        damage_deposit_presets: normalized.vehicleModelPresets,
        allow_custom_deposit: normalized.allowCustomDeposit,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'id',
      }
    );

  if (error) {
    throw error;
  }

  return normalized;
};
