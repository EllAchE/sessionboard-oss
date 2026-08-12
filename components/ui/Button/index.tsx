import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn';
import styles from './Button.module.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      iconLeft,
      iconRight,
      fullWidth = false,
      disabled,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={cn(
          styles.root,
          styles[variant],
          styles[size],
          fullWidth && styles.fullWidth,
          className,
        )}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...rest}
      >
        {loading && <span className={styles.spinner} aria-hidden="true" />}
        <span className={cn(styles.content, loading && styles.contentHidden)}>
          {iconLeft && <span className={styles.icon}>{iconLeft}</span>}
          {children !== undefined && <span className={styles.label}>{children}</span>}
          {iconRight && <span className={styles.icon}>{iconRight}</span>}
        </span>
      </button>
    );
  },
);

Button.displayName = 'Button';

export { Button };
export type { ButtonProps };
