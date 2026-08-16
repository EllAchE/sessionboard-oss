"use client";

import { useEffect, useState } from "react";
import { conferenceClock } from "@/lib/conference-clock";
import styles from "./public-event.module.css";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function ConferenceCountdown({
  startsOn,
  endsOn,
  timeZone,
  initialNow,
}: {
  startsOn: string;
  endsOn: string | null;
  timeZone: string;
  initialNow: number;
}) {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  const clock = conferenceClock(startsOn, endsOn, timeZone, now);
  const { remaining } = clock;

  return (
    <span
      className={styles.countdownBadge}
      data-phase={clock.phase}
      role="timer"
      aria-label={
        remaining
          ? `${clock.label} ${remaining.days} days ${remaining.hours} hours ${remaining.minutes} minutes ${remaining.seconds} seconds`
          : clock.label
      }
      aria-live="off"
    >
      <span className={styles.countdownBadgeLabel}>{clock.label}</span>
      {remaining ? (
        <span className={styles.countdownBadgeValue}>
          {remaining.days}d {pad(remaining.hours)}h {pad(remaining.minutes)}m{" "}
          {pad(remaining.seconds)}s
        </span>
      ) : null}
    </span>
  );
}
