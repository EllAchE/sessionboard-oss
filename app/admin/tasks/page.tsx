import { can } from '@/lib/context';
import { currentEventContext } from '@/lib/services/events';
import {
  listSpeakers,
  listTaskCompletion,
  listTasksForAdmin,
  summarizeTaskCompletion,
} from '@/lib/services/dashboard';
import { listForms } from '@/lib/services/forms';
import { copyableEvents, listScopableSubmissions } from '@/lib/services/tasks';
import { TasksIndex } from './TasksIndex';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Tasks · Cicero' };

export default async function AdminTasksPage() {
  const ctx = await currentEventContext();
  const canManage = can(ctx, 'task:manage');
  const [tasks, assignments, speakers, forms, copyable, submissions] = await Promise.all([
    listTasksForAdmin(ctx),
    listTaskCompletion(ctx),
    listSpeakers(ctx),
    canManage ? listForms(ctx) : Promise.resolve([]),
    canManage ? copyableEvents(ctx) : Promise.resolve([]),
    canManage ? listScopableSubmissions(ctx) : Promise.resolve([]),
  ]);

  return (
    <TasksIndex
      tasks={tasks}
      assignments={assignments}
      summary={summarizeTaskCompletion(assignments)}
      speakerCount={speakers.length}
      speakers={speakers.map(({ id, name, email }) => ({ id, name, email }))}
      // `S-17`. A task points at a *portal* form. Offering the call for speakers here was a way to
      // hand a speaker their own CFP as an onboarding task and have its answers land nowhere.
      forms={forms
        .filter((entry) => entry.kind === 'portal')
        .map((entry) => ({ id: entry.id, name: entry.name }))}
      submissions={submissions}
      copyableEvents={copyable}
      canManage={canManage}
    />
  );
}
