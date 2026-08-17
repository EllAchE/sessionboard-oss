'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  Bell,
  Building2,
  CalendarDays,
  ClipboardList,
  Code2,
  Contact,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Link2,
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
import { ActionsPanel } from './ActionsPanel';
import { EventSwitcher } from './EventSwitcher';
import { InfoPanel } from './InfoPanel';
import { ThemeToggle } from './ThemeToggle';
import styles from './organizer.module.css';

type NavEntry = {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  /**
   * Extra path prefixes this entry owns for highlighting. Needed where one nav entry fronts several
   * routes — Messages is the sidebar's name for the whole `/organizer/comms` tab strip, and the
   * Email and SMS tabs live at sibling paths rather than under it.
   */
  covers?: string[];
};

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
  'goto-new-event': '/events/new',
  'goto-portal': '/portal',
  // `goto-public` is deliberately absent: its destination depends on the event in hand.
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
      /**
       * Sponsors and the exhibitor map sat under Setup, which read them as configuration. They are
       * neither: both publish to the attendee-facing event — `/[slug]/sponsors` and
       * `/[slug]/exhibitor-map` — and an organizer curates them the way they curate Speakers, by
       * adding the real thing rather than by setting an option. Program is where the event's content
       * lives, so they belong beside Speakers and not beside Integrations.
       */
      { id: 'sponsors', label: 'Sponsors', href: '/organizer/sponsors', icon: <Building2 size={15} /> },
      { id: 'exhibitor-map', label: 'Exhibitor map', href: '/organizer/exhibitor-map', icon: <MapIcon size={15} /> },
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
      /**
       * One entry, not three. Compose, Templates, Email and SMS are already four tabs of one screen
       * (`comms/CommsTabs`); listing three of them here as separate destinations made the organizer
       * pick a channel before knowing what they wanted to do, and left "Comms" and "Mailbox" sitting
       * next to each other with the same icon and no way to tell which was which.
       */
      {
        id: 'messages',
        label: 'Messages',
        href: '/organizer/comms',
        icon: <MessageSquare size={15} />,
        covers: ['/organizer/mail', '/organizer/sms'],
      },
      { id: 'guest-links', label: 'Guest links', href: '/organizer/share-links', icon: <Link2 size={15} /> },
    ],
  },
  {
    id: 'setup',
    title: 'Setup',
    items: [
      { id: 'settings', label: 'Settings', href: '/organizer/settings', icon: <Settings size={15} /> },
      /** Configuration and a snippet to paste, which is Setup's job, not outreach. */
      { id: 'embeds', label: 'Embeds', href: '/organizer/embeds', icon: <Code2 size={15} /> },
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
  const [actionsOpen, setActionsOpen] = useState(false);
  const { openShortcuts } = useHotkeyContext();
  const currentEvent = events.find((event) => event.id === currentEventId) ?? events[0];

  /**
   * The actions panel lists these same moves, so it has to get out of the way when one of them
   * fires — otherwise `.` then `g` `o` navigates underneath a panel that stays open over the
   * result.
   */
  const go = (href: string) => {
    setActionsOpen(false);
    router.push(href);
  };

  /**
   * The outermost scope, claimed once for the whole workspace. Everything a screen registers lands
   * inside it, so these keys keep working anywhere the screen has not deliberately shadowed them.
   */
  useHotkeys(SCOPES.organizerGlobal, {
    'command-palette': () => {
      setActionsOpen(false);
      setCommandOpen((open) => !open);
    },
    'shortcuts-help': () => {
      setActionsOpen(false);
      openShortcuts();
    },
    'actions-panel': () => setActionsOpen((open) => !open),
    ...Object.fromEntries(Object.entries(GOTO_HREFS).map(([id, href]) => [id, () => go(href)])),
    /**
     * Left undefined while no event is in hand rather than bound to a dead route. An unhandled
     * binding is inert but stays in the `?` overlay, which is the honest reading: the key exists,
     * it has nowhere to go yet.
     */
    'goto-public': currentEvent?.slug ? () => go(`/${currentEvent.slug}`) : undefined,
  });

  /** Longest matching href wins, so /organizer/forms/abc highlights Forms rather than Overview. */
  const activeId = useMemo(() => {
    const all = NAV.flatMap((section) => section.items);
    const owns = (base: string) =>
      pathname === base || (base !== '/organizer' && pathname.startsWith(`${base}/`));
    return all
      .flatMap((item) => [item.href, ...(item.covers ?? [])].map((base) => ({ id: item.id, base })))
      .filter((candidate) => owns(candidate.base))
      .sort((a, b) => b.base.length - a.base.length)[0]?.id;
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
      /**
       * The sidebar collapsed these into Messages, but they are still the words an organizer types.
       * The palette is where a name that lost its sidebar row keeps its search term.
       */
      {
        id: 'messages-email',
        label: 'Email log',
        group: 'Reach',
        icon: <Mail size={15} />,
        onSelect: () => router.push('/organizer/mail'),
      },
      {
        id: 'messages-sms',
        label: 'SMS log',
        group: 'Reach',
        icon: <MessageSquare size={15} />,
        onSelect: () => router.push('/organizer/sms'),
      },
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
      <ActionsPanel
        currentEventSlug={currentEvent?.slug}
        onOpenCommand={() => setCommandOpen(true)}
        open={actionsOpen}
        onOpenChange={setActionsOpen}
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
