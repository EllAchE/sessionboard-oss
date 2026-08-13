import { inspectUnsubscribeToken } from '@/lib/services/notification-preferences';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Email preferences · Cicero', robots: { index: false } };

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string }>;
}) {
  const { token = '', done } = await searchParams;
  if (done) {
    return <main><h1>Unsubscribed</h1><p>This kind of email is now off for this event.</p></main>;
  }
  try {
    const scope = await inspectUnsubscribeToken(token);
    return (
      <main>
        <h1>Unsubscribe from {scope.categoryLabel.toLowerCase()}?</h1>
        <p>This changes email preferences for {scope.eventName} only. Other alerts keep their current settings.</p>
        <form action="/unsubscribe/confirm" method="post">
          <input type="hidden" name="token" value={token} />
          <button type="submit">Unsubscribe</button>
        </form>
      </main>
    );
  } catch {
    return <main><h1>Link expired</h1><p>Request a fresh email or change preferences while signed in.</p></main>;
  }
}
