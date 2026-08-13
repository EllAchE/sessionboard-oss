'use client';

import { useActionState } from 'react';
import { Button, Card, CardBody, CardHeader, CardDescription, CardTitle, Input } from '@/components/ui';
import { requestLinkAction, type SignInState } from './actions';
import styles from './signin.module.css';

const INITIAL: SignInState = { sent: false };

export function SignInForm({
  next,
  defaultEmail,
  mailboxHint,
  intent = 'sign-in',
}: {
  next: string;
  defaultEmail: string;
  mailboxHint: boolean;
  intent?: 'sign-in' | 'sign-up';
}) {
  const [state, action, pending] = useActionState(requestLinkAction, INITIAL);
  const signingUp = intent === 'sign-up';

  return (
    <Card className={styles.card}>
      <CardHeader>
        <CardTitle>{signingUp ? 'Create your Cicero account' : 'Sign in to Cicero'}</CardTitle>
        <CardDescription>
          {signingUp
            ? 'Start with your work email. We will send you a secure link, then help you create your first event.'
            : 'We email you a link. Organizers, reviewers and speakers all sign in the same way, and none of them have a password to forget.'}
        </CardDescription>
      </CardHeader>
      <CardBody>
        {state.sent ? (
          <div className={styles.sent}>
            <p className={styles.sentLead}>
              Check {state.email} for your {signingUp ? 'account' : 'sign-in'} link.
            </p>
            <p className={styles.hint}>It works once and expires in 30 minutes.</p>
            {state.link ? (
              <>
                <Button href={state.link} variant="primary" fullWidth>
                  {signingUp ? 'Open Cicero' : 'Open your sign-in link'}
                </Button>
                <p className={styles.hint}>
                  {state.undelivered
                    ? 'The mail provider would not deliver to that address on this demo deployment, so the link is here instead.'
                    : 'This instance logs mail instead of sending it, so the link is here rather than in an inbox.'}{' '}
                  Every message it sends is at <a href="/admin/mail">/admin/mail</a>.
                </p>
              </>
            ) : mailboxHint ? (
              <p className={styles.hint}>
                This instance logs mail instead of sending it. Open{' '}
                <a href="/admin/mail">/admin/mail</a> to click the link.
              </p>
            ) : null}
          </div>
        ) : (
          <form action={action} className={styles.form}>
            <input type="hidden" name="next" value={next} />
            <label className={styles.field}>
              <span className={styles.label}>Email</span>
              <Input
                name="email"
                type="email"
                autoComplete="email"
                required
                autoFocus
                defaultValue={defaultEmail}
                placeholder="you@example.com"
                invalid={Boolean(state.error)}
              />
            </label>
            {state.error ? <p className={styles.error}>{state.error}</p> : null}
            <Button type="submit" variant="primary" loading={pending} fullWidth>
              {signingUp ? 'Create my account' : 'Email me a link'}
            </Button>
          </form>
        )}
        <p className={styles.switchMode}>
          {signingUp ? 'Already have an account?' : 'New to Cicero?'}{' '}
          <a href={signingUp ? '/signin' : '/signup'}>
            {signingUp ? 'Sign in' : 'Create an account'}
          </a>
        </p>
      </CardBody>
    </Card>
  );
}
