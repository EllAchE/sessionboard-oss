'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui';
import type { SentFilter } from './messages';
import styles from '../comms/comms.module.css';

/**
 * Filters the log on the server by rewriting `?q=`. Replaces the near-identical `MailSearch` and
 * `SmsSearch`, which differed only in the path they pushed and the placeholder they showed.
 *
 * The event and the channel filter ride along; the selected message deliberately does not, since it
 * is unlikely to survive the search that is being applied to it.
 */
export function SentSearch({
  initial,
  eventSlug,
  channel,
}: {
  initial: string;
  eventSlug?: string | null;
  channel: SentFilter;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);

  function apply() {
    const query = new URLSearchParams();
    if (eventSlug) query.set('event', eventSlug);
    if (channel !== 'all') query.set('channel', channel);
    if (value) query.set('q', value);
    router.push(`/organizer/sent?${query.toString()}`);
  }

  /**
   * Each channel matches on the fields it has — recipient and subject for email, number and body
   * for SMS — so under "All" the honest prompt names what both searches actually cover.
   */
  const placeholder =
    channel === 'email'
      ? 'Recipient or subject'
      : channel === 'sms'
        ? 'Phone number or message'
        : 'Recipient, subject or message';

  return (
    <div className={styles.mailSearch}>
      <Input
        inputSize="sm"
        value={value}
        placeholder={placeholder}
        aria-label="Search sent messages"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply();
        }}
      />
      <button type="button" className={styles.variableChip} aria-label="Search" onClick={apply}>
        <Search size={14} />
      </button>
    </div>
  );
}
