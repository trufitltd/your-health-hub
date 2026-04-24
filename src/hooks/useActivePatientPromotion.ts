import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ActivePatientPromotion = {
  used: number;
  limit: number;
  remaining: number;
  endsAt: string | null;
  countdownText: string;
  endDateText: string;
  remainingMs: number;
  isActive: boolean;
};

const formatCountdown = (remainingMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }
  return `${hours}h ${minutes}m ${seconds}s`;
};

export const useActivePatientPromotion = () => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const query = useQuery({
    queryKey: ['active-patient-promotion'],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('public_get_active_promotion');

      if (error) {
        throw error;
      }

      const row = Array.isArray(data) ? data[0] : null;
      const limit = Number(row?.promotion_first_n_free_limit || 0);
      const endsAt = row?.promotion_ends_at || null;
      return {
        used: 0,
        limit,
        remaining: 0,
        endsAt,
      };
    },
    refetchInterval: 60000,
  });

  const enrichedData = useMemo<ActivePatientPromotion | undefined>(() => {
    if (!query.data) return undefined;

    const endsAtMs = query.data.endsAt ? new Date(query.data.endsAt).getTime() : 0;
    const remainingMs = endsAtMs > 0 ? Math.max(0, endsAtMs - nowMs) : 0;
    const isActive = remainingMs > 0;
    const endDateText = endsAtMs > 0
      ? new Date(endsAtMs).toLocaleString()
      : '';

    return {
      ...query.data,
      remainingMs,
      isActive,
      countdownText: isActive ? formatCountdown(remainingMs) : 'Expired',
      endDateText,
    };
  }, [query.data, nowMs]);

  return {
    ...query,
    data: enrichedData,
  };
};
