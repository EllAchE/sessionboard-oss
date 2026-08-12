'use client';

import { useFormStatus } from 'react-dom';
import { Button, cn, type ButtonProps } from '@/components/ui';
import type { FormState } from '../form-state';
import styles from '../portal.module.css';

/** Every portal write reports back in the same place, in the same words. */
export function FormNotice({ state }: { state: FormState }) {
  if (state.status === 'idle' || !state.message) return null;
  return (
    <p
      className={cn(
        styles.formNotice,
        state.status === 'ok' ? styles.formNoticeOk : styles.formNoticeError,
      )}
      role="status"
    >
      {state.message}
    </p>
  );
}

export function FieldError({ state, field }: { state: FormState; field: string }) {
  const message = state.details?.[field];
  if (!message) return null;
  return <span className={styles.error}>{message}</span>;
}

export function SubmitButton({ children, ...rest }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} {...rest}>
      {children}
    </Button>
  );
}
