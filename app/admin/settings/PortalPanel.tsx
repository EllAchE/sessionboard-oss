'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Textarea, useToast } from '@/components/ui';
import { ACCENT_PRESETS, PORTAL_LOGO, normalizeAccent } from '@/lib/portal-appearance';
import { clearPortalLogoAction, savePortalAppearanceAction } from './actions';
import type { PortalAppearanceWire } from './types';
import styles from './settings.module.css';

/**
 * `S-11`. The speaker portal's appearance. `portal_theme` held all four of these columns from the
 * day the schema was written, the portal masthead and the branded email wrapper both read them, and
 * nothing but the seeds ever wrote one — so on any event nobody seeded, the portal fell back to its
 * defaults and there was no way to change that. This panel is the writer.
 *
 * Deliberately its own tab rather than another pair of fields under Event. Two logo uploaders in one
 * place is confusing unless it is obvious which surface each one dresses, and these two dress
 * different surfaces for different audiences: `E-3`'s logo and banner brand the public event pages,
 * and this one brands the portal a speaker signs in to. The lede on each says so.
 *
 * The logo commits on selection and the four text fields commit on Save, which is the same split
 * `BrandingFields` makes and for the same reason — a file input whose effect waits for a button is
 * a way to lose an image.
 */

const ENDPOINT = '/admin/settings/portal/upload';

type Draft = {
  accentColor: string;
  welcomeMarkdown: string;
  supportEmail: string;
};

function draftOf(appearance: PortalAppearanceWire): Draft {
  return {
    accentColor: appearance.accentColor ?? '',
    welcomeMarkdown: appearance.welcomeMarkdown ?? '',
    supportEmail: appearance.supportEmail ?? '',
  };
}

