'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  IconButton,
  Input,
  Tooltip,
  type DataTableColumn,
} from '../../../components/ui';
import { createFormAction, deleteFormAction, duplicateFormAction } from './actions';
import type { FormKind, FormStatus } from './types';
import styles from './forms.module.css';

export type FormRow = {
  id: string;
  name: string;
  slug: string;
  kind: FormKind;
  status: FormStatus;
  fieldCount: number;
  submissionCount: number;
  closesAt: string | null;
};

const STATUS_TONE: Record<FormStatus, 'neutral' | 'success' | 'warning'> = {
  draft: 'neutral',
  open: 'success',
  closed: 'warning',
};

const KIND_LABEL: Record<FormKind, string> = {
  cfp: 'Call for speakers',
  portal: 'Portal form',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  // Pinned locale and zone: this renders on a UTC Worker and rehydrates in the reader's own zone.
  return new Date(value).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function FormsIndex({ forms }: { forms: FormRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<FormKind>('cfp');
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await createFormAction({ name, kind });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCreating(false);
      setName('');
      router.push(`/organizer/forms/${result.data.id}`);
    });
  };

  const duplicate = (formId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await duplicateFormAction(formId);
      if (!result.ok) setError(result.message);
      else router.refresh();
    });
  };

  const remove = (formId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteFormAction(formId);
      if (!result.ok) setError(result.message);
      else router.refresh();
    });
  };

  const columns: Array<DataTableColumn<FormRow>> = [
    {
      id: 'name',
      header: 'Form',
      width: '34%',
      space: 'wide',
      render: (row) => (
        <span className={styles.nameCell}>
          <Link className={styles.nameLink} href={`/organizer/forms/${row.id}`}>
            {row.name}
          </Link>
          <span className={styles.slug}>/submit/{row.slug}</span>
        </span>
      ),
    },
    { id: 'kind', header: 'Type', width: '13%', render: (row) => KIND_LABEL[row.kind] },
    {
      id: 'status',
      header: 'Status',
      width: '11%',
      space: 'compact',
      render: (row) => <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>,
    },
    {
      id: 'fields',
      header: 'Questions',
      width: '9%',
      space: 'compact',
      align: 'right',
      render: (row) => row.fieldCount,
    },
    {
      id: 'submissions',
      header: 'Submissions',
      width: '11%',
      space: 'compact',
      align: 'right',
      render: (row) => row.submissionCount,
    },
    { id: 'closes', header: 'Closes', width: '13%', render: (row) => formatDate(row.closesAt) },
    {
      id: 'actions',
      header: '',
      width: '9%',
      space: 'compact',
      align: 'right',
      render: (row) => (
        <span className={styles.rowActions}>
          <Tooltip content="Duplicate">
            <IconButton
              label={`Duplicate ${row.name}`}
              size="sm"
              disabled={pending}
              onClick={() => duplicate(row.id)}
            >
              <Copy size={14} aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <Tooltip content={row.submissionCount > 0 ? 'Has submissions' : 'Delete'}>
            <IconButton
              label={`Delete ${row.name}`}
              size="sm"
              variant="danger"
              disabled={pending || row.submissionCount > 0}
              onClick={() => remove(row.id)}
            >
              <Trash2 size={14} aria-hidden="true" />
            </IconButton>
          </Tooltip>
        </span>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headings}>
          <span className={styles.eyebrow}>Submissions</span>
          <h1 className={styles.title}>Forms</h1>
          <p className={styles.subtitle}>
            CFP forms collect talks. Portal forms collect post-acceptance information.
          </p>
        </div>
        <div className={styles.actions}>
          <Button variant="primary" iconLeft={<Plus size={15} />} onClick={() => setCreating(true)}>
            New form
          </Button>
        </div>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}

      {forms.length === 0 && !creating ? (
        <Card>
          <div className={styles.empty}>
            <p>No forms yet.</p>
            <Button variant="primary" onClick={() => setCreating(true)}>
              Create the first one
            </Button>
          </div>
        </Card>
      ) : (
        <Card padding="none">
          <DataTable
            columns={columns}
            rows={forms}
            getRowId={(row) => row.id}
            label="Forms"
            emptyState="No forms yet."
          />
        </Card>
      )}

      {creating ? (
        <Card>
          <div className={styles.fieldStack}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="new-form-name">
                Form name
              </label>
              <Input
                id="new-form-name"
                autoFocus
                value={name}
                placeholder="2026 Call for Speakers"
                onChange={(event) => setName(event.target.value)}
              />
              <span className={styles.help}>Internal name; set the public title in Settings.</span>
            </div>

            <div className={styles.kindChoice}>
              {(['cfp', 'portal'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={styles.kindOption}
                  data-selected={kind === option}
                  onClick={() => setKind(option)}
                >
                  <span className={styles.kindOptionBody}>
                    <span className={styles.kindOptionTitle}>{KIND_LABEL[option]}</span>
                    <span className={styles.kindOptionHint}>
                      {option === 'cfp'
                        ? 'Creates a submission. Starts with the six built-in fields.'
                        : 'Collects extra information from a speaker. Starts empty.'}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            <div className={styles.actions}>
              <Button variant="primary" loading={pending} disabled={!name.trim()} onClick={create}>
                Create form
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
