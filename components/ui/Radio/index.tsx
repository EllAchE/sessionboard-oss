import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '../cn';
import styles from './Radio.module.css';

interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {}

const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} type="radio" className={cn(styles.root, className)} {...rest} />;
});

Radio.displayName = 'Radio';

export { Radio };
export type { RadioProps };
