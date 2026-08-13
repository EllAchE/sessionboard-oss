import { describe, expect, it } from "vitest";
import { conferenceClock, startOfDate } from "./conference-clock";

describe("conference clock", () => {
  it("starts a Rome event at midnight in Rome", () => {
    expect(startOfDate("2027-01-13", "Europe/Rome")).toBe(
      Date.parse("2027-01-12T23:00:00.000Z"),
    );
  });

  it("respects daylight saving time at a New York boundary", () => {
    expect(startOfDate("2026-03-08", "America/New_York")).toBe(
      Date.parse("2026-03-08T05:00:00.000Z"),
    );
  });

  it("counts down to an upcoming conference", () => {
    const clock = conferenceClock(
      "2027-01-13",
      "2027-01-16",
      "Europe/Rome",
      Date.parse("2027-01-12T22:59:59.000Z"),
    );

    expect(clock.phase).toBe("upcoming");
    expect(clock.remaining).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 1,
    });
  });

  it("counts through the final conference day", () => {
    const clock = conferenceClock(
      "2027-01-13",
      "2027-01-16",
      "Europe/Rome",
      Date.parse("2027-01-15T23:00:00.000Z"),
    );

    expect(clock.phase).toBe("live");
    expect(clock.remaining).toEqual({
      days: 1,
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
  });

  it("settles after the event ends", () => {
    const clock = conferenceClock(
      "2027-01-13",
      "2027-01-16",
      "Europe/Rome",
      Date.parse("2027-01-16T23:00:00.000Z"),
    );

    expect(clock).toEqual({
      phase: "complete",
      label: "Conference complete",
      remaining: null,
    });
  });
});
