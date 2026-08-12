import { forwardRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { cn } from '../cn';
import styles from './Textarea.module.css';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  resize?: 'none' | 'vertical';
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, resize = 'vertical', className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(styles.root, styles[resize], className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
});

Textarea.displayName = 'Textarea';

export { Textarea };
export type { TextareaProps };
