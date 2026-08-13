'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, FileUp, Table2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardDescription,
  CardTitle,
  DataTable,
  Select,
  Textarea,
  useToast,
  type DataTableColumn,
} from '@/components/ui';
import { importContactsAction, previewImportAction } from '../actions';
import styles from '../crm.module.css';

type ImportFieldWire = { key: string; label: string; required: boolean };

type IssueWire = { severity: 'error' | 'warning'; message: string };

type PreviewRowWire = {
  line: number;
  values: Record<string, string>;
  issues: IssueWire[];
  action: 'create' | 'update' | 'skip';
};

type PreviewWire = {
  headers: string[];
  mapping: Record<string, string>;
  rows: PreviewRowWire[];
  counts: { create: number; update: number; skip: number };
};

type Props = { fields: ImportFieldWire[]; sampleCsv: string };

const ACTION_TONE = {
  create: 'success',
  update: 'info',
  skip: 'danger',
} as const;

export function ImportWizard({ fields, sampleCsv }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<PreviewWire | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPreview = (text: string, mapping?: Record<string, string>) => {
    setError(null);
    startTransition(async () => {
      const result = await previewImportAction(text, mapping);
      if (!result.ok) {
        setPreview(null);
        setError(result.error);
        return;
      }
      setPreview(result.data);
    });
  };

  const readFile = (file: File) => {
    void file.text().then((text) => {
      setCsv(text);
      runPreview(text);
    });
  };

  const remap = (fieldKey: string, header: string) => {
    if (!preview) return;
    runPreview(csv, { ...preview.mapping, [fieldKey]: header });
  };

  const commit = () => {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const result = await importContactsAction(csv, preview.mapping);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({
        title: `Imported ${result.data.created} contacts`,
        description: `${result.data.updated} updated, ${result.data.skipped} skipped.`,
        tone: 'success',
      });
      router.push('/crm');
    });
  };

  const columns: Array<DataTableColumn<PreviewRowWire>> = [
    {
      id: 'line',
      header: 'Line',
      width: '8%',
      mono: true,
      render: (row) => row.line,
    },
    {
      id: 'name',
      header: 'Name',
      width: '20%',
      render: (row) => row.values.name || '—',
    },
    {
      id: 'email',
      header: 'Email',
      width: '24%',
      mono: true,
      render: (row) => row.values.email || '—',
    },
    {
      id: 'company',
      header: 'Company',
      width: '18%',
      render: (row) => row.values.company || '—',
    },
    {
      id: 'action',
      header: 'Result',
      width: '12%',
      render: (row) => <Badge tone={ACTION_TONE[row.action]}>{row.action}</Badge>,
    },
    {
      id: 'issues',
      header: 'Problems',
      width: '18%',
      render: (row) =>
        row.issues.length === 0 ? (
          <span className={styles.muted}>—</span>
        ) : (
          <span className={styles.issue}>
            {row.issues.map((issue) => (
              <span
                key={issue.message}
                className={issue.severity === 'error' ? styles.error : styles.hint}
              >
                {issue.message}
              </span>
            ))}
          </span>
        ),
    },
  ];

  const importable = preview !== null && preview.counts.create + preview.counts.update > 0;

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Organization</p>
          <h1 className={styles.title}>Import contacts</h1>
          <p className={styles.subtitle}>
            Upload a CSV or paste one in. Every row is mapped and checked before anything is
            written.
          </p>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>1. The file</CardTitle>
          <CardDescription>The first row must be the header row.</CardDescription>
        </CardHeader>
        <CardBody>
          <div className={styles.stack}>
            <div className={styles.dropZone}>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                aria-label="CSV file"
                onChange={(entry) => {
                  const file = entry.currentTarget.files?.[0];
                  if (file) readFile(file);
                }}
              />
              <span className={styles.hint}>
                No file handy? Paste the rows below instead — the two paths run the same check.
              </span>
            </div>
            <Textarea
              rows={8}
              aria-label="Paste CSV"
              placeholder="Name,Email,Job Title,Company"
              value={csv}
              onChange={(entry) => setCsv(entry.currentTarget.value)}
            />
            <div className={styles.row}>
              <Button
                variant="primary"
                iconLeft={<Table2 size={14} />}
                loading={pending}
                onClick={() => runPreview(csv)}
              >
                Map columns and preview
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setCsv(sampleCsv);
                  runPreview(sampleCsv);
                }}
              >
                Use a sample file
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {preview ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>2. Column mapping</CardTitle>
              <CardDescription>
                Guessed from the header names. Change any of them and the preview re-runs.
              </CardDescription>
            </CardHeader>
            <CardBody>
              <div className={styles.mappingGrid}>
                {fields.map((field) => (
                  <label key={field.key} className={styles.filterField}>
                    <span className={styles.filterLabel}>
                      {field.label}
                      {field.required ? ' *' : ''}
                    </span>
                    <Select
                      selectSize="sm"
                      value={preview.mapping[field.key] ?? ''}
                      aria-label={`Column for ${field.label}`}
                      onChange={(entry) => remap(field.key, entry.currentTarget.value)}
                    >
                      <option value="">Not imported</option>
                      {preview.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </Select>
                  </label>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. Validation</CardTitle>
              <CardDescription>
                {preview.counts.create} new, {preview.counts.update} updates, {preview.counts.skip}{' '}
                skipped.
              </CardDescription>
            </CardHeader>
            <CardBody>
              <div className={styles.stack}>
                <div className={styles.row}>
                  <Badge tone="success">
                    <CheckCircle2 size={12} aria-hidden="true" /> {preview.counts.create} will be
                    created
                  </Badge>
                  <Badge tone="info">{preview.counts.update} will be updated</Badge>
                  {preview.counts.skip > 0 ? (
                    <Badge tone="danger">
                      <AlertTriangle size={12} aria-hidden="true" /> {preview.counts.skip} skipped
                    </Badge>
                  ) : null}
                </div>
                <div className={styles.previewWrap}>
                  <DataTable
                    columns={columns}
                    rows={preview.rows}
                    getRowId={(row) => String(row.line)}
                    label="Import preview"
                    emptyState="That file has a header row but no data rows."
                  />
                </div>
                <div>
                  <Button
                    variant="primary"
                    iconLeft={<FileUp size={14} />}
                    disabled={!importable}
                    loading={pending}
                    onClick={commit}
                  >
                    Import {preview.counts.create + preview.counts.update} contacts
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        </>
      ) : null}
    </div>
  );
}
