'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bookmark, FileUp, Mail, Plus, Sparkles, UserPlus, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  DataTable,
  Dialog,
  Input,
  Radio,
  Select,
  Tag,
  Textarea,
  useToast,
  type DataTableColumn,
} from '@/components/ui';
import {
  createContactAction,
  createSegmentAction,
  enrollProspectAction,
  loadSampleContactsAction,
} from './actions';
import {
  EMPTY_FILTERS,
  activeFilterCount,
  filtersToQuery,
  matchesWire,
  type ContactWire,
  type EventWire,
  type FacetsWire,
  type FieldWire,
  type FiltersWire,
  type StageWire,
} from './wire';
import styles from './crm.module.css';

type Props = {
  contacts: ContactWire[];
  facets: FacetsWire;
  fields: FieldWire[];
  events: EventWire[];
  stages: StageWire[];
  initialFilters: FiltersWire;
  heading?: { eyebrow: string; title: string; subtitle: string };
};

type NewContact = {
  name: string;
  email: string;
  jobTitle: string;
  company: string;
  location: string;
  tags: string;
  bioMarkdown: string;
};

const BLANK_CONTACT: NewContact = {
  name: '',
  email: '',
  jobTitle: '',
  company: '',
  location: '',
  tags: '',
  bioMarkdown: '',
};

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.filterField}>
      <span className={styles.filterLabel}>{label}</span>
      <Select
        selectSize="sm"
        value={value}
        aria-label={`Filter by ${label.toLowerCase()}`}
        onChange={(entry) => onChange(entry.currentTarget.value)}
      >
        <option value="">Any {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    </label>
  );
}

