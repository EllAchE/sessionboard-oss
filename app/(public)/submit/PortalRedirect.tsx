'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * `F-11`, the half the annotation calls out: the seam between "submitted" and "onboarding". The
 * redirect is announced and counted down rather than instant, because a success page that vanishes
 * before it is read is how a submitter ends up unsure whether anything happened.
 */
export function PortalRedirect({ to, seconds = 5 }: { to: string; seconds?: number }) {
  const router = useRouter();
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    const tick = setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000);
    const jump = setTimeout(() => router.push(to), seconds * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(jump);
    };
  }, [router, to, seconds]);

  return (
    <p aria-live="polite">
      Taking you to your private atrium in {left} second{left === 1 ? '' : 's'}…
    </p>
  );
}
