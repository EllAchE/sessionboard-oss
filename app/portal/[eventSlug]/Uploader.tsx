'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { Button, cn } from '@/components/ui';
import styles from '../portal.module.css';

/**
 * Posts to the portal's upload route rather than to a Server Action, because a Server Action body is
 * capped at 1 MB by default and a slide deck never is. Everything else — accepted types, size cap,
 * how many files a request takes — is enforced by `lib/services/files.ts` on the way in.
 */
export function Uploader({
  eventSlug,
  intent,
  assignmentId,
  fileId,
  accept,
  acceptedLabel,
  maxSizeMb,
  multiple = false,
  buttonLabel = 'Lodge scroll',
  helpText,
  compact = false,
}: {
  eventSlug: string;
  intent: 'headshot' | 'task' | 'replace';
  assignmentId?: string;
  fileId?: string;
  accept?: string;
  /** `CNT-02`. Stated before the picker opens, never only in the error that follows a bad pick. */
  acceptedLabel: string;
  maxSizeMb: number;
  multiple?: boolean;
  buttonLabel?: string;
  helpText?: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  async function send() {
    const files = inputRef.current?.files;
    if (!files || files.length === 0) {
      setNotice({ ok: false, message: 'Choose a scroll first' });
      return;
    }

    const body = new FormData();
    body.set('intent', intent);
    if (assignmentId) body.set('assignmentId', assignmentId);
    if (fileId) body.set('fileId', fileId);
    for (const entry of Array.from(files)) body.append('files', entry);

    setPending(true);
    setNotice(null);
    try {
      const response = await fetch(`/portal/${eventSlug}/upload`, { method: 'POST', body });
      const result = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !result.ok) {
        setNotice({ ok: false, message: result.message ?? 'The archive did not receive that scroll' });
        return;
      }
      setNotice({ ok: true, message: result.message ?? 'Entered in the archive' });
      setChosen([]);
      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
    } catch {
      setNotice({ ok: false, message: 'The archive did not receive that scroll. Check the road to Cicero.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={compact ? styles.stackTight : styles.dropzone}>
      {helpText && <p className={styles.hint}>{helpText}</p>}
      <p className={styles.hint}>
        Scrolls accepted: <strong>{acceptedLabel}</strong> · Maximum size:{' '}
        <strong>{maxSizeMb} MB</strong>
        {multiple ? ' · several scrolls permitted' : ' · one scroll at a time'}
      </p>
      <input
        ref={inputRef}
        type="file"
        className={styles.fileInput}
        accept={accept}
        multiple={multiple}
        onChange={(untrusted) =>
          setChosen(Array.from(untrusted.target.files ?? []).map((entry) => entry.name))
        }
      />
      <div className={styles.row}>
        <Button
          type="button"
          variant="primary"
          size="sm"
          loading={pending}
          onClick={send}
          iconLeft={<UploadCloud size={15} />}
        >
          {buttonLabel}
        </Button>
        {chosen.length > 0 && (
          <span className={styles.faint}>
            {chosen.length === 1 ? chosen[0] : `${chosen.length} scrolls selected`}
          </span>
        )}
      </div>
      {notice && (
        <p
          className={cn(styles.formNotice, notice.ok ? styles.formNoticeOk : styles.formNoticeError)}
          role="status"
        >
          {notice.message}
        </p>
      )}
    </div>
  );
}
