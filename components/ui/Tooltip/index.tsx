'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { HTMLAttributes, KeyboardEvent, ReactElement, ReactNode } from 'react';
import { cn } from '../cn';
import styles from './Tooltip.module.css';

interface TooltipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'content'> {
  content: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delay?: number;
  children: ReactElement;
}

function Tooltip({
  content,
  side = 'top',
  delay = 120,
  children,
  className,
  ...rest
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tooltipId = useId();

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const show = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(true), delay);
  };

  const hide = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
    setVisible(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Escape') hide();
  };

  return (
    <span
      className={cn(styles.wrapper, className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={handleKeyDown}
      aria-describedby={visible ? tooltipId : undefined}
      {...rest}
    >
      {children}
      {visible ? (
        <span role="tooltip" id={tooltipId} className={cn(styles.tip, styles[side])}>
          {content}
        </span>
      ) : null}
    </span>
  );
}

export { Tooltip };
export type { TooltipProps };
