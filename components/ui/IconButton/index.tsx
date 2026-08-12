import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../cn';
import styles from './IconButton.module.css';

type IconButtonVariant = 'ghost' | 'secondary' | 'danger';
type IconButtonSize = 'xs' | 'sm' | 'md';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, variant = 'ghost', size = 'md', disabled, className, children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        disabled={disabled}
        className={cn(styles.root, styles[variant], styles[size], className)}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

IconButton.displayName = 'IconButton';

export { IconButton };
export type { IconButtonProps };
