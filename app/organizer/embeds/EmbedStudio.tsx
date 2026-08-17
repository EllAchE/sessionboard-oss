'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, Monitor, Plus, Smartphone, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  IconButton,
  Input,
  Select,
  Switch,
  Textarea,
} from '@/components/ui';
import {
  EMBED_STATUSES,
  EMBED_STATUS_LABEL,
  EMBED_VIEWS,
  EMBED_VIEW_LABEL,
  EMBED_VIEW_SUMMARY,
  sanitizeEmbedCss,
  type EmbedStatus,
  type EmbedView,
} from '../../embed/model';
import {
  EMBED_FEED_FORMATS,
  EMBED_FEED_LABEL,
  EMBED_FEED_SEGMENT,
  feedSupportsFormat,
} from '../../embed/formats';
import dashboard from '../dashboard/dashboard.module.css';
import styles from './embeds.module.css';

type View = EmbedView;

type Config = {
  id: string;
  name: string;
  view: View;
  enabled: boolean;
  tracks: string[];
  rooms: string[];
  status: EmbedStatus;
  speaker: string | null;
  showBio: boolean;
  showPhoto: boolean;
  showRoom: boolean;
  showTrack: boolean;
  showDescription: boolean;
  columns: number;
  accent: string;
  css: string;
  theme: 'auto' | 'light' | 'dark';
  limit: string;
};

const STORAGE_KEY = 'cicero-embeds';

function blank(view: View = 'agenda'): Config {
  return {
    id: `embed-${Date.now()}`,
    name: EMBED_VIEW_LABEL[view],
    view,
    enabled: true,
    tracks: [],
    rooms: [],
    status: 'published',
    speaker: null,
    showBio: true,
    showPhoto: true,
    showRoom: true,
    showTrack: true,
    showDescription: true,
    columns: 3,
    accent: '',
    css: '',
    theme: 'auto',
    limit: '',
  };
}

function load(): Config[] {
  if (typeof window === 'undefined') return [blank()];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [blank()];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [blank()];
    return parsed as Config[];
  } catch {
    return [blank()];
  }
}

function persist(configs: Config[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
  } catch {
    /* A saved embed configuration is a convenience; the URL is the real artifact. */
  }
}

