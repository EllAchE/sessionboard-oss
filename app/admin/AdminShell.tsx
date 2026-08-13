'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
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
import { CiceroBrand } from '@/components/CiceroBrand';
import { CommandMenu, SidebarNav, type CommandMenuItem } from '@/components/ui';
import type { EventSummary } from '@/lib/services/events';
import { EventSwitcher } from './EventSwitcher';
import { QuickActions } from './QuickActions';
import { ThemeToggle } from './ThemeToggle';
import styles from './admin.module.css';

type NavEntry = { id: string; label: string; href: string; icon: React.ReactNode };

const NAV: { id: string; title: string; items: NavEntry[] }[] = [
  {
    id: 'program',
    title: 'The Curia',
    items: [
      { id: 'overview', label: 'Forum', href: '/admin', icon: <LayoutDashboard size={15} /> },
      { id: 'submissions', label: 'Petitions', href: '/admin/submissions', icon: <ClipboardList size={15} /> },
      { id: 'agenda', label: 'Fasti', href: '/admin/agenda', icon: <CalendarDays size={15} /> },
      { id: 'speakers', label: 'Orators', href: '/admin/speakers', icon: <Users size={15} /> },
      { id: 'crm', label: 'Orator census', href: '/crm', icon: <Contact size={15} /> },
    ],
  },
  {
    id: 'collect',
    title: 'Gather',
    items: [
      { id: 'forms', label: 'Scrolls', href: '/admin/forms', icon: <FileText size={15} /> },
      { id: 'tasks', label: 'Duties', href: '/admin/tasks', icon: <ClipboardList size={15} /> },
    ],
  },
  {
    id: 'reach',
    title: 'Proclaim',
    items: [
      { id: 'comms', label: 'Dispatches', href: '/admin/comms', icon: <Mail size={15} /> },
      { id: 'mail', label: 'Courier archive', href: '/admin/mail', icon: <Mail size={15} /> },
      { id: 'embeds', label: 'Inscriptions', href: '/admin/embeds', icon: <Plug size={15} /> },
    ],
  },
  {
    id: 'setup',
    title: 'Govern',
    items: [
      { id: 'settings', label: 'Edicts', href: '/admin/settings', icon: <Settings size={15} /> },
      { id: 'integrations', label: 'Alliances', href: '/admin/integrations', icon: <Plug size={15} /> },
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
  const [commandOpen, setCommandOpen] = useState(false);
  const currentEvent = events.find((event) => event.id === currentEventId) ?? events[0];

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
        label: 'Convene an event',
        group: 'Commands',
        onSelect: () => router.push('/events/new'),
      },
      { id: 'portal', label: 'Enter the orator atrium', group: 'Commands', onSelect: () => router.push('/portal') },
    ],
    [router],
  );

  return (
    <div className={styles.root}>
      <aside className={styles.sidebar}>
        <SidebarNav
          sections={NAV}
          activeId={activeId}
          header={<CiceroBrand markSize={22} />}
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
      <QuickActions
        currentEventSlug={currentEvent?.slug}
        onOpenCommand={() => setCommandOpen(true)}
      />
      <CommandMenu
        items={commands}
        open={commandOpen}
        onOpenChange={setCommandOpen}
        hotkey
        placeholder="Search the empire…"
      />
    </div>
  );
}
