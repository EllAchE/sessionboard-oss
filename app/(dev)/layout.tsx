import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Design labs are useful under `next dev`, but they are not product surfaces. Keep the route group
 * unavailable in production even if a new lab is added without its own guard.
 */
export default function DevelopmentLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return children;
}