function queryFor(config: Config): string {
  const params = new URLSearchParams();
  if (config.tracks.length > 0) params.set('track', config.tracks.join(','));
  if (config.rooms.length > 0) params.set('room', config.rooms.join(','));
  if (config.status !== 'published') params.set('status', config.status);
  if (config.speaker) params.set('sb-speaker-id', config.speaker);
  if (!config.showBio) params.set('bio', '0');
  if (!config.showPhoto) params.set('photo', '0');
  if (!config.showRoom) params.set('room_label', '0');
  if (!config.showTrack) params.set('track_label', '0');
  if (!config.showDescription) params.set('description', '0');
  if (config.columns !== 3) params.set('columns', String(config.columns));
  if (/^#?[0-9a-f]{6}$/i.test(config.accent)) params.set('accent', config.accent.replace('#', ''));
  if (config.theme !== 'auto') params.set('theme', config.theme);
  if (config.limit.trim()) params.set('limit', config.limit.trim());
  /**
   * `AD-3`. Only CSS the widget would actually honour is put on the URL, so an organizer who pastes
   * something the sanitiser rejects sees it disappear from the snippet rather than silently ship a
   * parameter that the embed drops on arrival.
   */
  const css = sanitizeEmbedCss(config.css);
  if (css) params.set('css', css);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** HTML attribute values are the one place a legal CSS `"` would break the snippet. */
function attrValue(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function datasetFor(config: Config): string[] {
  const attrs = [`data-cicero-embed="${config.view}"`];
  if (config.tracks.length > 0) attrs.push(`data-track="${config.tracks.join(',')}"`);
  if (config.rooms.length > 0) attrs.push(`data-room="${config.rooms.join(',')}"`);
  if (config.status !== 'published') attrs.push(`data-status="${config.status}"`);
  if (config.speaker) attrs.push(`data-sb-speaker-id="${config.speaker}"`);
  if (!config.showBio) attrs.push('data-bio="0"');
  if (!config.showPhoto) attrs.push('data-photo="0"');
  if (!config.showRoom) attrs.push('data-room-label="0"');
  if (!config.showTrack) attrs.push('data-track-label="0"');
  if (!config.showDescription) attrs.push('data-description="0"');
  if (config.columns !== 3) attrs.push(`data-columns="${config.columns}"`);
  if (/^#?[0-9a-f]{6}$/i.test(config.accent))
    attrs.push(`data-accent="${config.accent.replace('#', '')}"`);
  if (config.theme !== 'auto') attrs.push(`data-theme="${config.theme}"`);
  if (config.limit.trim()) attrs.push(`data-limit="${config.limit.trim()}"`);
  const css = sanitizeEmbedCss(config.css);
  if (css) attrs.push(`data-css="${attrValue(css)}"`);
  return attrs;
}

/** `G-5`–`G-8`. */
export function EmbedStudio({
  eventSlug,
  eventName,
  origin,
  tracks,
  rooms,
  speakers,
  publishedSessions,
  publishedSpeakers,
}: {
  eventSlug: string;
  eventName: string;
  origin: string;
  tracks: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
  speakers: { id: string; slug: string; name: string }[];
  publishedSessions: number;
  publishedSpeakers: number;
}) {
  const [configs, setConfigs] = useState<Config[]>(load);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [copied, setCopied] = useState<string | null>(null);

  const active = configs.find((entry) => entry.id === activeId) ?? configs[0];

  const update = (patch: Partial<Config>) => {
    const next = configs.map((entry) =>
      entry.id === active.id ? { ...entry, ...patch } : entry,
    );
    setConfigs(next);
    persist(next);
  };

  const addConfig = () => {
    const created = blank();
    created.name = `Embed ${configs.length + 1}`;
    const next = [...configs, created];
    setConfigs(next);
    persist(next);
    setActiveId(created.id);
  };

  const removeConfig = (id: string) => {
    const next = configs.filter((entry) => entry.id !== id);
    const resolved = next.length > 0 ? next : [blank()];
    setConfigs(resolved);
    persist(resolved);
    setActiveId(resolved[0].id);
  };

  const previewUrl = `/embed/${eventSlug}/${active.view}${queryFor(active)}`;
  const publicUrl = `${origin}/embed/${eventSlug}/${active.view}${queryFor(active)}`;

  const snippet = useMemo(() => {
    const attrs = datasetFor(active);
    return [
      `<div ${attrs.join(' ')} data-event="${eventSlug}"></div>`,
      `<script src="${origin}/embed.js" async></script>`,
    ].join('\n');
  }, [active, eventSlug, origin]);

  const iframeSnippet = `<iframe src="${publicUrl}" title="${eventName} ${active.view}" style="width:100%;height:600px;border:0" loading="lazy"></iframe>`;

  const everyWidget = useMemo(
    () =>
      EMBED_VIEWS.map((view) => {
        const config = { ...active, view };
        return {
          view,
          url: `${origin}/embed/${eventSlug}/${view}${queryFor(config)}`,
          snippet: [
            `<div ${datasetFor(config).join(' ')} data-event="${eventSlug}"></div>`,
            `<script src="${origin}/embed.js" async></script>`,
          ].join('\n'),
        };
      }),
    [active, eventSlug, origin],
  );

  /**
   * `AD-3`. The data feeds are the same configuration in another wrapper, not a second product: the
   * query string is exactly the one the script and iframe snippets carry, so a filter or field the
   * organizer changes above moves every format at once.
   */
  const feeds = useMemo(
    () =>
      EMBED_FEED_FORMATS.filter((format) => feedSupportsFormat(active.view, format)).map(
        (format) => ({
          format,
          label: EMBED_FEED_LABEL[format],
          url: `${origin}/embed/${eventSlug}/${active.view}/${EMBED_FEED_SEGMENT[format]}${queryFor(active)}`,
        }),
      ),
    [active, eventSlug, origin],
  );

  const cssError =
    active.css.trim() && !sanitizeEmbedCss(active.css)
      ? 'Remove @import, url(), angle brackets or trim below 4000 characters.'
      : null;

  const copy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1600);
    });
  };

  const toggleIn = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];

  return (
    <div className={dashboard.page}>
      <div className={dashboard.pageHead}>
        <div>
          <p className={dashboard.eyebrow}>Reach</p>
          <h1 className={dashboard.title}>Embeds</h1>
          <p className={dashboard.subtitle}>
            Paste one snippet into your event website. It renders live data on every visit, so a
            schedule change or a new speaker appears without re-pasting anything.
          </p>
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.panel}>
          <Card>
            <CardHeader>
              <CardTitle>Embeds</CardTitle>
              <CardDescription>
                {publishedSessions} published sessions · {publishedSpeakers} speakers visible.
              </CardDescription>
            </CardHeader>
            <CardBody>
              <div className={styles.savedList}>
                {configs.map((config) => (
                  <div key={config.id} className={styles.savedRow} data-active={config.id === active.id}>
                    <button
                      type="button"
                      className={styles.savedName}
                      onClick={() => setActiveId(config.id)}
                    >
                      {config.name}
                      <span className={styles.savedMeta}> · {EMBED_VIEW_LABEL[config.view]}</span>
                    </button>
                    <Badge tone={config.enabled ? 'success' : 'neutral'}>
                      {config.enabled ? 'Live' : 'Off'}
                    </Badge>
                    <IconButton
                      label={`Delete ${config.name}`}
                      size="sm"
                      onClick={() => removeConfig(config.id)}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                ))}
              </div>
              <div className={styles.snippetActions}>
                <Button size="sm" variant="secondary" iconLeft={<Plus size={14} />} onClick={addConfig}>
                  New embed
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardBody>
              <div className={styles.panel}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Name</span>
                  <Input
                    inputSize="sm"
                    value={active.name}
                    onChange={(e) => update({ name: e.target.value })}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>What it shows</span>
                  <Select
                    selectSize="sm"
                    value={active.view}
                    onChange={(e) => update({ view: e.target.value as View })}
                  >
                    {EMBED_VIEWS.map((view) => (
                      <option key={view} value={view}>
                        {EMBED_VIEW_LABEL[view]}
                      </option>
                    ))}
                  </Select>
                  <span className={styles.fieldHint}>{EMBED_VIEW_SUMMARY[active.view]}</span>
                </label>

                <div className={styles.toggleRow}>
                  <span>Enabled</span>
                  <Switch
                    checked={active.enabled}
                    onCheckedChange={(checked) => update({ enabled: checked })}
                  />
                </div>

                {tracks.length > 0 ? (
                  <div className={styles.group}>
                    <span className={styles.groupTitle}>Filter by track</span>
                    <div className={styles.chipRow}>
                      {tracks.map((track) => (
                        <button
                          key={track.id}
                          type="button"
                          className={styles.chipToggle}
                          data-on={active.tracks.includes(track.name)}
                          onClick={() => update({ tracks: toggleIn(active.tracks, track.name) })}
                        >
                          {track.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {rooms.length > 0 ? (
                  <div className={styles.group}>
                    <span className={styles.groupTitle}>Filter by room</span>
                    <div className={styles.chipRow}>
                      {rooms.map((room) => (
                        <button
                          key={room.id}
                          type="button"
                          className={styles.chipToggle}
                          data-on={active.rooms.includes(room.name)}
                          onClick={() => update({ rooms: toggleIn(active.rooms, room.name) })}
                        >
                          {room.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Publication status</span>
                  <Select
                    selectSize="sm"
                    value={active.status}
                    onChange={(e) => update({ status: e.target.value as EmbedStatus })}
                  >
                    {EMBED_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {EMBED_STATUS_LABEL[status]}
                      </option>
                    ))}
                  </Select>
                  <span className={styles.fieldHint}>
                    Narrows what the embed shows within your published programme. Drafts, sessions
                    awaiting review and unconfirmed speakers are never embeddable at any setting.
                  </span>
                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Deep-link to one speaker</span>
                  <Select
                    selectSize="sm"
                    value={active.speaker ?? ''}
                    onChange={(e) => update({ speaker: e.target.value || null })}
                  >
                    <option value="">Show everyone</option>
                    {speakers.map((speaker) => (
                      <option key={speaker.id} value={speaker.id}>
                        {speaker.name}
                      </option>
                    ))}
                  </Select>
                  <span className={styles.fieldHint}>
                    Adds <code>?sb-speaker-id=…</code>. A visitor arriving at your page with that
                    parameter set gets the same result without changing the snippet.
                  </span>
                </label>

                <div className={styles.group}>
                  <span className={styles.groupTitle}>Fields</span>
                  {(
                    [
                      ['showPhoto', 'Headshots'],
                      ['showBio', 'Speaker bios'],
                      ['showDescription', 'Session descriptions'],
                      ['showTrack', 'Track labels'],
                      ['showRoom', 'Room labels'],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className={styles.toggleRow}>
                      <span>{label}</span>
                      <Switch
                        checked={active[key]}
                        onCheckedChange={(checked) => update({ [key]: checked } as Partial<Config>)}
                      />
                    </div>
                  ))}
                </div>

                <div className={styles.group}>
                  <span className={styles.groupTitle}>Style</span>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Columns</span>
                    <Select
                      selectSize="sm"
                      value={String(active.columns)}
                      onChange={(e) => update({ columns: Number(e.target.value) })}
                    >
                      {[1, 2, 3, 4].map((count) => (
                        <option key={count} value={count}>
                          {count}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Accent colour</span>
                    <Input
                      inputSize="sm"
                      value={active.accent}
                      placeholder="B7391F"
                      onChange={(e) => update({ accent: e.target.value })}
                    />
                    <span className={styles.fieldHint}>
                      Six hex digits. Leave blank to inherit Cicero&rsquo;s palette.
                    </span>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Theme</span>
                    <Select
                      selectSize="sm"
                      value={active.theme}
                      onChange={(e) => update({ theme: e.target.value as Config['theme'] })}
                    >
                      <option value="auto">Match the visitor</option>
                      <option value="light">Always light</option>
                      <option value="dark">Always dark</option>
                    </Select>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Maximum sessions</span>
                    <Input
                      inputSize="sm"
                      value={active.limit}
                      placeholder="All"
                      inputMode="numeric"
                      onChange={(e) => update({ limit: e.target.value })}
                    />
                  </label>
                </div>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Custom CSS</span>
                  <Textarea
                    rows={4}
                    spellCheck={false}
                    invalid={Boolean(cssError)}
                    value={active.css}
                    placeholder=".sb-session-title { font-family: Georgia, serif; }"
                    onChange={(e) => update({ css: e.target.value })}
                  />
                  <span className={styles.fieldHint}>
                    {cssError ??
                      'Applied inside the widget only. Imports, url() and markup are rejected, so a stylesheet cannot phone home or inject script.'}
                  </span>
                </label>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data feeds</CardTitle>
              <CardDescription>
                The same configuration as machine-readable data. Every filter, field and limit above
                applies identically here.
              </CardDescription>
            </CardHeader>
            <CardBody>
              <div className={styles.savedList}>
                {feeds.map((feed) => (
                  <div key={feed.format} className={styles.savedRow}>
                    <div className={styles.savedName}>
                      <Badge tone="neutral">{feed.format.toUpperCase()}</Badge>
                      <span className={styles.savedMeta}>{feed.label}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      iconLeft={
                        copied === `feed-${feed.format}` ? <Check size={14} /> : <Copy size={14} />
                      }
                      onClick={() => copy(feed.url, `feed-${feed.format}`)}
                    >
                      {copied === `feed-${feed.format}` ? 'Copied' : 'Copy URL'}
                    </Button>
                  </div>
                ))}
              </div>
              <p className={styles.note}>
                {feedSupportsFormat(active.view, 'ics')
                  ? 'The .ics URL is a live subscription: paste it into Google Calendar, Outlook or Apple Calendar and it re-checks hourly, updating sessions in place rather than duplicating them.'
                  : 'This widget has no dated sessions, so it publishes data feeds but no calendar.'}
              </p>
            </CardBody>
          </Card>
        </div>

        <div className={styles.panel}>
          <Card>
            <CardBody>
              <div className={styles.previewHead}>
                <div>
                  <CardTitle>Live preview</CardTitle>
                  <CardDescription>Exactly what your visitors will see.</CardDescription>
                </div>
                <div className={styles.deviceToggle}>
                  <Button
                    size="sm"
                    variant={device === 'desktop' ? 'primary' : 'secondary'}
                    iconLeft={<Monitor size={14} />}
                    onClick={() => setDevice('desktop')}
                  >
                    Desktop
                  </Button>
                  <Button
                    size="sm"
                    variant={device === 'mobile' ? 'primary' : 'secondary'}
                    iconLeft={<Smartphone size={14} />}
                    onClick={() => setDevice('mobile')}
                  >
                    Mobile
                  </Button>
                </div>
              </div>
              <div className={styles.frameWrap}>
                <iframe
                  key={previewUrl + device}
                  className={styles.frame}
                  data-device={device}
                  src={previewUrl}
                  title="Embed preview"
                />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Paste this into your site</CardTitle>
              <CardDescription>
                Works in any CMS that accepts an HTML block — WordPress, Webflow, Squarespace, a
                hand-written page.
              </CardDescription>
            </CardHeader>
            <CardBody>
              <p className={styles.note}>
                This embed auto-updates. The iframe renders live data on every page load, so a
                rescheduled talk or a newly published speaker appears immediately — you never re-paste
                the snippet.
              </p>

              <p className={styles.fieldLabel} style={{ marginTop: 'var(--space-4)' }}>
                Script tag (auto-resizing, recommended)
              </p>
              <pre className={styles.snippet}>{snippet}</pre>
              <div className={styles.snippetActions}>
                <Button
                  size="sm"
                  iconLeft={copied === 'script' ? <Check size={14} /> : <Copy size={14} />}
                  onClick={() => copy(snippet, 'script')}
                >
                  {copied === 'script' ? 'Copied' : 'Copy snippet'}
                </Button>
              </div>

              <p className={styles.fieldLabel} style={{ marginTop: 'var(--space-4)' }}>
                Plain iframe (no JavaScript, fixed height)
              </p>
              <pre className={styles.snippet}>{iframeSnippet}</pre>
              <div className={styles.snippetActions}>
                <Button
                  size="sm"
                  variant="secondary"
                  iconLeft={copied === 'iframe' ? <Check size={14} /> : <Copy size={14} />}
                  onClick={() => copy(iframeSnippet, 'iframe')}
                >
                  {copied === 'iframe' ? 'Copied' : 'Copy iframe'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  iconLeft={copied === 'url' ? <Check size={14} /> : <Copy size={14} />}
                  onClick={() => copy(publicUrl, 'url')}
                >
                  Copy URL
                </Button>
                <a href={previewUrl} target="_blank" rel="noreferrer" className={styles.fieldHint}>
                  Open in a new tab
                </a>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Every widget type</CardTitle>
              <CardDescription>
                The same filters, styling, and field choices applied to each widget.
                Copy the snippet or the shareable URL for whichever ones your site needs.
              </CardDescription>
            </CardHeader>
            <CardBody>
              <div className={styles.savedList}>
                {everyWidget.map((entry) => (
                  <div key={entry.view} className={styles.savedRow}>
                    <span className={styles.savedName}>
                      {EMBED_VIEW_LABEL[entry.view]}
                      <span className={styles.savedMeta}> · {EMBED_VIEW_SUMMARY[entry.view]}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      iconLeft={
                        copied === `snippet-${entry.view}` ? <Check size={14} /> : <Copy size={14} />
                      }
                      onClick={() => copy(entry.snippet, `snippet-${entry.view}`)}
                    >
                      Snippet
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconLeft={
                        copied === `link-${entry.view}` ? <Check size={14} /> : <Copy size={14} />
                      }
                      onClick={() => copy(entry.url, `link-${entry.view}`)}
                    >
                      URL
                    </Button>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Public pages</CardTitle>
              <CardDescription>
                The same data as a full page, for organizers without a website to embed into.
              </CardDescription>
            </CardHeader>
            <CardBody>
              <div className={styles.savedList}>
                {[
                  ['', 'Event home'],
                  ...EMBED_VIEWS.map((view) => [`/${view}`, EMBED_VIEW_LABEL[view]] as const),
                ].map(([path, label]) => (
                  <div key={label} className={styles.savedRow}>
                    <span className={styles.savedName}>{label}</span>
                    <a
                      className={styles.savedMeta}
                      href={`/${eventSlug}${path}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {origin}/{eventSlug}
                      {path}
                    </a>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
