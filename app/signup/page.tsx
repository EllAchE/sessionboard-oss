import { SignInForm } from '../signin/SignInForm';
import { authRedirect } from '../signin/redirect';
import styles from '../signin/signin.module.css';

export const metadata = { title: 'Join the Forum · Cicero' };

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
