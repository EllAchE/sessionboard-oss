import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink, FileJson, KeyRound, Lock } from 'lucide-react';
import { Badge } from '@/components/ui';
import spec from '@/docs/openapi.json';
import styles from './api-docs.module.css';

/**
 * The human-readable face of `/api/v1/openapi.json`.
 *
 * The footer advertised "API docs" and pointed at the raw spec, which is a download prompt in most
 * browsers rather than documentation. This route is the address that link deserves. It is
 * deliberately a projection of the committed spec — `docs/openapi.json`, which CI already holds
 * equal to what the route generates — so an endpoint cannot appear here that the API does not
 * serve, and a new endpoint cannot ship undocumented.
 *
 * This is the first cut: operation, path, summary, and which credential each one wants. Parameters,
 * request and response schemas, and worked examples are the next layer, and they belong on this
 * same route rather than on a second one.
 */

export const metadata: Metadata = {
  title: 'API reference · Cicero',
  description:
    'Read and search the public program of a Cicero event, and integrate organizer and speaker workflows, over a versioned REST API.',
};

const METHOD_ORDER = ['get', 'post', 'put', 'patch', 'delete'] as const;

type Operation = {
  summary?: string;
  description?: string;
  tags?: string[];
  security?: Array<Record<string, string[]>>;
};

type SpecShape = {
  info: { title: string; version: string; description: string };
  servers?: Array<{ url: string }>;
  tags?: Array<{ name: string; description?: string }>;
  paths: Record<string, Record<string, Operation>>;
};

const doc = spec as unknown as SpecShape;

/** Which credential an operation asks for, in the words a reader needs rather than scheme ids. */
function credentialOf(operation: Operation): { label: string; kind: 'public' | 'key' | 'speaker' } {
  const schemes = (operation.security ?? []).flatMap((entry) => Object.keys(entry));
  if (schemes.length === 0) return { label: 'Public', kind: 'public' };
  if (schemes.includes('bearerAuth')) return { label: 'Event API key', kind: 'key' };
  return { label: 'Speaker session', kind: 'speaker' };
}

interface Endpoint {
  method: string;
  path: string;
  summary: string;
  credential: ReturnType<typeof credentialOf>;
}

/** Grouped by the spec's own tags, in the spec's own order, so the two cannot drift apart. */
function endpointsByTag(): Array<{ name: string; description?: string; endpoints: Endpoint[] }> {
  const groups = new Map<string, Endpoint[]>();

  for (const [path, operations] of Object.entries(doc.paths)) {
    for (const method of METHOD_ORDER) {
      const operation = operations[method];
      if (!operation) continue;
      const tag = operation.tags?.[0] ?? 'Other';
      const endpoint: Endpoint = {
        method: method.toUpperCase(),
        path,
        summary: operation.summary ?? '',
        credential: credentialOf(operation),
      };
      groups.set(tag, [...(groups.get(tag) ?? []), endpoint]);
    }
  }

  const ordered = (doc.tags ?? []).map((tag) => ({
    name: tag.name,
    description: tag.description,
    endpoints: groups.get(tag.name) ?? [],
  }));

  // Anything the spec tagged with a name it never declared still has to appear.
  for (const [name, endpoints] of groups) {
    if (!ordered.some((group) => group.name === name)) {
      ordered.push({ name, description: undefined, endpoints });
    }
  }

  return ordered.filter((group) => group.endpoints.length > 0);
}

export default function ApiDocsPage() {
  const groups = endpointsByTag();
  const baseUrl = doc.servers?.[0]?.url;
  const count = groups.reduce((total, group) => total + group.endpoints.length, 0);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>API reference</p>
        <h1 className={styles.title}>{doc.info.title}</h1>
        <p className={styles.lede}>{doc.info.description}</p>
        <div className={styles.meta}>
          <Badge tone="accent">v{doc.info.version}</Badge>
          <span>{count} endpoints</span>
          {baseUrl ? (
            <span>
              Base URL <code className={styles.code}>{baseUrl}</code>
            </span>
          ) : null}
        </div>
        <div className={styles.actions}>
          <a className={styles.action} href="/api/v1/openapi.json">
            <FileJson size={15} aria-hidden="true" />
            <span>OpenAPI 3.1 spec</span>
          </a>
          <a
            className={styles.action}
            href="https://github.com/EllAchE/sessionboard-oss/tree/main/docs"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={15} aria-hidden="true" />
            <span>Architecture and setup docs</span>
          </a>
        </div>
      </header>

      <section className={styles.auth} aria-labelledby="api-auth">
        <h2 className={styles.sectionTitle} id="api-auth">
          Authentication
        </h2>
        <dl className={styles.authList}>
          <div className={styles.authRow}>
            <dt>
              <Lock size={15} aria-hidden="true" /> Public
            </dt>
            <dd>
              Published program reads need no credential. Unpublished sessions and unlisted speakers
              are never served here.
            </dd>
          </div>
          <div className={styles.authRow}>
            <dt>
              <KeyRound size={15} aria-hidden="true" /> Event API key
            </dt>
            <dd>
              <code className={styles.code}>Authorization: Bearer &lt;key&gt;</code>. Scoped to one
              event; read scope inspects protected data, write scope also runs organizer mutations.
            </dd>
          </div>
          <div className={styles.authRow}>
            <dt>
              <KeyRound size={15} aria-hidden="true" /> Speaker session
            </dt>
            <dd>
              The signed-in speaker&rsquo;s own proposals, profile, and tasks, over the portal session
              cookie or the same token as a bearer.
            </dd>
          </div>
        </dl>
      </section>

      {groups.map((group) => (
        <section className={styles.group} key={group.name} aria-labelledby={`api-${group.name}`}>
          <h2 className={styles.sectionTitle} id={`api-${group.name}`}>
            {group.name}
          </h2>
          {group.description ? <p className={styles.groupNote}>{group.description}</p> : null}
          <ul className={styles.endpoints}>
            {group.endpoints.map((endpoint) => (
              <li className={styles.endpoint} key={`${endpoint.method} ${endpoint.path}`}>
                <span className={styles.method} data-method={endpoint.method}>
                  {endpoint.method}
                </span>
                <code className={styles.path}>{endpoint.path}</code>
                <span className={styles.summary}>{endpoint.summary}</span>
                <span className={styles.credential} data-kind={endpoint.credential.kind}>
                  {endpoint.credential.label}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className={styles.footnote}>
        Every path is relative to the base URL above. Full parameter, request-body, and response
        schemas are in the <a href="/api/v1/openapi.json">OpenAPI document</a> while this reference
        grows them inline. Questions or a gap worth closing?{' '}
        <Link href="/">Start from the overview</Link>.
      </p>
    </main>
  );
}
