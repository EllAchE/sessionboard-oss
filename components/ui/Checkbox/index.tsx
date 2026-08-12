'use client';

import { forwardRef, useEffect, useRef } from 'react';
import type { InputHTMLAttributes, Ref } from 'react';
import { cn } from '../cn';
import styles from './Checkbox.module.css';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  indeterminate?: boolean;
}

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (node: T) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') {
        ref(node);
      } else {
        (ref as { current: T | null }).current = node;
      }
    }
  };
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { indeterminate, className, ...rest },
  ref,
) {
  const internalRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (internalRef.current) {
      internalRef.current.indeterminate = Boolean(indeterminate);
    }
  }, [indeterminate]);

  return (
    <input
      ref={mergeRefs(internalRef, ref)}
      type="checkbox"
      className={cn(styles.root, className)}
      aria-checked={indeterminate ? 'mixed' : undefined}
      {...rest}
    />
  );
});

Checkbox.displayName = 'Checkbox';

export { Checkbox };
export type { CheckboxProps };
