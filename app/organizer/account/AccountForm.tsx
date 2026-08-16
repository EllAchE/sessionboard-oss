'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardBody, CardHeader, CardTitle, Input, useToast } from '@/components/ui';
import type { AccountProfile } from '@/lib/services/account';
import { saveAccountAction } from './actions';
import styles from './account.module.css';

type NameDraft = Pick<AccountProfile, 'firstName' | 'lastName'>;

export function AccountForm({ profile }: { profile: AccountProfile }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<NameDraft>({
    firstName: profile.firstName,
    lastName: profile.lastName,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const dirty = draft.firstName !== profile.firstName || draft.lastName !== profile.lastName;

  const set =
    (field: keyof NameDraft) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setDraft((current) => ({ ...current, [field]: event.target.value }));

  const save = () => {
    setErrors({});
    startTransition(async () => {
      const result = await saveAccountAction(draft);
      if (!result.ok) {
        setErrors(result.details ?? {});
        toast({ title: result.message, tone: 'danger' });
        return;
      }
      setDraft({ firstName: result.data.firstName, lastName: result.data.lastName });
      toast({ title: 'Account profile saved', tone: 'success' });
      router.refresh();
    });
  };

  const error = (field: keyof NameDraft) =>
    errors[field] ? <span className={styles.error}>{errors[field]}</span> : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal details</CardTitle>
      </CardHeader>
      <CardBody>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>First name</span>
              <Input
                autoComplete="given-name"
                value={draft.firstName}
                invalid={Boolean(errors.firstName)}
                onChange={set('firstName')}
              />
              {error('firstName')}
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Last name</span>
              <Input
                autoComplete="family-name"
                value={draft.lastName}
                invalid={Boolean(errors.lastName)}
                onChange={set('lastName')}
              />
              {error('lastName')}
            </label>
            <label className={styles.fieldWide}>
              <span className={styles.label}>Sign-in email</span>
              <Input value={profile.email} readOnly aria-describedby="account-email-help" />
              <span className={styles.hint} id="account-email-help">
                Cicero sends passwordless sign-in links and account invitations to this address.
              </span>
            </label>
          </div>
          <div className={styles.formActions}>
            <Button type="submit" variant="primary" loading={pending} disabled={!dirty}>
              Save profile
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
