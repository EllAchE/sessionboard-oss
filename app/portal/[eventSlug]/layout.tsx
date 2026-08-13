import type { CSSProperties } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Avatar, Button } from '@/components/ui';
import { getBranding, listMySubmissions, listPortalPages } from '@/lib/services/portal';
import { listPortalTasks, summarize } from '@/lib/services/tasks';
import { formatDate } from '../format';
import styles from '../portal.module.css';
import { headshotUrl, portalSession, speakerName } from './context';
import { PortalTabs, type PortalTab } from './PortalTabs';
import { portalSignOutAction, stopImpersonationAction } from './shell-actions';

export default async function PortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const { event, ctx, me, impersonatedByUserId } = await portalSession(eventSlug);

  const [branding, tasks, pages, submissions] = await Promise.all([
    getBranding(event.id),
    listPortalTasks(event.id, me.id),
    listPortalPages(event.id),
    listMySubmissions(me.id),
  ]);
  const summary = summarize(tasks);

  const base = `/portal/${eventSlug}`;
  const tabs: PortalTab[] = [
    { id: 'home', label: 'Atrium', href: base },
    {
      id: 'sessions',
      label: 'My orations',
      href: `${base}/submissions`,
      count: submissions.length,
    },
    {
      id: 'tasks',
      label: 'Duties',
      href: `${base}/tasks`,
      count: summary.outstanding,
      alert: summary.overdue > 0,
    },
    { id: 'files', label: 'Scrolls', href: `${base}/files` },
    { id: 'profile', label: 'Public likeness', href: `${base}/profile` },
    { id: 'group', label: 'Delegation', href: `${base}/group` },
  ];
  if (pages.length > 0) tabs.push({ id: 'pages', label: 'Notices', href: `${base}/pages` });

  /**
   * `S-11`. The organizer's accent is data, so it arrives as a custom property rather than a
   * stylesheet rule. Everything downstream still reads `var(--accent)` and stays token-driven.
   */
  const accentStyle = branding.accentColor
    ? ({
        '--accent': branding.accentColor,
        '--accent-hover': branding.accentColor,
        '--border-accent': branding.accentColor,
        '--text-accent': branding.accentColor,
      } as unknown as CSSProperties)
    : undefined;

  const dates = [
    formatDate(event.startsOn, event.timezone),
    formatDate(event.endsOn, event.timezone),
  ]
    .filter(Boolean)
    .join(' – ');

  return (
    <div className={styles.shell} style={accentStyle}>
      {impersonatedByUserId && (
        <div className={styles.impersonation} role="alert">
          <ShieldAlert size={18} className={styles.impersonationIcon} aria-hidden />
          <div className={styles.impersonationText}>
            You are viewing the portal as{' '}
            <span className={styles.impersonationWho}>{speakerName(me, ctx)}</span> (
            {ctx.actor.email}).
            <span className={styles.impersonationNote}>
              Anything you change here is recorded as them—settle their duty, then return to the
              Curia.
            </span>
          </div>
          <form action={stopImpersonationAction}>
            <Button type="submit" variant="primary" size="sm">
              Return to the Curia
            </Button>
          </form>
        </div>
      )}

      <header className={styles.masthead}>
        <div className={styles.mastheadInner}>
          <div className={styles.brandRow}>
            {branding.logoFileId && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={styles.logo}
                src={headshotUrl(eventSlug, branding.logoFileId)}
                alt={event.name}
              />
            )}
            <div className={styles.brandText}>
              <div className={styles.eventName}>{event.name}</div>
              <div className={styles.eventMeta}>
                Orator atrium{dates ? ` · ${dates}` : ''}
                {event.venueName ? ` · ${event.venueName}` : ''}
              </div>
            </div>
            <div className={styles.identity}>
              <Avatar
                name={speakerName(me, ctx)}
                src={headshotUrl(eventSlug, me.headshotFileId)}
                size="sm"
              />
              <div>
                <div className={styles.identityName}>{speakerName(me, ctx)}</div>
                <div className={styles.identityEmail}>{ctx.actor.email}</div>
              </div>
              {!impersonatedByUserId && (
                <form action={portalSignOutAction} className={styles.inlineForm}>
                  <Button type="submit" variant="ghost" size="sm">
                    Leave the Forum
                  </Button>
                </form>
              )}
            </div>
          </div>
          <PortalTabs tabs={tabs} />
        </div>
      </header>

      <main className={styles.main}>{children}</main>

      <footer className={styles.footer}>
        {branding.supportEmail ? (
          <>
            At an impasse? Dispatch{' '}
            <a href={`mailto:${branding.supportEmail}`}>{branding.supportEmail}</a>.
          </>
        ) : (
          <>Every word placed here travels straight to the {event.name} organizers.</>
        )}
      </footer>
    </div>
  );
}
