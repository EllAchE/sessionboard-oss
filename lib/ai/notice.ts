import { features } from '@/lib/env';

/**
 * Whether a real model is reachable. The AI surfaces render whether this is true or not — a feature
 * that disappears when it is unconfigured is one nobody can evaluate, and hiding it would also hide
 * the shape of the thing, which is the part worth judging: the assistant proposes, a human decides.
 */
export function aiModelConfigured(): boolean {
  return features.ai();
}

/**
 * What those surfaces say when no key is set. Deliberately specific about *why* — an organizer who
 * reads "unavailable" assumes something is broken, and the honest answer is that nobody has bought
 * a key for this instance yet.
 */
export const AI_KEY_MISSING_NOTE =
  'The augur has no model key. This is a demonstration province and no treasury has funded its ' +
  'omens yet—the aqueduct is complete, so setting ANTHROPIC_API_KEY in the environment is the whole ' +
  'change, and the next request calls claude-sonnet-5.';

export const AI_KEY_MISSING_NOTE_MARKDOWN =
  '**The augur has no model key.** This is a demonstration province and its treasury has not funded ' +
  'omens yet. The aqueduct is complete—set `ANTHROPIC_API_KEY` and the same seal calls ' +
  '`claude-sonnet-5`.';
