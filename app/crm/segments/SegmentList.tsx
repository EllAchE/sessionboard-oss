'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bookmark, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardBody, useToast } from '@/components/ui';
import { deleteSegmentAction } from '../actions';
import { formatDate } from '../wire';
import styles from '../crm.module.css';

export type SegmentView = {
  id: string;
  name: string;
  kind: string;
  memberCount: number;
  criteria: string;
  createdAt: string;
};

export function SegmentList({ segments }: { segments: SegmentView[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const remove = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteSegmentAction(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({ title: 'Cohort erased from the tablet', tone: 'success' });
      router.refresh();
    });
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>The census</p>
          <h1 className={styles.title}>Cohorts</h1>
          <p className={styles.subtitle}>
            A saved slice of the directory. Dynamic segments re-run their filters; curated ones keep
            the list they were saved with.
          </p>
        </div>
        <div className={styles.headActions}>
          <Button size="sm" variant="primary" href="/crm" iconLeft={<Bookmark size={14} />}>
            Build one in the directory
          </Button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {segments.length === 0 ? (
        <Card>
          <CardBody>
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No cohorts have been inscribed</p>
              <p className={styles.emptyBody}>
                Narrow the census to the citizens you return to, then preserve them as a cohort.
              </p>
              <Button variant="primary" href="/crm">
                Go to the census
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className={styles.grid}>
          {segments.map((segment) => (
            <Card key={segment.id}>
              <CardBody>
                <div className={styles.stack}>
                  <div className={styles.spread}>
                    <Link href={`/crm/segments/${segment.id}`} className={styles.personName}>
                      {segment.name}
                    </Link>
                    <Badge tone={segment.kind === 'dynamic' ? 'accent' : 'neutral'}>
                      {segment.kind}
                    </Badge>
                  </div>
                  <span className={styles.value}>{segment.memberCount} citizens</span>
                  <span className={styles.hint}>{segment.criteria}</span>
                  <div className={styles.spread}>
                    <span className={styles.timelineMeta}>
                      Saved {formatDate(segment.createdAt)}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconLeft={<Trash2 size={14} />}
                      loading={pending}
                      onClick={() => remove(segment.id)}
                    >
                      Disband
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
