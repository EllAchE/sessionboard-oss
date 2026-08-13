import { X } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { cn } from '../cn';
import styles from './Tag.module.css';

type TagTone = 'neutral' | 'accent';

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: TagTone;
  onRemove?: () => void;
  removeLabel?: string;
}

function Tag({
  tone = 'neutral',
  onRemove,
  removeLabel = 'Remove',
  className,
  children,
  ...rest
}: TagProps) {
  const removeAriaLabel = typeof children === 'string' ? `${removeLabel} ${children}` : removeLabel;

  return (
    <span className={cn(styles.root, styles[tone], className)} {...rest}>
      <span className={styles.label}>{children}</span>
      {onRemove && (
        <button
          type="button"
          className={styles.removeButton}
          aria-label={removeAriaLabel}
          onClick={onRemove}
        >
          <X className={styles.removeIcon} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
Tag.displayName = 'Tag';

export { Tag };
export type { TagProps };
