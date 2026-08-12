import type { HTMLAttributes } from 'react';
import { cn } from '../cn';
import styles from './Kbd.module.css';

type KbdSize = 'sm' | 'md';

interface KbdProps extends HTMLAttributes<HTMLElement> {
  size?: KbdSize;
}

function Kbd({ size = 'sm', className, ...rest }: KbdProps) {
  return <kbd className={cn(styles.root, styles[size], className)} {...rest} />;
}

Kbd.displayName = 'Kbd';

export { Kbd };
export type { KbdProps };
