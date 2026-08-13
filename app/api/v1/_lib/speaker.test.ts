import { describe, expect, it } from 'vitest';
import type { PortalTask } from '@/lib/services/tasks';
import { speakerTaskSchema } from './schemas';
import { speakerTaskPayload } from './speaker';

/**
 * `S-16` turned one task into several assignment rows and `0010` gave them a scope. The payload kept
 * describing the flat world before it: no `taskId`, so four rows looked like four unrelated chores
 * rather than four answers to one question, and no `scope` / `shared`, so the row a whole panel is
 * looking at was indistinguishable from the one a speaker owes alone.
 */
function portalTask(overrides: Partial<PortalTask> = {}): PortalTask {
  return {
    assignmentId: 'assignment-1',
    taskId: 'task-1',
    name: 'Upload your slides',
    descriptionMarkdown: null,
    descriptionHtml: '',
    kind: 'form',
    scope: 'contact',
    shared: false,
    status: 'not_started',
    required: true,
    position: 0,
    dueAt: new Date('2026-09-01T12:00:00.000Z'),
    overdue: false,
    completedAt: null,
    linkUrl: null,
    submissionId: null,
    submissionTitle: null,
    pinnedSubmissionId: null,
    answers: null,
    fileRequest: null,
    files: [],
    form: null,
    ...overrides,
  };
}

describe('speakerTaskPayload', () => {
  it('names the task the assignment answers', () => {
    expect(speakerTaskPayload(portalTask())).toMatchObject({
      assignmentId: 'assignment-1',
      taskId: 'task-1',
      scope: 'contact',
      shared: false,
    });
  });

  it('distinguishes a shared session row from the speaker’s own', () => {
    const shared = speakerTaskPayload(
      portalTask({
        assignmentId: 'assignment-2',
        scope: 'group',
        shared: true,
        submissionId: 'submission-9',
        submissionTitle: 'A panel',
        pinnedSubmissionId: 'submission-9',
      }),
    );

    expect(shared).toMatchObject({
      taskId: 'task-1',
      scope: 'group',
      shared: true,
      submissionId: 'submission-9',
      pinnedSubmissionId: 'submission-9',
    });
    expect(speakerTaskSchema.parse(shared)).toBeTruthy();
  });

  /**
   * `formFieldSchema` documents `helpText`, `placeholder` and `optionLabels` as present-and-nullable
   * and, since `0008`, an `entity`. The task-form path builds a bare `FormFieldSpec`, so the payload
   * used to promise four keys it never emitted — a schema that is true of one endpoint and false of
   * another is worse than no schema.
   */
  it('emits every key formFieldSchema promises, even on a bare task form field', () => {
    const payload = speakerTaskPayload(
      portalTask({
        form: {
          id: 'form-1',
          name: 'Slide details',
          introMarkdown: null,
          confirmationSubject: null,
          confirmationBodyMarkdown: null,
          fields: [
            {
              id: 'field-1',
              key: 'deck',
              builtinKey: null,
              type: 'short_text',
              label: 'Deck link',
              helpText: 'A link we can open.',
              placeholder: null,
              position: 0,
              step: 0,
              required: true,
              options: null,
              optionLabels: null,
              showIf: null,
              minLength: null,
              maxLength: null,
              charLimitGroup: null,
            },
          ],
        },
      }),
    );

    expect(payload.form?.fields[0]).toEqual({
      id: 'field-1',
      key: 'deck',
      entity: 'abstract',
      builtinKey: null,
      participantKey: null,
      type: 'short_text',
      label: 'Deck link',
      helpText: 'A link we can open.',
      placeholder: null,
      position: 0,
      step: 0,
      required: true,
      options: null,
      optionLabels: null,
      showIf: null,
      minLength: null,
      maxLength: null,
      charLimitGroup: null,
    });
    expect(speakerTaskSchema.parse(payload)).toBeTruthy();
  });
});
