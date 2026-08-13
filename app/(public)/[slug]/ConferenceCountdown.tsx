"use client";

import { useEffect, useState } from "react";
import { conferenceClock } from "@/lib/conference-clock";
import styles from "./public-event.module.css";

const UNITS = [
  ["days", "Days"],
  ["hours", "Hours"],
  ["minutes", "Minutes"],
  ["seconds", "Seconds"],
] as const;

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

  return (
    <section
      className={styles.countdown}
      data-phase={clock.phase}
      role="timer"
      aria-label={clock.label}
      aria-live="off"
    >
      <p className={styles.countdownLabel}>{clock.label}</p>
      {clock.remaining ? (
        <div className={styles.countdownUnits}>
          {UNITS.map(([key, label]) => (
            <span className={styles.countdownUnit} key={key}>
              <span className={styles.countdownValue}>
                {String(clock.remaining?.[key] ?? 0).padStart(2, "0")}
              </span>
              <span className={styles.countdownUnitLabel}>{label}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className={styles.countdownComplete}>
          Thank you for being part of it.
        </p>
      )}
    </section>
  );
}
