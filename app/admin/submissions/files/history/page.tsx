import {
  listContentRevisions,
  listEditableContent,
  trackedFields,
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

  return (
    <ContentHistory
      entities={entityWire}
      revisions={revisionWire}
      sessionFields={trackedFields('session')}
      speakerFields={trackedFields('participant')}
    />
  );
}
