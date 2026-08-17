import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DOCS_DIRECTORY = path.join(REPOSITORY_ROOT, 'docs');
const STAGING_DIRECTORY = path.join(REPOSITORY_ROOT, '.wrangler-artifacts');

/**
 * Stages only the assets intentionally published by the two readable-artifact Workers. Keeping
 * this allowlist explicit prevents the submission Worker from turning the entire docs tree into a
 * second public file server as new repository documentation is added.
 */
export async function prepareReadableSiteAssets(): Promise<void> {
  const submissionDirectory = path.join(STAGING_DIRECTORY, 'submission');
  const surveyDirectory = path.join(STAGING_DIRECTORY, 'field-survey');

  await rm(STAGING_DIRECTORY, { recursive: true, force: true });
  await Promise.all([
    mkdir(path.join(submissionDirectory, 'images'), { recursive: true }),
    mkdir(surveyDirectory, { recursive: true }),
  ]);

  await Promise.all([
    cp(path.join(DOCS_DIRECTORY, 'submission'), path.join(submissionDirectory, 'submission'), {
      recursive: true,
    }),
    cp(
      path.join(DOCS_DIRECTORY, 'images', 'submission-evidence'),
      path.join(submissionDirectory, 'images', 'submission-evidence'),
      { recursive: true },
    ),
    cp(
      path.join(DOCS_DIRECTORY, 'alternatives', 'visual', 'index.html'),
      path.join(surveyDirectory, 'index.html'),
    ),
  ]);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await prepareReadableSiteAssets();
  process.stdout.write('Staged the submission and field-survey Worker assets.\n');
}
