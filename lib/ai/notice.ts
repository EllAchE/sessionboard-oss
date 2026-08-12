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
  'No model key is set here. This deployment is a demo and nobody wanted to put a card down for it ' +
  'yet — the wiring is finished either way, so setting ANTHROPIC_API_KEY in the environment is the ' +
  'whole change, and this starts calling claude-sonnet-5 on the next request.';

export const AI_KEY_MISSING_NOTE_MARKDOWN =
  '**No model key is set on this deployment.** It is a demo and nobody wanted to put a card down ' +
  'for one yet. The wiring is finished — set `ANTHROPIC_API_KEY` and the same button calls ' +
  '`claude-sonnet-5` instead.';
