'use client';

import { useState } from 'react';
import {
  Archive,
  CalendarDays,
  Copy,
  FileText,
  LayoutDashboard,
  Mic2,
  Plus,
  Search,
  Settings,
  Trash2,
  Users,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  CommandMenu,
  DataTable,
  Dialog,
  IconButton,
  Input,
  Kbd,
  Radio,
  ScoreStars,
  Select,
  SidebarNav,
  Switch,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTrigger,
  Tag,
  Textarea,
  Toast,
  ToastProvider,
  Tooltip,
  useToast,
} from '@/components/ui';
import type { CommandMenuItem, DataTableColumn, SidebarNavSection } from '@/components/ui';
import styles from './kitchen-sink.module.css';

interface SessionRow {
  id: string;
  ref: string;
  title: string;
  speaker: string;
  track: string;
  status: 'accepted' | 'review' | 'declined';
  score: number;
}

const SESSIONS: SessionRow[] = [
  { id: '1', ref: 'SESS-1', title: 'Rhetoric for engineers', speaker: 'Marcus Tullius', track: 'Craft', status: 'accepted', score: 4.5 },
  { id: '2', ref: 'SESS-2', title: 'Designing for the forum', speaker: 'Livia Drusilla', track: 'Design', status: 'review', score: 3 },
  { id: '3', ref: 'SESS-3', title: 'Aqueducts as infrastructure', speaker: 'Sextus Frontinus', track: 'Platform', status: 'accepted', score: 5 },
  { id: '4', ref: 'SESS-4', title: 'Stone, mortar, and migrations', speaker: 'Vitruvius Pollio', track: 'Platform', status: 'declined', score: 2.5 },
  { id: '5', ref: 'SESS-5', title: 'Keeping the calendar honest', speaker: 'Julia Augusta', track: 'Ops', status: 'review', score: 3.5 },
  { id: '6', ref: 'SESS-6', title: 'Notes on the shorter letter', speaker: 'Plinius Minor', track: 'Craft', status: 'accepted', score: 4 },
  { id: '7', ref: 'SESS-7', title: 'Provisioning the provinces', speaker: 'Agricola Iulius', track: 'Ops', status: 'review', score: 3 },
  { id: '8', ref: 'SESS-8', title: 'On the nature of caches', speaker: 'Titus Lucretius', track: 'Platform', status: 'accepted', score: 4.5 },
];

const STATUS_TONE = {
  accepted: 'success',
  review: 'info',
  declined: 'danger',
} as const;

const NAV_SECTIONS: SidebarNavSection[] = [
  {
    id: 'main',
    title: 'Programme',
    items: [
      { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={16} /> },
      { id: 'sessions', label: 'Sessions', icon: <FileText size={16} />, badge: <Badge tone="accent">8</Badge> },
      { id: 'speakers', label: 'Speakers', icon: <Mic2 size={16} /> },
      { id: 'schedule', label: 'Schedule', icon: <CalendarDays size={16} /> },
    ],
  },
  {
    id: 'admin',
    title: 'Administration',
    items: [
      { id: 'people', label: 'People', icon: <Users size={16} /> },
      { id: 'settings', label: 'Settings', icon: <Settings size={16} /> },
      { id: 'archive', label: 'Archive', icon: <Archive size={16} />, disabled: true },
    ],
  },
];

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  return (
    <label className={styles.themeToggle}>
      <span>Dark</span>
      <Switch
        checked={dark}
        onCheckedChange={(next) => {
          setDark(next);
          document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
        }}
        aria-label="Toggle dark theme"
      />
    </label>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section} id={id} aria-labelledby={`${id}-title`}>
      <h2 className={styles.sectionTitle} id={`${id}-title`}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.block}>
      <h3 className={styles.blockTitle}>{title}</h3>
      {children}
    </div>
  );
}

