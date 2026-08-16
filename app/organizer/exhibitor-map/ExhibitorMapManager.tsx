'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, ExternalLink, FileText, Trash2, Upload } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  useToast,
} from '@/components/ui';
import {
  EXHIBITOR_MAP_UPLOAD,
  exhibitorMapEmbedPath,
  exhibitorMapFilePath,
} from '@/lib/exhibitor-map';
import { formatBytes } from '@/lib/services/file-format';
import dashboard from '../dashboard/dashboard.module.css';
import { removeExhibitorMapAction } from './actions';
import styles from './exhibitor-map.module.css';

type MapWire = { filename: string; sizeBytes: number; updatedAt: string };

export function ExhibitorMapManager({
  eventName,
  eventSlug,
  origin,
  map,
}: {
  eventName: string;
  eventSlug: string;
  origin: string;
  map: MapWire | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, startRemoving] = useTransition();
  const [copied, setCopied] = useState<'script' | 'iframe' | null>(null);

  const embedPath = exhibitorMapEmbedPath(eventSlug);
  const embedUrl = `${origin}${embedPath}`;
  const fileUrl = `${origin}${exhibitorMapFilePath(eventSlug)}`;
  const scriptSnippet = useMemo(
    () =>
      [
        `<div data-cicero-embed="exhibitor-map" data-event="${eventSlug}"></div>`,
        `<script src="${origin}/embed.js" async></script>`,
      ].join('\n'),
    [eventSlug, origin],
  );
  const iframeSnippet = `<iframe src="${embedUrl}" title="${eventName} exhibitor map" style="width:100%;height:700px;border:0" loading="lazy"></iframe>`;

  const copy = async (value: string, kind: 'script' | 'iframe') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      toast({ title: 'Clipboard access is unavailable', tone: 'danger' });
    }
  };

  const upload = async (picked: File) => {
    setUploading(true);
    try {
      const body = new FormData();
      body.set('map', picked);
      const response = await fetch('/organizer/exhibitor-map/upload', { method: 'POST', body });
      const result = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !result.ok) throw new Error(result.message ?? 'Upload failed');
      toast({ title: map ? 'Exhibitor map replaced' : 'Exhibitor map published', tone: 'success' });
      router.refresh();
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : 'That PDF could not be uploaded',
        tone: 'danger',
      });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const remove = () => {
    if (!window.confirm('Remove this exhibitor map? The public embed will stop showing it.')) return;
    startRemoving(async () => {
      const result = await removeExhibitorMapAction();
      if (!result.ok) {
        toast({ title: result.message, tone: 'danger' });
        return;
      }
      toast({ title: 'Exhibitor map removed', tone: 'success' });
      router.refresh();
    });
  };

  return (
    <div className={dashboard.page}>
      <div className={dashboard.pageHead}>
        <div>
          <p className={dashboard.eyebrow}>Setup</p>
          <h1 className={dashboard.title}>Exhibitor map</h1>
          <p className={dashboard.subtitle}>
            Upload the finished floor plan you already have. Cicero publishes that PDF as a static,
            embeddable document—no booth drawing or map setup required.
          </p>
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.stack}>
          <Card>
            <CardHeader>
              <div className={styles.cardHeading}>
                <div>
                  <CardTitle>Map PDF</CardTitle>
                  <CardDescription>Uploading is publication; replacing keeps the same embed URL.</CardDescription>
                </div>
                <Badge tone={map ? 'success' : 'neutral'}>{map ? 'Published' : 'Not uploaded'}</Badge>
              </div>
            </CardHeader>
            <CardBody>
              {map ? (
                <div className={styles.fileRow}>
                  <FileText size={22} aria-hidden />
                  <div className={styles.fileMeta}>
                    <strong>{map.filename}</strong>
                    <span>
                      {formatBytes(map.sizeBytes)} · updated {new Date(map.updatedAt).toLocaleString()}
                    </span>
                  </div>
                  <a className={styles.openLink} href={fileUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} /> Open PDF
                  </a>
                </div>
              ) : (
                <p className={styles.empty}>No exhibitor map is public for this event.</p>
              )}

              <input
                ref={fileInput}
                id="exhibitor-map-upload"
                className={styles.visuallyHidden}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => {
                  const picked = event.target.files?.[0];
                  if (picked) void upload(picked);
                }}
              />
              <p className={styles.hint}>
                PDF only, up to {EXHIBITOR_MAP_UPLOAD.maxSizeMb} MB. The map is displayed as-is and
                is not converted into interactive booths or hotspots.
              </p>
              <div className={styles.actions}>
                <Button
                  iconLeft={<Upload size={14} />}
                  loading={uploading}
                  onClick={() => fileInput.current?.click()}
                >
                  {map ? 'Replace PDF' : 'Upload PDF'}
                </Button>
                {map ? (
                  <Button
                    variant="danger"
                    iconLeft={<Trash2 size={14} />}
                    loading={removing}
                    onClick={remove}
                  >
                    Remove map
                  </Button>
                ) : null}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Embed code</CardTitle>
              <CardDescription>Paste either version into the event website.</CardDescription>
            </CardHeader>
            <CardBody>
              {!map ? (
                <p className={styles.warning}>Upload the PDF before publishing this embed.</p>
              ) : null}
              <p className={styles.label}>Script tag (auto-resizing, recommended)</p>
              <pre className={styles.snippet}>{scriptSnippet}</pre>
              <Button
                size="sm"
                iconLeft={copied === 'script' ? <Check size={14} /> : <Copy size={14} />}
                onClick={() => void copy(scriptSnippet, 'script')}
              >
                {copied === 'script' ? 'Copied' : 'Copy snippet'}
              </Button>

              <p className={styles.label}>Plain iframe (fixed height)</p>
              <pre className={styles.snippet}>{iframeSnippet}</pre>
              <Button
                size="sm"
                variant="secondary"
                iconLeft={copied === 'iframe' ? <Check size={14} /> : <Copy size={14} />}
                onClick={() => void copy(iframeSnippet, 'iframe')}
              >
                {copied === 'iframe' ? 'Copied' : 'Copy iframe'}
              </Button>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Live preview</CardTitle>
            <CardDescription>Exactly what the embedded event map will show.</CardDescription>
          </CardHeader>
          <CardBody>
            <iframe className={styles.preview} src={embedPath} title="Exhibitor map preview" />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