function LogoSlot({ url, canManage }: { url: string | null; canManage: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [clearing, startClearing] = useTransition();

  const upload = async (picked: File) => {
    setBusy(true);
    try {
      const body = new FormData();
      body.set('image', picked);
      const response = await fetch(ENDPOINT, { method: 'POST', body });
      const result = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !result.ok) {
        toast({ title: result.message ?? 'That image could not be uploaded', tone: 'danger' });
        return;
      }
      toast({ title: 'Portal logo updated', tone: 'success' });
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
      const result = await clearPortalLogoAction();
      if (!result.ok) {
        toast({ title: result.message, tone: 'danger' });
        return;
      }
      toast({ title: 'Portal logo removed', tone: 'success' });
      router.refresh();
    });
  };

  return (
    <div className={styles.fieldWide}>
      <span className={styles.label}>{PORTAL_LOGO.label}</span>
      <div className={styles.brandingPreview} data-kind="logo">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by a route handler, not the image optimiser
          <img src={url} alt="Logo shown in the speaker portal" className={styles.brandingImage} />
        ) : (
          <span className={styles.hint}>Nothing uploaded — the portal shows the event name</span>
        )}
      </div>
      <span className={styles.hint}>
        {PORTAL_LOGO.guidance} PNG, JPEG, SVG or WebP, up to {PORTAL_LOGO.maxSizeMb} MB.
      </span>
      {canManage ? (
        <div className={styles.formActions}>
          <input
            ref={input}
            type="file"
            accept={PORTAL_LOGO.acceptedTypes.join(',')}
            className={styles.visuallyHidden}
            id="portal-logo"
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

export function PortalPanel({
  appearance,
  eventName,
  canManage,
}: {
  appearance: PortalAppearanceWire;
  eventName: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const saved = draftOf(appearance);
  const [draft, setDraft] = useState<Draft>(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set =
    (key: keyof Draft) =>
    (input: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft((current) => ({ ...current, [key]: input.target.value }));

  const dirty = (Object.keys(saved) as (keyof Draft)[]).some((key) => draft[key] !== saved[key]);

  /** Only for the preview swatch. The service is what decides whether a colour is acceptable. */
  const previewAccent = normalizeAccent(draft.accentColor);

  const save = () => {
    setErrors({});
    startTransition(async () => {
      const result = await savePortalAppearanceAction({
        accentColor: draft.accentColor,
        welcomeMarkdown: draft.welcomeMarkdown,
        supportEmail: draft.supportEmail,
      });
      if (!result.ok) {
        setErrors(result.details ?? {});
        toast({ title: result.message, tone: 'danger' });
        return;
      }
      toast({ title: 'Portal appearance saved', tone: 'success' });
      router.refresh();
    });
  };

  const error = (key: keyof Draft) =>
    errors[key] ? <span className={styles.error}>{errors[key]}</span> : null;

  return (
    <section className={styles.panel} aria-label="Speaker portal">
      <p className={styles.lede}>
        How the portal looks to a speaker who signs in — not the public event pages, which are
        dressed by the logo and banner under Event. Anything left blank falls back to Cicero&rsquo;s
        own design, so none of this is required.
      </p>

      <div className={styles.formGrid}>
        <LogoSlot url={appearance.logoUrl} canManage={canManage} />

        <div className={styles.fieldWide}>
          <span className={styles.label}>Accent colour</span>
          <div className={styles.accentRow}>
            <span
              className={styles.swatch}
              data-empty={previewAccent ? undefined : ''}
              style={previewAccent ? { background: previewAccent } : undefined}
              aria-hidden
            />
            <Input
              value={draft.accentColor}
              placeholder="#B7391F"
              className={styles.mono}
              disabled={!canManage}
              invalid={Boolean(errors.accentColor)}
              onChange={set('accentColor')}
              aria-label="Accent colour, as a hex value"
            />
          </div>
          {canManage ? (
            <div className={styles.accentPresets}>
              {ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset.hex}
                  type="button"
                  className={styles.accentPreset}
                  style={{ background: preset.hex }}
                  title={`${preset.label} · ${preset.hex}`}
                  aria-label={`Use ${preset.label}`}
                  aria-pressed={previewAccent === preset.hex}
                  onClick={() =>
                    setDraft((current) => ({ ...current, accentColor: preset.hex }))
                  }
                />
              ))}
            </div>
          ) : null}
          <span className={styles.hint}>
            A hex value, because the same colour rules the top of every email this event sends and
            an inbox cannot read a design token. Clear the box to go back to Cicero&rsquo;s
            vermilion.
          </span>
          {error('accentColor')}
        </div>

        <label className={styles.fieldWide}>
          <span className={styles.label}>Welcome message</span>
          <Textarea
            value={draft.welcomeMarkdown}
            rows={5}
            placeholder={`Markdown. Shown at the top of the portal home screen — the first thing a ${eventName} speaker reads.`}
            disabled={!canManage}
            invalid={Boolean(errors.welcomeMarkdown)}
            onChange={set('welcomeMarkdown')}
          />
          <span className={styles.hint}>
            Replaces the default greeting. Leave it blank and Cicero explains the portal itself.
          </span>
          {error('welcomeMarkdown')}
        </label>

        <label className={styles.fieldWide}>
          <span className={styles.label}>Support email</span>
          <Input
            type="email"
            value={draft.supportEmail}
            placeholder="speakers@example.com"
            disabled={!canManage}
            invalid={Boolean(errors.supportEmail)}
            onChange={set('supportEmail')}
          />
          <span className={styles.hint}>
            Where a stuck speaker is told to write, in the portal footer and at the foot of every
            email. Blank means they are told to reply to the message instead.
          </span>
          {error('supportEmail')}
        </label>
      </div>

      {canManage ? (
        <div className={styles.formActions}>
          <Button variant="primary" loading={pending} disabled={!dirty} onClick={save}>
            Save appearance
          </Button>
          {dirty ? <span className={styles.hint}>Unsaved changes</span> : null}
        </div>
      ) : null}
    </section>
  );
}
