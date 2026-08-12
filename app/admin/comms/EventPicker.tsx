'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Select } from '@/components/ui';
import styles from './comms.module.css';

/**
 * `E-6`. The comms surfaces are not nested under an event segment, so the selection rides in
 * `?event=<slug>` and this is what writes it.
 */
export function EventPicker({
  current,
  options,
  basePath,
}: {
  current: string;
  options: Array<{ id: string; name: string; slug: string }>;
  basePath: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  if (options.length <= 1) return null;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor="eventPicker">
        Event
      </label>
      <Select
        id="eventPicker"
        selectSize="sm"
        value={current}
        onChange={(e) => router.push(`${pathname || basePath}?event=${encodeURIComponent(e.target.value)}`)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.slug}>
            {option.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
