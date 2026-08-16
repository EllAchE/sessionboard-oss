'use client';

import { useCallback, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Download, Upload } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  DataTable,
  Select,
  useToast,
  type DataTableColumn,
} from '@/components/ui';
import type {
  ColumnMapping,
  PlannedSpeaker,
  SpeakerFieldKey,
  SpeakerImportField,
  SpeakerImportPlan,
  SpeakerImportResult,
} from '@/lib/services/participants';
import { importSpeakersAction, previewSpeakerImportAction } from '../actions';
import styles from '../speakers.module.css';

const PREVIEW_ROWS = 30;

function Step({
  number,
  title,
  note,
  children,
}: {
  number: number;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <span className={styles.stepHead}>
          <span className={styles.stepNumber}>{number}</span>
          <CardTitle>{title}</CardTitle>
        </span>
        {note ? <p className={styles.sectionNote}>{note}</p> : null}
      </CardHeader>
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function previewColumns(
  fields: SpeakerImportField[],
): Array<DataTableColumn<PlannedSpeaker>> {
  const label = (key: SpeakerFieldKey) => fields.find((f) => f.key === key)?.label ?? key;

  return [
    {
      id: 'line',
      header: 'Line',
      width: '8%',
      mono: true,
      render: (row) => row.line,
    },
    {
      id: 'action',
      header: 'Outcome',
      width: '18%',
      render: (row) =>
        row.action === 'create' ? (
          <Badge tone="success">New speaker</Badge>
        ) : (
          <Badge tone="info">
            {row.changes.length === 0 ? 'Matched, no change' : 'Matched, updates'}
          </Badge>
        ),
    },
    {
      id: 'name',
      header: 'Name',
      width: '26%',
      strong: true,
      render: (row) => row.name,
    },
    { id: 'email', header: 'Email', width: '26%', mono: true, render: (row) => row.email },
    {
      id: 'detail',
      header: 'Fields',
      width: '22%',
      render: (row) => (
        <span className={styles.muted}>
          {row.action === 'create'
            ? Object.keys(row.values)
                .filter((key) => key !== 'email')
                .map((key) => label(key as SpeakerFieldKey))
                .join(', ') || 'Email only'
            : row.changes.map(label).join(', ') || 'Nothing to change'}
        </span>
      ),
    },
  ];
}

/**
 * `SPK-03`. Upload, map, preview, confirm — in that order, because a spreadsheet exported from
 * somebody else's CFP tool is wrong in ways nobody predicts, and finding that out from a
 * half-finished import is how duplicate speakers happen.
 */
export function ImportSpeakers({
  fields,
  template,
}: {
  fields: SpeakerImportField[];
  template: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const picker = useRef<HTMLInputElement>(null);

  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [plan, setPlan] = useState<SpeakerImportPlan | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>([]);
  const [result, setResult] = useState<SpeakerImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPreview = useCallback((text: string, chosen?: ColumnMapping) => {
    startTransition(async () => {
      const outcome = await previewSpeakerImportAction(text, chosen);
      if (!outcome.ok) {
        setError(outcome.message);
        setPlan(null);
        return;
      }
      setError(null);
      setPlan(outcome.data);
      setMapping(outcome.data.mapping);
    });
  }, []);

  const loadFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? '');
        setCsv(text);
        setFileName(file.name);
        setResult(null);
        runPreview(text);
      };
      reader.onerror = () =>
        toast({ title: 'Could not read that file', tone: 'danger', description: file.name });
      reader.readAsText(file);
    },
    [runPreview, toast],
  );

  const remap = useCallback(
    (column: number, key: SpeakerFieldKey | '') => {
      const next = mapping.map((entry, index) => (index === column ? key : entry));
      setMapping(next);
      runPreview(csv, next);
    },
    [mapping, csv, runPreview],
  );

  const runImport = useCallback(() => {
    startTransition(async () => {
      const outcome = await importSpeakersAction(csv, mapping);
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      setError(null);
      setResult(outcome.data);
      toast({
        title: `${outcome.data.created} added, ${outcome.data.updated} updated`,
        tone: outcome.data.created + outcome.data.updated > 0 ? 'success' : 'warning',
      });
      router.refresh();
    });
  }, [csv, mapping, router, toast]);

  const downloadTemplate = useCallback(() => {
    const url = URL.createObjectURL(new Blob([template], { type: 'text/csv' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'cicero-speakers-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }, [template]);

  const creating = plan?.rows.filter((row) => row.action === 'create').length ?? 0;
  const updating = plan?.rows.filter((row) => row.action === 'update').length ?? 0;
  const ready = Boolean(plan && plan.problems.length === 0 && plan.rows.length > 0);

  return (
    <div className={styles.steps}>
      {error ? <p className={styles.notice}>{error}</p> : null}

      <Step
        number={1}
        title="Choose a CSV"
        note="Standard CSV quoting is supported."
      >
        <input
          ref={picker}
          className={styles.hiddenInput}
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) loadFile(file);
          }}
        />
        {fileName ? (
          <div className={styles.fileChip}>
            <CheckCircle2 size={15} />
            <span>{fileName}</span>
            <span className={styles.toolbarSpacer} />
            <Button size="sm" onClick={() => picker.current?.click()}>
              Choose another
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className={styles.dropzone}
            data-dragging={dragging}
            onClick={() => picker.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) loadFile(file);
            }}
          >
            <Upload size={20} />
            <span className={styles.dropzoneTitle}>Drop a CSV here, or click to browse</span>
            <span className={styles.dropzoneHint}>
              Any column order. You map the columns in the next step.
            </span>
          </button>
        )}
        <div className={`${styles.formActions} ${styles.spaced}`}>
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<Download size={14} />}
            onClick={downloadTemplate}
          >
            Download template
          </Button>
        </div>
      </Step>

      {plan && plan.headers.length > 0 ? (
        <Step
          number={2}
          title="Map the columns"
          note="Review the suggested column matches."
        >
          <div className={styles.mapTable}>
            <div className={`${styles.mapRow} ${styles.mapHeadRow}`}>
              <span>CSV column</span>
              <span>Speaker field</span>
              <span>First value</span>
            </div>
            {plan.headers.map((header, column) => (
              <div className={styles.mapRow} key={`${header}-${column}`}>
                <span className={styles.mapColumn}>{header || `Column ${column + 1}`}</span>
                <Select
                  selectSize="sm"
                  value={mapping[column] ?? ''}
                  aria-label={`Field for column ${header || column + 1}`}
                  onChange={(event) => remap(column, event.target.value as SpeakerFieldKey | '')}
                >
                  <option value="">Skip this column</option>
                  {fields.map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}
                      {field.required ? ' (required)' : ''}
                    </option>
                  ))}
                </Select>
                <span className={styles.mapSample}>{plan.sample[column] || '—'}</span>
              </div>
            ))}
          </div>
          {plan.problems.map((problem) => (
            <p className={`${styles.notice} ${styles.spaced}`} key={problem}>
              {problem}
            </p>
          ))}
        </Step>
      ) : null}

      {plan && plan.problems.length === 0 ? (
        <Step
          number={3}
          title="Preview"
          note="Existing emails are updated, not duplicated."
        >
          <div className={styles.summaryRow}>
            <Badge tone="success">{creating} to add</Badge>
            <Badge tone="info">{updating} matched to an existing speaker</Badge>
            <Badge tone={plan.skipped.length > 0 ? 'warning' : 'neutral'}>
              {plan.skipped.length} skipped
            </Badge>
          </div>
          <DataTable
            label="Import preview"
            columns={previewColumns(fields)}
            rows={plan.rows.slice(0, PREVIEW_ROWS)}
            getRowId={(row) => String(row.line)}
            emptyState="No importable rows in that file."
          />
          {plan.rows.length > PREVIEW_ROWS ? (
            <p className={styles.skipItem}>
              Showing the first {PREVIEW_ROWS} of {plan.rows.length} rows. All of them import.
            </p>
          ) : null}
          {plan.skipped.length > 0 ? (
            <div className={styles.skipList}>
              <p className={styles.sectionTitle}>Skipped rows</p>
              {plan.skipped.map((row) => (
                <p className={styles.skipItem} key={row.line}>
                  <span className={styles.skipLine}>Line {row.line}</span>
                  {row.label} — {row.reason}
                </p>
              ))}
            </div>
          ) : null}
        </Step>
      ) : null}

      {ready && !result ? (
        <div className={styles.formActions}>
          <Button variant="primary" loading={pending} onClick={runImport}>
            Import {creating + updating} speaker{creating + updating === 1 ? '' : 's'}
          </Button>
          <span className={styles.fieldHint}>Nothing is written until you press this.</span>
        </div>
      ) : null}

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>Imported</CardTitle>
          </CardHeader>
          <CardBody>
            <div className={styles.summaryRow}>
              <Badge tone="success">{result.created} added</Badge>
              <Badge tone="info">{result.updated} updated</Badge>
              <Badge tone={result.skipped > 0 ? 'warning' : 'neutral'}>
                {result.skipped} skipped
              </Badge>
              {result.failed.length > 0 ? (
                <Badge tone="danger">{result.failed.length} failed</Badge>
              ) : null}
            </div>
            {result.failed.map((row) => (
              <p className={styles.skipItem} key={row.label}>
                {row.label} — {row.message}
              </p>
            ))}
            <div className={`${styles.formActions} ${styles.spaced}`}>
              <Button variant="primary" href="/admin/speakers">
                View the speaker list
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
