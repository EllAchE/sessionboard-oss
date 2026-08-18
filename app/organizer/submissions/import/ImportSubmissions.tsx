'use client';

import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ClipboardCopy, Download, Upload } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  DataTable,
  Select,
  Textarea,
  useToast,
  type DataTableColumn,
} from '../../../../components/ui';
import { importSubmissionsAction } from '../actions';
import { previewImportAction } from './actions';
import {
  IMPORT_COLUMNS,
  IMPORT_RULES,
  templateCsv,
  templateHeaderRow,
  type ImportPreview,
} from './contract';
import queue from '../submissions.module.css';
import styles from './import.module.css';

export type ImportFormWire = {
  id: string;
  name: string;
  status: 'draft' | 'open' | 'closed';
  submissionCount: number;
};

type ImportResult = {
  created: number;
  failed: Array<{ title: string; message: string }>;
  errors: Array<{ line: number; message: string }>;
};

const PREVIEW_ROWS = 25;

/**
 * `V-10`. Paste or pick a file, see exactly what the parser made of it, then write. The preview is
 * the whole point: a spreadsheet exported from someone else's CFP tool is wrong in ways nobody
 * predicts, and finding that out from a half-finished import is how duplicate rows happen.
 */
export function ImportSubmissions({ forms }: { forms: ImportFormWire[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const filePicker = useRef<HTMLInputElement>(null);

  const [formId, setFormId] = useState(forms[0]?.id ?? '');
  const [csv, setCsv] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editCsv = useCallback((value: string, origin: string | null) => {
    setCsv(value);
    setSource(origin);
    setPreview(null);
    setResult(null);
    setError(null);
  }, []);

  const readFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => editCsv(String(reader.result ?? ''), file.name);
      reader.onerror = () =>
        toast({ title: 'Could not read that file', tone: 'danger', description: file.name });
      reader.readAsText(file);
    },
    [editCsv, toast],
  );

  const runPreview = useCallback(() => {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const outcome = await previewImportAction(csv);
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      setPreview(outcome.data);
    });
  }, [csv]);

  const runImport = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const outcome = await importSubmissionsAction(formId, csv);
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      setResult(outcome.data);
      toast({
        title: `${outcome.data.created} submission${outcome.data.created === 1 ? '' : 's'} imported`,
        tone: outcome.data.created > 0 ? 'success' : 'warning',
      });
      router.refresh();
    });
  }, [formId, csv, router, toast]);

  const copyHeader = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(templateHeaderRow());
      toast({ title: 'Header row copied', tone: 'success' });
    } catch {
      toast({
        title: 'Clipboard unavailable',
        description: 'Use the template download instead.',
        tone: 'warning',
      });
    }
  }, [toast]);

  const downloadTemplate = useCallback(() => {
    const url = URL.createObjectURL(new Blob([templateCsv()], { type: 'text/csv' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'cicero-submission-import-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const previewColumns = useMemo<Array<DataTableColumn<ImportPreview['rows'][number]>>>(
    () => [
      { id: 'title', header: 'Title', strong: true, width: '30%', space: 'wide', render: (row) => row.title },
      {
        id: 'speaker',
        header: 'Speaker',
        width: '24%',
        space: 'wide',
        render: (row) => (
          <span className={styles.stacked}>
            <span>{row.speakerName ?? <span className={queue.muted}>No name</span>}</span>
            <span className={queue.muted}>{row.speakerEmail}</span>
          </span>
        ),
      },
      {
        id: 'track',
        header: 'Track',
        render: (row) => row.track ?? <span className={queue.muted}>—</span>,
      },
      {
        id: 'format',
        header: 'Format',
        render: (row) => row.format ?? <span className={queue.muted}>—</span>,
      },
      {
        id: 'level',
        header: 'Level',
        render: (row) => row.level ?? <span className={queue.muted}>—</span>,
      },
      {
        id: 'status',
        header: 'Status',
        width: '104px',
        space: 'compact',
        render: (row) => (
          <Badge tone={row.status === 'accepted' ? 'success' : 'info'}>{row.status}</Badge>
        ),
      },
    ],
    [],
  );

  const errorColumns = useMemo<Array<DataTableColumn<{ line: number; message: string }>>>(
    () => [
      { id: 'line', header: 'Line', width: '72px', space: 'compact', align: 'right', mono: true, render: (row) => row.line },
      { id: 'message', header: 'Problem', space: 'wide', render: (row) => row.message },
    ],
    [],
  );

  const failedColumns = useMemo<Array<DataTableColumn<{ title: string; message: string }>>>(
    () => [
      { id: 'title', header: 'Title', strong: true, width: '36%', space: 'wide', render: (row) => row.title },
      { id: 'message', header: 'Why it did not land', space: 'wide', render: (row) => row.message },
    ],
    [],
  );

  const partial = result !== null && result.created > 0 && result.failed.length + result.errors.length > 0;

  return (
    <div className={queue.page}>
      <header className={queue.header}>
        <div className={queue.headings}>
          <span className={queue.eyebrow}>Review</span>
          <h1 className={queue.title}>Import submissions</h1>
          <p className={queue.subtitle}>
            CSV in, submissions out. Nothing is written until you press import.
          </p>
        </div>
        <div className={queue.actions}>
          <Button variant="ghost" iconLeft={<ChevronLeft size={14} />} href="/organizer/submissions">
            Back to queue
          </Button>
        </div>
      </header>

      {error ? <p className={queue.error}>{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Expected columns</CardTitle>
        </CardHeader>
        <CardBody>
          <div className={styles.templateBar}>
            <code className={styles.headerRow}>{templateHeaderRow()}</code>
            <Button size="sm" variant="ghost" iconLeft={<ClipboardCopy size={14} />} onClick={copyHeader}>
              Copy header row
            </Button>
            <Button size="sm" variant="ghost" iconLeft={<Download size={14} />} onClick={downloadTemplate}>
              Template CSV
            </Button>
          </div>

          <dl className={styles.columnList}>
            {IMPORT_COLUMNS.map((column) => (
              <div key={column.header} className={styles.column}>
                <dt>
                  <span className={styles.columnName}>{column.header}</span>
                  {column.required ? (
                    <Badge tone="accent">required</Badge>
                  ) : (
                    <Badge tone="neutral">optional</Badge>
                  )}
                </dt>
                <dd>
                  <span>{column.description}</span>
                  {column.aliases.length > 0 ? (
                    <span className={queue.muted}>
                      Also accepted: {column.aliases.join(', ')}
                    </span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>

          <ul className={styles.rules}>
            {IMPORT_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Source</CardTitle>
        </CardHeader>
        <CardBody>
          <div className={styles.sourceBar}>
            <label className={styles.field}>
              <span className={styles.label}>Target form</span>
              <Select
                selectSize="sm"
                value={formId}
                onChange={(event) => setFormId(event.target.value)}
              >
                {forms.length === 0 ? <option value="">No CFP form yet</option> : null}
                {forms.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} · {entry.status} · {entry.submissionCount} existing
                  </option>
                ))}
              </Select>
            </label>
            <Button
              size="sm"
              variant="ghost"
              iconLeft={<Upload size={14} />}
              onClick={() => filePicker.current?.click()}
            >
              Choose a .csv
            </Button>
            {source ? <span className={styles.sourceName}>{source}</span> : null}
            <input
              ref={filePicker}
              className={styles.hiddenInput}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) readFile(file);
                event.target.value = '';
              }}
            />
          </div>

          <Textarea
            className={styles.csv}
            rows={12}
            spellCheck={false}
            aria-label="CSV to import"
            placeholder={templateHeaderRow()}
            value={csv}
            onChange={(event) => editCsv(event.target.value, null)}
          />

          <div className={styles.footer}>
            <Button variant="secondary" loading={pending} disabled={csv.trim().length === 0} onClick={runPreview}>
              Preview
            </Button>
            <Button
              variant="primary"
              loading={pending}
              disabled={!preview || preview.rows.length === 0 || !formId}
              onClick={runImport}
            >
              {preview && preview.rows.length > 0
                ? `Import ${preview.rows.length} row${preview.rows.length === 1 ? '' : 's'}`
                : 'Import'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle>
              Preview · {preview.rows.length} row{preview.rows.length === 1 ? '' : 's'} ready
              {preview.errors.length > 0 ? `, ${preview.errors.length} skipped` : ''}
            </CardTitle>
          </CardHeader>
          <CardBody>
            {preview.headers.length > 0 ? (
              <p className={styles.headersSeen}>
                Header read as: <code>{preview.headers.join(' · ')}</code>
              </p>
            ) : null}

            {preview.errors.length > 0 ? (
              <div className={styles.tableWrap}>
                <DataTable
                  columns={errorColumns}
                  rows={preview.errors}
                  getRowId={(row, index) => `${row.line}-${index}`}
                  label="Rows that will be skipped"
                />
              </div>
            ) : null}

            {preview.rows.length > 0 ? (
              <div className={styles.tableWrap}>
                <DataTable
                  columns={previewColumns}
                  rows={preview.rows.slice(0, PREVIEW_ROWS)}
                  getRowId={(row, index) => `${row.speakerEmail}-${index}`}
                  label="Rows that will be imported"
                />
                {preview.rows.length > PREVIEW_ROWS ? (
                  <p className={queue.muted}>
                    Showing the first {PREVIEW_ROWS} of {preview.rows.length}.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className={queue.muted}>Nothing in this file can be imported as it stands.</p>
            )}
          </CardBody>
        </Card>
      ) : null}

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
          </CardHeader>
          <CardBody>
            <div className={styles.buckets}>
              <div className={styles.bucket} data-tone="success">
                <span className={styles.bucketValue}>{result.created}</span>
                <span className={styles.bucketLabel}>created</span>
              </div>
              <div className={styles.bucket} data-tone={result.failed.length > 0 ? 'danger' : 'neutral'}>
                <span className={styles.bucketValue}>{result.failed.length}</span>
                <span className={styles.bucketLabel}>rows rejected on write</span>
              </div>
              <div className={styles.bucket} data-tone={result.errors.length > 0 ? 'warning' : 'neutral'}>
                <span className={styles.bucketValue}>{result.errors.length}</span>
                <span className={styles.bucketLabel}>lines never parsed</span>
              </div>
            </div>

            {partial ? (
              <p className={styles.partial}>
                A partial import. The {result.created} row{result.created === 1 ? '' : 's'} above are
                already in the queue. Fix and re-import only the rows listed below, or importing
                this file again will duplicate them.
              </p>
            ) : null}

            {result.failed.length > 0 ? (
              <div className={styles.tableWrap}>
                <p className={styles.bucketHeading}>Parsed, but the write was refused</p>
                <DataTable
                  columns={failedColumns}
                  rows={result.failed}
                  getRowId={(row, index) => `${row.title}-${index}`}
                  label="Rows rejected on write"
                />
              </div>
            ) : null}

            {result.errors.length > 0 ? (
              <div className={styles.tableWrap}>
                <p className={styles.bucketHeading}>Never reached the write</p>
                <DataTable
                  columns={errorColumns}
                  rows={result.errors}
                  getRowId={(row, index) => `${row.line}-${index}`}
                  label="Lines that could not be parsed"
                />
              </div>
            ) : null}

            <div className={styles.footer}>
              <Button variant="primary" href="/organizer/submissions">
                Go to the queue
              </Button>
              <Button variant="ghost" onClick={() => editCsv('', null)}>
                Start another import
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
