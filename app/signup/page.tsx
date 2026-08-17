import { SignInForm } from '../signin/SignInForm';
import { authRedirect } from '../signin/redirect';
import styles from '../signin/signin.module.css';

// Follows the heading this page renders (`authCopy('sign-up').title`) and the bar button that leads
// here, both of which say "Create an event". The tab was the last place the product still called
// this "Sign up", which named the paperwork rather than the thing the visitor came to do.
export const metadata = { title: 'Create an event · Cicero' };

/**
 * `/welcome` rather than `/events/new`. Pointing sign-up straight at the event form made "create an
 * account" and "run a conference" the same click, which is a fair description of what an organizer
 * wants and a poor one for the invited speaker who signed up because a button said to. `/welcome`
 * asks which of the two this is and forwards anyone who already has a membership, so the extra
 * screen only ever appears for the account that genuinely has a choice to make.
 */
const SIGN_UP_FALLBACK = '/welcome';

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const { next, email } = await searchParams;
  const safeNext = authRedirect(next, SIGN_UP_FALLBACK);

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
