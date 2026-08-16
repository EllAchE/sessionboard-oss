import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Card, CardBody, CardHeader, CardDescription, CardTitle } from '@/components/ui';
import { getCrmDashboard, type Breakdown } from '@/lib/services/crm';
import { requireCrmOrganizer } from '../context';
import styles from '../crm.module.css';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'CRM dashboard · Cicero' };

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <div className={styles.counter}>
      <span className={styles.counterValue}>{value}</span>
      <span className={styles.counterLabel}>{label}</span>
    </div>
  );
}

/** Every bar is a link back into the directory pre-filtered to the slice it counts. */
function Bars({
  rows,
  href,
  empty,
}: {
  rows: Breakdown[];
  href: (label: string) => string | null;
  empty: string;
}) {
  if (rows.length === 0) return <p className={styles.hint}>{empty}</p>;
  const peak = Math.max(...rows.map((row) => row.count), 1);

  return (
    <div className={styles.bars}>
      {rows.map((row) => {
        const target = href(row.label);
        const inner = (
          <>
            <span className={styles.barLabel}>{row.label}</span>
            <span className={styles.barTrack}>
              <span
                className={styles.barFill}
                style={
                  {
                    '--bar-share': `${Math.round((row.count / peak) * 100)}%`,
                  } as CSSProperties
                }
              />
            </span>
            <span className={styles.barCount}>{row.count}</span>
          </>
        );
        return target === null ? (
          <span key={row.label} className={styles.bar}>
            {inner}
          </span>
        ) : (
          <Link key={row.label} href={target} className={styles.bar}>
            {inner}
          </Link>
        );
      })}
    </div>
  );
}

export default async function CrmDashboardPage() {
  const actor = await requireCrmOrganizer();
  const data = await getCrmDashboard(actor);
  const query = (key: string, value: string) => `/crm?${key}=${encodeURIComponent(value)}`;

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Organization</p>
          <h1 className={styles.title}>CRM dashboard</h1>
          <p className={styles.subtitle}>Your speaker database across events.</p>
        </div>
      </div>

      <div className={styles.counterGrid}>
        <Counter value={data.totals.contacts} label="Total contacts" />
        <Counter value={data.totals.companies} label="Companies" />
        <Counter value={data.totals.prospects} label="In the pipeline" />
        <Counter value={data.totals.confirmed} label="Confirmed" />
        <Counter value={data.totals.segments} label="Segments" />
        <Counter value={data.totals.eventLinks} label="Event placements" />
        <Counter value={data.totals.withBio} label="With a bio" />
        <Counter value={data.totals.emailsSent} label="Emails sent" />
      </div>

      <div className={styles.split}>
        <Card>
          <CardHeader>
            <CardTitle>Top companies</CardTitle>
            <CardDescription>Click a company to open the directory filtered to it.</CardDescription>
          </CardHeader>
          <CardBody>
            <Bars
              rows={data.topCompanies}
              href={(label) => query('company', label)}
              empty="No company recorded on any contact yet."
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Areas of focus</CardTitle>
            <CardDescription>The tags carried by the most contacts.</CardDescription>
          </CardHeader>
          <CardBody>
            <Bars rows={data.topTags} href={(label) => query('tag', label)} empty="No tags yet." />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where they came from</CardTitle>
          </CardHeader>
          <CardBody>
            <Bars
              rows={data.bySource}
              href={(label) => query('source', label)}
              empty="No source recorded yet."
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Regions</CardTitle>
          </CardHeader>
          <CardBody>
            <Bars
              rows={data.byLocation}
              href={(label) => query('location', label)}
              empty="No locations recorded yet."
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sourcing pipeline</CardTitle>
          <CardDescription>Prospects by stage.</CardDescription>
        </CardHeader>
        <CardBody>
          <Bars rows={data.byStage} href={() => '/crm/pipeline'} empty="Nobody is being sourced." />
        </CardBody>
      </Card>
    </div>
  );
}
