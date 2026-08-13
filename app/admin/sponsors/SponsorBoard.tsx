'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Dialog,
  IconButton,
  Input,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { SPONSOR_LOGO } from '@/lib/sponsor-branding';
import type { SponsorKind } from '@/lib/services/sponsors';
import {
  clearSponsorLogoAction,
  createSponsorAction,
  removeSponsorAction,
  reorderSponsorsAction,
  updateSponsorAction,
} from './actions';
import type { ActionResult, SponsorGroup, SponsorWire } from './types';
import styles from './sponsors.module.css';

/**
 * `E-7`. Two ordered lists, one dialog. The form is a dialog rather than the inline blur-committed
 * grid the taxonomy settings use, because a sponsor is six fields and an image rather than a name
 * and a colour — editing that in a table cell would be worse than a form, and the image cannot be
 * committed on blur at all.
 *
 * The logo is the one field that saves on its own. A file input whose effect is deferred is a way
 * to lose an image, and the slot holds exactly one file, so there is nothing to reconcile with the
 * rest of the form — the same call `BrandingFields` makes for the event logo. Every other field
 * saves with the dialog.
 */

type Draft = {
  kind: SponsorKind;
  name: string;
  tier: string;
  websiteUrl: string;
  description: string;
  boothLocation: string;
};

const EMPTY: Draft = {
  kind: 'sponsor',
  name: '',
  tier: '',
  websiteUrl: '',
  description: '',
  boothLocation: '',
};

function draftOf(row: SponsorWire): Draft {
  return {
    kind: row.kind,
    name: row.name,
    tier: row.tier ?? '',
    websiteUrl: row.websiteUrl ?? '',
    description: row.description ?? '',
    boothLocation: row.boothLocation ?? '',
  };
}

