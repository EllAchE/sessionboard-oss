'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Check, Copy, ExternalLink, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  IconButton,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTrigger,
  Tooltip,
} from '../../../../components/ui';
import type { FieldType } from '../../../../lib/forms/contract';
import {
  addFieldAction,
  addFieldFromLibraryAction,
  deleteFieldAction,
  deleteLibraryEntryAction,
  reorderFieldsAction,
  saveFieldToLibraryAction,
  setFormStatusAction,
  updateFieldAction,
  updateFormAction,
} from '../actions';
import { fieldTypeLabel, stepsOf } from '../field-rules';
import type { ActionResult, FieldPatchWire, FormSettingsInput } from '../types';
import { BuilderSidebar } from './BuilderSidebar';
import { FieldCard } from './FieldCard';
import { FieldEditor } from './FieldEditor';
import { FormPreview } from './FormPreview';
import { FormSettingsPanel } from './FormSettingsPanel';
import {
  parseStepDroppableId,
  stepDroppableId,
  type BuilderDragData,
  type BuilderFieldView,
  type FormView,
  type LibraryEntryView,
} from './builder-types';
import styles from './builder.module.css';

const STATUS_TONE = { draft: 'neutral', open: 'success', closed: 'warning' } as const;

/** Where a drop lands: a step, and an index into the whole running order. */
type DropTarget = { step: number; index: number };

function StepDropzone({
  step,
  children,
}: {
  step: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stepDroppableId(step) });
  return (
    <div ref={setNodeRef} className={styles.dropzone} data-over={isOver ? 'true' : undefined}>
      {children}
    </div>
  );
}

