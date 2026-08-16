'use client';

import { useState } from 'react';
import { Badge, Tabs, TabsList, TabsPanel, TabsTrigger } from '@/components/ui';
import { CollectionPanel } from './CollectionPanel';
import { EventPanel } from './EventPanel';
import { NotificationsPanel } from './NotificationsPanel';
import { PortalPanel } from './PortalPanel';
import {
  buildSpecs,
  type EntityKind,
  type EntityRow,
  type EventWire,
  type NotificationsWire,
  type PortalAppearanceWire,
} from './types';
import styles from './settings.module.css';

/**
 * One page with tabs rather than seven routes: setting an event up means moving between tracks,
 * rooms and formats in the same minute, and a full navigation between each would reload the whole
 * shell. The tab is mirrored into `?tab=` so a link into "Rooms" still works, using
 * `replaceState` so it does not push a history entry per click.
 */

type Props = {
  event: EventWire;
  /** `S-11`. The speaker portal's own dressing — a different table from the event branding. */
  portal: PortalAppearanceWire;
  notifications: NotificationsWire;
  rows: Record<EntityKind, EntityRow[]>;
  fieldTypes: string[];
  initialTab: string;
  canManage: boolean;
};

export function SettingsScreen({
  event,
  portal,
  notifications,
  rows,
  fieldTypes,
  initialTab,
  canManage,
}: Props) {
  const specs = buildSpecs(fieldTypes);
  const valid = ['event', 'portal', 'notifications', ...specs.map((spec) => spec.kind)];
  const [tab, setTab] = useState(valid.includes(initialTab) ? initialTab : 'event');

  const selectTab = (next: string) => {
    setTab(next);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState(null, '', url);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Settings</p>
          <h1 className={styles.title}>{event.name}</h1>
          <p className={styles.lede}>Shared options used by forms and the agenda.</p>
        </div>
      </header>

      <Tabs value={tab} onValueChange={selectTab}>
        <TabsList>
          <TabsTrigger value="event">Event</TabsTrigger>
          <TabsTrigger value="portal">Speaker portal</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          {specs.map((spec) => (
            <TabsTrigger key={spec.kind} value={spec.kind}>
              {spec.label}
              <Badge tone="neutral" className={styles.tabCount}>
                {rows[spec.kind].length}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsPanel value="event">
          <EventPanel event={event} canManage={canManage} />
        </TabsPanel>

        <TabsPanel value="portal">
          <PortalPanel appearance={portal} eventName={event.name} canManage={canManage} />
        </TabsPanel>

        <TabsPanel value="notifications">
          <NotificationsPanel prefs={notifications} />
        </TabsPanel>

        {specs.map((spec) => (
          <TabsPanel key={spec.kind} value={spec.kind}>
            <CollectionPanel spec={spec} rows={rows[spec.kind]} canManage={canManage} />
          </TabsPanel>
        ))}
      </Tabs>
    </div>
  );
}
