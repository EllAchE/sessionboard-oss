import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen, ExternalLink, FileJson, KeyRound, Link2, Lock } from 'lucide-react';
import { Badge } from '@/components/ui';
import { curlFor, exampleFor, type WorkedExample } from './examples';
import { SchemaBlock } from './SchemaFields';
import {
  baseUrl,
  constraintsOf,
  doc,
  endpointsByTag,
  jsonSchemaOf,
  partitionResponses,
  typeLabel,
  type Endpoint,
  type Parameter,
} from './spec';
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
 * Parameters, request and response schemas, status codes, and the worked examples all read out of
 * that same document (`./spec.ts` does the `$ref` resolution). The only authored content is the
 * sample values in `./examples.ts`, and those are validated against the spec's schemas in the test.
 */

export const metadata: Metadata = {
  title: 'API reference · Cicero',
  description:
    'Read and search the public program of a Cicero event, and integrate organizer and speaker workflows, over a versioned REST API.',
};

function ParameterList({ parameters, title }: { parameters: Parameter[]; title: string }) {
  if (parameters.length === 0) return null;

  return (
    <div className={styles.block}>
      <h4 className={styles.blockTitle}>{title}</h4>
      <ul className={styles.fields}>
        {parameters.map((parameter) => {
          const constraints = constraintsOf(parameter.schema);
          return (
            <li className={styles.field} key={`${parameter.in}-${parameter.name}`}>
              <p className={styles.fieldHead}>
                <code className={styles.fieldName}>{parameter.name}</code>
                <span className={styles.fieldType}>{typeLabel(parameter.schema)}</span>
                {parameter.required ? (
                  <span className={styles.fieldRequired}>required</span>
                ) : (
                  <span className={styles.fieldOptional}>optional</span>
                )}
              </p>
              {parameter.description ? (
                <p className={styles.fieldNote}>{parameter.description}</p>
              ) : null}
              {constraints.length ? (
                <p className={styles.fieldConstraints}>{constraints.join(' · ')}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Example({ example, endpoint }: { example: WorkedExample; endpoint: Endpoint }) {
  const command = curlFor(example);
  if (!command) return null;

  return (
    <div className={styles.block}>
      <h4 className={styles.blockTitle}>Example</h4>
      <pre className={styles.sample} tabIndex={0} aria-label={`Example request for ${endpoint.summary}`}>
        <code>{command}</code>
      </pre>
      <p className={styles.sampleCaption}>
        <span className={styles.status} data-tone="success">
          {example.status}
        </span>
        <span>{endpoint.operation.responses?.[example.status]?.description}</span>
      </p>
      <pre className={styles.sample} tabIndex={0} aria-label={`Example response for ${endpoint.summary}`}>
        <code>{JSON.stringify(example.response, null, 2)}</code>
      </pre>
      {example.note ? <p className={styles.fieldConstraints}>{example.note}</p> : null}
    </div>
  );
}

function EndpointArticle({ endpoint }: { endpoint: Endpoint }) {
  const parameters = endpoint.operation.parameters ?? [];
  const pathParams = parameters.filter((parameter) => parameter.in === 'path');
  const queryParams = parameters.filter((parameter) => parameter.in === 'query');
  const requestSchema = jsonSchemaOf(endpoint.operation.requestBody?.content);
  const { success, errors, detailed } = partitionResponses(endpoint.operation);
  const example = exampleFor(endpoint.operationId);
  const titleId = `${endpoint.anchor}-title`;

  return (
    <article className={styles.endpoint} id={endpoint.anchor} aria-labelledby={titleId}>
      <div className={styles.endpointHead}>
        <h3 className={styles.endpointTitle} id={titleId}>
          <span className={styles.method} data-method={endpoint.method}>
            {endpoint.method}
          </span>
          <code className={styles.path}>{endpoint.path}</code>
        </h3>
        <span className={styles.credential} data-kind={endpoint.credential.kind}>
          {endpoint.credential.label}
        </span>
        <a
          className={styles.permalink}
          href={`#${endpoint.anchor}`}
          aria-label={`Permalink to ${endpoint.method} ${endpoint.path}`}
        >
          <Link2 size={14} aria-hidden="true" />
        </a>
      </div>

      {endpoint.summary ? <p className={styles.summary}>{endpoint.summary}</p> : null}
      {endpoint.description ? <p className={styles.description}>{endpoint.description}</p> : null}

      <ParameterList parameters={pathParams} title="Path parameters" />
      <ParameterList parameters={queryParams} title="Query parameters" />

      {requestSchema ? (
        <details className={styles.block} open>
          <summary className={styles.blockTitle}>
            Request body
            <span className={styles.blockHint}>
              {endpoint.operation.requestBody?.required ? 'required' : 'optional'} · application/json
            </span>
          </summary>
          <SchemaBlock schema={requestSchema} />
        </details>
      ) : null}

      {[...success, ...detailed].map((response) => (
        <details className={styles.block} key={response.status} open>
          <summary className={styles.blockTitle}>
            <span className={styles.status} data-tone="success">
              {response.status}
            </span>
            <span className={styles.blockHint}>{response.description}</span>
          </summary>
          {response.schema ? (
            <SchemaBlock schema={response.schema} />
          ) : (
            <p className={styles.fieldConstraints}>No response body.</p>
          )}
        </details>
      ))}

      {errors.length ? (
        <div className={styles.block}>
          <h4 className={styles.blockTitle}>
            Errors
            <span className={styles.blockHint}>
              every one returns the <a href="#errors">Error</a> body
            </span>
          </h4>
          <ul className={styles.statusList}>
            {errors.map((response) => (
              <li className={styles.statusRow} key={response.status}>
                <span className={styles.status} data-tone="danger">
                  {response.status}
                </span>
                <span>{response.description}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {example ? <Example example={example} endpoint={endpoint} /> : null}
    </article>
  );
}

export default function ApiDocsPage() {
  const groups = endpointsByTag();
  const count = groups.reduce((total, group) => total + group.endpoints.length, 0);
  const schemes = doc.components?.securitySchemes ?? {};

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
          {/*
            Both routes read the same spec. The link exists so the two renderings can be compared
            side by side rather than from memory, while we decide which one Cicero keeps.
          */}
          <Link className={styles.action} href="/docs/api/scalar">
            <BookOpen size={15} aria-hidden="true" />
            <span>Open in Scalar</span>
          </Link>
        </div>
      </header>

      <div className={styles.body}>
        <nav className={styles.sidebar} aria-label="API endpoints">
          <p className={styles.sidebarTitle}>On this page</p>
          <ul className={styles.sidebarList}>
            <li>
              <a className={styles.sidebarSection} href="#authentication">
                Authentication
              </a>
            </li>
            <li>
              <a className={styles.sidebarSection} href="#errors">
                Errors
              </a>
            </li>
          </ul>
          {groups.map((group) => (
            <div className={styles.sidebarGroup} key={group.anchor}>
              <a className={styles.sidebarSection} href={`#${group.anchor}`}>
                {group.name}
              </a>
              <ul className={styles.sidebarList}>
                {group.endpoints.map((endpoint) => (
                  <li key={endpoint.anchor}>
                    <a className={styles.sidebarLink} href={`#${endpoint.anchor}`}>
                      <span className={styles.sidebarMethod} data-method={endpoint.method}>
                        {endpoint.method}
                      </span>
                      <span className={styles.sidebarLabel}>
                        <span className={styles.sidebarSummary}>{endpoint.summary}</span>
                        <span className={styles.sidebarPath}>{endpoint.path}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className={styles.content}>
          <section className={styles.section} id="authentication" aria-labelledby="authentication-title">
            <h2 className={styles.sectionTitle} id="authentication-title">
              Authentication
            </h2>
            <dl className={styles.authList}>
              <div className={styles.authRow}>
                <dt>
                  <Lock size={15} aria-hidden="true" /> Public
                </dt>
                <dd>
                  Published program reads need no credential. Unpublished sessions and unlisted
                  speakers are never served here.
                </dd>
              </div>
              <div className={styles.authRow}>
                <dt>
                  <KeyRound size={15} aria-hidden="true" /> Event API key
                </dt>
                <dd>
                  <code className={styles.code}>Authorization: Bearer &lt;key&gt;</code>{' '}
                  {schemes.bearerAuth?.description}
                </dd>
              </div>
              <div className={styles.authRow}>
                <dt>
                  <KeyRound size={15} aria-hidden="true" /> Speaker session
                </dt>
                <dd>
                  <code className={styles.code}>Authorization: Bearer &lt;token&gt;</code> or the{' '}
                  <code className={styles.code}>{schemes.speakerCookieAuth?.name}</code> cookie.{' '}
                  {schemes.speakerBearerAuth?.description}
                </dd>
              </div>
            </dl>
          </section>

          <section className={styles.section} id="errors" aria-labelledby="errors-title">
            <h2 className={styles.sectionTitle} id="errors-title">
              Errors
            </h2>
            <p className={styles.groupNote}>
              Each endpoint below lists the statuses it can return; the body is the same either way.
            </p>
            <SchemaBlock schema={{ $ref: '#/components/schemas/Error' }} />
          </section>

          {groups.map((group) => (
            <section
              className={styles.section}
              id={group.anchor}
              key={group.anchor}
              aria-labelledby={`${group.anchor}-title`}
            >
              <h2 className={styles.sectionTitle} id={`${group.anchor}-title`}>
                {group.name}
              </h2>
              {group.description ? <p className={styles.groupNote}>{group.description}</p> : null}
              {group.endpoints.map((endpoint) => (
                <EndpointArticle endpoint={endpoint} key={endpoint.anchor} />
              ))}
            </section>
          ))}

          <p className={styles.footnote}>
            Every path is relative to the base URL above, and every field on this page is read from
            the <a href="/api/v1/openapi.json">OpenAPI document</a> the API generates from its own
            validators. Questions or a gap worth closing?{' '}
            <Link href="/">Start from the overview</Link>.
          </p>
        </div>
      </div>
    </main>
  );
}
