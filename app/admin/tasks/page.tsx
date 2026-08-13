import { can } from '@/lib/context';
import { currentEventContext } from '@/lib/services/events';
import {
  listSpeakers,
  listTaskCompletion,
  listTasksForAdmin,
  summarizeTaskCompletion,
} from '@/lib/services/dashboard';
import { listForms } from '@/lib/services/forms';
import { copyableEvents } from '@/lib/services/tasks';
import { TasksIndex } from './TasksIndex';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Tasks · Cicero' };

export default async function AdminTasksPage() {
  const ctx = await currentEventContext();
  const canManage = can(ctx, 'task:manage');
  const [tasks, assignments, speakers, forms, copyable] = await Promise.all([
    listTasksForAdmin(ctx),
    listTaskCompletion(ctx),
    listSpeakers(ctx),
    canManage ? listForms(ctx) : Promise.resolve([]),
    canManage ? copyableEvents(ctx) : Promise.resolve([]),
  ]);

  return (
    <TasksIndex
      tasks={tasks}
      assignments={assignments}
      summary={summarizeTaskCompletion(assignments)}
      speakerCount={speakers.length}
      speakers={speakers.map(({ id, name, email }) => ({ id, name, email }))}
      forms={forms.map((entry) => ({ id: entry.id, name: entry.name }))}
      copyableEvents={copyable}
      canManage={canManage}
    />
  );
}
