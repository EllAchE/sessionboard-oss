'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Contact,
  FileUp,
  GitMerge,
  Kanban,
  LayoutDashboard,
  Mail,
  Bookmark,
  SlidersHorizontal,
} from 'lucide-react';
import styles from './crm.module.css';

const ITEMS = [
  { href: '/crm', label: 'Directory', icon: <Contact size={14} /> },
  { href: '/crm/pipeline', label: 'Pipeline', icon: <Kanban size={14} /> },
  { href: '/crm/segments', label: 'Segments', icon: <Bookmark size={14} /> },
  {
    href: '/crm/duplicates',
    label: 'Duplicates',
    icon: <GitMerge size={14} />,
  },
  { href: '/crm/campaigns', label: 'Email', icon: <Mail size={14} /> },
  {
    href: '/crm/dashboard',
    label: 'CRM dashboard',
    icon: <LayoutDashboard size={14} />,
  },
  { href: '/crm/import', label: 'Import CSV', icon: <FileUp size={14} /> },
  {
    href: '/crm/fields',
    label: 'Custom fields',
    icon: <SlidersHorizontal size={14} />,
  },
];

export function CrmNav() {
  const pathname = usePathname();
  const active = ITEMS.filter(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  ).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className={styles.nav} aria-label="Speaker CRM">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={styles.navItem}
          data-active={item.href === active}
          aria-current={item.href === active ? 'page' : undefined}
        >
          {item.icon}
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