function FoundationsSection() {
  return (
    <Section id="foundations" title="Foundations">
      <Block title="Type scale">
        <div>
          <div className={styles.typeRow}>
            <span className={styles.typeMeta}>display / 54</span>
            <span className={styles.display}>Cicero</span>
          </div>
          <div className={styles.typeRow}>
            <span className={styles.typeMeta}>title / 31</span>
            <span className={styles.title}>Programme committee review</span>
          </div>
          <div className={styles.typeRow}>
            <span className={styles.typeMeta}>heading / 16</span>
            <span className={styles.heading}>Session detail</span>
          </div>
          <div className={styles.typeRow}>
            <span className={styles.typeMeta}>body / 14</span>
            <span className={styles.body}>The working UI face carries everything dense.</span>
          </div>
          <div className={styles.typeRow}>
            <span className={styles.typeMeta}>mono / 13</span>
            <span className={styles.mono}>SESS-4 · 2026-08-11T09:30Z</span>
          </div>
        </div>
        <p className={styles.prose}>
          Prose sets in Spectral at the loose leading, capped at the prose measure so long-form
          copy — speaker bios, review notes, call-for-papers text — never runs past a comfortable
          line length.
        </p>
      </Block>

      <Block title="Semantic surfaces">
        <div className={styles.swatches}>
          {[
            ['--surface-page', 'page'],
            ['--surface-card', 'card'],
            ['--surface-sunken', 'sunken'],
            ['--surface-raised', 'raised'],
            ['--surface-hover', 'hover'],
            ['--surface-active', 'active'],
            ['--surface-selected', 'selected'],
            ['--surface-inverse', 'inverse'],
          ].map(([token, name]) => (
            <div key={token} className={styles.swatch} style={{ background: `var(${token})` }}>
              <span>{name}</span>
              <span>{token}</span>
            </div>
          ))}
        </div>
      </Block>
    </Section>
  );
}

function CoreSection() {
  return (
    <Section id="core" title="Core">
      <Block title="Button — variants">
        <div className={styles.row}>
          <Button variant="primary">Publish schedule</Button>
          <Button variant="secondary">Save draft</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Withdraw</Button>
        </div>
      </Block>
      <Block title="Button — sizes, icons, loading, disabled">
        <div className={styles.row}>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button variant="primary" iconLeft={<Plus size={14} />}>
            New session
          </Button>
          <Button iconRight={<Copy size={14} />}>Duplicate</Button>
          <Button variant="primary" loading>
            Saving
          </Button>
          <Button disabled>Disabled</Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
      </Block>
      <Block title="IconButton">
        <div className={styles.row}>
          <IconButton label="Search" size="xs">
            <Search size={12} />
          </IconButton>
          <IconButton label="Search" size="sm">
            <Search size={14} />
          </IconButton>
          <IconButton label="Search">
            <Search size={16} />
          </IconButton>
          <IconButton label="Settings" variant="secondary">
            <Settings size={16} />
          </IconButton>
          <IconButton label="Delete session" variant="danger">
            <Trash2 size={16} />
          </IconButton>
          <IconButton label="Disabled" disabled>
            <Settings size={16} />
          </IconButton>
        </div>
      </Block>
      <Block title="Kbd">
        <p className={styles.body}>
          Press <Kbd>⌘</Kbd> <Kbd>K</Kbd> to open the command menu, <Kbd>↑</Kbd> <Kbd>↓</Kbd> to move
          through a table, and <Kbd size="md">Esc</Kbd> to dismiss.
        </p>
      </Block>
      <Block title="Card">
        <div className={styles.grid}>
          <Card>
            <CardHeader>
              <CardTitle>Rhetoric for engineers</CardTitle>
              <CardDescription>Marcus Tullius · Craft track</CardDescription>
            </CardHeader>
            <CardBody>
              <p className={styles.note}>
                A hairline card. Hierarchy comes from the rule, not the shadow.
              </p>
            </CardBody>
            <CardFooter>
              <Badge tone="success">Accepted</Badge>
            </CardFooter>
          </Card>
          <Card elevated>
            <CardHeader>
              <CardTitle>Elevated</CardTitle>
              <CardDescription>Reserved for surfaces that genuinely float</CardDescription>
            </CardHeader>
            <CardBody>
              <p className={styles.note}>Same geometry, one step of elevation.</p>
            </CardBody>
          </Card>
          <Card padding="sm">
            <CardBody>
              <p className={styles.note}>Compact padding, no header or footer.</p>
            </CardBody>
          </Card>
        </div>
      </Block>
      <Block title="Badge">
        <div className={styles.row}>
          <Badge>Neutral</Badge>
          <Badge tone="info">In review</Badge>
          <Badge tone="success">Accepted</Badge>
          <Badge tone="warning">Awaiting bio</Badge>
          <Badge tone="danger">Declined</Badge>
          <Badge tone="accent">Keynote</Badge>
          <Badge size="md" tone="info">
            Medium
          </Badge>
        </div>
      </Block>
      <Block title="Tag">
        <div className={styles.row}>
          <Tag>platform</Tag>
          <Tag tone="accent">keynote</Tag>
          <Tag onRemove={() => undefined}>accessibility</Tag>
          <Tag tone="accent" onRemove={() => undefined} removeLabel="Remove tag">
            workshop
          </Tag>
        </div>
      </Block>
      <Block title="Avatar">
        <div className={styles.row}>
          <Avatar name="Marcus Tullius" size="xs" />
          <Avatar name="Livia Drusilla" size="sm" />
          <Avatar name="Sextus Frontinus" />
          <Avatar name="Julia Augusta" size="lg" />
        </div>
      </Block>
    </Section>
  );
}

