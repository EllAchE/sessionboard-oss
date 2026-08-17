'use client';

import nextDynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import styles from './scalar.module.css';

/**
 * Scalar renders in the browser against a spec it fetches at runtime, so there is nothing for the
 * server to produce and `ssr: false` keeps it from trying. It also sidesteps the Turbopack tracing
 * panic the package's filepath URLs trigger when it is imported statically.
 *
 * `nextDynamic` rather than `dynamic` because the route segment config below owns that name.
 */
const ScalarReference = nextDynamic(() => import('./ScalarReference'), {
  ssr: false,
  loading: () => <p className={styles.loading}>Loading the API reference…</p>,
});

export default function ScalarDocsPage() {
  return (
    <>
      <Link className={styles.back} href="/docs/api">
        <ArrowLeft size={16} aria-hidden="true" />
        Back to the Cicero-styled reference
      </Link>
      <ScalarReference />
    </>
  );
}
