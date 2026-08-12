import type { HTMLAttributes } from 'react';
import { cn } from '../cn';
import styles from './Avatar.module.css';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  name: string;
  src?: string;
  size?: AvatarSize;
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}

function Avatar({ name, src, size = 'md', className, ...rest }: AvatarProps) {
  const initials = getInitials(name);

  return (
    <span
      role="img"
      aria-label={name}
      className={cn(styles.root, styles[size], className)}
      {...rest}
    >
      <span className={styles.initials} aria-hidden="true">
        {initials}
      </span>
      {src && <img className={styles.image} src={src} alt="" />}
    </span>
  );
}
Avatar.displayName = 'Avatar';

export { Avatar };
export type { AvatarProps };
