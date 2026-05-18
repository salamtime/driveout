import { adminApiRequest } from './adminApi';
import { supabase } from '../lib/supabase';
import { shouldScopeSharedTenantData } from './OrganizationService';
import { getTenantSession } from './TenantRegistryService';

const SETTINGS_TABLE = 'app_settings';
const DEFAULT_SETTINGS_ID = 1;

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
  if (shouldScopeSharedTenantData()) {
    return readSharedTenantDepositPresetSettings();
  }

  return readGlobalDepositPresetSettings();
};

export const saveDepositPresetSettings = async (settings) => {
  const normalized = normalizeDepositPresetSettings(
    settings?.vehicleModelPresets,
    settings?.allowCustomDeposit ?? true
  );

  if (shouldScopeSharedTenantData()) {
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
