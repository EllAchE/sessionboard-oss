import { can } from '@/lib/context';
import { currentEventContext } from '@/lib/services/events';
import {
  listSpeakers,
  listTaskCompletion,
  listTasksForAdmin,
  summarizeTaskCompletion,
} from '@/lib/services/dashboard';
import { TasksIndex } from './TasksIndex';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Tasks · Cicero' };

export default async function AdminTasksPage() {
  const ctx = await currentEventContext();
  const [tasks, assignments, speakers] = await Promise.all([
    listTasksForAdmin(ctx),
    listTaskCompletion(ctx),
    listSpeakers(ctx),
  ]);

  return (
    <TasksIndex
      tasks={tasks}
      assignments={assignments}
      summary={summarizeTaskCompletion(assignments)}
      speakerCount={speakers.length}
      canManage={can(ctx, 'task:manage')}
    />
  );
}
