'use client';

import { createContext, useContext, useId, useRef, useState } from 'react';
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
} from 'react';
import { cn } from '../cn';
import styles from './Tabs.module.css';

interface TabsEntry {
  el: HTMLButtonElement;
  disabled: boolean;
}

interface TabsContextValue {
  selectedValue: string | undefined;
  hasSelection: boolean;
  select: (value: string) => void;
  baseId: string;
  registerTrigger: (value: string, el: HTMLButtonElement | null, disabled: boolean) => void;
  focusAdjacent: (fromValue: string, direction: 1 | -1) => void;
  focusEdge: (edge: 'first' | 'last') => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error(`${component} must be rendered inside a Tabs component`);
  }
  return ctx;
}

interface TabsProps extends HTMLAttributes<HTMLDivElement> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children?: ReactNode;
}

function Tabs({ value, defaultValue, onValueChange, className, children, ...rest }: TabsProps) {
  const isControlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const selectedValue = isControlled ? value : uncontrolledValue;
  const baseId = useId();

  const orderRef = useRef<string[]>([]);
  const entriesRef = useRef(new Map<string, TabsEntry>());

  const select = (next: string) => {
    if (!isControlled) {
      setUncontrolledValue(next);
    }
    onValueChange?.(next);
  };

  const registerTrigger = (val: string, el: HTMLButtonElement | null, disabled: boolean) => {
    if (el) {
      if (!orderRef.current.includes(val)) {
        orderRef.current.push(val);
      }
      entriesRef.current.set(val, { el, disabled });
    } else {
      orderRef.current = orderRef.current.filter((v) => v !== val);
      entriesRef.current.delete(val);
    }
  };

  const enabledOrder = () =>
    orderRef.current.filter((v) => !entriesRef.current.get(v)?.disabled);

  const focusAdjacent = (fromValue: string, direction: 1 | -1) => {
    const order = enabledOrder();
    if (order.length === 0) return;
    const currentIndex = order.indexOf(fromValue);
    const startIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = (startIndex + direction + order.length) % order.length;
    const nextValue = order[nextIndex];
    select(nextValue);
    entriesRef.current.get(nextValue)?.el.focus();
  };

  const focusEdge = (edge: 'first' | 'last') => {
    const order = enabledOrder();
    if (order.length === 0) return;
    const nextValue = edge === 'first' ? order[0] : order[order.length - 1];
    select(nextValue);
    entriesRef.current.get(nextValue)?.el.focus();
  };

  const contextValue: TabsContextValue = {
    selectedValue,
    hasSelection: selectedValue !== undefined,
    select,
    baseId,
    registerTrigger,
    focusAdjacent,
    focusEdge,
  };

  return (
    <TabsContext.Provider value={contextValue}>
      <div className={cn(styles.root, className)} {...rest}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

interface TabsListProps extends HTMLAttributes<HTMLDivElement> {}

function TabsList({ className, children, ...rest }: TabsListProps) {
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn(styles.list, className)}
      {...rest}
    >
      {children}
    </div>
  );
}

interface TabsTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  value: string;
  disabled?: boolean;
}

function TabsTrigger({
  value,
  disabled,
  className,
  onKeyDown,
  onClick,
  children,
  ...rest
}: TabsTriggerProps) {
  const { selectedValue, hasSelection, select, baseId, registerTrigger, focusAdjacent, focusEdge } =
    useTabsContext('TabsTrigger');
  const isSelected = selectedValue === value;
  const triggerId = `${baseId}-trigger-${value}`;
  const panelId = `${baseId}-panel-${value}`;

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    if (!disabled) select(value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(e);
    if (disabled) return;
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        focusAdjacent(value, 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        focusAdjacent(value, -1);
        break;
      case 'Home':
        e.preventDefault();
        focusEdge('first');
        break;
      case 'End':
        e.preventDefault();
        focusEdge('last');
        break;
      default:
        break;
    }
  };

  return (
    <button
      type="button"
      ref={(el) => registerTrigger(value, el, Boolean(disabled))}
      id={triggerId}
      role="tab"
      aria-selected={isSelected}
      aria-controls={panelId}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      tabIndex={isSelected || !hasSelection ? 0 : -1}
      className={cn(styles.trigger, isSelected && styles.selected, className)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {children}
    </button>
  );
}

interface TabsPanelProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
}

function TabsPanel({ value, className, children, ...rest }: TabsPanelProps) {
  const { selectedValue, baseId } = useTabsContext('TabsPanel');
  if (selectedValue !== value) return null;

  const triggerId = `${baseId}-trigger-${value}`;
  const panelId = `${baseId}-panel-${value}`;

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={triggerId}
      tabIndex={0}
      className={cn(styles.panel, className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsPanel };
export type { TabsProps, TabsTriggerProps, TabsPanelProps };
