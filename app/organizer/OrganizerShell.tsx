'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  Bell,
  Building2,
  CalendarDays,
  ClipboardList,
  Contact,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Mail,
  Map as MapIcon,
  MessageSquare,
  Plug,
  Settings,
  UserRound,
  Video,
  Users,
} from 'lucide-react';
import { CiceroBrand } from '@/components/CiceroBrand';
import { useHotkeyContext, useHotkeys } from '@/components/hotkeys/HotkeyProvider';
import { Avatar, CommandMenu, SidebarNav, type CommandMenuItem } from '@/components/ui';
import { SCOPES } from '@/lib/hotkeys/registry';
import type { EventSummary } from '@/lib/services/events';
import { EventSwitcher } from './EventSwitcher';
import { InfoPanel } from './InfoPanel';
import { QuickActions } from './QuickActions';
import { ThemeToggle } from './ThemeToggle';
import styles from './organizer.module.css';

type NavEntry = { id: string; label: string; href: string; icon: React.ReactNode };

/**
 * Where each `g` sequence lands. The registry owns which letter reaches a binding; this owns where
 * that binding goes, so adding a destination never means editing the matcher.
 */
const GOTO_HREFS: Record<string, string> = {
  'goto-overview': '/organizer',
  'goto-submissions': '/organizer/submissions',
  'goto-agenda': '/organizer/agenda',
  'goto-updates': '/organizer/updates',
  'goto-tasks': '/organizer/tasks',
  'goto-forms': '/organizer/forms',
  'goto-comms': '/organizer/comms',
  'goto-speakers': '/organizer/speakers',
};

const NAV: { id: string; title: string; items: NavEntry[] }[] = [
  {
    id: 'program',
    title: 'Program',
    items: [
      { id: 'overview', label: 'Overview', href: '/organizer', icon: <LayoutDashboard size={15} /> },
      { id: 'updates', label: 'Updates', href: '/organizer/updates', icon: <Bell size={15} /> },
      { id: 'submissions', label: 'Submissions', href: '/organizer/submissions', icon: <ClipboardList size={15} /> },
      { id: 'agenda', label: 'Agenda', href: '/organizer/agenda', icon: <CalendarDays size={15} /> },
      { id: 'recordings', label: 'Recordings', href: '/organizer/recordings', icon: <Video size={15} /> },
      { id: 'speakers', label: 'Speakers', href: '/organizer/speakers', icon: <Users size={15} /> },
      { id: 'crm', label: 'Speaker CRM', href: '/crm', icon: <Contact size={15} /> },
    ],
  },
  {
    id: 'collect',
    title: 'Collect',
    items: [
      { id: 'forms', label: 'Forms', href: '/organizer/forms', icon: <FileText size={15} /> },
      { id: 'tasks', label: 'Tasks', href: '/organizer/tasks', icon: <ClipboardList size={15} /> },
      /**
       * `SPK-10`. The library has always existed; it was only reachable from a tab strip inside the
       * submission screens, so "where are the files" ended at a guessed URL and a 404. It is filed
       * under Collect because that is what it is the other half of: Forms and Tasks ask for things,
       * this is where the things arrive.
       */
      { id: 'files', label: 'Files', href: '/organizer/submissions/files', icon: <FolderOpen size={15} /> },
    ],
  },
  {
    id: 'reach',
    title: 'Reach',
    items: [
      { id: 'comms', label: 'Comms', href: '/organizer/comms', icon: <Mail size={15} /> },
      { id: 'mail', label: 'Mailbox', href: '/organizer/mail', icon: <Mail size={15} /> },
      { id: 'sms', label: 'SMS', href: '/organizer/sms', icon: <MessageSquare size={15} /> },
      { id: 'embeds', label: 'Embeds', href: '/organizer/embeds', icon: <Plug size={15} /> },
    ],
  },
  {
    id: 'setup',
    title: 'Setup',
    items: [
      { id: 'settings', label: 'Settings', href: '/organizer/settings', icon: <Settings size={15} /> },
      { id: 'sponsors', label: 'Sponsors', href: '/organizer/sponsors', icon: <Building2 size={15} /> },
      { id: 'exhibitor-map', label: 'Exhibitor map', href: '/organizer/exhibitor-map', icon: <MapIcon size={15} /> },
      { id: 'integrations', label: 'Integrations', href: '/organizer/integrations', icon: <Plug size={15} /> },
    ],
  },
];

export function OrganizerShell({
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
  const { openShortcuts } = useHotkeyContext();
  const currentEvent = events.find((event) => event.id === currentEventId) ?? events[0];

  /**
   * The outermost scope, claimed once for the whole workspace. Everything a screen registers lands
   * inside it, so these keys keep working anywhere the screen has not deliberately shadowed them.
   */
  useHotkeys(SCOPES.organizerGlobal, {
    'command-palette': () => setCommandOpen((open) => !open),
    'shortcuts-help': openShortcuts,
    ...Object.fromEntries(
      Object.entries(GOTO_HREFS).map(([id, href]) => [id, () => router.push(href)]),
    ),
  });

  /** Longest matching href wins, so /organizer/forms/abc highlights Forms rather than Overview. */
  const activeId = useMemo(() => {
    const all = NAV.flatMap((section) => section.items);
    return all
      .filter(
        (item) =>
          pathname === item.href ||
          (item.href !== '/organizer' && pathname.startsWith(`${item.href}/`)),
      )
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
      {
        id: 'account',
        label: 'Account settings',
        group: 'Account',
        icon: <UserRound size={15} />,
        onSelect: () => router.push('/organizer/account'),
      },
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
            <InfoPanel
              onOpenCommand={() => setCommandOpen(true)}
              onOpenShortcuts={openShortcuts}
            />
            <ThemeToggle />
            <Link
              href="/organizer/account"
              className={styles.profileLink}
              data-active={pathname === '/organizer/account'}
              aria-label={`Open account settings for ${actorName}`}
            >
              <Avatar name={actorName} size="xs" />
              <span className={styles.actor}>{actorName}</span>
            </Link>
          </div>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
      <QuickActions
        currentEventSlug={currentEvent?.slug}
        onOpenCommand={() => setCommandOpen(true)}
      />
      {/*
        `hotkey={false}` hands ⌘K to the registry. The palette keeps its own listener for consumers
        that mount it alone, but here it would be a second ⌘K firing beside the registered one, and
        the help overlay would have no way to know the palette existed.
      */}
      <CommandMenu
        items={commands}
        open={commandOpen}
        onOpenChange={setCommandOpen}
        hotkey={false}
        placeholder="Jump to…"
      />
    </div>
  );
}
