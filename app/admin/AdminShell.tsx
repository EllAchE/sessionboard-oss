'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useMemo } from 'react';
import {
  CalendarDays,
  ClipboardList,
  Contact,
  FileText,
  LayoutDashboard,
  Mail,
  Plug,
  Settings,
  Users,
} from 'lucide-react';
import { CommandMenu, SidebarNav, type CommandMenuItem } from '@/components/ui';
import type { EventSummary } from '@/lib/services/events';
import { EventSwitcher } from './EventSwitcher';
import { ThemeToggle } from './ThemeToggle';
import styles from './admin.module.css';

type NavEntry = { id: string; label: string; href: string; icon: React.ReactNode };

const NAV: { id: string; title: string; items: NavEntry[] }[] = [
  {
    id: 'program',
    title: 'Program',
    items: [
      { id: 'overview', label: 'Overview', href: '/admin', icon: <LayoutDashboard size={15} /> },
      { id: 'submissions', label: 'Submissions', href: '/admin/submissions', icon: <ClipboardList size={15} /> },
      { id: 'agenda', label: 'Agenda', href: '/admin/agenda', icon: <CalendarDays size={15} /> },
      { id: 'speakers', label: 'Speakers', href: '/admin/speakers', icon: <Users size={15} /> },
      { id: 'crm', label: 'Speaker CRM', href: '/crm', icon: <Contact size={15} /> },
    ],
  },
  {
    id: 'collect',
    title: 'Collect',
    items: [
      { id: 'forms', label: 'Forms', href: '/admin/forms', icon: <FileText size={15} /> },
      { id: 'tasks', label: 'Tasks', href: '/admin/tasks', icon: <ClipboardList size={15} /> },
    ],
  },
  {
    id: 'reach',
    title: 'Reach',
    items: [
      { id: 'comms', label: 'Comms', href: '/admin/comms', icon: <Mail size={15} /> },
      { id: 'mail', label: 'Mailbox', href: '/admin/mail', icon: <Mail size={15} /> },
      { id: 'embeds', label: 'Embeds', href: '/admin/embeds', icon: <Plug size={15} /> },
    ],
  },
  {
    id: 'setup',
    title: 'Setup',
    items: [
      { id: 'settings', label: 'Settings', href: '/admin/settings', icon: <Settings size={15} /> },
      { id: 'integrations', label: 'Integrations', href: '/admin/integrations', icon: <Plug size={15} /> },
    ],
  },
];

export function AdminShell({
  children,
  events,
  currentEventId,
  actorName,
}: {
  children: React.ReactNode;
  events: EventSummary[];
  currentEventId: string;
  actorName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  /** Longest matching href wins, so /admin/forms/abc highlights Forms rather than Overview. */
  const activeId = useMemo(() => {
    const all = NAV.flatMap((section) => section.items);
    return all
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.id;
  }, [pathname]);

  const commands = useMemo<CommandMenuItem[]>(
    () => [
      ...NAV.flatMap((section) =>
        section.items.map((item) => ({
          id: item.id,
          label: item.label,
          group: section.title,
          icon: item.icon,
          onSelect: () => router.push(item.href),
        })),
      ),
      {
        id: 'new-event',
        label: 'Create an event',
        group: 'Actions',
        onSelect: () => router.push('/events/new'),
      },
      { id: 'portal', label: 'Open the speaker portal', group: 'Actions', onSelect: () => router.push('/portal') },
    ],
    [router],
  );

  return (
    <div className={styles.root}>
      <aside className={styles.sidebar}>
        <SidebarNav
          sections={NAV}
          activeId={activeId}
          header={<span className={styles.wordmark}>Cicero</span>}
        />
      </aside>
      <div className={styles.main}>
        <header className={styles.topbar}>
          <EventSwitcher events={events} currentEventId={currentEventId} />
          <div className={styles.topbarRight}>
            <ThemeToggle />
            <span className={styles.actor}>{actorName}</span>
          </div>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
      <CommandMenu items={commands} hotkey placeholder="Jump to…" />
    </div>
  );
}
