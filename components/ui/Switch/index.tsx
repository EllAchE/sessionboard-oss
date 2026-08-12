'use client';

import { forwardRef, useState } from 'react';
import type { ButtonHTMLAttributes, MouseEvent } from 'react';
import { cn } from '../cn';
import styles from './Switch.module.css';

interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'type' | 'value'> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: 'sm' | 'md';
}

const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, defaultChecked, onCheckedChange, size = 'md', className, onClick, ...rest },
  ref,
) {
  const isControlled = checked !== undefined;
  const [uncontrolledChecked, setUncontrolledChecked] = useState(Boolean(defaultChecked));
  const isChecked = isControlled ? checked : uncontrolledChecked;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    const next = !isChecked;
    if (!isControlled) {
      setUncontrolledChecked(next);
    }
    onCheckedChange?.(next);
  };

  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={isChecked}
      className={cn(styles.root, styles[size], className)}
      onClick={handleClick}
      {...rest}
    >
      <span className={styles.thumb} />
    </button>
  );
});

Switch.displayName = 'Switch';

export { Switch };
export type { SwitchProps };
