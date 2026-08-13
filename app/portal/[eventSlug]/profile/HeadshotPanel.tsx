'use client';

import { useActionState } from 'react';
import { ImageIcon } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, CardTitle } from '@/components/ui';
import { IDLE_STATE } from '../../form-state';
import styles from '../../portal.module.css';
import { removeHeadshotAction } from '../actions';
import { FormNotice } from '../FormNotice';
import { Uploader } from '../Uploader';

/** `S-3`. */
export function HeadshotPanel({
  eventSlug,
  headshotUrl,
}: {
  eventSlug: string;
  headshotUrl?: string;
}) {
  const [state, action] = useActionState(removeHeadshotAction, IDLE_STATE);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portrait</CardTitle>
      </CardHeader>
      <CardBody>
        <div className={styles.headshotPanel}>
          {headshotUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.headshotImage} src={headshotUrl} alt="Your public portrait" />
          ) : (
            <div className={styles.headshotPlaceholder}>
              <ImageIcon size={24} aria-hidden />
            </div>
          )}
          <div className={styles.spacer}>
            <Uploader
              eventSlug={eventSlug}
              intent="headshot"
              accept="image/*"
              acceptedLabel="JPEG, PNG, GIF, WebP"
              maxSizeMb={10}
              buttonLabel={headshotUrl ? 'Replace portrait' : 'Commission portrait'}
              helpText="A square likeness fits the gallery best."
              compact
            />
            {headshotUrl && (
              <form action={action}>
                <input type="hidden" name="eventSlug" value={eventSlug} />
                <Button type="submit" variant="ghost" size="sm">
                  Remove from the gallery
                </Button>
              </form>
            )}
            <FormNotice state={state} />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
