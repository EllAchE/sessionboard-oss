import { activeTransportName } from '@/lib/mail';
import { SignInForm } from './SignInForm';
import styles from './signin.module.css';

export const metadata = { title: 'Sign in · Cicero' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  /** Only relative paths, so `?next=https://evil.example` cannot turn sign-in into an open redirect. */
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/admin';

  return (
    <main className={styles.root}>
      <SignInForm next={safeNext} mailboxHint={activeTransportName() === 'log'} />
    </main>
  );
}
