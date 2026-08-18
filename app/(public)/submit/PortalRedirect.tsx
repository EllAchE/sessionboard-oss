'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import styles from './submit.module.css';

/**
 * `F-11`, the half the annotation calls out: the seam between "submitted" and "onboarding". The
 * redirect is announced and counted down rather than instant, because a success page that vanishes
 * before it is read is how a submitter ends up unsure whether anything happened.
 *
 * Five seconds was not long enough for that to hold. The page it leaves carries the reference, the
 * note about the confirmation email and the next step, and an evaluator who submitted and looked
 * found the portal instead and reported the product as confirming nothing at all — the confirmation
 * had been on screen and had gone. It is now twenty seconds and, more to the point, stoppable: a
 * countdown nobody can stop is a deadline for reading, and there is nothing here worth imposing one
 * over. The redirect the requirement asks for still happens on its own for anyone who walks away.
 */
export function PortalRedirect({ to, seconds = 20 }: { to: string; seconds?: number }) {
  const router = useRouter();
  const [left, setLeft] = useState(seconds);
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    if (stopped) return;
    const tick = setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000);
    const jump = setTimeout(() => router.push(to), seconds * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(jump);
    };
  }, [router, to, seconds, stopped]);

  if (stopped) {
    return (
      <p className={styles.help} aria-live="polite">
        Staying here. Open your portal with the button above whenever you are ready.
      </p>
    );
  }

  return (
    <p className={styles.countdown} aria-live="polite">
      Taking you to your speaker portal in {left} second{left === 1 ? '' : 's'}…
      <Button variant="ghost" size="sm" onClick={() => setStopped(true)}>
        Stay on this page
      </Button>
    </p>
  );
}
