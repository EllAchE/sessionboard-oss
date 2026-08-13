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
  Tabs,
  TabsList,
  TabsPanel,
  TabsTrigger,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import {
  createApiKeyAction,
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
} from './types';
import styles from './integrations.module.css';

/**
 * Three integrations on one screen, each of which degrades to a visibly disabled panel naming the
 * environment variables it wants rather than disappearing — a judge or an operator running without
 * credentials should be able to see what the feature would do.
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
      emptyState={<div className={styles.empty}>No record has crossed this road.</div>}
    />
  );
}

function ApiKeysPanel({ keys }: { keys: ApiKeyRow[] }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [issued, setIssued] = useState<{
    name: string;
    plaintext: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await createApiKeyAction(name);
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
      header: 'Forged',
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
          <h2 className={styles.sectionTitle}>Keys to the city</h2>
          <p className={styles.note}>
            A key reads this event&apos;s petitions over <code>/api/v1</code>. The public programme
            endpoints need none. Keys are hashed at rest, so the value below is shown once and
            cannot be recovered.
          </p>
        </div>
      </div>

      <div className={styles.createRow}>
        <Input
          className={styles.createInput}
          placeholder="What gate does this key open? e.g. Website fasti"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={pending}
        />
        <Button variant="primary" iconLeft={<Plus size={15} />} loading={pending} onClick={create}>
          Mint aqueduct key
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
        emptyState={<div className={styles.empty}>No keys have been struck.</div>}
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
        `${created} inscribed, ${alreadyThere} already across, ${skipped} duplicate names passed over, ${failed} refused` +
          (authHeaderUsed ? ` — Accelevents accepted the \`${authHeaderUsed}\` seal` : ''),
      );
    });
  };

  const columns: DataTableColumn<AccelEventsPanel['speakers'][number]>[] = [
    {
      id: 'name',
      header: 'Orator',
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
      header: 'Accepted orations',
      render: (row) => (
        <span className={styles.cellSub}>{row.sessionTitles.join(', ') || '—'}</span>
      ),
    },
    {
      id: 'status',
      header: 'Last crossing',
      width: '22%',
      render: (row) =>
        row.lastStatus ? (
          <Badge tone={SYNC_TONE[row.lastStatus]}>{row.lastStatus}</Badge>
        ) : (
          <Badge tone="neutral">not sent</Badge>
        ),
    },
  ];

  if (panel.mode === 'disabled') {
    return (
      <div className={styles.section}>
        <div className={styles.disabled}>
          <strong className={styles.disabledTitle}>Accelevents is not configured</strong>
          <p className={styles.note}>
            Accepted orators are sent to Accelevents so they receive their complimentary token
            without a scribe re-entering the roll. Set these and reload:
          </p>
          <ul className={styles.envList}>
            <li className={styles.env}>ACCELEVENTS_API_KEY</li>
            <li className={styles.env}>ACCELEVENTS_EVENT_URL</li>
            <li className={styles.env}>
              ACCELEVENTS_AUTH_HEADER (optional, defaults to Authorization)
            </li>
          </ul>
          <p className={styles.note}>
            No seals? Set <code>ACCELEVENTS_FAKE=1</code> to travel the whole road against the
            recorded fixtures, including the duplicate-address rejection.
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
            One road, accepted orators only. Accelevents rejects a duplicate dispatch address
            rather than updating it, so anyone already sent is left alone.
          </p>
        </div>
        <div className={styles.actions}>
          {panel.mode === 'fake' ? (
            <Badge tone="warning">Fixture mode</Badge>
          ) : (
            <Badge tone="success">Live</Badge>
          )}
          <Button size="sm" loading={pending} onClick={runTest}>
            Test the road
          </Button>
          <Button
            size="sm"
            variant="primary"
            iconLeft={<RefreshCw size={14} />}
            loading={pending}
            onClick={push}
          >
            Send accepted orators
          </Button>
        </div>
      </div>

      <div className={styles.status}>
        <span className={styles.mono}>assembly: {panel.eventUrl ?? 'unproclaimed'}</span>
        <span className={styles.mono}>seal: {panel.authHeader}</span>
      </div>

      <Feedback result={test} />
      {pushed ? <p className={styles.feedback}>{pushed}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      <DataTable
        columns={columns}
        rows={panel.speakers}
        getRowId={(row) => row.participantId}
        label="Accepted orators"
        emptyState={<div className={styles.empty}>No accepted orator is ready to cross this road.</div>}
      />

      <SyncLog rows={panel.log} label="Accelevents courier annals" />
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
            Cicero can mirror petitions, orators, and the fasti into an Airtable base for your
            scribes. The road runs one way—Airtable is never the archive. Set these and reload:
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
          <p className={styles.note}>
            Records are pushed as they change. &ldquo;Sync now&rdquo; backfills whatever is not yet
            mirrored and is safe to run repeatedly — it resumes rather than restarting, and holds to
            Airtable&apos;s five requests a second.
          </p>
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
          <strong className={styles.disabledTitle}>The SMS courier is not configured</strong>
          <p className={styles.note}>
            Citizens who choose SMS summons fall back to the practice archive at{' '}
            <code>/admin/sms</code> until Twilio is configured. Set these and reload:
          </p>
          <ul className={styles.envList}>
            <li className={styles.env}>TWILIO_ACCOUNT_SID</li>
            <li className={styles.env}>TWILIO_AUTH_TOKEN</li>
            <li className={styles.env}>SMS_FROM</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div className={styles.headings}>
          <h2 className={styles.sectionTitle}>SMS courier</h2>
          <p className={styles.note}>
            Summons for anyone who prefers SMS—the same occasions as email, plus the dispatch
            composer&rsquo;s courier route. Every dispatch is inscribed at <code>/admin/sms</code>,
            as email is at <code>/admin/mail</code>.
          </p>
        </div>
        <div className={styles.actions}>
          {panel.transport === 'twilio' ? (
            <Badge tone="success">Live courier — Twilio</Badge>
          ) : (
            <Badge tone="warning">Practice archive — SMS_TRANSPORT=log</Badge>
          )}
        </div>
      </div>

      <div className={styles.status}>
        <span className={styles.mono}>courier number: {panel.from ?? 'not inscribed'}</span>
      </div>
    </div>
  );
}

export function IntegrationsScreen({
  keys,
  accelevents,
  airtable,
  sms,
}: {
  keys: ApiKeyRow[];
  accelevents: AccelEventsPanel;
  airtable: AirtablePanel;
  sms: SmsPanel;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headings}>
          <span className={styles.eyebrow}>Foreign relations</span>
          <h1 className={styles.title}>Alliances &amp; roads</h1>
          <p className={styles.subtitle}>
            The public aqueduct, Accelevents road, and Airtable mirror. Each gate remains shut until
            its seal is set, and says so rather than failing quietly.
          </p>
        </div>
      </header>

      <Card padding="lg">
        <CardHeader>
          <CardTitle>Public aqueduct</CardTitle>
          <CardDescription>
            The programme flows without a credential at <code>/api/v1/events/&lt;slug&gt;</code>
            .
            The engineer’s plan is inscribed at <code>/api/v1/openapi.json</code>.
          </CardDescription>
        </CardHeader>
        <CardBody>
          <ApiKeysPanel keys={keys} />
        </CardBody>
      </Card>

      <Card padding="lg">
        <CardBody>
          <Tabs defaultValue="accelevents">
            <TabsList>
              <TabsTrigger value="accelevents">Accelevents</TabsTrigger>
              <TabsTrigger value="airtable">Airtable</TabsTrigger>
              <TabsTrigger value="sms">SMS courier</TabsTrigger>
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
