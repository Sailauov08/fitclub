'use client';

import { useTranslations } from 'next-intl';
import { addDaysToKey, localDateKey } from '@fitclub/shared';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/controls';
import { cn } from '@/lib/utils';

export interface Range {
  from: string;
  to: string;
  includeTest: boolean;
}

export function defaultRange(days = 30): Range {
  const to = localDateKey(new Date());
  return { from: addDaysToKey(to, -(days - 1)), to, includeTest: true };
}

/** Preset + custom date range selector with the "include test/demo payments" switch. */
export function RangePicker({
  value,
  onChange,
  showTest = true,
}: {
  value: Range;
  onChange: (r: Range) => void;
  showTest?: boolean;
}) {
  const t = useTranslations('admin.range');
  const today = localDateKey(new Date());
  const presets = [7, 30, 90, 365];
  const active = (d: number) => value.to === today && value.from === addDaysToKey(today, -(d - 1));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
        {presets.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onChange({ ...value, from: addDaysToKey(today, -(d - 1)), to: today })}
            className={cn(
              'rounded px-2.5 py-1 text-xs font-semibold',
              active(d) ? 'bg-foreground text-background' : 'text-muted hover:text-foreground',
            )}
          >
            {t(`d${d}`)}
          </button>
        ))}
      </div>
      <Input
        type="date"
        aria-label={t('from')}
        value={value.from}
        max={value.to}
        onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })}
        className="h-8 w-[9.5rem] text-xs"
      />
      <span className="text-muted">—</span>
      <Input
        type="date"
        aria-label={t('to')}
        value={value.to}
        min={value.from}
        max={today}
        onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })}
        className="h-8 w-[9.5rem] text-xs"
      />
      {showTest && (
        <label className="ml-1 inline-flex items-center gap-2 text-xs text-muted">
          <Switch checked={value.includeTest} onCheckedChange={(v) => onChange({ ...value, includeTest: v })} />
          {t('includeTest')}
        </label>
      )}
    </div>
  );
}
