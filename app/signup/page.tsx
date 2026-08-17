import { SignInForm } from '../signin/SignInForm';
import { authRedirect } from '../signin/redirect';
import styles from '../signin/signin.module.css';

// Titled for the form the page actually renders, not the "Create event" button that leads here --
// the event form is at `/events/new`, one magic link later.
export const metadata = { title: 'Create your account · Cicero' };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const { next, email } = await searchParams;
  const safeNext = authRedirect(next, '/events/new');

  return (
    <main className={styles.root}>
      <SignInForm
        next={safeNext}
        defaultEmail={email ?? ''}
        intent="sign-up"
      />
    </main>
  );
}
