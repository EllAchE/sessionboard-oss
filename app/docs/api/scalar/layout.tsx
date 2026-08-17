import type { Metadata } from 'next';

/**
 * The page itself is a client component and cannot export metadata, so the segment carries it.
 */
export const metadata: Metadata = {
  title: 'API reference (Scalar) · Cicero',
  description:
    'The same versioned Cicero REST API, rendered by Scalar from the spec the API publishes.',
};

export default function ScalarDocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