function FormsSection() {
  const [checked, setChecked] = useState(true);
  const [choice, setChoice] = useState('review');
  const [notify, setNotify] = useState(true);

  return (
    <Section id="forms" title="Forms">
      <Block title="Input, Textarea, Select">
        <div className={styles.stateGrid}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ks-title">
              Session title
            </label>
            <Input id="ks-title" defaultValue="Rhetoric for engineers" />
            <span className={styles.hint}>Shown on the public schedule.</span>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ks-slug">
              Slug (invalid)
            </label>
            <Input id="ks-slug" invalid defaultValue="rhetoric for engineers" />
            <span className={styles.error}>Slugs cannot contain spaces.</span>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ks-locked">
              Reference (disabled)
            </label>
            <Input id="ks-locked" disabled defaultValue="SESS-1" />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ks-small">
              Small
            </label>
            <Input id="ks-small" inputSize="sm" placeholder="Filter sessions…" />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ks-large">
              Large
            </label>
            <Input id="ks-large" inputSize="lg" placeholder="Search everything" />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ks-track">
              Track
            </label>
            <Select id="ks-track" defaultValue="platform">
              <option value="craft">Craft</option>
              <option value="design">Design</option>
              <option value="platform">Platform</option>
              <option value="ops">Ops</option>
            </Select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ks-track-invalid">
              Track (invalid)
            </label>
            <Select id="ks-track-invalid" invalid defaultValue="">
              <option value="">Choose a track…</option>
              <option value="craft">Craft</option>
            </Select>
            <span className={styles.error}>A track is required.</span>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ks-track-disabled">
              Track (disabled)
            </label>
            <Select id="ks-track-disabled" disabled defaultValue="ops">
              <option value="ops">Ops</option>
            </Select>
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="ks-abstract">
            Abstract
          </label>
          <Textarea
            id="ks-abstract"
            defaultValue="Persuasion is a systems problem. This talk borrows from classical rhetoric to make design documents that land."
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="ks-abstract-invalid">
            Abstract (invalid, fixed size)
          </label>
          <Textarea id="ks-abstract-invalid" invalid resize="none" defaultValue="Too short." />
          <span className={styles.error}>Abstracts must be at least 200 characters.</span>
        </div>
      </Block>

      <Block title="Checkbox, Radio, Switch">
        <div className={styles.row}>
          <label className={styles.choice}>
            <Checkbox checked={checked} onChange={(event) => setChecked(event.target.checked)} />
            Notify the speaker
          </label>
          <label className={styles.choice}>
            <Checkbox indeterminate checked={false} onChange={() => undefined} />
            Partially selected
          </label>
          <label className={styles.choice} data-disabled="true">
            <Checkbox disabled />
            Disabled
          </label>
          <label className={styles.choice} data-disabled="true">
            <Checkbox disabled checked readOnly />
            Disabled, checked
          </label>
        </div>
        <div className={styles.row} role="radiogroup" aria-label="Review decision">
          {(['accepted', 'review', 'declined'] as const).map((option) => (
            <label key={option} className={styles.choice}>
              <Radio
                name="ks-decision"
                value={option}
                checked={choice === option}
                onChange={() => setChoice(option)}
              />
              {option}
            </label>
          ))}
          <label className={styles.choice} data-disabled="true">
            <Radio name="ks-decision-disabled" disabled />
            Disabled
          </label>
        </div>
        <div className={styles.row}>
          <label className={styles.choice}>
            <Switch checked={notify} onCheckedChange={setNotify} />
            Email on decision
          </label>
          <label className={styles.choice}>
            <Switch size="sm" defaultChecked />
            Small, uncontrolled
          </label>
          <label className={styles.choice} data-disabled="true">
            <Switch disabled />
            Disabled
          </label>
          <label className={styles.choice} data-disabled="true">
            <Switch disabled defaultChecked />
            Disabled, on
          </label>
        </div>
      </Block>
    </Section>
  );
}

