'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';
import type { FieldError, FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { useErrorMessage } from '@/components/providers';
import { cn } from '@/lib/utils';
import { Label } from './input';

/** Resolves `v.*` keys produced by the shared zod schemas into the active language. */
export function useValidationMessage() {
  const t = useTranslations('validation');
  return (message?: string) => {
    if (!message) return undefined;
    if (message.startsWith('v.')) {
      const key = message.slice(2);
      return t.has(key) ? t(key) : t('invalid');
    }
    return message;
  };
}

export function Field({
  label,
  error,
  hint,
  children,
  className,
  required,
  id: idProp,
}: {
  label?: React.ReactNode;
  error?: FieldError | string;
  hint?: React.ReactNode;
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => React.ReactNode;
  className?: string;
  required?: boolean;
  id?: string;
}) {
  const generated = useId();
  const id = idProp ?? generated;
  const translate = useValidationMessage();
  const message = typeof error === 'string' ? translate(error) : translate(error?.message);
  const describedBy = message ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <Label htmlFor={id}>
          {label}
          {required && <span className="ml-0.5 text-primary">*</span>}
        </Label>
      )}
      {children({ id, 'aria-invalid': message ? true : undefined, 'aria-describedby': describedBy })}
      {message ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
          {message}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Standard mutation error handling: field-level issues from the API are shown under the
 * matching inputs; everything else becomes a toast in the visitor's language.
 */
export function useFormErrorHandler<T extends FieldValues>(setError?: UseFormSetError<T>) {
  const message = useErrorMessage();
  return (error: unknown) => {
    if (error instanceof ApiError && error.details?.issues && setError) {
      let mapped = false;
      for (const issue of error.details.issues) {
        if (issue.path) {
          setError(issue.path as Path<T>, { type: 'server', message: issue.message });
          mapped = true;
        }
      }
      if (mapped) return;
    }
    toast.error(message(error));
  };
}
