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
  cfp: 'Proclamation for orators',
  portal: 'Atrium scroll',
};

const STATUS_LABEL: Record<FormStatus, string> = {
  draft: 'Unproclaimed',
  open: 'Open in the Forum',
  closed: 'Sealed',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
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
      router.push(`/admin/forms/${result.data.id}`);
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
      header: 'Scroll',
      width: '34%',
      render: (row) => (
        <span className={styles.nameCell}>
          <Link className={styles.nameLink} href={`/admin/forms/${row.id}`}>
            {row.name}
          </Link>
          <span className={styles.slug}>/submit/{row.slug}</span>
        </span>
      ),
    },
    {
      id: 'kind',
      header: 'Purpose',
      width: '16%',
      render: (row) => KIND_LABEL[row.kind],
    },
    {
      id: 'status',
      header: 'Standing',
      width: '12%',
      render: (row) => <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>,
    },
    {
      id: 'fields',
      header: 'Prompts',
      width: '10%',
      align: 'right',
      render: (row) => row.fieldCount,
    },
    {
      id: 'submissions',
      header: 'Petitions',
      width: '12%',
      align: 'right',
      render: (row) => row.submissionCount,
    },
    {
      id: 'closes',
      header: 'Closes',
      width: '12%',
      render: (row) => formatDate(row.closesAt),
    },
    {
      id: 'actions',
      header: '',
      width: '10%',
      align: 'right',
      render: (row) => (
        <span className={styles.rowActions}>
          <Tooltip content="Copy this scroll">
            <IconButton
              label={`Copy ${row.name}`}
              size="sm"
              disabled={pending}
              onClick={() => duplicate(row.id)}
            >
              <Copy size={14} aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <Tooltip
            content={row.submissionCount > 0 ? 'Petitions invoke this scroll' : 'Burn scroll'}
          >
            <IconButton
              label={`Burn ${row.name}`}
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
          <span className={styles.eyebrow}>The scriptorium</span>
          <h1 className={styles.title}>Scrolls of the scriptorium</h1>
          <p className={styles.subtitle}>
            A proclamation gathers petitions; an atrium scroll gathers whatever else a proclaimed
            orator owes the Forum.
          </p>
        </div>
        <div className={styles.actions}>
          <Button variant="primary" iconLeft={<Plus size={15} />} onClick={() => setCreating(true)}>
            Inscribe a scroll
          </Button>
        </div>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}

      {forms.length === 0 && !creating ? (
        <Card>
          <div className={styles.empty}>
            <p>
              No scrolls yet. A proclamation for orators arrives with the six essential prompts
              already inscribed.
            </p>
            <Button variant="primary" onClick={() => setCreating(true)}>
              Inscribe the first scroll
            </Button>
          </div>
        </Card>
      ) : (
        <Card padding="none">
          <DataTable
            columns={columns}
            rows={forms}
            getRowId={(row) => row.id}
            label="Scrolls of the scriptorium"
            emptyState="The scriptorium shelves are empty."
          />
        </Card>
      )}

      {creating ? (
        <Card>
          <div className={styles.fieldStack}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="new-form-name">
                Scroll name
              </label>
              <Input
                id="new-form-name"
                autoFocus
                value={name}
                placeholder="MMXXVI Proclamation for Orators"
                onChange={(event) => setName(event.target.value)}
              />
              <span className={styles.help}>
                Magistrates see this name. Its public heading is governed in the scroll&rsquo;s
                decrees.
              </span>
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
                        ? 'Creates a petition with the six foundational inscriptions.'
                        : 'Collects further particulars from an orator. Starts blank.'}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            <div className={styles.actions}>
              <Button variant="primary" loading={pending} disabled={!name.trim()} onClick={create}>
                Inscribe scroll
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Leave the scriptorium
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
