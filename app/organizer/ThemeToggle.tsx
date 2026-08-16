'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { IconButton } from '@/components/ui';

type Theme = 'light' | 'dark';

/**
 * Reads the attribute the pre-paint script in the root layout already set, rather than defaulting to
 * light and correcting on mount — that correction is the flash it exists to avoid.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('cicero-theme', next);
    } catch {
      /* private mode; the choice just does not survive the tab */
    }
    setTheme(next);
  }

  return (
    <IconButton
      variant="ghost"
      size="sm"
      label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={toggle}
    >
      {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
    </IconButton>
  );
}
