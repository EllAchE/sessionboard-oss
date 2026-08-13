import { currentEventContext, getEvent, listEventsForUser } from '@/lib/services/events';
import {
  listSpeakers,
  listTaskCompletion,
  loadBreakdowns,
  loadCounters,
  loadNudges,
  loadPacing,
  loadReviewProgress,
  loadScheduleHealth,
  summarizeTaskCompletion,
} from '@/lib/services/dashboard';
import { Dashboard } from './dashboard/Dashboard';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Dashboard · Cicero' };

/**
 * `B-1` leads. The prior edition for `B-6` is picked as the operator's next-most-recent event,
 * which is the only signal available without asking them to declare a series.
 */
export default async function AdminOverviewPage() {
  const ctx = await currentEventContext();
  const [event, siblings] = await Promise.all([
    getEvent(ctx.eventId),
    listEventsForUser(ctx.actor.userId),
  ]);
  const priorEditionId = siblings.find((entry) => entry.id !== ctx.eventId)?.id ?? null;

  const [outstanding, counters, nudges, pacing, breakdowns, reviewRounds, scheduleHealth, speakers] =
    await Promise.all([
      listTaskCompletion(ctx),
      loadCounters(ctx),
      loadNudges(ctx),
      loadPacing(ctx, priorEditionId),
      loadBreakdowns(ctx),
      loadReviewProgress(ctx),
      loadScheduleHealth(ctx),
      listSpeakers(ctx),
    ]);

  return (
    <Dashboard
      data={{
        eventName: event.name,
        outstanding,
        taskSummary: summarizeTaskCompletion(outstanding),
        counters,
        nudges,
        pacing,
        byForm: breakdowns.byForm,
        byTrack: breakdowns.byTrack,
        reviewRounds,
        scheduleHealth,
        speakers,
      }}
    />
  );
}
