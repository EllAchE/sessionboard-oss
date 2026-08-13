import type { HTMLAttributes } from 'react';
import Image from 'next/image';
import { speakerInitials } from '@/lib/speaker-name';
import { cn } from '../cn';
import styles from './Avatar.module.css';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  name: string;
  src?: string;
  size?: AvatarSize;
}

function Avatar({ name, src, size = 'md', className, ...rest }: AvatarProps) {
  const initials = speakerInitials(name);

  return (
    <span
      role="img"
      aria-label={name}
      dir="auto"
      className={cn(styles.root, styles[size], className)}
      {...rest}
    >
      <span className={styles.initials} aria-hidden="true">
        {initials}
      </span>
      {src && (
        <Image className={styles.image} src={src} alt="" width={48} height={48} unoptimized />
      )}
    </span>
  );
}
Avatar.displayName = 'Avatar';

export { Avatar };
export type { AvatarProps };
