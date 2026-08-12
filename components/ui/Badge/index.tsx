import type { HTMLAttributes } from 'react';
import { cn } from '../cn';
import styles from './Badge.module.css';

type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';
type BadgeSize = 'sm' | 'md';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: BadgeSize;
}

function Badge({ tone = 'neutral', size = 'sm', className, ...rest }: BadgeProps) {
  return <span className={cn(styles.root, styles[tone], styles[size], className)} {...rest} />;
}
Badge.displayName = 'Badge';

export { Badge };
export type { BadgeProps };