function NavigationSection({ onOpenCommandMenu }: { onOpenCommandMenu: () => void }) {
  const [activeNav, setActiveNav] = useState('sessions');

  return (
    <Section id="navigation" title="Navigation">
      <Block title="Tabs">
        <Tabs defaultValue="detail">
          <TabsList>
            <TabsTrigger value="detail">Detail</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="locked" disabled>
              Locked
            </TabsTrigger>
          </TabsList>
          <TabsPanel value="detail">
            <p className={styles.note}>
              Arrow keys move between tabs and select as they go; Home and End jump to the ends.
            </p>
          </TabsPanel>
          <TabsPanel value="reviews">
            <p className={styles.note}>Three reviews, average 4.2.</p>
          </TabsPanel>
          <TabsPanel value="history">
            <p className={styles.note}>Submitted, revised twice, accepted.</p>
          </TabsPanel>
          <TabsPanel value="locked">
            <p className={styles.note}>Unreachable.</p>
          </TabsPanel>
        </Tabs>
      </Block>

      <Block title="SidebarNav">
        <div className={styles.sidebarDemo}>
          <SidebarNav sections={NAV_SECTIONS} activeId={activeNav} onSelect={setActiveNav} />
          <div className={styles.sidebarBody}>
            <p className={styles.note}>
              Selected: <code>{activeNav}</code>. The active item carries{' '}
              <code>aria-current=&quot;page&quot;</code>; the archive item is disabled but still
              announced.
            </p>
          </div>
        </div>
      </Block>

      <Block title="CommandMenu">
        <div className={styles.row}>
          <Button variant="secondary" iconLeft={<Search size={14} />} onClick={onOpenCommandMenu}>
            Open command menu
          </Button>
          <span className={styles.note}>
            Or press <Kbd>⌘</Kbd> <Kbd>K</Kbd> anywhere on this page.
          </span>
        </div>
      </Block>
    </Section>
  );
}

