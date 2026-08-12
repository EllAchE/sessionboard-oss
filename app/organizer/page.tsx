import { redirect } from 'next/navigation';

/** As with `/dashboard`: a name people reach for, pointed at the address that exists. */
export default function OrganizerAlias() {
  redirect('/admin');
}
