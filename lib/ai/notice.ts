import { features } from '@/lib/env';

/**
 * Whether a real model is reachable. The AI surfaces render whether this is true or not — a feature
 * that disappears when it is unconfigured is one nobody can evaluate, and hiding it would also hide
 * the shape of the thing, which is the part worth judging: the assistant proposes, a human decides.
 */
export function aiModelConfigured(): boolean {
  return features.ai();
}

/** What AI surfaces show when no model key is configured. */
export const AI_KEY_MISSING_NOTE =
  'No model key is configured. Set ANTHROPIC_API_KEY to enable AI-assisted review and agenda suggestions with claude-sonnet-5.';

export const AI_KEY_MISSING_NOTE_MARKDOWN =
  '**No model key is configured.** Set `ANTHROPIC_API_KEY` to enable AI-assisted review and agenda suggestions with `claude-sonnet-5`.';