function FeedbackSection() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <Section id="feedback" title="Feedback">
      <Block title="Dialog">
        <div className={styles.row}>
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Edit session
          </Button>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Withdraw session
          </Button>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Edit session"
          description="Changes are visible to the speaker immediately."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setDialogOpen(false)}>
                Save changes
              </Button>
            </>
          }
        >
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ks-dialog-title">
              Title
            </label>
            <Input id="ks-dialog-title" defaultValue="Rhetoric for engineers" />
          </div>
        </Dialog>
        <Dialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          size="sm"
          title="Withdraw this session?"
          description="The speaker is notified and the slot returns to the pool."
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                Keep it
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmOpen(false);
                  toast({ tone: 'danger', title: 'Session withdrawn', description: 'SESS-1 is back in the pool.' });
                }}
              >
                Withdraw
              </Button>
            </>
          }
        />
      </Block>

      <Block title="Toast">
        <div className={styles.row}>
          <Button onClick={() => toast({ title: 'Schedule saved' })}>Info toast</Button>
          <Button
            onClick={() =>
              toast({ tone: 'success', title: 'Session accepted', description: 'SESS-3 moves to the programme.' })
            }
          >
            Success toast
          </Button>
          <Button
            onClick={() =>
              toast({ tone: 'warning', title: 'Speaker bio missing', description: 'Three speakers have no bio.' })
            }
          >
            Warning toast
          </Button>
          <Button
            onClick={() =>
              toast({
                tone: 'danger',
                title: 'Publish failed',
                description: 'The schedule has two rooms double-booked.',
                duration: 0,
                action: { label: 'Show conflicts', onClick: () => undefined },
              })
            }
          >
            Danger toast (pinned)
          </Button>
        </div>
        <div className={styles.stateGrid}>
          <Toast title="Schedule saved" description="Ten sessions updated." />
          <Toast tone="success" title="Session accepted" />
          <Toast tone="warning" title="Speaker bio missing" description="Three speakers have no bio." />
          <Toast
            tone="danger"
            title="Publish failed"
            description="Two rooms are double-booked."
            action={{ label: 'Show conflicts', onClick: () => undefined }}
            onDismiss={() => undefined}
          />
        </div>
      </Block>

      <Block title="Tooltip">
        <div className={styles.row}>
          <Tooltip content="Create a new session">
            <IconButton label="New session" variant="secondary">
              <Plus size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip content="Opens on the right" side="right">
            <Button variant="ghost">Right</Button>
          </Tooltip>
          <Tooltip content="Opens below" side="bottom">
            <Button variant="ghost">Bottom</Button>
          </Tooltip>
          <Tooltip content="Opens on the left" side="left">
            <Button variant="ghost">Left</Button>
          </Tooltip>
        </div>
      </Block>
    </Section>
  );
}

function DataSection() {
  const [selected, setSelected] = useState<string[]>(['3']);
  const [singleSelected, setSingleSelected] = useState<string[]>([]);
  const [score, setScore] = useState(4);
  const { toast } = useToast();

  const columns: Array<DataTableColumn<SessionRow>> = [
    { id: 'ref', header: 'Ref', width: 'calc(var(--space-24) - var(--space-4))', space: 'compact', mono: true, render: (row) => row.ref },
    { id: 'title', header: 'Title', strong: true, space: 'wide', render: (row) => row.title },
    { id: 'speaker', header: 'Speaker', width: 'var(--sidebar-width)', space: 'wide', render: (row) => (
        <span className={styles.choice}>
          <Avatar name={row.speaker} size="xs" />
          {row.speaker}
        </span>
      ) },
    { id: 'track', header: 'Track', width: 'var(--space-24)', render: (row) => <Tag>{row.track}</Tag> },
    {
      id: 'status',
      header: 'Status',
      width: 'var(--space-24)',
      render: (row) => <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>,
    },
    {
      id: 'score',
      header: 'Score',
      width: 'var(--space-32)',
      space: 'wide',
      align: 'right',
      render: (row) => <ScoreStars value={row.score} size="sm" label={`Score for ${row.ref}`} />,
    },
  ];

  return (
    <Section id="data" title="Data">
      <Block title="DataTable — multi-select, keyboard driven">
        <p className={styles.note}>
          Click the table then use <Kbd>↑</Kbd> <Kbd>↓</Kbd> <Kbd>Home</Kbd> <Kbd>End</Kbd> to move
          the cursor, <Kbd>Space</Kbd> to toggle a row, <Kbd>⌘</Kbd> <Kbd>A</Kbd> to select all,
          <Kbd>Esc</Kbd> to clear, and <Kbd>↵</Kbd> to open the active row.
        </p>
        <DataTable
          className={styles.tableWrap}
          label="Sessions"
          columns={columns}
          rows={SESSIONS}
          getRowId={(row) => row.id}
          selectionMode="multiple"
          selectedIds={selected}
          onSelectionChange={setSelected}
          onRowActivate={(row) => toast({ title: `Opened ${row.ref}`, description: row.title })}
        />
        <p className={styles.note}>Selected: {selected.length === 0 ? 'none' : selected.join(', ')}</p>
      </Block>

      <Block title="DataTable — single select">
        <DataTable
          label="Sessions, single select"
          columns={columns.slice(0, 3)}
          rows={SESSIONS.slice(0, 4)}
          getRowId={(row) => row.id}
          selectionMode="single"
          selectedIds={singleSelected}
          onSelectionChange={setSingleSelected}
        />
      </Block>

      <Block title="DataTable — empty">
        <DataTable
          label="No sessions"
          columns={columns.slice(0, 3)}
          rows={[]}
          getRowId={(row: SessionRow) => row.id}
          emptyState="No sessions match this filter."
        />
      </Block>

      <Block title="ScoreStars">
        <div className={styles.row}>
          <ScoreStars value={5} size="sm" />
          <ScoreStars value={3.5} />
          <ScoreStars value={0} size="lg" />
        </div>
        <div className={styles.row}>
          <ScoreStars
            value={score}
            readOnly={false}
            onChange={setScore}
            label="Your review score"
            size="lg"
          />
          <span className={styles.note}>Interactive — arrow keys, Home and End all work. ({score}/5)</span>
        </div>
      </Block>
    </Section>
  );
}

