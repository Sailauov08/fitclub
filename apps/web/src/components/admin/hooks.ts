'use client';

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import type { LocalizedText } from '@fitclub/shared';
import { usePathname, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import type { Plan } from '@/lib/types';

/** URL-backed filter state so admin lists are shareable and survive reloads. */
export function useUrlState<T extends Record<string, string | undefined>>(defaults: T) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const state = Object.fromEntries(Object.keys(defaults).map((k) => [k, params.get(k) ?? defaults[k]])) as T;
  const set = useCallback(
    (patch: Partial<T>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '' || v === defaults[k]) next.delete(k);
        else next.set(k, String(v));
      }
      if (!('page' in patch)) next.delete('page');
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [params, router, pathname, defaults],
  );
  return [state, set] as const;
}

export interface BranchOption {
  id: string;
  name: LocalizedText;
  rooms: { id: string; name: LocalizedText; capacity: number; isActive: boolean }[];
}

export function useBranches() {
  return useQuery({
    queryKey: ['admin-branches'],
    queryFn: () => api.get<BranchOption[]>('/admin/branches'),
    staleTime: 5 * 60_000,
  });
}

export function usePlans() {
  return useQuery({ queryKey: ['admin-plans'], queryFn: () => api.get<Plan[]>('/admin/plans'), staleTime: 60_000 });
}

export interface TrainerOption {
  id: string;
  displayName: string;
  branchId: string;
  isActive: boolean;
}
export function useTrainers() {
  return useQuery({
    queryKey: ['admin-trainers'],
    queryFn: () => api.get<TrainerOption[]>('/admin/trainers'),
    staleTime: 60_000,
  });
}
