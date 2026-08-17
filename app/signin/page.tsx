import { demoSignInEmail } from '@/lib/demo-access';
import { SignInForm } from './SignInForm';
import { authRedirect } from './redirect';
import styles from './signin.module.css';

export const metadata = { title: 'Sign in · Cicero' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string; event?: string }>;
}) {
  const { next, email, event } = await searchParams;

  const safeNext = authRedirect(next, '/organizer');

  return (
    <main className={styles.root}>
      <SignInForm
        next={safeNext}
        defaultEmail={email ?? ''}
        event={event ?? ''}
        demoEmail={demoSignInEmail()}
      />
    </main>
  );
}
