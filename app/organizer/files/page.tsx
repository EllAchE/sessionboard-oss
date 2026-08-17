import { permanentRedirect } from 'next/navigation';

/**
 * `SPK-10`. The library lives under the submission screens because it grew out of them, but nobody
 * looking for "the files" guesses that path — the evaluation went to `/organizer/files`, got a 404,
 * and concluded there was no library at all. Keeping the canonical URL where it is and answering the
 * obvious one costs a redirect.
 */
export default function OrganizerFilesPage(): never {
  permanentRedirect('/organizer/submissions/files');
}
