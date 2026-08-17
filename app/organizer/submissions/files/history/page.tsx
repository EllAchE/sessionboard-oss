import {
  listContentRevisions,
  listEditableContent,
  trackedFields,
  type ContentEntityKind,
} from '../../../../../lib/services/content';
import { decideContext } from '../../context';
import { ContentHistory, type EntityWire, type RevisionWire } from './ContentHistory';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Content history · Cicero' };

/**
 * `CNT-11` and `CNT-12` on one screen, deliberately: the approval control and the attributed history
 * belong together, because "why is this off the agenda" is answered by the entry above it.
 */
export default async function ContentHistoryPage() {
  const ctx = await decideContext();
  const [entities, revisions] = await Promise.all([
    listEditableContent(ctx),
    listContentRevisions(ctx),
  ]);

  const entityWire: EntityWire[] = entities.map((entity) => ({
    kind: entity.kind,
    id: entity.id,
    label: entity.label,
    secondary: entity.secondary,
    fields: entity.fields,
    contentStatus: entity.contentStatus,
  }));

  const revisionWire: RevisionWire[] = revisions.map((revision) => ({
    id: revision.id,
    entityKind: revision.entityKind,
    entityId: revision.entityId,
    entityLabel: revision.entityLabel,
    revisionNumber: revision.revisionNumber,
    summary: revision.summary,
    editorName: revision.editorName,
    when: revision.createdAt.toISOString().slice(0, 16).replace('T', ' '),
    isCurrent: revision.isCurrent,
    changed: revision.changed.map((change) => ({
      label: change.label,
      before: change.before,
      after: change.after,
    })),
  }));

  /**
   * One map keyed by kind rather than a prop per kind. The screen grew from two entity kinds to
   * four, and a `sessionFields`/`speakerFields`/… list would need editing again for the fifth.
   */
  const fieldLabels = Object.fromEntries(
    (['session', 'participant', 'scheduled_session', 'sponsor'] as ContentEntityKind[]).map(
      (kind) => [kind, trackedFields(kind)],
    ),
  ) as Record<ContentEntityKind, Record<string, string>>;

  return (
    <ContentHistory entities={entityWire} revisions={revisionWire} fieldLabels={fieldLabels} />
  );
}