export function Directory({
  contacts,
  facets,
  fields,
  events,
  stages,
  initialFilters,
  heading,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [filters, setFilters] = useState<FiltersWire>(initialFilters);
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<NewContact>(BLANK_CONTACT);
  const [savingSegment, setSavingSegment] = useState(false);
  const [segmentName, setSegmentName] = useState('');
  const [segmentKind, setSegmentKind] = useState<'dynamic' | 'curated'>('dynamic');
  const [enrolling, setEnrolling] = useState<ContactWire | null>(null);
  const [enrollStage, setEnrollStage] = useState('researching');
  const [enrollScore, setEnrollScore] = useState('');
  const [enrollRationale, setEnrollRationale] = useState('');
  const [enrollEventId, setEnrollEventId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(
    () => contacts.filter((row) => matchesWire(row, filters)),
    [contacts, filters],
  );

  /** Keeps the narrowed view shareable and reload-safe without re-rendering the server component. */
  useEffect(() => {
    const query = filtersToQuery(filters).toString();
    window.history.replaceState(null, '', query === '' ? window.location.pathname : `?${query}`);
  }, [filters]);

  const selectFields = fields.filter(
    (field) => field.type === 'select' || field.type === 'multi_select',
  );
  const filterCount = activeFilterCount(filters);
  const searching = filters.search.trim() !== '';

  const set = (patch: Partial<FiltersWire>) => setFilters((current) => ({ ...current, ...patch }));
  const setCustom = (key: string, value: string) =>
    setFilters((current) => ({
      ...current,
      custom: { ...current.custom, [key]: value },
    }));

  const columns: Array<DataTableColumn<ContactWire>> = [
    {
      id: 'name',
      header: 'Name',
      width: '22%',
      render: (row) => (
        <span className={styles.person}>
          <Link href={`/crm/${row.id}`} className={styles.personName}>
            {row.name}
          </Link>
        </span>
      ),
    },
    {
      id: 'email',
      header: 'Email',
      width: '22%',
      mono: true,
      render: (row) => row.email,
    },
    {
      id: 'company',
      header: 'Company',
      width: '16%',
      render: (row) => row.company ?? <span className={styles.muted}>—</span>,
    },
    {
      id: 'jobTitle',
      header: 'Job title',
      width: '16%',
      render: (row) => row.jobTitle ?? <span className={styles.muted}>—</span>,
    },
    {
      id: 'tags',
      header: 'Tags',
      width: '14%',
      render: (row) =>
        row.tags.length === 0 ? (
          <span className={styles.muted}>—</span>
        ) : (
          <span className={styles.tagRow}>
            {row.tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </span>
        ),
    },
    {
      id: 'enroll',
      header: '',
      width: '10%',
      align: 'right',
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<UserPlus size={14} />}
          onClick={(clicked) => {
            clicked.stopPropagation();
            setEnrolling(row);
            setEnrollStage('researching');
            setEnrollScore('');
            setEnrollRationale('');
            setEnrollEventId('');
          }}
        >
          Enroll
        </Button>
      ),
    },
  ];

  const submitContact = () => {
    setError(null);
    startTransition(async () => {
      const result = await createContactAction({
        name: draft.name,
        email: draft.email,
        jobTitle: draft.jobTitle,
        company: draft.company,
        location: draft.location,
        bioMarkdown: draft.bioMarkdown,
        tags: draft.tags.split(','),
        source: 'manual',
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreating(false);
      setDraft(BLANK_CONTACT);
      toast({ title: 'Contact added', tone: 'success' });
      router.refresh();
    });
  };

  const submitSegment = () => {
    setError(null);
    startTransition(async () => {
      const result = await createSegmentAction({
        name: segmentName,
        kind: segmentKind,
        filters: {
          search: filters.search || null,
          company: filters.company || null,
          jobTitle: filters.jobTitle || null,
          tag: filters.tag || null,
          source: filters.source || null,
          location: filters.location || null,
          custom: Object.fromEntries(
            Object.entries(filters.custom).filter(([, value]) => value !== ''),
          ),
        },
        memberContactIds: rows.map((row) => row.id),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavingSegment(false);
      setSegmentName('');
      toast({
        title: `Saved segment`,
        description: `${rows.length} contacts`,
        tone: 'success',
      });
      router.push(`/crm/segments/${result.data.id}`);
    });
  };

  const submitEnroll = () => {
    if (!enrolling) return;
    setError(null);
    startTransition(async () => {
      const result = await enrollProspectAction({
        contactId: enrolling.id,
        stage: enrollStage as never,
        score: enrollScore.trim() === '' ? null : Number(enrollScore),
        rationale: enrollRationale.trim() === '' ? null : enrollRationale,
        eventId: enrollEventId === '' ? null : enrollEventId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEnrolling(null);
      toast({ title: 'Added to the sourcing pipeline', tone: 'success' });
      router.push('/crm/pipeline');
    });
  };

  const loadSamples = () => {
    startTransition(async () => {
      const result = await loadSampleContactsAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({
        title: `Added ${result.data.created} sample contacts`,
        tone: 'success',
      });
      router.refresh();
    });
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>{heading?.eyebrow ?? 'Organization'}</p>
          <h1 className={styles.title}>{heading?.title ?? 'Speaker directory'}</h1>
          <p className={styles.subtitle}>
            {heading?.subtitle ??
              'Every speaker and contact your organization has worked with, across all events.'}
          </p>
        </div>
        <div className={styles.headActions}>
          <Button variant="secondary" size="sm" href="/crm/import" iconLeft={<FileUp size={14} />}>
            Import CSV
          </Button>
          <Button size="sm" iconLeft={<Plus size={14} />} onClick={() => setCreating(true)}>
            New contact
          </Button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <span className={styles.search}>
          <Input
            inputSize="sm"
            type="search"
            placeholder="Search contacts by name, email, company or tag"
            aria-label="Search contacts"
            value={filters.search}
            onChange={(entry) => set({ search: entry.currentTarget.value })}
          />
        </span>
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Bookmark size={14} />}
          onClick={() => setSavingSegment(true)}
        >
          Save as segment
        </Button>
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Mail size={14} />}
          disabled={selected.length < 2}
          onClick={() => router.push(`/crm/campaigns?ids=${selected.join(',')}`)}
        >
          Email selected ({selected.length})
        </Button>
      </div>

      <div className={styles.filterBar}>
        <FilterSelect
          label="Company"
          value={filters.company}
          options={facets.companies}
          onChange={(value) => set({ company: value })}
        />
        <FilterSelect
          label="Job title"
          value={filters.jobTitle}
          options={facets.jobTitles}
          onChange={(value) => set({ jobTitle: value })}
        />
        <FilterSelect
          label="Tag"
          value={filters.tag}
          options={facets.tags}
          onChange={(value) => set({ tag: value })}
        />
        <FilterSelect
          label="Location"
          value={filters.location}
          options={facets.locations}
          onChange={(value) => set({ location: value })}
        />
        <FilterSelect
          label="Source"
          value={filters.source}
          options={facets.sources}
          onChange={(value) => set({ source: value })}
        />
        {selectFields.map((field) => (
          <FilterSelect
            key={field.id}
            label={field.label}
            value={filters.custom[field.key] ?? ''}
            options={field.options}
            onChange={(value) => setCustom(field.key, value)}
          />
        ))}
      </div>

      <div className={styles.resultLine}>
        <span>
          Showing {rows.length} of {contacts.length} contacts
        </span>
        {filterCount > 0 ? <Badge tone="accent">{filterCount} filters</Badge> : null}
        {filterCount > 0 || searching ? (
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<X size={14} />}
            onClick={() => setFilters(EMPTY_FILTERS)}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {contacts.length === 0 ? (
        <Card>
          <CardBody>
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>Your speaker database is empty</p>
              <p className={styles.emptyBody}>
                Import a CSV of past speakers, add someone by hand, or drop in a set of sample
                contacts to see how the directory, segments and sourcing pipeline fit together.
              </p>
              <div className={styles.row}>
                <Button iconLeft={<Sparkles size={14} />} loading={pending} onClick={loadSamples}>
                  Load sample contacts
                </Button>
                <Button variant="secondary" href="/crm/import" iconLeft={<FileUp size={14} />}>
                  Import CSV
                </Button>
                <Button variant="secondary" onClick={() => setCreating(true)}>
                  Add manually
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(row) => row.id}
          selectionMode="multiple"
          selectedIds={selected}
          onSelectionChange={setSelected}
          label="Speaker directory"
          emptyState="No contact matches those filters."
          onRowActivate={(row) => router.push(`/crm/${row.id}`)}
        />
      )}

      <Dialog
        open={creating}
        onOpenChange={setCreating}
        title="New contact"
        description="Added to the organization-level database, not to any one event."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button loading={pending} onClick={submitContact}>
              Add contact
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          <label className={styles.field}>
            <span className={styles.label}>Name</span>
            <Input
              value={draft.name}
              onChange={(entry) => setDraft({ ...draft, name: entry.currentTarget.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Email</span>
            <Input
              type="email"
              value={draft.email}
              onChange={(entry) => setDraft({ ...draft, email: entry.currentTarget.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Company</span>
            <Input
              value={draft.company}
              onChange={(entry) => setDraft({ ...draft, company: entry.currentTarget.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Job title</span>
            <Input
              value={draft.jobTitle}
              onChange={(entry) => setDraft({ ...draft, jobTitle: entry.currentTarget.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Location</span>
            <Input
              value={draft.location}
              onChange={(entry) => setDraft({ ...draft, location: entry.currentTarget.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Tags</span>
            <Input
              placeholder="AI, Leadership"
              value={draft.tags}
              onChange={(entry) => setDraft({ ...draft, tags: entry.currentTarget.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Bio</span>
            <Textarea
              rows={4}
              value={draft.bioMarkdown}
              onChange={(entry) => setDraft({ ...draft, bioMarkdown: entry.currentTarget.value })}
            />
          </label>
        </div>
      </Dialog>

      <Dialog
        open={savingSegment}
        onOpenChange={setSavingSegment}
        title="Save this view as a segment"
        description={`${rows.length} contacts match right now.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSavingSegment(false)}>
              Cancel
            </Button>
            <Button loading={pending} onClick={submitSegment}>
              Save segment
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          <label className={styles.field}>
            <span className={styles.label}>Segment name</span>
            <Input
              placeholder="AI Experts"
              value={segmentName}
              onChange={(entry) => setSegmentName(entry.currentTarget.value)}
            />
          </label>
          <fieldset className={styles.stack}>
            <span className={styles.label}>How should membership be decided?</span>
            <label className={styles.row}>
              <Radio
                name="segment-kind"
                value="dynamic"
                checked={segmentKind === 'dynamic'}
                onChange={() => setSegmentKind('dynamic')}
              />
              <span className={styles.value}>
                Dynamic — re-runs these filters, so contacts added later join on their own
              </span>
            </label>
            <label className={styles.row}>
              <Radio
                name="segment-kind"
                value="curated"
                checked={segmentKind === 'curated'}
                onChange={() => setSegmentKind('curated')}
              />
              <span className={styles.value}>
                Curated — freezes today&rsquo;s {rows.length} contacts as the member list
              </span>
            </label>
          </fieldset>
        </div>
      </Dialog>

      <Dialog
        open={enrolling !== null}
        onOpenChange={(open) => !open && setEnrolling(null)}
        title={`Add ${enrolling?.name ?? ''} to the sourcing pipeline`}
        description="Scoring a prospect at enrollment is what makes the board sortable later."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEnrolling(null)}>
              Cancel
            </Button>
            <Button loading={pending} onClick={submitEnroll}>
              Add to pipeline
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          <label className={styles.field}>
            <span className={styles.label}>Stage</span>
            <Select
              value={enrollStage}
              onChange={(entry) => setEnrollStage(entry.currentTarget.value)}
            >
              {stages.map((stage) => (
                <option key={stage.stage} value={stage.stage}>
                  {stage.label}
                </option>
              ))}
            </Select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Score</span>
            <Input
              type="number"
              min={0}
              max={100}
              placeholder="85"
              value={enrollScore}
              onChange={(entry) => setEnrollScore(entry.currentTarget.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Rationale</span>
            <Textarea
              rows={3}
              placeholder="Why this person, in one line."
              value={enrollRationale}
              onChange={(entry) => setEnrollRationale(entry.currentTarget.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Target event (optional)</span>
            <Select
              value={enrollEventId}
              onChange={(entry) => setEnrollEventId(entry.currentTarget.value)}
            >
              <option value="">No event yet</option>
              {events.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </Dialog>
    </div>
  );
}
