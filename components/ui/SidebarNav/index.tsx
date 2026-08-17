'use client';

import type { HTMLAttributes, MouseEvent, ReactNode } from 'react';
import { cn } from '../cn';
import styles from './SidebarNav.module.css';

interface SidebarNavItem {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
  href?: string;
  disabled?: boolean;
  /**
   * The keystroke that reaches this destination, in `aria-keyshortcuts` spelling. Announced rather
   * than drawn, so a screen reader learns the key without the sighted hint badge being on screen.
   */
  keyshortcuts?: string;
}

interface SidebarNavSection {
  id: string;
  title?: string;
  items: SidebarNavItem[];
}

interface SidebarNavProps extends Omit<HTMLAttributes<HTMLElement>, 'onSelect'> {
  sections: SidebarNavSection[];
  activeId?: string;
  onSelect?: (id: string) => void;
  header?: ReactNode;
  footer?: ReactNode;
}

function SidebarNav({
  sections,
  activeId,
  onSelect,
  header,
  footer,
  className,
  ...rest
}: SidebarNavProps) {
  return (
    <nav className={cn(styles.root, className)} {...rest}>
      {header ? <div className={styles.header}>{header}</div> : null}
      {sections.map((section) => (
        <div key={section.id} className={styles.section}>
          {section.title ? <div className={styles.sectionTitle}>{section.title}</div> : null}
          <ul role="list" className={styles.list}>
            {section.items.map((item) => {
              const isActive = item.id === activeId;
              const itemClassName = cn(
                styles.item,
                isActive && styles.active,
                item.disabled && styles.disabled,
              );
              const content = (
                <>
                  {item.icon ? <span className={styles.icon}>{item.icon}</span> : null}
                  <span className={styles.label}>{item.label}</span>
                  {item.badge ? <span className={styles.badge}>{item.badge}</span> : null}
                </>
              );

              const handleClick = (e: MouseEvent) => {
                if (item.disabled) {
                  e.preventDefault();
                  return;
                }
                onSelect?.(item.id);
              };

              return (
                <li key={item.id}>
                  {item.href ? (
                    <a
                      href={item.disabled ? undefined : item.href}
                      className={itemClassName}
                      aria-current={isActive ? 'page' : undefined}
                      aria-disabled={item.disabled || undefined}
                      aria-keyshortcuts={item.keyshortcuts}
                      tabIndex={item.disabled ? -1 : undefined}
                      onClick={handleClick}
                    >
                      {content}
                    </a>
                  ) : (
                    <button
                      type="button"
                      className={itemClassName}
                      aria-current={isActive ? 'page' : undefined}
                      aria-disabled={item.disabled || undefined}
                      aria-keyshortcuts={item.keyshortcuts}
                      disabled={item.disabled}
                      onClick={handleClick}
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </nav>
  );
}

export { SidebarNav };
export type { SidebarNavProps, SidebarNavItem, SidebarNavSection };