function KitchenSink() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { toast } = useToast();

  const commands: CommandMenuItem[] = [
    { id: 'new-session', group: 'Create', label: 'New session', icon: <Plus size={14} />, shortcut: ['⌘', 'N'], onSelect: () => toast({ title: 'New session' }) },
    { id: 'new-speaker', group: 'Create', label: 'Invite speaker', icon: <Mic2 size={14} />, keywords: ['add', 'person'], onSelect: () => toast({ title: 'Invite speaker' }) },
    { id: 'go-sessions', group: 'Navigate', label: 'Go to sessions', icon: <FileText size={14} />, hint: 'Programme', onSelect: () => toast({ title: 'Sessions' }) },
    { id: 'go-speakers', group: 'Navigate', label: 'Go to speakers', icon: <Users size={14} />, hint: 'Programme', onSelect: () => toast({ title: 'Speakers' }) },
    { id: 'go-schedule', group: 'Navigate', label: 'Go to schedule', icon: <CalendarDays size={14} />, hint: 'Programme', onSelect: () => toast({ title: 'Schedule' }) },
    { id: 'settings', group: 'Navigate', label: 'Open settings', icon: <Settings size={14} />, onSelect: () => toast({ title: 'Settings' }) },
    { id: 'publish', group: 'Actions', label: 'Publish schedule', keywords: ['release', 'live'], shortcut: ['⌘', '⏎'], onSelect: () => toast({ tone: 'success', title: 'Schedule published' }) },
    { id: 'archive', group: 'Actions', label: 'Archive conference', icon: <Archive size={14} />, disabled: true, onSelect: () => undefined },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <span className={styles.brand}>Cicero</span>
        <span className={styles.eyebrow}>Kitchen sink</span>
        <span className={styles.spacer} />
        <Tooltip content="Command menu">
          <IconButton label="Open command menu" onClick={() => setMenuOpen(true)}>
            <Search size={16} />
          </IconButton>
        </Tooltip>
        <ThemeToggle />
      </header>

      <main className={styles.main}>
        <p className={styles.note}>
          Every component in the frozen design system, in each state it ships with. Flip the Dark
          switch to re-render the whole page against <code>[data-theme=&quot;dark&quot;]</code> with
          no reload.
        </p>
        <FoundationsSection />
        <CoreSection />
        <FormsSection />
        <NavigationSection onOpenCommandMenu={() => setMenuOpen(true)} />
        <FeedbackSection />
        <DataSection />
      </main>

      <CommandMenu items={commands} open={menuOpen} onOpenChange={setMenuOpen} />
    </div>
  );
}

export default function KitchenSinkPage() {
  return (
    <ToastProvider>
      <KitchenSink />
    </ToastProvider>
  );
}
