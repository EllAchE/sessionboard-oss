import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SOCIAL_IMAGE_PATH } from '../lib/site-metadata';

const REPOSITORY_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DOCS_DIRECTORY = path.join(REPOSITORY_ROOT, 'docs');
const PUBLIC_DIRECTORY = path.join(REPOSITORY_ROOT, 'public');
const STAGING_DIRECTORY = path.join(REPOSITORY_ROOT, '.wrangler-artifacts');

/**
 * Stages only the assets intentionally published by the two readable-artifact Workers. Keeping
 * this allowlist explicit prevents the submission Worker from turning the entire docs tree into a
 * second public file server as new repository documentation is added.
 */
export async function prepareReadableSiteAssets(): Promise<void> {
  const submissionDirectory = path.join(STAGING_DIRECTORY, 'submission');
  const surveyDirectory = path.join(STAGING_DIRECTORY, 'field-survey');
  const socialImagePath = SOCIAL_IMAGE_PATH.slice(1);
  const socialImageSource = path.join(PUBLIC_DIRECTORY, socialImagePath);

  await rm(STAGING_DIRECTORY, { recursive: true, force: true });
  await Promise.all([
    mkdir(path.join(submissionDirectory, 'images'), { recursive: true }),
    mkdir(path.join(submissionDirectory, path.dirname(socialImagePath)), { recursive: true }),
    mkdir(path.join(surveyDirectory, path.dirname(socialImagePath)), { recursive: true }),
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
    cp(socialImageSource, path.join(submissionDirectory, socialImagePath)),
    cp(socialImageSource, path.join(surveyDirectory, socialImagePath)),
  ]);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await prepareReadableSiteAssets();
  process.stdout.write('Staged the submission and field-survey Worker assets.\n');
}
