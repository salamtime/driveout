import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const REALTIME_DEBOUNCE_MS = 180;

const isUuidLike = (value = '') =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());

export const useCustomerWalletRealtime = ({
  userId,
  walletId,
  enabled = true,
  onChange,
}) => {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const normalizedUserId = String(userId || '').trim();
    const normalizedWalletId = String(walletId || '').trim();

    if (!enabled || !normalizedUserId || typeof onChangeRef.current !== 'function' || !isUuidLike(normalizedUserId)) {
      return undefined;
    }

    let debounceTimer = null;
    const channel = supabase.channel(`customer-wallet:${normalizedUserId}:${normalizedWalletId || 'snapshot'}`);

    const scheduleRefresh = () => {
      if (debounceTimer) {
        window.clearTimeout(debounceTimer);
      }

      debounceTimer = window.setTimeout(() => {
        onChangeRef.current?.();
      }, REALTIME_DEBOUNCE_MS);
    };

    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'app_wallet_accounts',
      filter: `owner_id=eq.${normalizedUserId}`,
    }, scheduleRefresh);

    if (isUuidLike(normalizedWalletId)) {
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'app_wallet_transactions',
        filter: `wallet_account_id=eq.${normalizedWalletId}`,
      }, scheduleRefresh);
    }

    channel.subscribe();

    return () => {
      if (debounceTimer) {
        window.clearTimeout(debounceTimer);
      }
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId, walletId]);
};

export default useCustomerWalletRealtime;
