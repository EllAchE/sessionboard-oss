import { notFound } from 'next/navigation';

/** Reserve the retired probe path so it cannot fall through to the public `[slug]` event route. */
export default function RetiredDatabaseProbe() {
  notFound();
}
