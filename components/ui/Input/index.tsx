import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '../cn';
import styles from './Input.module.css';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  inputSize?: 'sm' | 'md' | 'lg';
  invalid?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { inputSize = 'md', invalid, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(styles.root, styles[inputSize], className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
});

Input.displayName = 'Input';

export { Input };
export type { InputProps };