export function FormBuilder({
  form,
  fields: serverFields,
  library,
  eventSlug,
}: {
  form: FormView;
  fields: BuilderFieldView[];
  library: LibraryEntryView[];
  eventSlug: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fields, setFields] = useState<BuilderFieldView[]>(serverFields);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [awaitingEditId, setAwaitingEditId] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<BuilderDragData | null>(null);
  /** "Add a step" shows an empty step before any field lives on it; fields make it permanent. */
  const [manualStepTotal, setManualStepTotal] = useState(0);
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setFields(serverFields);
  }, [serverFields]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  /** A question added by drag opens its editor as soon as the refreshed row arrives. */
  useEffect(() => {
    if (awaitingEditId && fields.some((field) => field.id === awaitingEditId)) {
      setEditingId(awaitingEditId);
      setAwaitingEditId(null);
    }
  }, [awaitingEditId, fields]);

  const ordered = useMemo(
    () => [...fields].sort((a, b) => a.position - b.position),
    [fields],
  );
  const steps = useMemo(() => {
    const present = stepsOf(fields);
    const highest = present[present.length - 1] ?? 0;
    const total = Math.max(highest + 1, manualStepTotal, 1);
    return Array.from({ length: total }, (_, index) => index);
  }, [fields, manualStepTotal]);

  const publicPath = `/submit/${eventSlug}/${form.slug}`;
  const publicUrl = origin ? `${origin}${publicPath}` : publicPath;
  const editingField = ordered.find((field) => field.id === editingId) ?? null;

  const handle = (result: ActionResult<unknown>, onOk?: () => void): boolean => {
    if (!result.ok) {
      setError(result.message);
      setFields(serverFields);
      return false;
    }
    setError(null);
    onOk?.();
    router.refresh();
    return true;
  };

  const orderPayload = (list: readonly BuilderFieldView[]) =>
    list.map((field) => ({ id: field.id, step: field.step }));

  const normalize = (list: BuilderFieldView[]): BuilderFieldView[] =>
    list.map((field, index) => ({ ...field, position: index }));

  // -------------------------------------------------------------------------
  // Adding
  // -------------------------------------------------------------------------

  const insertionIndexForStep = (step: number): number => {
    const after = ordered.findIndex((field) => field.step > step);
    if (after !== -1) return after;
    return ordered.length;
  };

  const addAt = (type: FieldType, target: DropTarget) => {
    setNotice(null);
    startTransition(async () => {
      const result = await addFieldAction(form.id, {
        type,
        label: fieldTypeLabel(type),
        step: target.step,
        index: target.index,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
      setAwaitingEditId(result.data.id);
      router.refresh();
    });
  };

  const addFromLibrary = (entryId: string, target: DropTarget) => {
    setNotice(null);
    startTransition(async () => {
      const result = await addFieldFromLibraryAction(form.id, entryId, target.step, target.index);
      handle(result);
    });
  };

  // -------------------------------------------------------------------------
  // Dragging
  // -------------------------------------------------------------------------

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const resolveTarget = (overId: string): DropTarget | null => {
    const step = parseStepDroppableId(overId);
    if (step !== null) return { step, index: insertionIndexForStep(step) };
    const index = ordered.findIndex((field) => field.id === overId);
    if (index === -1) return null;
    return { step: ordered[index].step, index };
  };

  const moveField = (fieldId: string, target: DropTarget) => {
    const from = ordered.findIndex((field) => field.id === fieldId);
    if (from === -1) return;
    const to = Math.min(target.index, ordered.length - 1);
    const moved = arrayMove(ordered, from, to).map((field) =>
      field.id === fieldId ? { ...field, step: target.step } : field,
    );
    const next = normalize(moved);
    setFields(next);
    startTransition(async () => {
      const result = await reorderFieldsAction(form.id, orderPayload(next));
      handle(result);
    });
  };

  const onDragStart = (event: DragStartEvent) => {
    setActiveDrag((event.active.data.current as BuilderDragData | undefined) ?? null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    const data = event.active.data.current as BuilderDragData | undefined;
    if (!data || !event.over) return;
    const target = resolveTarget(String(event.over.id));
    if (!target) return;
    if (data.source === 'palette') addAt(data.type, target);
    else if (data.source === 'library') addFromLibrary(data.entryId, target);
    else if (data.fieldId !== String(event.over.id)) moveField(data.fieldId, target);
  };

  // -------------------------------------------------------------------------
  // Steps
  // -------------------------------------------------------------------------

  const removeStep = (step: number) => {
    const next = normalize(
      ordered.map((field) => {
        if (field.step === step) return { ...field, step: Math.max(0, step - 1) };
        if (field.step > step) return { ...field, step: field.step - 1 };
        return field;
      }),
    );
    setManualStepTotal(0);
    if (next.every((field, index) => field.step === ordered[index].step)) return;
    setFields(next);
    startTransition(async () => {
      const result = await reorderFieldsAction(form.id, orderPayload(next));
      handle(result);
    });
  };

  // -------------------------------------------------------------------------
  // Field and form writes
  // -------------------------------------------------------------------------

  const saveField = (fieldId: string, patch: FieldPatchWire) => {
    startTransition(async () => {
      const result = await updateFieldAction(form.id, fieldId, patch);
      if (handle(result)) setEditingId(null);
    });
  };

  const deleteField = (fieldId: string) => {
    startTransition(async () => {
      const result = await deleteFieldAction(form.id, fieldId);
      handle(result);
    });
  };

  const saveToLibrary = (fieldId: string) => {
    startTransition(async () => {
      const result = await saveFieldToLibraryAction(form.id, fieldId);
      handle(result, () => setNotice('Kept in the inscription library.'));
    });
  };

  const removeLibraryEntry = (entryId: string) => {
    startTransition(async () => {
      const result = await deleteLibraryEntryAction(form.id, entryId);
      handle(result);
    });
  };

  const saveSettings = (patch: FormSettingsInput) => {
    startTransition(async () => {
      const result = await updateFormAction(form.id, patch);
      handle(result, () => setNotice('Decrees sealed.'));
    });
  };

  const setStatus = (status: FormView['status']) => {
    startTransition(async () => {
      const result = await setFormStatusAction(form.id, status);
      handle(result, () =>
        setNotice(
          status === 'open'
            ? 'The scroll is proclaimed and accepting petitions.'
            : status === 'closed'
              ? 'The scroll is sealed. Its road remains, but no new answers may enter.'
              : 'The scroll is unproclaimed and no longer reachable.',
        ),
      );
    });
  };

  const copyLink = () => {
    void navigator.clipboard?.writeText(publicUrl).then(() => {
      setCopied(true);
      setNotice('Public road copied.');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headings}>
          <Link className={styles.breadcrumb} href="/admin/forms">
            Scrolls
          </Link>
          <h1 className={styles.title}>{form.name}</h1>
          <div className={styles.metaRow}>
            <Badge tone={STATUS_TONE[form.status]}>{form.status}</Badge>
            <span className={styles.publicLink}>{publicPath}</span>
            <Tooltip content={copied ? 'Road copied' : 'Copy the public road'}>
              <IconButton label="Copy the public proclamation" size="xs" onClick={copyLink}>
                {copied ? (
                  <Check size={13} aria-hidden="true" />
                ) : (
                  <Copy size={13} aria-hidden="true" />
                )}
              </IconButton>
            </Tooltip>
            <a
              className={styles.publicLink}
              href={publicPath}
              target="_blank"
              rel="noreferrer"
              aria-label="Unroll the public scroll in a new tab"
            >
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className={styles.actions}>
          {form.status === 'open' ? (
            <>
              <Button variant="secondary" loading={pending} onClick={() => setStatus('closed')}>
                Seal to new petitions
              </Button>
              <Button variant="ghost" loading={pending} onClick={() => setStatus('draft')}>
                Withdraw proclamation
              </Button>
            </>
          ) : (
            <Button variant="primary" loading={pending} onClick={() => setStatus('open')}>
              Proclaim
            </Button>
          )}
        </div>
      </header>

      {error ? <p className={`${styles.banner} ${styles.bannerError}`}>{error}</p> : null}
      {notice && !error ? (
        <p className={`${styles.banner} ${styles.bannerInfo}`}>{notice}</p>
      ) : null}

      <Tabs defaultValue="build">
        <TabsList>
          <TabsTrigger value="build">Inscriptions</TabsTrigger>
          <TabsTrigger value="settings">Decrees</TabsTrigger>
          <TabsTrigger value="preview">Wax preview</TabsTrigger>
        </TabsList>

        <TabsPanel value="build" className={styles.tabPanel}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => setActiveDrag(null)}
          >
            <div className={styles.columns}>
              <div className={styles.steps}>
                {steps.map((step) => {
                  const inStep = ordered.filter((field) => field.step === step);
                  return (
                    <section className={styles.step} key={step}>
                      <div className={styles.stepHeader}>
                        <span className={styles.stepTitle}>
                          {steps.length > 1 ? `Tablet ${step + 1}` : 'Prompts'}
                        </span>
                        {steps.length > 1 ? (
                          <Tooltip content="Remove this tablet and move its prompts upward">
                            <IconButton
                              label={`Remove tablet ${step + 1}`}
                              size="xs"
                              variant="danger"
                              disabled={pending}
                              onClick={() => removeStep(step)}
                            >
                              <Trash2 size={13} aria-hidden="true" />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                      </div>

                      <StepDropzone step={step}>
                        <SortableContext
                          items={inStep.map((field) => field.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {inStep.length === 0 ? (
                            <p className={styles.stepEmpty}>
                              Drag an inscription here, or choose one from the scribe’s palette.
                            </p>
                          ) : (
                            inStep.map((field) => (
                              <FieldCard
                                key={field.id}
                                field={field}
                                fields={ordered}
                                disabled={pending}
                                onEdit={setEditingId}
                                onDelete={deleteField}
                                onSaveToLibrary={saveToLibrary}
                              />
                            ))
                          )}
                        </SortableContext>
                      </StepDropzone>
                    </section>
                  );
                })}

                <div className={styles.actions}>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconLeft={<Plus size={14} />}
                    onClick={() => setManualStepTotal(steps.length + 1)}
                  >
                    Add a tablet
                  </Button>
                  <span className={styles.help}>
                    Tablets become pages a petitioner reads one at a time.
                  </span>
                </div>
              </div>

              <BuilderSidebar
                fields={ordered}
                library={library}
                busy={pending}
                onAddType={(type) =>
                  addAt(type, {
                    step: steps[steps.length - 1],
                    index: ordered.length,
                  })
                }
                onAddLibraryEntry={(entryId) =>
                  addFromLibrary(entryId, {
                    step: steps[steps.length - 1],
                    index: ordered.length,
                  })
                }
                onDeleteLibraryEntry={removeLibraryEntry}
              />
            </div>

            <DragOverlay>
              {activeDrag ? (
                <Card padding="sm">
                  <span className={styles.fieldLabel}>
                    {activeDrag.source === 'palette'
                      ? fieldTypeLabel(activeDrag.type)
                      : activeDrag.source === 'library'
                        ? (library.find((entry) => entry.id === activeDrag.entryId)?.label ??
                          'Library inscription')
                        : (ordered.find((field) => field.id === activeDrag.fieldId)?.label ??
                          'Prompt')}
                  </span>
                </Card>
              ) : null}
            </DragOverlay>
          </DndContext>
        </TabsPanel>

        <TabsPanel value="settings" className={styles.tabPanel}>
          <FormSettingsPanel form={form} busy={pending} onSave={saveSettings} />
        </TabsPanel>

        <TabsPanel value="preview" className={styles.tabPanel}>
          <FormPreview form={form} fields={ordered} />
        </TabsPanel>
      </Tabs>

      <FieldEditor
        field={editingField}
        fields={ordered}
        busy={pending}
        error={error}
        onSave={saveField}
        onClose={() => setEditingId(null)}
      />
    </div>
  );
}
