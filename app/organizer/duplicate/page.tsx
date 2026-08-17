import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { requireCapability } from '@/lib/context';
import { utcToLocalInput } from '@/lib/event-dates';
import { CLONE_PLAN, copiedTables } from '@/lib/services/event-clone-plan';
import { suggestNextEditionName, suggestNextEditionWindow } from '@/lib/services/event-clone';
import { currentEventContext, getEvent } from '@/lib/services/events';
import { DuplicateForm } from './DuplicateForm';
import styles from './duplicate.module.css';

/**
 * `AD-1`. The "run it again next year" screen.
 *
 * The two lists below are generated from `CLONE_PLAN` rather than written out, so the page cannot
 * promise something the clone does not do. That matters more than it looks: the reason an organizer
 * trusts a duplicate at all is that they can see what is in it before they press the button, and a
 * hand-written list would be wrong within a release or two.
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Duplicate event · Cicero' };

const IRREGULAR: Record<string, string> = {
  scorecard_criterion: 'Scorecard criteria',
  persona: 'Personas',
  field_library_entry: 'Field library',
  portal_theme: 'Portal branding',
};

function humanTableName(name: string): string {
  if (IRREGULAR[name]) return IRREGULAR[name];
  const words = name.split('_');
  const last = words[words.length - 1];
  words[words.length - 1] = last.endsWith('s') ? last : `${last}s`;
  const label = words.join(' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Nested tables are folded into their parent: "Forms" already implies its fields. */
const IMPLIED = new Set(['form_field', 'form_participant_role', 'scorecard_criterion']);

/** One line per class of skipped thing, so the list stays readable as the schema grows. */
const SKIP_HEADLINES: Record<string, string> = {
  people: 'Participants, speakers, memberships and reviewers',
  submissions: 'Submissions, reviews, scores, decisions, the agenda and recordings',
  credential: 'API keys, webhook endpoints, sign-in and unsubscribe tokens',
  'operational-log': 'Email and SMS history, webhook deliveries, the edit trail',
  'integration-state': 'Airtable and Accelevents sync state',
  files: 'Uploaded files: headshots, decks, logos, the exhibitor map',
  'user-preference': 'Saved views and per-person notification settings',
  commercial: 'Sponsors and exhibitors',
};

export default async function DuplicateEventPage() {
  const ctx = await currentEventContext();
  requireCapability(ctx, 'event:manage');
  const source = await getEvent(ctx.eventId);

  const window = suggestNextEditionWindow(
    utcToLocalInput(source.startsAt, source.timezone),
    utcToLocalInput(source.endsAt, source.timezone),
  );

  const copies = copiedTables()
    .filter((name) => !IMPLIED.has(name))
    .map(humanTableName)
    .sort((a, b) => a.localeCompare(b));

  const categories = new Set(
    Object.values(CLONE_PLAN)
      .filter((entry) => entry.action === 'skip')
      .map((entry) => entry.category),
  );
  const skips = [...categories]
    .map((category) => SKIP_HEADLINES[category] ?? category)
    .sort((a, b) => a.localeCompare(b));

  return (
    <main className={styles.root}>
      <Card className={styles.card}>
        <CardHeader>
          <CardTitle>Duplicate {source.name}</CardTitle>
          <CardDescription>
            Sets up a new event with this one&rsquo;s configuration and none of its people.
          </CardDescription>
        </CardHeader>
        <CardBody>
          <div className={styles.summary}>
            <div className={styles.column}>
              <h3>Comes across</h3>
              <ul className={styles.list}>
                {copies.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </div>
            <div className={styles.column}>
              <h3>Stays behind</h3>
              <ul className={styles.list}>
                {skips.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </div>
          </div>

          <DuplicateForm
            defaultName={suggestNextEditionName(source.name)}
            defaultStartsAt={window.startsAt}
            defaultEndsAt={window.endsAt}
            defaultTimezone={source.timezone}
          />
        </CardBody>
      </Card>
    </main>
  );
}
