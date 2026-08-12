'use client';

import { useActionState } from 'react';
import { Button, Card, CardBody, CardHeader, CardDescription, CardTitle, Input } from '@/components/ui';
import { requestLinkAction, type SignInState } from './actions';
import styles from './signin.module.css';

const INITIAL: SignInState = { sent: false };

export function SignInForm({ next, mailboxHint }: { next: string; mailboxHint: boolean }) {
  const [state, action, pending] = useActionState(requestLinkAction, INITIAL);

  return (
    <Card className={styles.card}>
      <CardHeader>
        <CardTitle>Sign in to Cicero</CardTitle>
        <CardDescription>
          We email you a link. There is no password to forget — for organizers, reviewers or speakers.
        </CardDescription>
      </CardHeader>
      <CardBody>
        {state.sent ? (
          <div className={styles.sent}>
            <p className={styles.sentLead}>Check {state.email} for your sign-in link.</p>
            <p className={styles.hint}>It works once and expires in 30 minutes.</p>
            {state.link ? (
              <>
                <Button href={state.link} variant="primary" fullWidth>
                  Open your sign-in link
                </Button>
                <p className={styles.hint}>
                  This instance logs mail instead of sending it, so the link is here rather than in an
                  inbox. Every message it would have sent is at <a href="/admin/mail">/admin/mail</a>.
                </p>
              </>
            ) : mailboxHint ? (
              <p className={styles.hint}>
                This instance logs mail instead of sending it — open <a href="/admin/mail">/admin/mail</a> to
                click the link.
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
                placeholder="you@example.com"
                invalid={Boolean(state.error)}
              />
            </label>
            {state.error ? <p className={styles.error}>{state.error}</p> : null}
            <Button type="submit" variant="primary" loading={pending} fullWidth>
              Email me a link
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
