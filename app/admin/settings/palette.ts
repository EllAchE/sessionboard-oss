/**
 * The colours a track or tag may take. Pure and free of any database import, so the client bundle
 * can have it.
 *
 * A free hex field was the obvious alternative and is the wrong one: an organizer picks a colour
 * that reads well in light mode, and it turns unreadable the moment anyone flips the theme. These
 * are the mid-tones of the palette in `app/tokens.css`, which hold their contrast on both
 * surfaces, and the service refuses anything that is not a token name.
 */

export type ColorToken = { token: string; label: string };

export const COLOR_TOKENS: ColorToken[] = [
  { token: '--vermilion-500', label: 'Vermilion' },
  { token: '--vermilion-300', label: 'Vermilion, pale' },
  { token: '--lapis-500', label: 'Lapis' },
  { token: '--lapis-300', label: 'Lapis, pale' },
  { token: '--verdigris-500', label: 'Verdigris' },
  { token: '--verdigris-300', label: 'Verdigris, pale' },
  { token: '--ochre-500', label: 'Ochre' },
  { token: '--ochre-300', label: 'Ochre, pale' },
  { token: '--stone-600', label: 'Stone' },
  { token: '--stone-400', label: 'Stone, pale' },
];

export function colorLabel(token: string | null | undefined): string {
  if (!token) return 'Uncoloured stone';
  return COLOR_TOKENS.find((entry) => entry.token === token)?.label ?? token;
}
