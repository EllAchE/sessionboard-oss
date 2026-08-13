'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, useToast } from '@/components/ui';
import { EVENT_BRANDING, type EventBrandingKind } from '@/lib/event-branding';
import { clearEventBrandingAction } from './actions';
import type { EventWire } from './types';
import styles from './settings.module.css';

/**
 * `E-3`. Logo and banner upload. `event.logo_file_id` had been a dead column since the schema was
 * written — nothing read it and nothing wrote it — and there was no banner at all.
 *
 * The upload posts to `/admin/settings/branding/upload`, which runs the same `validateUpload` every
 * other upload in the app runs. It commits on selection rather than on a save button: a file input
 * whose effect is deferred is a way to lose an image, and there is nothing to reconcile with the
 * form beside it because the slot holds exactly one file.
 *
 * `portal_theme` had the same problem — inserted by the seeds, writable by nothing — but that is the
 * speaker portal's branding (`S-11`) rather than the event's. It has its own writer now, under the
 * Speaker portal tab, and is deliberately not merged into this section: the two logos dress
 * different surfaces for different audiences, and two unexplained logo uploaders in one settings
 * area is worse than two clearly separated ones.
 */

const ENDPOINT = '/admin/settings/branding/upload';

type SlotProps = {
  kind: EventBrandingKind;
  url: string | null;
  canManage: boolean;
};

function Slot({ kind, url, canManage }: SlotProps) {
  const spec = EVENT_BRANDING[kind];
  const router = useRouter();
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [clearing, startClearing] = useTransition();

  const upload = async (picked: File) => {
    setBusy(true);
    try {
      const body = new FormData();
      body.set('kind', kind);
      body.set('image', picked);
      const response = await fetch(ENDPOINT, { method: 'POST', body });
      const result = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !result.ok) {
        toast({ title: result.message ?? 'That image could not be uploaded', tone: 'danger' });
        return;
      }
      toast({ title: `${spec.label} updated`, tone: 'success' });
      router.refresh();
    } catch {
      toast({ title: 'That image could not be uploaded', tone: 'danger' });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const clear = () => {
    startClearing(async () => {
      const result = await clearEventBrandingAction(kind);
      if (!result.ok) {
        toast({ title: result.message, tone: 'danger' });
        return;
      }
      toast({ title: `${spec.label} removed`, tone: 'success' });
      router.refresh();
    });
  };

  return (
    <div className={styles.field}>
      <span className={styles.label}>{spec.label}</span>
      <div className={styles.brandingPreview} data-kind={kind}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by a route handler, not the image optimiser
          <img src={url} alt={`${spec.label} for this event`} className={styles.brandingImage} />
        ) : (
          <span className={styles.hint}>Nothing uploaded</span>
        )}
      </div>
      <span className={styles.hint}>
        {spec.guidance} PNG, JPEG{kind === 'logo' ? ', SVG' : ''} or WebP, up to {spec.maxSizeMb} MB.
      </span>
      {canManage ? (
        <div className={styles.formActions}>
          <input
            ref={input}
            type="file"
            accept={spec.acceptedTypes.join(',')}
            className={styles.visuallyHidden}
            id={`branding-${kind}`}
            onChange={(changed) => {
              const picked = changed.target.files?.[0];
              if (picked) void upload(picked);
            }}
          />
          <Button
            variant="secondary"
            loading={busy}
            onClick={() => input.current?.click()}
            type="button"
          >
            {url ? 'Replace' : 'Upload'}
          </Button>
          {url ? (
            <Button variant="ghost" loading={clearing} onClick={clear} type="button">
              Remove
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function BrandingFields({ event, canManage }: { event: EventWire; canManage: boolean }) {
  return (
    <section className={styles.subPanel} aria-label="Branding">
      <h2 className={styles.subTitle}>Branding</h2>
      <p className={styles.hint}>
        Both appear on the public event pages. The banner sits behind the title; the logo sits beside
        the event name in the header. The portal a speaker signs in to is dressed separately, under
        Speaker portal.
      </p>
      <div className={styles.formGrid}>
        <Slot kind="logo" url={event.logoUrl} canManage={canManage} />
        <Slot kind="banner" url={event.bannerUrl} canManage={canManage} />
      </div>
    </section>
  );
}
