import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../cn';
import styles from './Select.module.css';

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  selectSize?: 'sm' | 'md' | 'lg';
  invalid?: boolean;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { selectSize = 'md', invalid, className, children, ...rest },
  ref,
) {
  return (
    <span className={styles.wrap}>
      <select
        ref={ref}
        className={cn(styles.root, styles[selectSize], className)}
        aria-invalid={invalid || undefined}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className={styles.chevron} aria-hidden size={16} />
    </span>
  );
});

Select.displayName = 'Select';

export { Select };
export type { SelectProps };
