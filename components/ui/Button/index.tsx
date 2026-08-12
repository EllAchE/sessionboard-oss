import { forwardRef } from 'react';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
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
  /** Renders an anchor instead. Navigation that looks like an action still has to be a link. */
  href?: string;
}

const Button = forwardRef<HTMLButtonElement & HTMLAnchorElement, ButtonProps>(
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
      href,
      ...rest
    },
    ref,
  ) => {
    const classes = cn(
      styles.root,
      styles[variant],
      styles[size],
      fullWidth && styles.fullWidth,
      className,
    );
    const inner = (
      <>
        {loading && <span className={styles.spinner} aria-hidden="true" />}
        <span className={cn(styles.content, loading && styles.contentHidden)}>
          {iconLeft && <span className={styles.icon}>{iconLeft}</span>}
          {children !== undefined && <span className={styles.label}>{children}</span>}
          {iconRight && <span className={styles.icon}>{iconRight}</span>}
        </span>
      </>
    );

    if (href !== undefined) {
      return (
        <a
          ref={ref}
          href={href}
          className={classes}
          {...(rest as unknown as AnchorHTMLAttributes<HTMLAnchorElement>)}
        >
          {inner}
        </a>
      );
    }

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...rest}
      >
        {inner}
      </button>
    );
  },
);

Button.displayName = 'Button';

export { Button };
export type { ButtonProps };
