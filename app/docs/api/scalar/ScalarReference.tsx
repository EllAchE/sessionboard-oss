'use client';

import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';

import { SCALAR_CONFIGURATION } from './configuration';
import styles from './scalar.module.css';

/**
 * Scalar ships its own design system and scopes it under `.scalar-api-reference`, so it does not
 * inherit Cicero's tokens and Cicero's tokens do not leak into it. That is the point of the
 * comparison this route exists for: the page below is what an off-the-shelf renderer looks like
 * against the same spec `/docs/api` projects by hand.
 */
export default function ScalarReference() {
  return (
    <div className={styles.frame}>
      <ApiReferenceReact configuration={SCALAR_CONFIGURATION} />
    </div>
  );
}
