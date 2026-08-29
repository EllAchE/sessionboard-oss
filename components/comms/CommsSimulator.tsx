'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, KeyRound, Mail, MessageSquare } from 'lucide-react';
import { Badge, useToast } from '@/components/ui';
import type { SimulatedFeed, SimulatedMessage } from '@/lib/services/comms-simulator';
import { SimulatedMessageDialog } from './SimulatedMessageDialog';
import styles from './CommsSimulator.module.css';

/**
 * Raises a toast for every email and SMS the app "sends" while neither channel has a real provider
 * behind it, so a send is something you watch happen rather than something you go looking for in
 * `/organizer/sent` afterwards.
 *
 * Mounted once in the root layout, inside the existing `ToastProvider`, so the stack it feeds is
 * the same one the rest of the app uses — a simulated delivery queues behind a "Saved" toast rather
 * than fighting it for the same corner. `/embed/*` is excluded upstream: a widget in somebody
 * else's page has no business narrating our outbox.
 *
 * Everything about *what* may be shown lives on the server in `lib/services/comms-simulator.ts`,
 * including the sign-in-token redaction. This component decides only when to poll and how it looks.
 */

const POLL_ACTIVE_MS = 4_000;
/**
 * The backoff for "nothing to watch" — signed out, or both channels have a real provider. Slow
 * rather than stopped, so signing in without a full page load still starts the stream.
 */
const POLL_IDLE_MS = 60_000;

/**
 * Surviving a reload matters: an organizer who approves a submission and hits refresh should still
 * be told what went out. Per-tab, and the server scopes every poll to the current session
 * regardless, so a stale cursor can only ever narrow what comes back — never widen it.
 */
const CURSOR_KEY = 'cicero-comms-simulator-cursor';

/** Long enough that no realistic burst replays, small enough to stay bounded. */
const SEEN_LIMIT = 500;

const EMPTY_CURSOR: SimulatedFeed['cursor'] = { email: null, sms: null };

function readCursor(): SimulatedFeed['cursor'] {
  try {
    const raw = sessionStorage.getItem(CURSOR_KEY);
    if (!raw) return EMPTY_CURSOR;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return EMPTY_CURSOR;
    const { email, sms } = parsed as Record<string, unknown>;
    return {
      email: typeof email === 'string' ? email : null,
      sms: typeof sms === 'string' ? sms : null,
    };
  } catch {
    return EMPTY_CURSOR;
  }
}

function writeCursor(cursor: SimulatedFeed['cursor']): void {
  try {
    sessionStorage.setItem(CURSOR_KEY, JSON.stringify(cursor));
  } catch {
    // A tab with storage denied still polls; it just replays nothing across a reload.
  }
}

/** Enough of the body to recognise the message, on one line. */
function preview(message: SimulatedMessage): string {
  const source = message.channel === 'email' ? (message.subject ?? message.bodyText) : message.bodyText;
  const flat = source.replace(/\s+/g, ' ').trim();
  return flat.length > 120 ? `${flat.slice(0, 119)}…` : flat;
}

export function CommsSimulator() {
  const { toast } = useToast();
  const [open, setOpen] = useState<SimulatedMessage | null>(null);

  const cursor = useRef<SimulatedFeed['cursor']>(EMPTY_CURSOR);
  const seen = useRef<Set<string>>(new Set());

  const raise = useCallback(
    (message: SimulatedMessage) => {
      const failed = message.status === 'failed';
      const Icon = message.channel === 'email' ? Mail : MessageSquare;
      toast({
        tone: failed ? 'danger' : 'info',
        // A sign-in link that times out unread is somebody locked out of the app, so those stay up
        // until they are dismissed. Everything else clears itself.
        duration: message.signInLink ? 0 : 12_000,
        title: (
          <span className={styles.title}>
            <Icon size={13} aria-hidden="true" />
            <span className={styles.channel}>{message.channel === 'email' ? 'Email' : 'SMS'}</span>
            <span className={styles.recipient}>to {message.to}</span>
          </span>
        ),
        description: (
          <span className={styles.body}>
            <span className={styles.preview}>{preview(message)}</span>
            <span className={styles.meta}>
              {failed
                ? `Not sent — ${message.error ?? 'the transport refused it'}`
                : 'Simulated delivery. Nothing left the server.'}
              {message.signInLink ? (
                <span className={styles.flag}>
                  <KeyRound size={11} aria-hidden="true" /> sign-in link
                </span>
              ) : null}
              {message.hasIcs ? (
                <span className={styles.flag}>
                  <CalendarDays size={11} aria-hidden="true" /> invite
                </span>
              ) : null}
            </span>
          </span>
        ),
        action: { label: 'Read it', onClick: () => setOpen(message) },
      });
    },
    [toast],
  );

  const poll = useCallback(async (): Promise<number> => {
    const params = new URLSearchParams();
    if (cursor.current.email) params.set('email', cursor.current.email);
    if (cursor.current.sms) params.set('sms', cursor.current.sms);

    const response = await fetch(`/api/comms/simulated?${params.toString()}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return POLL_IDLE_MS;

    const payload = (await response.json()) as { data?: SimulatedFeed };
    const feed = payload.data;
    if (!feed) return POLL_IDLE_MS;

    cursor.current = feed.cursor;
    writeCursor(feed.cursor);

    if (seen.current.size > SEEN_LIMIT) seen.current.clear();
    for (const message of feed.messages) {
      if (seen.current.has(message.key)) continue;
      seen.current.add(message.key);
      raise(message);
    }

    return feed.active ? POLL_ACTIVE_MS : POLL_IDLE_MS;
  }, [raise]);

  useEffect(() => {
    cursor.current = readCursor();

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      // A hidden tab schedules nothing at all; `visibilitychange` restarts the loop. Otherwise a
      // backgrounded tab keeps a poll running for a stack nobody can see.
      if (document.visibilityState !== 'visible') return;

      let next = POLL_IDLE_MS;
      try {
        next = await poll();
      } catch {
        // Offline, a redeploy mid-flight, a 503 from a database that is restarting. None of those
        // are worth a console line every four seconds; back off and try again.
        next = POLL_IDLE_MS;
      }
      if (!cancelled) timer = setTimeout(() => void tick(), next);
    };

    const restart = () => {
      if (document.visibilityState !== 'visible') return;
      if (timer) clearTimeout(timer);
      void tick();
    };

    void tick();
    document.addEventListener('visibilitychange', restart);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', restart);
    };
  }, [poll]);

  return <SimulatedMessageDialog message={open} onClose={() => setOpen(null)} />;
}
