import { redirect } from 'next/navigation';

/** `/organizer` is the real address; this exists because it is the first thing people type. */
export default function DashboardAlias() {
  redirect('/organizer');
}