export function SponsorBoard({
  groups,
  canManage,
}: {
  groups: SponsorGroup[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  /** The row being edited, `null` for a new one, `undefined` when the dialog is closed. */
  const [editing, setEditing] = useState<SponsorWire | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<SponsorWire | null>(null);

  const settle = useCallback(
    (result: ActionResult<unknown>, success: string) => {
      if (!result.ok) {
        setErrors(result.details ?? {});
        toast({ title: result.message, tone: 'danger' });
        return false;
      }
      setErrors({});
      toast({ title: success, tone: 'success' });
      router.refresh();
      return true;
    },
    [router, toast],
  );

  const openNew = (kind: SponsorKind) => {
    setErrors({});
    setDraft({ ...EMPTY, kind });
    setEditing(null);
  };

  const openEdit = (row: SponsorWire) => {
    setErrors({});
    setDraft(draftOf(row));
    setEditing(row);
  };

  const save = () => {
    const input = {
      kind: draft.kind,
      name: draft.name,
      tier: draft.tier,
      websiteUrl: draft.websiteUrl,
      description: draft.description,
      boothLocation: draft.boothLocation,
    };
    startTransition(async () => {
      const result =
        editing == null
          ? await createSponsorAction(input)
          : await updateSponsorAction(editing.id, input);
      if (settle(result, editing == null ? 'Added' : 'Saved')) setEditing(undefined);
    });
  };

  const remove = (row: SponsorWire) => {
    startTransition(async () => {
      const result = await removeSponsorAction(row.id);
      if (settle(result, `${row.name} removed`)) setConfirming(null);
    });
  };

  /** Swaps a row with its neighbour and posts the whole ordered list, as the taxonomy panel does. */
  const move = (group: SponsorGroup, index: number, delta: number) => {
    const next = group.rows.map((row) => row.id);
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    startTransition(async () => {
      settle(await reorderSponsorsAction(group.kind, next), 'Order saved');
    });
  };

  return (
    <div className={styles.board}>
      {groups.map((group) => (
        <Card key={group.kind}>
          <CardHeader>
            <div className={styles.groupHead}>
              <div>
                <CardTitle>
                  {group.label} <Badge>{group.rows.length}</Badge>
                </CardTitle>
                <p className={styles.groupLede}>{group.lede}</p>
              </div>
              {canManage ? (
                <Button
                  variant="primary"
                  iconLeft={<Plus size={15} />}
                  onClick={() => openNew(group.kind)}
                >
                  Add {group.singular}
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardBody>
            {group.rows.length === 0 ? (
              <p className={styles.empty}>
                No {group.label.toLowerCase()} yet.
                {canManage ? ` Add the first ${group.singular} to start the list.` : ''}
              </p>
            ) : (
              <ul className={styles.rows}>
                {group.rows.map((row, index) => (
                  <SponsorRow
                    key={row.id}
                    row={row}
                    group={group}
                    index={index}
                    canManage={canManage}
                    busy={pending}
                    onEdit={() => openEdit(row)}
                    onRemove={() => setConfirming(row)}
                    onMove={(delta) => move(group, index, delta)}
                    onChanged={() => router.refresh()}
                    onError={(message) => toast({ title: message, tone: 'danger' })}
                  />
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ))}

      <Dialog
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
        title={editing ? `Edit ${editing.name}` : 'Add an organisation'}
        description="Only the name is required. Everything else can be filled in later."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(undefined)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={pending}>
              {editing ? 'Save' : 'Add'}
            </Button>
          </>
        }
      >
        <div className={styles.form}>
          <Field label="Type" error={errors.kind}>
            <Select
              value={draft.kind}
              onChange={(event) =>
                setDraft({ ...draft, kind: event.target.value as SponsorKind })
              }
            >
              <option value="sponsor">Sponsor</option>
              <option value="exhibitor">Exhibitor</option>
            </Select>
          </Field>

          <Field label="Name" error={errors.name}>
            <Input
              value={draft.name}
              invalid={Boolean(errors.name)}
              placeholder="Fabrica Vitraria"
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </Field>

          <Field
            label="Tier"
            error={errors.tier}
            hint="However this event names its levels — Gold, Principal, Supporting."
          >
            <Input
              value={draft.tier}
              invalid={Boolean(errors.tier)}
              placeholder="Gold"
              onChange={(event) => setDraft({ ...draft, tier: event.target.value })}
            />
          </Field>

          <Field label="Website" error={errors.websiteUrl} hint="A scheme is added if you omit one.">
            <Input
              value={draft.websiteUrl}
              invalid={Boolean(errors.websiteUrl)}
              placeholder="fabrica.example"
              onChange={(event) => setDraft({ ...draft, websiteUrl: event.target.value })}
            />
          </Field>

          <Field
            label="Booth"
            error={errors.boothLocation}
            hint="Where to find them on the floor. Usually only exhibitors have one."
          >
            <Input
              value={draft.boothLocation}
              invalid={Boolean(errors.boothLocation)}
              placeholder="Hall B, stand 14"
              onChange={(event) => setDraft({ ...draft, boothLocation: event.target.value })}
            />
          </Field>

          <Field label="Description" error={errors.description}>
            <Textarea
              value={draft.description}
              invalid={Boolean(errors.description)}
              rows={4}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </Field>

          {editing ? null : (
            <p className={styles.hint}>The logo can be added once the row exists.</p>
          )}
        </div>
      </Dialog>

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        title={confirming ? `Remove ${confirming.name}?` : ''}
        description="This removes the row and its logo. Nothing else references it."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => confirming && remove(confirming)}
            >
              Remove
            </Button>
          </>
        }
      />
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
      {error ? (
        <span className={styles.fieldError}>{error}</span>
      ) : hint ? (
        <span className={styles.hint}>{hint}</span>
      ) : null}
    </label>
  );
}

function SponsorRow({
  row,
  group,
  index,
  canManage,
  busy,
  onEdit,
  onRemove,
  onMove,
  onChanged,
  onError,
}: {
  row: SponsorWire;
  group: SponsorGroup;
  index: number;
  canManage: boolean;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  // The server row is the truth once it comes back; drop the local blob so the two cannot diverge.
  useEffect(() => {
    setPreview(null);
  }, [row.logoUrl]);

  const upload = async (picked: File) => {
    setUploading(true);
    const objectUrl = URL.createObjectURL(picked);
    setPreview(objectUrl);
    try {
      const body = new FormData();
      body.set('sponsorId', row.id);
      body.set('logo', picked);
      const response = await fetch('/admin/sponsors/upload', { method: 'POST', body });
      const result = (await response.json()) as { ok: true } | { ok: false; message: string };
      if (!response.ok || !result.ok) {
        setPreview(null);
        onError('message' in result ? result.message : 'That image could not be uploaded');
        return;
      }
      onChanged();
    } catch {
      setPreview(null);
      onError('That image could not be uploaded');
    } finally {
      URL.revokeObjectURL(objectUrl);
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };

  const clear = async () => {
    setUploading(true);
    try {
      const result = await clearSponsorLogoAction(row.id);
      if (!result.ok) onError(result.message);
      else onChanged();
    } finally {
      setUploading(false);
    }
  };

  const src = preview ?? row.logoUrl;

  return (
    <li className={styles.row}>
      <div className={styles.logoCell}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- a route handler serves this, not the image optimiser
          <img src={src} alt="" className={styles.logo} />
        ) : (
          <span className={styles.logoEmpty} aria-hidden>
            {row.name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>

      <div className={styles.rowMain}>
        <div className={styles.rowTitle}>
          <span className={styles.rowName}>{row.name}</span>
          {row.tier ? <Badge>{row.tier}</Badge> : null}
          {row.boothLocation ? (
            <span className={styles.rowMeta}>Booth {row.boothLocation}</span>
          ) : null}
        </div>
        {row.websiteUrl ? (
          <a className={styles.rowLink} href={row.websiteUrl} rel="noreferrer" target="_blank">
            {row.websiteUrl}
          </a>
        ) : null}
        {row.description ? <p className={styles.rowBody}>{row.description}</p> : null}
      </div>

      {canManage ? (
        <div className={styles.rowActions}>
          <IconButton
            label={`Move ${row.name} up`}
            disabled={busy || index === 0}
            onClick={() => onMove(-1)}
          >
            <ChevronUp size={15} />
          </IconButton>
          <IconButton
            label={`Move ${row.name} down`}
            disabled={busy || index === group.rows.length - 1}
            onClick={() => onMove(1)}
          >
            <ChevronDown size={15} />
          </IconButton>

          <input
            ref={input}
            type="file"
            className={styles.visuallyHidden}
            accept={SPONSOR_LOGO.acceptedTypes.join(',')}
            onChange={(event) => {
              const picked = event.target.files?.[0];
              if (picked) void upload(picked);
            }}
          />
          <Button
            variant="secondary"
            loading={uploading}
            iconLeft={<ImagePlus size={15} />}
            onClick={() => input.current?.click()}
          >
            {row.logoFileId ? 'Replace logo' : 'Logo'}
          </Button>
          {row.logoFileId ? (
            <Button variant="ghost" disabled={uploading} onClick={() => void clear()}>
              Clear
            </Button>
          ) : null}

          <IconButton label={`Edit ${row.name}`} onClick={onEdit}>
            <Pencil size={15} />
          </IconButton>
          <IconButton label={`Remove ${row.name}`} onClick={onRemove}>
            <Trash2 size={15} />
          </IconButton>
        </div>
      ) : null}
    </li>
  );
}
