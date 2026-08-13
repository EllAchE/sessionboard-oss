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
      header: 'Dispatch address',
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
      toast({ title: 'Name entered in the census', tone: 'success' });
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
        title: `Cohort inscribed`,
        description: `${rows.length} names from the rolls`,
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
      toast({ title: 'Summons prepared for the campaign', tone: 'success' });
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
        title: `Entered ${result.data.created} sample citizens in the census`,
        tone: 'success',
      });
      router.refresh();
    });
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>{heading?.eyebrow ?? 'The census house'}</p>
          <h1 className={styles.title}>{heading?.title ?? 'Empire-wide census'}</h1>
          <p className={styles.subtitle}>
            {heading?.subtitle ??
              'Every orator and citizen known to your house, across all assemblies.'}
          </p>
        </div>
        <div className={styles.headActions}>
          <Button variant="secondary" size="sm" href="/crm/import" iconLeft={<FileUp size={14} />}>
            Import census tablet
          </Button>
          <Button size="sm" iconLeft={<Plus size={14} />} onClick={() => setCreating(true)}>
            Inscribe a name
          </Button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <span className={styles.search}>
          <Input
            inputSize="sm"
            type="search"
            placeholder="Search by name, dispatch address, house, or mark"
            aria-label="Search the census"
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
          Inscribe as a cohort
        </Button>
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Mail size={14} />}
          disabled={selected.length < 2}
          onClick={() => router.push(`/crm/campaigns?ids=${selected.join(',')}`)}
        >
          Dispatch selected ({selected.length})
        </Button>
      </div>

      <div className={styles.filterBar}>
        <FilterSelect
          label="House or company"
          value={filters.company}
          options={facets.companies}
          onChange={(value) => set({ company: value })}
        />
        <FilterSelect
          label="Office or title"
          value={filters.jobTitle}
          options={facets.jobTitles}
          onChange={(value) => set({ jobTitle: value })}
        />
        <FilterSelect
          label="Mark"
          value={filters.tag}
          options={facets.tags}
          onChange={(value) => set({ tag: value })}
        />
        <FilterSelect
          label="Province or location"
          value={filters.location}
          options={facets.locations}
          onChange={(value) => set({ location: value })}
        />
        <FilterSelect
          label="Source roll"
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
          Showing {rows.length} of {contacts.length} names
        </span>
        {filterCount > 0 ? <Badge tone="accent">{filterCount} decrees</Badge> : null}
        {filterCount > 0 || searching ? (
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<X size={14} />}
            onClick={() => setFilters(EMPTY_FILTERS)}
          >
            Clear decrees
          </Button>
        ) : null}
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {contacts.length === 0 ? (
        <Card>
          <CardBody>
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>The census of orators is empty</p>
              <p className={styles.emptyBody}>
                Import a tablet of former orators, inscribe a citizen by hand, or enter sample names
                to see how the census, cohorts, and summoning campaign work together.
              </p>
              <div className={styles.row}>
                <Button iconLeft={<Sparkles size={14} />} loading={pending} onClick={loadSamples}>
                  Enter sample citizens
                </Button>
                <Button variant="secondary" href="/crm/import" iconLeft={<FileUp size={14} />}>
                  Import census tablet
                </Button>
                <Button variant="secondary" onClick={() => setCreating(true)}>
                  Inscribe by hand
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
          label="Census of orators"
          emptyState="No name on the rolls answers those filters."
          onRowActivate={(row) => router.push(`/crm/${row.id}`)}
        />
      )}

      <Dialog
        open={creating}
        onOpenChange={setCreating}
        title="Enter a name in the census"
        description="This name enters the empire-wide rolls without appointment to an assembly."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Leave the rolls unchanged
            </Button>
            <Button loading={pending} onClick={submitContact}>
              Enter in the census
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
            <span className={styles.label}>Dispatch address</span>
            <Input
              type="email"
              value={draft.email}
              onChange={(entry) => setDraft({ ...draft, email: entry.currentTarget.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>House or company</span>
            <Input
              value={draft.company}
              onChange={(entry) => setDraft({ ...draft, company: entry.currentTarget.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Office or title</span>
            <Input
              value={draft.jobTitle}
              onChange={(entry) => setDraft({ ...draft, jobTitle: entry.currentTarget.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Province or location</span>
            <Input
              value={draft.location}
              onChange={(entry) => setDraft({ ...draft, location: entry.currentTarget.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Marks</span>
            <Input
              placeholder="AI, Leadership"
              value={draft.tags}
              onChange={(entry) => setDraft({ ...draft, tags: entry.currentTarget.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Biography</span>
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
        title="Inscribe this view as a cohort"
        description={`${rows.length} names answer the decree right now.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSavingSegment(false)}>
              Leave the view unrecorded
            </Button>
            <Button loading={pending} onClick={submitSegment}>
              Seal cohort
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          <label className={styles.field}>
            <span className={styles.label}>Cohort name</span>
            <Input
              placeholder="AI Experts"
              value={segmentName}
              onChange={(entry) => setSegmentName(entry.currentTarget.value)}
            />
          </label>
          <fieldset className={styles.stack}>
            <span className={styles.label}>How shall membership be decreed?</span>
            <label className={styles.row}>
              <Radio
                name="segment-kind"
                value="dynamic"
                checked={segmentKind === 'dynamic'}
                onChange={() => setSegmentKind('dynamic')}
              />
              <span className={styles.value}>
                Living cohort—reapplies these decrees, so later names may join on their own
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
                Sealed cohort—fixes today&rsquo;s {rows.length} names as the complete roll
              </span>
            </label>
          </fieldset>
        </div>
      </Dialog>

      <Dialog
        open={enrolling !== null}
        onOpenChange={(open) => !open && setEnrolling(null)}
        title={`Summon ${enrolling?.name ?? ''} to the campaign`}
        description="Ranking a prospective orator now keeps the campaign in useful order."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEnrolling(null)}>
              Withhold the summons
            </Button>
            <Button loading={pending} onClick={submitEnroll}>
              Issue summons
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          <label className={styles.field}>
            <span className={styles.label}>Standing</span>
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
            <span className={styles.label}>Rank</span>
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
            <span className={styles.label}>Reason for the summons</span>
            <Textarea
              rows={3}
              placeholder="Why this person, in one line."
              value={enrollRationale}
              onChange={(entry) => setEnrollRationale(entry.currentTarget.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Target assembly (optional)</span>
            <Select
              value={enrollEventId}
              onChange={(entry) => setEnrollEventId(entry.currentTarget.value)}
            >
              <option value="">No assembly yet</option>
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
