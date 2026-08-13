'use client';

import { useState, useTransition } from 'react';
import { AlarmClock } from 'lucide-react';
import { Button } from '@/components/ui';
import { runRemindersAction } from '../comms/actions';
import styles from '../comms/comms.module.css';

/**
 * `C-7` on a button. The identical work runs from `/api/cron`; this exists so the reminder path is
 * demonstrable in the walkthrough without waiting for a trigger, and because both go through the
 * same idempotent job it is safe to press twice.
 */
export function RunRemindersButton() {
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className={styles.row}>
      <Button
        variant="secondary"
        size="sm"
        iconLeft={<AlarmClock size={15} />}
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const outcome = await runRemindersAction();
            setResult(
              outcome.ok
                ? `${outcome.data.taskRemindersSent} task, ${outcome.data.deadlineRemindersSent} deadline reminders sent`
                : outcome.error,
            );
          })
        }
      >
        Run scheduled reminders
      </Button>
      {result && <span className={styles.subtle}>{result}</span>}
    </div>
  );
}
