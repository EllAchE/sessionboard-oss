'use client';

import { useState, useTransition } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { Merge } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardDescription,
  CardTitle,
  Dialog,
  Radio,
  useToast,
} from '@/components/ui';
import { mergeContactsAction } from '../actions';
import { formatDate, type ContactWire } from '../wire';
import styles from '../crm.module.css';

export type MergeFieldWire = { key: string; label: string };
export type DuplicateGroupWire = { key: string; contacts: ContactWire[] };

type Props = { groups: DuplicateGroupWire[]; fields: MergeFieldWire[] };

function valueOf(contact: ContactWire, key: string): string {
  const value = (contact as unknown as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function GroupCard({ group, fields }: { group: DuplicateGroupWire; fields: MergeFieldWire[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [primaryId, setPrimaryId] = useState(group.contacts[0].id);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const primary = group.contacts.find((entry) => entry.id === primaryId) ?? group.contacts[0];
  const removedCount = group.contacts.length - 1;

  const chosen = (key: string): string => {
    const explicit = choices[key];
    if (explicit !== undefined) return explicit;
    const primary = group.contacts.find((entry) => entry.id === primaryId);
    const own = primary ? valueOf(primary, key) : '';
    if (own !== '') return own;
    return group.contacts.map((entry) => valueOf(entry, key)).find((value) => value !== '') ?? '';
  };

  const merge = () => {
    setError(null);
    startTransition(async () => {
      const result = await mergeContactsAction({
        primaryId,
        loserIds: group.contacts.filter((entry) => entry.id !== primaryId).map((entry) => entry.id),
        choices: Object.fromEntries(fields.map((field) => [field.key, chosen(field.key)])),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      toast({
        title: 'Records merged',
        description: 'One contact now carries both.',
        tone: 'success',
      });
      router.push(`/crm/${result.data.id}`);
    });
  };

  const gridVars = {
    '--merge-columns': group.contacts.length,
  } as CSSProperties;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{group.contacts[0].name}</CardTitle>
        <CardDescription>
          {group.contacts.length} records share this name. Pick which record survives, then pick the
          value to keep for each field.
        </CardDescription>
      </CardHeader>
      <CardBody>
        <div className={styles.stack}>
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={styles.mergeGrid}>
            <div className={styles.mergeRow} style={gridVars}>
              <span className={styles.mergeHead}>Keep as primary</span>
              {group.contacts.map((entry) => (
                <label key={entry.id} className={styles.row}>
                  <Radio
                    name={`primary-${group.key}`}
                    value={entry.id}
                    checked={primaryId === entry.id}
                    aria-label={`Keep ${entry.email} as the surviving record`}
                    onChange={() => {
                      setPrimaryId(entry.id);
                      setChoices({});
                    }}
                  />
                  <span className={styles.value}>{entry.email}</span>
                  {primaryId === entry.id ? <Badge tone="accent">primary</Badge> : null}
                </label>
              ))}
            </div>

            {fields.map((field) => (
              <div key={field.key} className={styles.mergeRow} style={gridVars}>
                <span className={styles.mergeHead}>{field.label}</span>
                {group.contacts.map((entry) => {
                  const value = valueOf(entry, field.key);
                  return (
                    <label key={entry.id} className={styles.mergeCell}>
                      <Radio
                        name={`${group.key}-${field.key}`}
                        checked={chosen(field.key) === value && value !== ''}
                        disabled={value === ''}
                        aria-label={`Use ${field.label} from ${entry.email}`}
                        onChange={() => setChoices({ ...choices, [field.key]: value })}
                      />
                      <span className={styles.mergeValue}>
                        {value === '' ? <span className={styles.muted}>empty</span> : value}
                      </span>
                    </label>
                  );
                })}
              </div>
            ))}

            <div className={styles.mergeRow} style={gridVars}>
              <span className={styles.mergeHead}>In directory since</span>
              {group.contacts.map((entry) => (
                <span key={entry.id} className={styles.timelineMeta}>
                  {formatDate(entry.createdAt)}
                </span>
              ))}
            </div>
          </div>

          <div>
            <Button
              variant="primary"
              iconLeft={<Merge size={14} />}
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
            >
              Review merge
            </Button>
          </div>
        </div>
      </CardBody>

      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirming(false);
        }}
        title="Merge these records permanently?"
        description={`${primary.email} will survive. ${removedCount} other record${
          removedCount === 1 ? '' : 's'
        } will be permanently removed. This cannot be undone.`}
        size="sm"
        dismissible={!pending}
        hideClose={pending}
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={pending} onClick={merge}>
              Merge records
            </Button>
          </>
        }
      >
        {error ? <p className={styles.error}>{error}</p> : null}
      </Dialog>
    </Card>
  );
}

export function MergePanel({ groups, fields }: Props) {
  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Organization</p>
          <h1 className={styles.title}>Duplicates</h1>
          <p className={styles.subtitle}>Review contacts with matching names.</p>
        </div>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardBody>
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No near-duplicates found</p>
              <p className={styles.emptyBody}>No matching names in the directory.</p>
              <Button variant="primary" href="/crm/import">
                Import a CSV
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className={styles.stack}>
          {groups.map((group) => (
            <GroupCard key={group.key} group={group} fields={fields} />
          ))}
        </div>
      )}
    </div>
  );
}
