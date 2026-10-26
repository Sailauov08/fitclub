'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Permission } from '@fitclub/shared';
import { api, ApiError } from './api';
import type { Me } from './types';

/** Current user, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<Me>('/auth/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
  });
}

export function useCan() {
  const { data } = useMe();
  return (permission: Permission) => Boolean(data?.permissions.includes(permission));
}

/** Current time as render-safe state, refreshed every `intervalMs`. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

interface PublicSettings {
  bookingPolicy: { freeCancellationHours: number };
  membershipPolicy: { memberSelfFreeze: boolean; minFreezeDays: number };
}

/** Non-sensitive club rules (`/settings/public`), shared by every client component. */
export function usePublicSettings() {
  return useQuery({
    queryKey: ['public-settings'],
    queryFn: () => api.get<PublicSettings>('/settings/public'),
    staleTime: 5 * 60_000,
  });
}
