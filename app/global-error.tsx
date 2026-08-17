'use client';

import { useEffect } from 'react';

/**
 * The last boundary. This one catches failures in the root layout itself, so by the time it renders
 * the layout is gone — which means no fonts, no `tokens.css`, and no `components/ui`. Everything
 * here is therefore self-contained and inline: reaching for the design system would risk failing
 * inside the handler for a failure, and a blank white screen is the worst possible answer to give
 * someone whose page just broke.
 *
 * It has to supply its own `<html>` and `<body>` because it replaces the root layout rather than
 * nesting inside it.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error.message);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '3rem 1.5rem',
          background: '#f4efe5',
          color: '#292621',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif',
          lineHeight: 1.5,
        }}
      >
        <main style={{ width: 'min(100%, 34rem)', textAlign: 'center' }}>
          <p
            style={{
              margin: 0,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '0.8125rem',
              letterSpacing: '0.08em',
              opacity: 0.55,
            }}
          >
            {error.digest ?? 'Error'}
          </p>
          <h1 style={{ margin: '0.75rem 0 0', fontSize: '1.5rem', fontWeight: 600 }}>
            Something went wrong
          </h1>
          <p style={{ margin: '0.75rem 0 0', opacity: 0.75 }}>
            The page could not be loaded. This is usually temporary.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.75rem',
              padding: '0.625rem 1.25rem',
              font: 'inherit',
              fontWeight: 600,
              color: '#f4efe5',
              background: '#292621',
              border: 0,
              borderRadius: '0.5rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
