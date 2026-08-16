'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui';
import styles from '../comms/comms.module.css';

/**
 * Filters the SMS mailbox on the server by rewriting `?q=`. Mirrors `MailSearch`.
 */
export function SmsSearch({ initial, eventSlug }: { initial: string; eventSlug?: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);

  function apply() {
    const query = new URLSearchParams();
    if (eventSlug) query.set('event', eventSlug);
    if (value) query.set('q', value);
    router.push(`/organizer/sms?${query.toString()}`);
  }

  return (
    <div className={styles.mailSearch}>
      <Input
        inputSize="sm"
        value={value}
        placeholder="Phone number or message"
        aria-label="Search the SMS mailbox"
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
