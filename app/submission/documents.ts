import evidenceMarkdown from '@/docs/06-submission-evidence.md';
import narrativeMarkdown from '@/docs/06-submission-narrative.md';
import summaryMarkdown from '@/docs/06-submission-summary.md';

export const SUBMISSION_DOCUMENTS = [
  {
    slug: 'narrative',
    route: '/submission',
    tabLabel: 'Full write-up',
    description: 'The complete product thesis, feature coverage, additions, tradeoffs, and roadmap.',
    markdown: narrativeMarkdown,
    sourceUrl:
      'https://github.com/EllAchE/sessionboard-oss/blob/main/docs/06-submission-narrative.md',
  },
  {
    slug: 'summary',
    route: '/submission/summary',
    tabLabel: 'Short form',
    description: 'A compact version for application fields and time-constrained review.',
    markdown: summaryMarkdown,
    sourceUrl:
      'https://github.com/EllAchE/sessionboard-oss/blob/main/docs/06-submission-summary.md',
  },
  {
    slug: 'evidence',
    route: '/submission/evidence',
    tabLabel: 'Evidence',
    description: 'Dated local and hosted checks, seeded data, screenshots, and deployment caveats.',
    markdown: evidenceMarkdown,
    sourceUrl:
      'https://github.com/EllAchE/sessionboard-oss/blob/main/docs/06-submission-evidence.md',
  },
] as const;

export type SubmissionDocument = (typeof SUBMISSION_DOCUMENTS)[number];

export function findSubmissionDocument(path: string[] | undefined): SubmissionDocument | undefined {
  if (!path || path.length === 0) return SUBMISSION_DOCUMENTS[0];
  if (path.length !== 1) return undefined;
  return SUBMISSION_DOCUMENTS.find((document) => document.slug === path[0]);
}
