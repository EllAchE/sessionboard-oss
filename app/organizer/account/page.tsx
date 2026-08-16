import { Bell, LogOut } from 'lucide-react';
import { Avatar, Button, Card, CardBody, CardHeader, CardTitle } from '@/components/ui';
import { requireCurrentActor } from '@/lib/auth';
import { getAccountProfile } from '@/lib/services/account';
import { signOutAction } from '../shell-actions';
import { AccountForm } from './AccountForm';
import styles from './account.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Account settings · Cicero' };

export default async function AccountPage() {
  const actor = await requireCurrentActor();
  const profile = await getAccountProfile(actor.userId);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Account settings</p>
          <h1 className={styles.title}>Your Cicero profile</h1>
          <p className={styles.lede}>
            These details belong to your account and follow you across every event you can access.
          </p>
        </div>
        <div className={styles.identity}>
          <Avatar name={profile.name} size="lg" />
          <div>
            <strong>{profile.name}</strong>
            <span>{profile.email}</span>
          </div>
        </div>
      </header>

      <AccountForm profile={profile} />

      <div className={styles.secondaryGrid}>
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          <CardBody>
            <p className={styles.cardCopy}>
              Choose how Cicero reaches you and set event-specific quiet hours.
            </p>
            <Button
              href="/organizer/settings?tab=notifications"
              variant="secondary"
              iconLeft={<Bell size={16} aria-hidden="true" />}
            >
              Notification settings
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session</CardTitle>
          </CardHeader>
          <CardBody>
            <p className={styles.cardCopy}>
              Cicero uses passwordless sign-in links. Sign out when you are finished on a shared device.
            </p>
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" iconLeft={<LogOut size={16} aria-hidden="true" />}>
                Sign out
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
