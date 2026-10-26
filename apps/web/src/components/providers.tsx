'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { useTranslations } from 'next-intl';
import { createContext, useContext, useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { z } from 'zod';
import { ApiError } from '@/lib/api';

type Theme = 'light' | 'dark' | 'system';
const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: 'system',
  setTheme: () => undefined,
});
export const useTheme = () => useContext(ThemeContext);

/** Applied before hydration (see layout) to avoid a flash of the wrong theme. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('fc-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

/** Maps zod issue codes to translation keys; schema-level messages (already keys) take precedence. */
function useZodLocale() {
  useEffect(() => {
    z.config({
      customError: (issue) => {
        if (issue.code === 'invalid_type' && issue.input === undefined) return 'v.required';
        if (issue.code === 'too_small')
          return issue.origin === 'string' && issue.minimum === 1 ? 'v.required' : 'v.tooShort';
        if (issue.code === 'too_big') return 'v.tooLong';
        if (issue.code === 'invalid_format') return issue.format === 'email' ? 'v.email' : 'v.invalid';
        return 'v.invalid';
      },
    });
  }, []);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
          },
        },
      }),
  );
  const [theme, setThemeState] = useState<Theme>('system');
  useZodLocale();

  useEffect(() => {
    try {
      // Read after hydration on purpose: the server cannot know the stored theme.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThemeState((localStorage.getItem('fc-theme') as Theme) || 'system');
    } catch {
      /* storage unavailable */
    }
  }, []);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem('fc-theme', next);
    } catch {
      /* storage unavailable */
    }
    applyTheme(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <QueryClientProvider client={client}>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
        <Toaster position="top-center" richColors closeButton toastOptions={{ className: 'font-sans' }} />
      </QueryClientProvider>
    </ThemeContext.Provider>
  );
}

/** Translates API errors (code + reason) into the visitor's language. */
export function useErrorMessage() {
  const t = useTranslations();
  return (error: unknown): string => {
    if (error instanceof ApiError) {
      const reason = error.details?.reason;
      if (reason && t.has(`reasons.${reason}`)) return t(`reasons.${reason}`);
      if (t.has(`errors.${error.code}`)) return t(`errors.${error.code}`);
      return error.message;
    }
    return t('errors.NETWORK');
  };
}
