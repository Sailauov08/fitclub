import type { LeadStatus } from '@fitclub/shared';
import type { Tone } from '@/components/ui/display';

export const LEAD_TONE: Record<LeadStatus, Tone> = {
  NEW: 'primary',
  CONTACTED: 'info',
  TRIAL_SCHEDULED: 'warning',
  NEGOTIATION: 'warning',
  WON: 'success',
  LOST: 'neutral',
};
