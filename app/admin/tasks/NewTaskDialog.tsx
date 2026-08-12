'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import {
  Button,
  Dialog,
  Input,
  Select,
  Switch,
  Textarea,
  useToast,
} from '@/components/ui';
import { createTaskAction, type NewTaskInput } from './actions';
import styles from './tasks.module.css';

const AUDIENCE_LABEL: Record<NewTaskInput['audience'], string> = {
  all_participants: 'All participants',
  accepted_participants: 'Accepted speakers',
};

const BLANK: NewTaskInput = {
  name: '',
  description: '',
  requiresFile: false,
  audience: 'accepted_participants',
  required: true,
  dueAt: '',
};

/**
 * The gap this closes: five task types were seeded and nothing after that could add a sixth. A
 * task type is a name, a description, whether it needs a file back, who it goes to — the same
 * fields the seeded ones already have, entered here instead of in `db/seed.ts`.
 *
 * A dialog rather than an inline row (contrast `CollectionPanel`) because a task carries a
 * multi-line description and two independent yes/no choices; a `DataTable` row cannot hold that
 * without becoming its own scrollable form.
 */
export function NewTaskDialog() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<NewTaskInput>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const close = () => {
    setOpen(false);
    setDraft(BLANK);
    setError(null);
    setFieldErrors({});
  };

  const submit = () => {
    if (!draft.name.trim()) {
      setFieldErrors({ name: 'A task needs a name' });
      return;
    }
    startTransition(async () => {
      const result = await createTaskAction(draft);
      if (!result.ok) {
        setError(result.message);
        setFieldErrors(result.details ?? {});
        return;
      }
      toast({ title: `${draft.name} added`, tone: 'success' });
      close();
      router.refresh();
    });
  };

  return (
    <>
      <Button variant="primary" size="sm" iconLeft={<Plus size={15} />} onClick={() => setOpen(true)}>
        New task
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        title="New task"
        description="Every speaker sees this in their portal the same way they see the built-in tasks."
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} loading={pending}>
              Add task
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          {error && <p className={styles.hint}>{error}</p>}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="newTaskName">
              Name
            </label>
            <Input
              id="newTaskName"
              placeholder="Sign the speaker agreement"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            {fieldErrors.name && <span className={styles.hint}>{fieldErrors.name}</span>}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="newTaskDescription">
              Description
            </label>
            <Textarea
              id="newTaskDescription"
              placeholder="What the speaker needs to do, in a sentence or two. Markdown is fine."
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>

          <div className={styles.row}>
            <div className={`${styles.field} ${styles.grow}`}>
              <label className={styles.label} htmlFor="newTaskAudience">
                Assign to
              </label>
              <Select
                id="newTaskAudience"
                value={draft.audience}
                onChange={(e) =>
                  setDraft({ ...draft, audience: e.target.value as NewTaskInput['audience'] })
                }
              >
                {Object.entries(AUDIENCE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div className={`${styles.field} ${styles.grow}`}>
              <label className={styles.label} htmlFor="newTaskDueAt">
                Deadline
              </label>
              <Input
                id="newTaskDueAt"
                type="date"
                value={draft.dueAt}
                onChange={(e) => setDraft({ ...draft, dueAt: e.target.value })}
              />
              {fieldErrors.dueAt && <span className={styles.hint}>{fieldErrors.dueAt}</span>}
            </div>
          </div>

          <div className={styles.switchRow}>
            <Switch
              checked={draft.requiresFile}
              onCheckedChange={(requiresFile) => setDraft({ ...draft, requiresFile })}
              aria-label="This task requires a file upload"
            />
            <span className={styles.hint}>Requires a file upload</span>
          </div>

          <div className={styles.switchRow}>
            <Switch
              checked={draft.required}
              onCheckedChange={(required) => setDraft({ ...draft, required })}
              aria-label="This task is required"
            />
            <span className={styles.hint}>
              Required — counts toward overdue and completion totals
            </span>
          </div>
        </div>
      </Dialog>
    </>
  );
}
