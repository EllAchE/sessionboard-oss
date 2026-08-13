'use client';

import { useState, useTransition } from 'react';
import { Plus, RotateCcw, Save, TriangleAlert, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Dialog,
  Input,
  Switch,
  Textarea,
} from '@/components/ui';
import type { TemplateVariable } from '@/lib/services/comms';
import {
  deleteTemplateAction,
  restoreDefaultTemplatesAction,
  saveTemplateAction,
} from './actions';
import styles from './comms.module.css';

export type TemplateRow = {
  id: string;
  key: string;
  name: string;
  subject: string;
  bodyMarkdown: string;
  enabled: boolean;
  attachIcs: boolean;
};

type Draft = TemplateRow & { isNew: boolean };

const BLANK: Draft = {
  id: '',
  key: '',
  name: '',
  subject: '',
  bodyMarkdown: '',
  enabled: true,
  attachIcs: false,
  isNew: true,
};

/**
 * `C-1`. Editing is a dialog rather than an inline form because the body is long and an organizer
 * comparing two templates needs the list to stay on screen.
 */
export function TemplateManager({
  eventId,
  templates,
  variables,
}: {
  eventId: string;
  templates: TemplateRow[];
  variables: TemplateVariable[];
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!draft) return;
    const data = new FormData();
    data.set('eventId', eventId);
    data.set('key', draft.key);
    data.set('name', draft.name);
    data.set('subject', draft.subject);
    data.set('bodyMarkdown', draft.bodyMarkdown);
    data.set('enabled', draft.enabled ? 'on' : 'off');
    data.set('attachIcs', draft.attachIcs ? 'on' : 'off');
    startTransition(async () => {
      const result = await saveTemplateAction(data);
      if (result.ok) {
        setDraft(null);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }

  function remove(id: string) {
    const data = new FormData();
    data.set('eventId', eventId);
    data.set('templateId', id);
    startTransition(async () => {
      const result = await deleteTemplateAction(data);
      if (!result.ok) setError(result.error);
      setDraft(null);
    });
  }

  function restore() {
    const data = new FormData();
    data.set('eventId', eventId);
    startTransition(async () => {
      const result = await restoreDefaultTemplatesAction(data);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <>
      <div className={styles.row}>
        <Button iconLeft={<Plus size={15} />} onClick={() => setDraft({ ...BLANK })}>
          New dispatch pattern
        </Button>
        <Button variant="ghost" iconLeft={<RotateCcw size={15} />} onClick={restore} loading={pending}>
          Restore the house patterns
        </Button>
      </div>

      {error && (
        <p className={`${styles.warning} ${styles.danger}`}>
          <TriangleAlert size={16} /> {error}
        </p>
      )}

      <div className={styles.templateGrid}>
        {templates.map((template) => (
          <Card key={template.id}>
            <CardHeader>
              <CardTitle>{template.name}</CardTitle>
            </CardHeader>
            <CardBody>
              <p className={styles.mono}>{template.key}</p>
              <div className={styles.templateMeta}>
                <Badge tone={template.enabled ? 'success' : 'neutral'}>
                  {template.enabled ? 'Active' : 'Off'}
                </Badge>
                {template.attachIcs && <Badge tone="info">Calendar summons</Badge>}
              </div>
              <p className={styles.subtle} style={{ marginTop: 'var(--space-3)' }}>
                {template.subject}
              </p>
              <p className={styles.templateBody}>{template.bodyMarkdown}</p>
              <div className={styles.row} style={{ marginTop: 'var(--space-4)' }}>
                <Button size="sm" onClick={() => setDraft({ ...template, isNew: false })}>
                  Revise
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  iconLeft={<Trash2 size={14} />}
                  onClick={() => remove(template.id)}
                >
                  Erase
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Dialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
        size="lg"
        title={draft?.isNew ? 'Inscribe a dispatch template' : `Revise ${draft?.name ?? ''}`}
        description="Bodies are markdown. Living inscriptions resolve for each recipient at dispatch."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button variant="primary" iconLeft={<Save size={15} />} onClick={submit} loading={pending}>
              Seal pattern
            </Button>
          </>
        }
      >
        {draft && (
          <div className={styles.stack}>
            <div className={styles.row}>
              <div className={`${styles.field} ${styles.grow}`}>
                <label className={styles.label} htmlFor="templateName">
                  Name
                </label>
                <Input
                  id="templateName"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className={`${styles.field} ${styles.grow}`}>
                <label className={styles.label} htmlFor="templateKeyField">
                  Key
                </label>
                <Input
                  id="templateKeyField"
                  className={styles.mono}
                  value={draft.key}
                  disabled={!draft.isNew}
                  onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="templateSubject">
                Subject
              </label>
              <Input
                id="templateSubject"
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="templateBody">
                Body — markdown
              </label>
              <Textarea
                id="templateBody"
                className={styles.body}
                value={draft.bodyMarkdown}
                onChange={(e) => setDraft({ ...draft, bodyMarkdown: e.target.value })}
              />
            </div>

            <div className={styles.row}>
              <Switch
                checked={draft.enabled}
                onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
                aria-label="Dispatch template is in circulation"
              />
              <span className={styles.subtle}>Active—automatic couriers use this pattern</span>
            </div>

            <div className={styles.row}>
              <Switch
                checked={draft.attachIcs}
                onCheckedChange={(attachIcs) => setDraft({ ...draft, attachIcs })}
                aria-label="Attach a summons for the personal fasti"
              />
              <span className={styles.subtle}>Carries a calendar summons</span>
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Available living inscriptions</span>
              <div className={styles.variables}>
                {variables.map((variable) => (
                  <span
                    key={variable.path}
                    className={styles.variableChip}
                    title={variable.description}
                  >
                    {variable.path}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
