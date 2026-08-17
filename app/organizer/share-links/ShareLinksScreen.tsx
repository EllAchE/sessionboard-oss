'use client';

import { useState, useTransition } from 'react';
import { Copy, Link2, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Input,
  IconButton,
  Select,
  Tooltip,
  DataTable,
  type DataTableColumn,
} from '@/components/ui';
import {
  DEFAULT_SHARE_LINK_DAYS,
  MAX_SHARE_LINK_DAYS,
  SHARE_LINK_VIEWS,
  SHARE_LINK_VIEW_LABEL,
  type ShareLinkView,
} from '@/lib/services/share-links';
import { createShareLinkAction, revokeShareLinkAction } from './actions';
import type { IssuedShareLinkRow, ShareLinkRow } from './types';
import styles from './share-links.module.css';

const EXPIRY_CHOICES = [1, 7, 14, 30, 90] as const;

function formatWhen(value: string | null): string {
  if (!value) return '—';
  // Pinned locale and zone, matching the other organizer tables: this renders on a UTC server.
  return new Date(value).toLocaleString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

type Status = { label: string; tone: 'success' | 'danger' | 'neutral' };

/**
 * Three states, not two. An expired link and a revoked one are both dead, but an organizer chasing
 * "why can't the keynote speaker open this" needs to know which — one is fixed by minting a fresh
 * link, the other means somebody killed it on purpose.
 */
function statusOf(row: ShareLinkRow, now: number): Status {
  if (row.revokedAt) return { label: 'Revoked', tone: 'danger' };
  if (new Date(row.expiresAt).getTime() <= now) return { label: 'Expired', tone: 'neutral' };
  return { label: 'Active', tone: 'success' };
}

export function ShareLinksScreen({ links }: { links: ShareLinkRow[] }) {
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState('');
  const [view, setView] = useState<ShareLinkView>('agenda');
  const [days, setDays] = useState<number>(DEFAULT_SHARE_LINK_DAYS);
  const [issued, setIssued] = useState<IssuedShareLinkRow | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = Date.now();

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await createShareLinkAction(label, view, days);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setIssued(result.data);
      setLabel('');
      setCopied(false);
    });
  };

  const revoke = (linkId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await revokeShareLinkAction(linkId);
      if (!result.ok) setError(result.message);
    });
  };

  const columns: DataTableColumn<ShareLinkRow>[] = [
    { id: 'label', header: 'Shared with', strong: true, space: 'wide', render: (row) => row.label },
    {
      id: 'view',
      header: 'Opens',
      width: '18%',
      render: (row) => SHARE_LINK_VIEW_LABEL[row.view],
    },
    {
      id: 'prefix',
      header: 'Link',
      mono: true,
      width: '12%',
      render: (row) => `/s/${row.prefix}…`,
    },
    {
      id: 'status',
      header: 'Status',
      width: '12%',
      space: 'compact',
      render: (row) => {
        const status = statusOf(row, now);
        return <Badge tone={status.tone}>{status.label}</Badge>;
      },
    },
    {
      id: 'expires',
      header: 'Expires',
      width: '16%',
      render: (row) => formatWhen(row.expiresAt),
    },
    {
      id: 'opened',
      header: 'Opened',
      width: '16%',
      render: (row) =>
        row.viewCount === 0 ? (
          <span className={styles.never}>Never</span>
        ) : (
          <div className={styles.cellStack}>
            <span>{formatWhen(row.lastViewedAt)}</span>
            <span className={styles.cellSub}>
              {row.viewCount} {row.viewCount === 1 ? 'view' : 'views'}
            </span>
          </div>
        ),
    },
    {
      id: 'revoke',
      header: '',
      width: '6%',
      space: 'compact',
      align: 'right',
      render: (row) =>
        row.revokedAt ? null : (
          <Tooltip content="Revoke this link">
            <IconButton
              label={`Revoke ${row.label}`}
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
      <div className={styles.headings}>
        <h1 className={styles.title}>Share links</h1>
        <p className={styles.note}>
          A link that opens one view of this event for someone with no Cicero account — a keynote
          speaker, a sponsor, a venue contact. Unlike the public programme it <strong>includes
          sessions, speakers and sponsors you have not published yet</strong>, so treat it as you
          would the draft itself. It never shows contact details, review scores or decisions, and
          anyone holding it can only read. Revoke it and it stops working immediately.
        </p>
      </div>

      <div className={styles.createRow}>
        <Input
          className={styles.createInput}
          placeholder="Who is this for? e.g. Ada Lovelace (keynote)"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          disabled={pending}
        />
        <Select
          aria-label="What the link opens"
          value={view}
          onChange={(event) => setView(event.target.value as ShareLinkView)}
          disabled={pending}
        >
          {SHARE_LINK_VIEWS.map((option) => (
            <option key={option} value={option}>
              {SHARE_LINK_VIEW_LABEL[option]}
            </option>
          ))}
        </Select>
        <Select
          aria-label="How long the link lasts"
          value={String(days)}
          onChange={(event) => setDays(Number(event.target.value))}
          disabled={pending}
        >
          {EXPIRY_CHOICES.map((option) => (
            <option key={option} value={option}>
              {option === 1 ? '1 day' : `${option} days`}
            </option>
          ))}
        </Select>
        <Button iconLeft={<Link2 size={14} />} onClick={create} disabled={pending}>
          Create link
        </Button>
      </div>

      <p className={styles.hint}>
        Links last at most {MAX_SHARE_LINK_DAYS} days. Mint a fresh one rather than asking for a
        longer life.
      </p>

      {error ? <div className={styles.error}>{error}</div> : null}

      {issued ? (
        <div className={styles.newLink}>
          <strong className={styles.newLinkTitle}>
            Copy the link for “{issued.label}” now, because it is not shown again
          </strong>
          <div className={styles.newLinkValue}>
            <code className={styles.secret}>{issued.url}</code>
            <Button
              size="sm"
              iconLeft={<Copy size={14} />}
              onClick={() => {
                void navigator.clipboard.writeText(issued.url);
                setCopied(true);
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>
              Done
            </Button>
          </div>
          <p className={styles.newLinkNote}>
            Cicero stores only a hash of this link, so nobody — including you — can recover it later.
            Anyone who has it can read the page, so send it to one person rather than a mailing list.
          </p>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={links}
        getRowId={(row) => row.id}
        label="Share links"
        emptyState={<div className={styles.empty}>No share links yet.</div>}
      />
    </div>
  );
}
