'use client';

import { useState, useTransition } from 'react';
import { Copy, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  IconButton,
  Input,
  Select,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTrigger,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import {
  createApiKeyAction,
  createWebhookAction,
  disableWebhookAction,
  pushSpeakersAction,
  revokeApiKeyAction,
  syncAirtableAction,
  testAccelEventsAction,
  testAirtableAction,
} from './actions';
import type {
  AccelEventsPanel,
  AirtablePanel,
  ApiKeyRow,
  SmsPanel,
  SyncLogRow,
  TestResult,
  WebhookPanel,
} from './types';
import styles from './integrations.module.css';

/**
 * Integration controls on one screen. Provider-backed panels degrade to a visibly disabled state
 * naming the environment variables they want rather than disappearing.
 */

const SYNC_TONE: Record<SyncLogRow['status'], 'neutral' | 'success' | 'danger'> = {
  pending: 'neutral',
  synced: 'success',
  failed: 'danger',
};

function formatWhen(value: string | null): string {
  if (!value) return '—';
  // Pinned locale and zone: this renders on a UTC Worker and rehydrates in the reader's own zone.
  return new Date(value).toLocaleString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function Feedback({ result }: { result: TestResult | null }) {
  if (!result) return null;
  return (
    <div className={styles.feedback}>
      <span className={result.ok ? styles.ok : styles.bad}>{result.message}</span>
      {result.extra ? <div className={styles.mono}>{result.extra}</div> : null}
    </div>
  );
}

function SyncLog({ rows, label }: { rows: SyncLogRow[]; label: string }) {
  const columns: DataTableColumn<SyncLogRow>[] = [
    {
      id: 'label',
      header: 'Record',
      strong: true,
      render: (row) => (
        <div className={styles.cellStack}>
          <span>{row.label}</span>
          {row.detail ? <span className={styles.cellSub}>{row.detail}</span> : null}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      width: '20%',
      render: (row) => <Badge tone={SYNC_TONE[row.status]}>{row.status}</Badge>,
    },
    {
      id: 'error',
      header: 'Detail',
      render: (row) => <span className={styles.cellSub}>{row.error ?? '—'}</span>,
    },
    {
      id: 'at',
      header: 'When',
      width: '20%',
      render: (row) => formatWhen(row.at),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      label={label}
      emptyState={<div className={styles.empty}>Nothing synced yet.</div>}
    />
  );
}

function ApiKeysPanel({ keys }: { keys: ApiKeyRow[] }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'read' | 'write'>('read');
  const [issued, setIssued] = useState<{
    name: string;
    plaintext: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await createApiKeyAction(name, scope);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setIssued({ name: result.data.name, plaintext: result.data.plaintext });
      setName('');
      setCopied(false);
    });
  };

  const revoke = (keyId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await revokeApiKeyAction(keyId);
      if (!result.ok) setError(result.message);
    });
  };

  const columns: DataTableColumn<ApiKeyRow>[] = [
    { id: 'name', header: 'Name', strong: true, render: (row) => row.name },
    {
      id: 'prefix',
      header: 'Prefix',
      mono: true,
      width: '18%',
      render: (row) => `${row.prefix}…`,
    },
    {
      id: 'scope',
      header: 'Scope',
      width: '12%',
      render: (row) => (
        <Badge tone={row.scope === 'write' ? 'warning' : 'neutral'}>{row.scope}</Badge>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      width: '14%',
      render: (row) =>
        row.revokedAt ? <Badge tone="danger">Revoked</Badge> : <Badge tone="success">Active</Badge>,
    },
    {
      id: 'lastUsed',
      header: 'Last used',
      width: '18%',
      render: (row) => formatWhen(row.lastUsedAt),
    },
    {
      id: 'created',
      header: 'Created',
      width: '18%',
      render: (row) => formatWhen(row.createdAt),
    },
    {
      id: 'revoke',
      header: '',
      width: '6%',
      align: 'right',
      render: (row) =>
        row.revokedAt ? null : (
          <Tooltip content="Revoke this key">
            <IconButton
              label={`Revoke ${row.name}`}
              variant="ghost"
              disabled={pending}
              onClick={() => revoke(row.id)}
            >
              <Trash2 size={15} />
            </IconButton>
          </Tooltip>
        ),
    },
  ];

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div className={styles.headings}>
          <h2 className={styles.sectionTitle}>API keys</h2>
          <p className={styles.note}>
            Read-only keys can inspect this event&apos;s submissions. Write keys may also reconcile the
            programme and run integration mutations. Public program endpoints need none. Keys are
            hashed at rest, so the value below is shown once and cannot be recovered.
          </p>
        </div>
      </div>

      <div className={styles.createRow}>
        <Input
          className={styles.createInput}
          placeholder="What is this key for? e.g. Website agenda embed"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={pending}
        />
        <Select
          aria-label="API key scope"
          value={scope}
          onChange={(event) => setScope(event.target.value as 'read' | 'write')}
          disabled={pending}
        >
          <option value="read">Read only</option>
          <option value="write">Read and write</option>
        </Select>
        <Button variant="primary" iconLeft={<Plus size={15} />} loading={pending} onClick={create}>
          Create key
        </Button>
      </div>

      {issued ? (
        <div className={styles.newKey}>
          <strong className={styles.disabledTitle}>
            Copy “{issued.name}” now, because it is not shown again
          </strong>
          <div className={styles.newKeyValue}>
            <code className={styles.secret}>{issued.plaintext}</code>
            <Button
              size="sm"
              iconLeft={<Copy size={14} />}
              onClick={() => {
                void navigator.clipboard.writeText(issued.plaintext);
                setCopied(true);
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>
              Done
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}

      <DataTable
        columns={columns}
        rows={keys}
        getRowId={(row) => row.id}
        label="API keys"
        emptyState={<div className={styles.empty}>No keys yet.</div>}
      />
    </div>
  );
}

function WebhooksPanel({ panel }: { panel: WebhookPanel }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [issued, setIssued] = useState<{ name: string; signingSecret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await createWebhookAction(name, url);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setIssued({ name: result.data.name, signingSecret: result.data.signingSecret });
      setName('');
      setUrl('');
      setCopied(false);
    });
  };

  const disable = (endpointId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await disableWebhookAction(endpointId);
      if (!result.ok) setError(result.message);
    });
  };

  const endpointName = new Map(panel.endpoints.map((endpoint) => [endpoint.id, endpoint.name]));
  const endpointColumns: DataTableColumn<WebhookPanel['endpoints'][number]>[] = [
    {
      id: 'endpoint',
      header: 'Endpoint',
      strong: true,
      render: (row) => (
        <div className={styles.cellStack}>
          <span>{row.name}</span>
          <span className={styles.cellSub}>{row.url}</span>
        </div>
      ),
    },
    {
      id: 'events',
      header: 'Events',
      render: (row) => <span className={styles.cellSub}>{row.eventTypes.join(', ')}</span>,
    },
    {
      id: 'secret',
      header: 'Signing secret',
      mono: true,
      width: '16%',
      render: (row) => `${row.secretPrefix}…`,
    },
    {
      id: 'status',
      header: 'Status',
      width: '12%',
      render: (row) => (
        <Badge tone={row.enabled ? 'success' : 'danger'}>
          {row.enabled ? 'Active' : 'Disabled'}
        </Badge>
      ),
    },
    {
      id: 'disable',
      header: '',
      width: '6%',
      align: 'right',
      render: (row) =>
        row.enabled ? (
          <Tooltip content="Disable this webhook">
            <IconButton
              label={`Disable ${row.name}`}
              variant="ghost"
              disabled={pending}
              onClick={() => disable(row.id)}
            >
              <Trash2 size={15} />
            </IconButton>
          </Tooltip>
        ) : null,
    },
  ];

  const deliveryColumns: DataTableColumn<WebhookPanel['deliveries'][number]>[] = [
    {
      id: 'event',
      header: 'Event',
      strong: true,
      render: (row) => row.eventType,
    },
    {
      id: 'endpoint',
      header: 'Endpoint',
      render: (row) => endpointName.get(row.endpointId) ?? 'Removed endpoint',
    },
    {
      id: 'status',
      header: 'Status',
      width: '14%',
      render: (row) => (
        <Badge
          tone={
            row.status === 'delivered'
              ? 'success'
              : row.status === 'failed'
                ? 'danger'
                : 'neutral'
          }
        >
          {row.status}
        </Badge>
      ),
    },
    {
      id: 'detail',
      header: 'Detail',
      render: (row) => (
        <span className={styles.cellSub}>
          {row.responseStatus ? `HTTP ${row.responseStatus}` : row.error ?? '—'}
        </span>
      ),
    },
    {
      id: 'created',
      header: 'When',
      width: '18%',
      render: (row) => formatWhen(row.createdAt),
    },
  ];

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div className={styles.headings}>
          <h2 className={styles.sectionTitle}>Outbound webhooks</h2>
          <p className={styles.note}>
            POST signed JSON when a proposal arrives, a decision is made, or a session is placed on
            the schedule. Verify <code>X-Cicero-Signature</code> as an HMAC-SHA256 over the raw body.
          </p>
        </div>
      </div>

      <div className={styles.createRow}>
        <Input
          className={styles.createInput}
          placeholder="Name, e.g. Data warehouse"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={pending}
        />
        <Input
          className={styles.createInput}
          placeholder="https://example.com/hooks/cicero"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={pending}
        />
        <Button variant="primary" iconLeft={<Plus size={15} />} loading={pending} onClick={create}>
          Add webhook
        </Button>
      </div>

      {issued ? (
        <div className={styles.newKey}>
          <strong className={styles.disabledTitle}>
            Copy “{issued.name}” signing secret now, because it is not shown again
          </strong>
          <div className={styles.newKeyValue}>
            <code className={styles.secret}>{issued.signingSecret}</code>
            <Button
              size="sm"
              iconLeft={<Copy size={14} />}
              onClick={() => {
                void navigator.clipboard.writeText(issued.signingSecret);
                setCopied(true);
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>
              Done
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}

      <DataTable
        columns={endpointColumns}
        rows={panel.endpoints}
        getRowId={(row) => row.id}
        label="Webhook endpoints"
        emptyState={<div className={styles.empty}>No webhook endpoints yet.</div>}
      />
      <DataTable
        columns={deliveryColumns}
        rows={panel.deliveries}
        getRowId={(row) => row.id}
        label="Recent webhook deliveries"
        emptyState={<div className={styles.empty}>No deliveries yet.</div>}
      />
    </div>
  );
}

function AccelEventsSection({ panel }: { panel: AccelEventsPanel }) {
  const [pending, startTransition] = useTransition();
  const [test, setTest] = useState<TestResult | null>(null);
  const [pushed, setPushed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = () => {
    setError(null);
    setPushed(null);
    startTransition(async () => {
      const result = await testAccelEventsAction();
      if (!result.ok) setError(result.message);
      else setTest(result.data);
    });
  };

  const push = () => {
    setError(null);
    setTest(null);
    startTransition(async () => {
      const result = await pushSpeakersAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const { created, alreadyThere, skipped, failed, authHeaderUsed } = result.data;
      setPushed(
        `${created} created, ${alreadyThere} already there, ${skipped} skipped as duplicates, ${failed} failed` +
          (authHeaderUsed ? ` — Accelevents accepted the \`${authHeaderUsed}\` header` : ''),
      );
    });
  };

  const columns: DataTableColumn<AccelEventsPanel['speakers'][number]>[] = [
    {
      id: 'name',
      header: 'Speaker',
      strong: true,
      render: (row) => (
        <div className={styles.cellStack}>
          <span>{row.name}</span>
          <span className={styles.cellSub}>{row.email}</span>
        </div>
      ),
    },
    {
      id: 'sessions',
      header: 'Accepted talks',
      render: (row) => (
        <span className={styles.cellSub}>{row.sessionTitles.join(', ') || '—'}</span>
      ),
    },
    {
      id: 'status',
      header: 'Last push',
      width: '22%',
      render: (row) =>
        row.lastStatus ? (
          <Badge tone={SYNC_TONE[row.lastStatus]}>{row.lastStatus}</Badge>
        ) : (
          <Badge tone="neutral">not pushed</Badge>
        ),
    },
  ];

  if (panel.mode === 'disabled') {
    return (
      <div className={styles.section}>
        <div className={styles.disabled}>
          <strong className={styles.disabledTitle}>Accelevents is not configured</strong>
          <p className={styles.note}>
            Push accepted speakers to Accelevents for comp tickets. Set these variables and reload:
          </p>
          <ul className={styles.envList}>
            <li className={styles.env}>ACCELEVENTS_API_KEY</li>
            <li className={styles.env}>ACCELEVENTS_EVENT_URL</li>
            <li className={styles.env}>
              ACCELEVENTS_AUTH_HEADER (optional, defaults to Authorization)
            </li>
          </ul>
          <p className={styles.note}>
            No credentials? Set <code>ACCELEVENTS_FAKE=1</code> to run the whole path against the
            recorded fixtures, including the duplicate-email rejection.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div className={styles.headings}>
          <h2 className={styles.sectionTitle}>Accelevents</h2>
          <p className={styles.note}>
            One-way sync of accepted speakers. Existing emails are skipped.
          </p>
        </div>
        <div className={styles.actions}>
          {panel.mode === 'fake' ? (
            <Badge tone="warning">Fixture mode</Badge>
          ) : (
            <Badge tone="success">Live</Badge>
          )}
          <Button size="sm" loading={pending} onClick={runTest}>
            Test connection
          </Button>
          <Button
            size="sm"
            variant="primary"
            iconLeft={<RefreshCw size={14} />}
            loading={pending}
            onClick={push}
          >
            Push accepted speakers
          </Button>
        </div>
      </div>

      <div className={styles.status}>
        <span className={styles.mono}>event: {panel.eventUrl ?? 'unset'}</span>
        <span className={styles.mono}>header: {panel.authHeader}</span>
      </div>

      <Feedback result={test} />
      {pushed ? <p className={styles.feedback}>{pushed}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      <DataTable
        columns={columns}
        rows={panel.speakers}
        getRowId={(row) => row.participantId}
        label="Accepted speakers"
        emptyState={<div className={styles.empty}>No accepted speakers to push yet.</div>}
      />

      <SyncLog rows={panel.log} label="Accelevents sync log" />
    </div>
  );
}

function AirtableSection({ panel }: { panel: AirtablePanel }) {
  const [pending, startTransition] = useTransition();
  const [test, setTest] = useState<TestResult | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = () => {
    setError(null);
    setProgress(null);
    startTransition(async () => {
      const result = await testAirtableAction();
      if (!result.ok) setError(result.message);
      else setTest(result.data);
    });
  };

  const sync = () => {
    setError(null);
    setTest(null);
    startTransition(async () => {
      const result = await syncAirtableAction({});
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const { attempted, created, updated, failed, incomplete } = result.data;
      setProgress(
        `${attempted} attempted — ${created} created, ${updated} updated, ${failed} failed.` +
          (incomplete ? ' More remain; run it again to continue where it stopped.' : ''),
      );
    });
  };

  if (!panel.enabled) {
    return (
      <div className={styles.section}>
        <div className={styles.disabled}>
          <strong className={styles.disabledTitle}>Airtable is not configured</strong>
          <p className={styles.note}>
            Mirror submissions, speakers, and the agenda to Airtable. Cicero remains the source of
            truth. Set these variables and reload:
          </p>
          <ul className={styles.envList}>
            <li className={styles.env}>AIRTABLE_API_KEY</li>
            <li className={styles.env}>AIRTABLE_BASE_ID</li>
            <li className={styles.env}>
              AIRTABLE_TABLE_SUBMISSIONS / _SPEAKERS / _SESSIONS (optional table names)
            </li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div className={styles.headings}>
          <h2 className={styles.sectionTitle}>Airtable mirror</h2>
          <p className={styles.note}>Sync now safely backfills unsynced records.</p>
        </div>
        <div className={styles.actions}>
          <Badge tone="success">Connected</Badge>
          <Button size="sm" loading={pending} onClick={runTest}>
            Test connection
          </Button>
          <Button
            size="sm"
            variant="primary"
            iconLeft={<RefreshCw size={14} />}
            loading={pending}
            onClick={sync}
          >
            Sync now
          </Button>
        </div>
      </div>

      <div className={styles.status}>
        <span className={styles.mono}>base: {panel.baseId ?? 'unset'}</span>
      </div>

      <Feedback result={test} />
      {progress ? <p className={styles.feedback}>{progress}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.grid}>
        {panel.tables.map((table) => (
          <div key={table.entity} className={styles.tableCard}>
            <span className={styles.tableName}>{table.table}</span>
            <div className={styles.counts}>
              <span>{table.total} rows</span>
              <span>{table.synced} synced</span>
              {table.failed > 0 ? <span className={styles.bad}>{table.failed} failed</span> : null}
            </div>
            <span className={styles.fields}>Columns: {table.fields.join(', ')}</span>
          </div>
        ))}
      </div>

      <SyncLog rows={panel.log} label="Airtable sync log" />
    </div>
  );
}

function SmsSection({ panel }: { panel: SmsPanel }) {
  if (!panel.configured) {
    return (
      <div className={styles.section}>
        <div className={styles.disabled}>
          <strong className={styles.disabledTitle}>SMS is not configured</strong>
          <p className={styles.note}>
            Without Twilio, texts are written to the SMS mailbox. Set these variables and reload:
          </p>
          <ul className={styles.envList}>
            <li className={styles.env}>TWILIO_ACCOUNT_SID</li>
            <li className={styles.env}>TWILIO_AUTH_TOKEN</li>
            <li className={styles.env}>SMS_FROM</li>
            <li className={styles.env}>APP_URL (public HTTPS)</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div className={styles.headings}>
          <h2 className={styles.sectionTitle}>SMS</h2>
          <p className={styles.note}>
            Sends the same alerts as email and logs them in the SMS mailbox.
          </p>
          <p className={styles.note}>
            Configure Twilio&apos;s inbound webhook at <code>/api/webhooks/twilio/sms</code>.
            Delivery callbacks are attached to every outbound message automatically.
          </p>
        </div>
        <div className={styles.actions}>
          {panel.transport === 'twilio' ? (
            <Badge tone="success">Live — Twilio</Badge>
          ) : (
            <Badge tone="warning">Safe mailbox — check transport and APP_URL</Badge>
          )}
        </div>
      </div>

      <div className={styles.status}>
        <span className={styles.mono}>from: {panel.from ?? 'unset'}</span>
      </div>
    </div>
  );
}

export function IntegrationsScreen({
  keys,
  webhooks,
  accelevents,
  airtable,
  sms,
}: {
  keys: ApiKeyRow[];
  webhooks: WebhookPanel;
  accelevents: AccelEventsPanel;
  airtable: AirtablePanel;
  sms: SmsPanel;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headings}>
          <span className={styles.eyebrow}>Admin</span>
          <h1 className={styles.title}>Integrations</h1>
          <p className={styles.subtitle}>API, webhooks, Accelevents, Airtable, and SMS.</p>
        </div>
      </header>

      <Card padding="lg">
        <CardHeader>
          <CardTitle>Public API</CardTitle>
          <CardDescription>
            The program is readable without a credential at <code>/api/v1/events/&lt;slug&gt;</code>
            . The full description lives at <code>/api/v1/openapi.json</code>.
          </CardDescription>
        </CardHeader>
        <CardBody>
          <ApiKeysPanel keys={keys} />
        </CardBody>
      </Card>

      <Card padding="lg">
        <CardBody>
          <WebhooksPanel panel={webhooks} />
        </CardBody>
      </Card>

      <Card padding="lg">
        <CardBody>
          <Tabs defaultValue="accelevents">
            <TabsList>
              <TabsTrigger value="accelevents">Accelevents</TabsTrigger>
              <TabsTrigger value="airtable">Airtable</TabsTrigger>
              <TabsTrigger value="sms">SMS</TabsTrigger>
            </TabsList>
            <TabsPanel value="accelevents">
              <div className={styles.panel}>
                <AccelEventsSection panel={accelevents} />
              </div>
            </TabsPanel>
            <TabsPanel value="airtable">
              <div className={styles.panel}>
                <AirtableSection panel={airtable} />
              </div>
            </TabsPanel>
            <TabsPanel value="sms">
              <div className={styles.panel}>
                <SmsSection panel={sms} />
              </div>
            </TabsPanel>
          </Tabs>
        </CardBody>
      </Card>
    </div>
  );
}
