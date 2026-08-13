'use client';

import { useActionState } from 'react';
import { CiceroMark } from '@/components/CiceroBrand';
import { Button, Card, CardBody, CardHeader, CardDescription, CardTitle, Input } from '@/components/ui';
import { requestLinkAction, type SignInState } from './actions';
import { authCopy, deliveryCopy, type AuthIntent } from './copy';
import styles from './signin.module.css';

const INITIAL: SignInState = { sent: false };

export function SignInForm({
  next,
  defaultEmail,
  intent = 'sign-in',
}: {
  next: string;
  defaultEmail: string;
  intent?: AuthIntent;
}) {
  const [state, action, pending] = useActionState(requestLinkAction, INITIAL);
  const copy = authCopy(intent);
  const delivery = state.sent
    ? deliveryCopy(intent, state.link ? (state.undelivered ? 'failed' : 'logged') : 'email', state.email)
    : null;

  return (
    <div className={styles.shell}>
      <a className={styles.brand} href="/" aria-label="Cicero home">
        <CiceroMark size={36} />
        <span>Cicero</span>
      </a>

      <Card className={styles.card} padding="none">
        <CardHeader className={styles.cardHeader}>
          <CardTitle className={styles.cardTitle}>{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <CardBody className={styles.cardBody}>
          {state.sent ? (
            <div className={styles.sent} aria-live="polite">
              <p className={styles.sentLead}>{delivery?.lead}</p>
              <p className={styles.hint}>The seal breaks after one use or 30 minutes.</p>
              {state.link ? (
                <>
                  <Button href={state.link} variant="primary" fullWidth>
                    {copy.linkLabel}
                  </Button>
                  <p className={styles.hint}>{delivery?.hint}</p>
                </>
              ) : null}
            </div>
          ) : (
            <form action={action} className={styles.form}>
              <input type="hidden" name="next" value={next} />
              <label className={styles.field}>
                <span className={styles.label}>Dispatch address</span>
                <Input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  autoFocus
                  defaultValue={defaultEmail}
                  placeholder="you@example.com"
                  data-lpignore="true"
                  invalid={Boolean(state.error)}
                />
              </label>
              {state.error ? <p className={styles.error}>{state.error}</p> : null}
              <Button type="submit" variant="primary" loading={pending} fullWidth>
                {copy.submit}
              </Button>
            </form>
          )}
          <p className={styles.switchMode}>
            {copy.switchPrompt} <a href={copy.switchHref}>{copy.switchLabel}</a>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
